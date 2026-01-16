const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const bcrypt = require('bcrypt');
const crypto = require('crypto'); // Módulo nativo para criptografia
const { randomInt } = require('crypto'); // Importando randomInt especificamente
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');

// --- CONEXÃO COM MONGODB ---
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("ERRO CRÍTICO: A variável de ambiente MONGO_URI não está configurada.");
} else {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('Conectado ao MongoDB com sucesso!'))
        .catch(err => {
            console.error('Erro ao conectar ao MongoDB:', err);
        });
}

// --- DEFINIÇÃO DOS MODELOS (SCHEMAS) ---

// Configurações (Chave-Valor)
const ConfigSchema = new mongoose.Schema({
    chave: { type: String, required: true, unique: true },
    valor: { type: String, default: '' }
});
const Config = mongoose.model('Config', ConfigSchema);

// Admin
const AdminSchema = new mongoose.Schema({
    usuario: { type: String, required: true, unique: true },
    senha: { type: String, required: true }
});
const Admin = mongoose.model('Admin', AdminSchema);

// Cambistas
const CambistaSchema = new mongoose.Schema({
    usuario: { type: String, required: true, unique: true },
    senha: { type: String, required: true },
    saldo_creditos: { type: Number, default: 0 },
    ativo: { type: Boolean, default: true },
    timestamp: { type: Date, default: Date.now }
});
const Cambista = mongoose.model('Cambista', CambistaSchema);

// Vendas
const VendaSchema = new mongoose.Schema({
    sorteio_id: { type: Number, default: 0 }, 
    nome_jogador: { type: String, required: true },
    telefone: String,
    quantidade_cartelas: { type: Number, required: true },
    valor_total: { type: Number, required: true },
    tipo_venda: { type: String, required: true },
    cartelas_json: String,
    payment_id: String,
    tipo_sorteio: { type: String, default: 'regular' },
    sorteio_id_especial: String,
    cambista_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cambista' },
    timestamp: { type: Date, default: Date.now }
});
VendaSchema.virtual('id').get(function(){ return this._id.toHexString(); });
VendaSchema.set('toJSON', { virtuals: true });
const Venda = mongoose.model('Venda', VendaSchema);

// Vencedores
const VencedorSchema = new mongoose.Schema({
    sorteio_id: { type: String, required: true },
    premio: { type: String, required: true },
    nome: { type: String, required: true },
    telefone: String,
    cartela_id: String,
    status_pagamento: { type: String, default: 'Pendente' },
    timestamp: { type: Date, default: Date.now }
});
VencedorSchema.virtual('id').get(function(){ return this._id.toHexString(); });
VencedorSchema.set('toJSON', { virtuals: true });
const Vencedor = mongoose.model('Vencedor', VencedorSchema);

// Comissões
const ComissaoSchema = new mongoose.Schema({
    cambista_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cambista', required: true },
    venda_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Venda', required: true },
    valor_venda: Number,
    valor_comissao: Number,
    status_pagamento: { type: String, default: 'pendente' },
    timestamp: { type: Date, default: Date.now }
});
ComissaoSchema.virtual('id').get(function(){ return this._id.toHexString(); });
ComissaoSchema.set('toJSON', { virtuals: true });
const Comissao = mongoose.model('Comissao', ComissaoSchema);

// Histórico de Créditos
const TransacaoCreditoSchema = new mongoose.Schema({
    cambista_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cambista', required: true },
    admin_usuario: String,
    valor_alteracao: Number,
    tipo: String,
    venda_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Venda' },
    timestamp: { type: Date, default: Date.now }
});
const TransacaoCredito = mongoose.model('TransacaoCredito', TransacaoCreditoSchema);

// Pagamentos Pendentes
const PagamentoPendenteSchema = new mongoose.Schema({
    payment_id: { type: String, required: true, unique: true },
    socket_id: String,
    dados_compra_json: String,
    cambista_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cambista' },
    timestamp: { type: Date, default: Date.now }
});
const PagamentoPendente = mongoose.model('PagamentoPendente', PagamentoPendenteSchema);

// --- NOVO SCHEMA: ESTADO DO JOGO (PERSISTÊNCIA) ---
const GameStateSchema = new mongoose.Schema({
    chave: { type: String, default: 'estado_atual', unique: true },
    estado: String, // 'ESPERANDO', 'JOGANDO_LINHA', 'JOGANDO_CHEIA', etc.
    numero_sorteio: Number,
    numeros_sorteados: [Number],
    numeros_disponiveis: [Number],
    tempo_restante: Number,
    sorteio_especial_em_andamento: { type: Boolean, default: false },
    data_inicio: { type: Date, default: Date.now }
});
const GameState = mongoose.model('GameState', GameStateSchema);


// --- CONFIGURAÇÃO INICIAL DO SERVIDOR ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORTA = process.env.PORT || 3000;

// Mercado Pago
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const mpClient = new MercadoPagoConfig({ accessToken: MERCADOPAGO_ACCESS_TOKEN, options: { timeout: 5000 } });
const MERCADOPAGO_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;

function formatarDataBR(date) {
    if (!date) return '--';
    return new Date(date).toLocaleString('pt-BR', { timeZone: 'America/Porto_Velho' }); 
}

// --- INICIALIZAÇÃO DE DADOS PADRÃO ---
async function inicializarDados() {
    try {
        const adminExists = await Admin.findOne({ usuario: 'admin' });
        if (!adminExists) {
            const hash = await bcrypt.hash('admin123', 10);
            await Admin.create({ usuario: 'admin', senha: hash });
            console.log('Admin criado (admin / admin123).');
        } else {
            if (!adminExists.senha.startsWith('$2')) {
                const hash = await bcrypt.hash('admin123', 10);
                adminExists.senha = hash;
                await adminExists.save();
                console.log('Senha do admin atualizada para hash seguro.');
            }
        }

        const configsDefault = [
            { chave: 'premio_linha', valor: '100.00' },
            { chave: 'premio_cheia', valor: '500.00' },
            { chave: 'preco_cartela', valor: '5.00' },
            { chave: 'sorteio_especial_ativo', valor: 'true' },
            { chave: 'sorteio_especial_valor', valor: '1000.00' },
            { chave: 'sorteio_especial_datahora', valor: '' },
            { chave: 'sorteio_especial_preco_cartela', valor: '10.00' },
            { chave: 'duracao_espera', valor: '20' },
            { chave: 'min_bots', valor: '80' },
            { chave: 'max_bots', valor: '150' },
            { chave: 'numero_sorteio_atual', valor: '500' }
        ];

        for (const conf of configsDefault) {
            const exists = await Config.findOne({ chave: conf.chave });
            if (!exists) {
                await Config.create(conf);
            }
        }
        console.log('Dados iniciais verificados.');
    } catch (e) {
        console.error('Erro na inicialização:', e);
    }
}

// --- MIDDLEWARES ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'segredo_padrao_troque_isso',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: MONGO_URI,
        collectionName: 'sessions' 
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

// Webhook
app.post('/webhook-mercadopago', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        let reqBody;
        try {
            reqBody = JSON.parse(req.body.toString());
        } catch (e) {
            return res.sendStatus(400);
        }

        const signature = req.headers['x-signature'];
        const requestId = req.headers['x-request-id'];

        if (MERCADOPAGO_WEBHOOK_SECRET && signature && requestId && reqBody.data && reqBody.data.id) {
            const parts = signature.split(',').reduce((acc, p) => {
                const [k, v] = p.split('='); acc[k.trim()] = v.trim(); return acc;
            }, {});
            
            if (parts.ts && parts.v1) {
                const template = `id:${reqBody.data.id};request-id:${requestId};ts:${parts.ts};`;
                const hmac = crypto.createHmac('sha256', MERCADOPAGO_WEBHOOK_SECRET);
                hmac.update(template);
                if (hmac.digest('hex') !== parts.v1) {
                    console.error('Webhook: Assinatura inválida');
                    return res.sendStatus(403);
                }
            }
        }

        if (reqBody.type === 'payment') {
            const paymentId = reqBody.data.id;
            const payment = new Payment(mpClient);
            
            try {
                const pag = await payment.get({ id: paymentId });

                if (pag.status === 'approved') {
                    const pendente = await PagamentoPendente.findOne({ payment_id: paymentId });
                    
                    if (pendente) {
                        const dadosCompra = JSON.parse(pendente.dados_compra_json);
                        const cambistaId = pendente.cambista_id;
                        
                        let cartelasGeradas = [];
                        let valorTotal = 0;
                        let vendaData = {
                            nome_jogador: dadosCompra.nome,
                            telefone: dadosCompra.telefone,
                            quantidade_cartelas: dadosCompra.quantidade,
                            tipo_venda: 'Online',
                            payment_id: paymentId,
                            cambista_id: cambistaId
                        };

                        if (dadosCompra.tipo_compra === 'especial') {
                            const preco = parseFloat(PRECO_CARTELA_ESPECIAL_ATUAL);
                            valorTotal = dadosCompra.quantidade * preco;
                            vendaData.tipo_sorteio = 'especial_agendado';
                            vendaData.sorteio_id_especial = SORTEIO_ESPECIAL_DATAHORA;
                            vendaData.sorteio_id = 0;
                            
                            for(let i=0; i<dadosCompra.quantidade; i++) cartelasGeradas.push(gerarDadosCartela(SORTEIO_ESPECIAL_DATAHORA));
                        } else {
                            const preco = parseFloat(PRECO_CARTELA);
                            valorTotal = dadosCompra.quantidade * preco;
                            let sorteioAlvo = (estadoJogo === "ESPERANDO") ? numeroDoSorteio : numeroDoSorteio + 1;
                            vendaData.tipo_sorteio = 'regular';
                            vendaData.sorteio_id = sorteioAlvo;
                            
                            for(let i=0; i<dadosCompra.quantidade; i++) cartelasGeradas.push(gerarDadosCartela(sorteioAlvo));
                        }

                        vendaData.valor_total = valorTotal;
                        vendaData.cartelas_json = JSON.stringify(cartelasGeradas);

                        const novaVenda = await Venda.create(vendaData);
                        console.log(`Venda criada #${novaVenda._id} via Webhook.`);

                        if (cambistaId) {
                            await Comissao.create({
                                cambista_id: cambistaId,
                                venda_id: novaVenda._id,
                                valor_venda: valorTotal,
                                valor_comissao: valorTotal * 0.30,
                                status_pagamento: 'pendente'
                            });
                        }

                        await PagamentoPendente.deleteOne({ _id: pendente._id });
                    }
                }
            } catch(errPayment) {
                console.error("Erro ao buscar pagamento no MP:", errPayment);
            }
        }
        res.sendStatus(200);
    } catch (e) {
        console.error('Erro geral no Webhook:', e);
        res.sendStatus(500);
    }
});

app.use(express.json());

// --- VARIÁVEIS GLOBAIS DE MEMÓRIA ---
let PREMIO_LINHA = '100.00', PREMIO_CHEIA = '500.00', PRECO_CARTELA = '5.00';
let DURACAO_ESPERA_ATUAL = 20, MIN_BOTS_ATUAL = 80, MAX_BOTS_ATUAL = 150;
let numeroDoSorteio = 500;
let PRECO_CARTELA_ESPECIAL_ATUAL = '10.00', SORTEIO_ESPECIAL_DATAHORA = '', SORTEIO_ESPECIAL_ATIVO = 'false';
let sorteioEspecialEmAndamento = false;

async function carregarConfiguracoes() {
    try {
        const configs = await Config.find({});
        const map = {};
        configs.forEach(c => map[c.chave] = c.valor);

        PREMIO_LINHA = map.premio_linha || '100.00';
        PREMIO_CHEIA = map.premio_cheia || '500.00';
        PRECO_CARTELA = map.preco_cartela || '5.00';
        DURACAO_ESPERA_ATUAL = parseInt(map.duracao_espera) || 20;
        MIN_BOTS_ATUAL = parseInt(map.min_bots) || 80;
        MAX_BOTS_ATUAL = parseInt(map.max_bots) || 150;
        numeroDoSorteio = parseInt(map.numero_sorteio_atual) || 500;
        
        SORTEIO_ESPECIAL_ATIVO = map.sorteio_especial_ativo || 'false';
        SORTEIO_ESPECIAL_DATAHORA = map.sorteio_especial_datahora || '';
        PRECO_CARTELA_ESPECIAL_ATUAL = map.sorteio_especial_preco_cartela || '10.00';
        
        console.log(`Configs carregadas. Sorteio Atual: #${numeroDoSorteio}`);
    } catch (err) {
        console.error("Erro ao carregar configurações:", err);
    }
}

// --- FUNÇÃO DE PERSISTÊNCIA (NOVA) ---
async function salvarEstadoJogo() {
    try {
        await GameState.findOneAndUpdate(
            { chave: 'estado_atual' },
            {
                estado: estadoJogo,
                numero_sorteio: numeroDoSorteio,
                numeros_sorteados: numerosSorteados,
                numeros_disponiveis: numerosDisponiveis,
                tempo_restante: tempoRestante,
                sorteio_especial_em_andamento: sorteioEspecialEmAndamento
            },
            { upsert: true }
        );
    } catch (e) {
        console.error("Erro ao salvar estado do jogo:", e);
    }
}

// --- ROTAS DE ARQUIVOS ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'anuncio.html')));
app.get('/dashboard-real', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/ping', (req, res) => res.send('pong'));

// --- ROTAS ADMIN ---
app.post('/admin/login', async (req, res) => {
    const { usuario, senha } = req.body;
    try {
        const admin = await Admin.findOne({ usuario });
        if (admin && await bcrypt.compare(senha, admin.senha)) {
            req.session.isAdmin = true;
            req.session.usuario = usuario;
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

function checkAdmin(req, res, next) {
    if (req.session.isAdmin) next();
    else if (req.xhr || req.headers.accept.indexOf('json') > -1) res.status(403).json({success:false, message:'Não autorizado'});
    else res.redirect('/admin/login.html');
}

app.get('/admin/premios-e-preco', checkAdmin, async (req, res) => {
    const configs = await Config.find({});
    const map = {};
    configs.forEach(c => map[c.chave] = c.valor);
    res.json(map);
});

app.post('/admin/premios-e-preco', checkAdmin, async (req, res) => {
    const dados = req.body;
    try {
        for (const [chave, valor] of Object.entries(dados)) {
            await Config.findOneAndUpdate({ chave }, { valor: String(valor) }, { upsert: true });
        }
        await carregarConfiguracoes();
        
        const novasConfigs = await Config.find({});
        const map = {};
        novasConfigs.forEach(c => map[c.chave] = c.valor);
        io.emit('configAtualizada', map);
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/admin/gerar-cartelas', checkAdmin, async (req, res) => {
    if (sorteioEspecialEmAndamento) return res.status(400).json({ success: false, message: 'Sorteio Especial em andamento' });
    
    const { quantidade, nome, telefone } = req.body;
    const sorteioAlvo = (estadoJogo === "ESPERANDO") ? numeroDoSorteio : numeroDoSorteio + 1;
    const preco = parseFloat(PRECO_CARTELA);
    
    const cartelas = [];
    for(let i=0; i<quantidade; i++) cartelas.push(gerarDadosCartela(sorteioAlvo));
    
    await Venda.create({
        sorteio_id: sorteioAlvo,
        nome_jogador: nome,
        telefone: telefone,
        quantidade_cartelas: quantidade,
        valor_total: quantidade * preco,
        tipo_venda: 'Manual',
        cartelas_json: JSON.stringify(cartelas),
        tipo_sorteio: 'regular'
    });

    const manualPlayerId = `manual_${gerarIdUnico()}`;
    jogadores[manualPlayerId] = { nome, telefone, isManual: true, cartelas };
    io.emit('contagemJogadores', getContagemJogadores());
    
    res.json(cartelas);
});

app.get('/admin/api/vendas', checkAdmin, async (req, res) => {
    const vendas = await Venda.find().sort({ timestamp: -1 });
    const formatadas = vendas.map(v => ({
        ...v.toObject(),
        data_formatada: formatarDataBR(v.timestamp),
        sorteio_id: v.tipo_sorteio === 'especial_agendado' ? v.sorteio_id_especial : v.sorteio_id
    }));
    
    const total = vendas.reduce((acc, v) => acc + v.valor_total, 0);
    const qtd = vendas.reduce((acc, v) => acc + v.quantidade_cartelas, 0);
    
    res.json({ success: true, vendas: formatadas, totais: { faturamento_total: total, cartelas_total: qtd } });
});

app.post('/admin/api/vendas/limpar', checkAdmin, async (req, res) => {
    const r = await Venda.deleteMany({});
    res.json({ success: true, changes: r.deletedCount });
});

app.get('/admin/api/vencedores', checkAdmin, async (req, res) => {
    const vencedores = await Vencedor.find().sort({ timestamp: -1 });
    const formatados = vencedores.map(v => ({
        ...v.toObject(),
        data_formatada: formatarDataBR(v.timestamp),
        id: v._id 
    }));
    res.json({ success: true, vencedores: formatados });
});

app.post('/admin/api/vencedor/pagar', checkAdmin, async (req, res) => {
    await Vencedor.findByIdAndUpdate(req.body.id, { status_pagamento: 'Pago' });
    res.json({ success: true });
});

app.post('/admin/api/vencedores/limpar', checkAdmin, async (req, res) => {
    const r = await Vencedor.deleteMany({});
    res.json({ success: true, changes: r.deletedCount });
});

app.get('/admin/api/cambistas', checkAdmin, async (req, res) => {
    const lista = await Cambista.find().sort({ usuario: 1 });
    const formatados = lista.map(c => ({...c.toObject(), id: c._id}));
    res.json({ success: true, cambistas: formatados });
});

app.post('/admin/api/cambistas/criar', checkAdmin, async (req, res) => {
    try {
        const hash = await bcrypt.hash(req.body.senha, 10);
        const novo = await Cambista.create({ usuario: req.body.usuario, senha: hash });
        res.json({ success: true, id: novo._id });
    } catch(e) {
        res.status(400).json({ success: false, message: 'Erro ou usuário já existe' });
    }
});

app.post('/admin/api/cambistas/toggle-status', checkAdmin, async (req, res) => {
    const cambista = await Cambista.findById(req.body.cambistaId);
    if (!cambista) return res.status(404).json({ success: false });
    cambista.ativo = !cambista.ativo;
    await cambista.save();
    res.json({ success: true, novoStatus: cambista.ativo });
});

app.post('/admin/api/cambistas/adicionar-creditos', checkAdmin, async (req, res) => {
    const { cambistaId, valor } = req.body;
    const cambista = await Cambista.findByIdAndUpdate(cambistaId, { $inc: { saldo_creditos: parseFloat(valor) } }, { new: true });
    
    await TransacaoCredito.create({
        cambista_id: cambistaId,
        admin_usuario: req.session.usuario,
        valor_alteracao: parseFloat(valor),
        tipo: 'recarga'
    });
    
    res.json({ success: true, novoSaldo: cambista.saldo_creditos });
});

app.get('/admin/api/comissoes', checkAdmin, async (req, res) => {
    const comissoes = await Comissao.find()
        .populate('cambista_id', 'usuario')
        .populate('venda_id', 'nome_jogador')
        .sort({ timestamp: -1 });
        
    const formatadas = comissoes.map(c => ({
        id: c._id,
        valor_venda: c.valor_venda,
        valor_comissao: c.valor_comissao,
        status_pagamento: c.status_pagamento,
        data_formatada: formatarDataBR(c.timestamp),
        nome_jogador: c.venda_id ? c.venda_id.nome_jogador : 'Desconhecido',
        cambista_usuario: c.cambista_id ? c.cambista_id.usuario : 'Removido'
    }));
    
    const pendentes = await Comissao.aggregate([
        { $match: { status_pagamento: 'pendente' } },
        { $group: { _id: null, total: { $sum: '$valor_comissao' } } }
    ]);
    
    res.json({ success: true, comissoes: formatadas, totalPendente: pendentes[0] ? pendentes[0].total : 0 });
});

app.post('/admin/api/comissao/pagar', checkAdmin, async (req, res) => {
    await Comissao.findByIdAndUpdate(req.body.id, { status_pagamento: 'pago' });
    res.json({ success: true });
});

// --- ROTAS CAMBISTA ---
function checkCambista(req, res, next) {
    if (req.session.isCambista) next();
    else res.status(403).json({ success: false });
}

app.get('/cambista/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cambista', 'login.html')));
app.get('/cambista/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cambista', 'login.html')));
app.use('/cambista', express.static(path.join(__dirname, 'public', 'cambista')));

app.post('/cambista/login', async (req, res) => {
    const { usuario, senha } = req.body;
    try {
        const cambista = await Cambista.findOne({ usuario, ativo: true });
        if (cambista && await bcrypt.compare(senha, cambista.senha)) {
            req.session.isCambista = true;
            req.session.cambistaId = cambista._id;
            req.session.cambistaUsuario = usuario;
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false });
        }
    } catch(e) {
        res.status(500).json({ success: false });
    }
});

app.get('/cambista/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/cambista/login.html');
});

app.get('/cambista/painel.html', checkCambista, (req, res) => res.sendFile(path.join(__dirname, 'public', 'cambista', 'painel.html')));

app.get('/cambista/meu-status', checkCambista, async (req, res) => {
    const c = await Cambista.findById(req.session.cambistaId);
    res.json({ success: true, usuario: c.usuario, saldo: c.saldo_creditos, precoCartela: PRECO_CARTELA });
});

app.post('/cambista/gerar-cartelas', checkCambista, async (req, res) => {
    if (sorteioEspecialEmAndamento) return res.status(400).json({ success: false, message: 'Sorteio Especial em andamento' });
    
    const { quantidade, nome, telefone } = req.body;
    const preco = parseFloat(PRECO_CARTELA);
    const total = quantidade * preco;
    const cambistaId = req.session.cambistaId;
    
    const cambista = await Cambista.findById(cambistaId);
    if (cambista.saldo_creditos < total) return res.status(400).json({ success: false, message: 'Saldo insuficiente' });
    
    cambista.saldo_creditos -= total;
    await cambista.save();
    
    const sorteioAlvo = (estadoJogo === "ESPERANDO") ? numeroDoSorteio : numeroDoSorteio + 1;
    const cartelas = [];
    for(let i=0; i<quantidade; i++) cartelas.push(gerarDadosCartela(sorteioAlvo));
    
    const novaVenda = await Venda.create({
        sorteio_id: sorteioAlvo,
        nome_jogador: nome,
        telefone: telefone,
        quantidade_cartelas: quantidade,
        valor_total: total,
        tipo_venda: 'Cambista',
        cartelas_json: JSON.stringify(cartelas),
        cambista_id: cambistaId,
        tipo_sorteio: 'regular'
    });
    
    await TransacaoCredito.create({
        cambista_id: cambistaId,
        admin_usuario: req.session.cambistaUsuario,
        valor_alteracao: -total,
        tipo: 'venda',
        venda_id: novaVenda._id
    });
    
    const manualPlayerId = `manual_${gerarIdUnico()}`;
    jogadores[manualPlayerId] = { nome, telefone, isManual: true, cartelas };
    io.emit('contagemJogadores', getContagemJogadores());
    
    res.json({ success: true, novoSaldo: cambista.saldo_creditos, cartelas });
});

app.get('/cambista/minhas-comissoes', checkCambista, async (req, res) => {
    const comissoes = await Comissao.find({ cambista_id: req.session.cambistaId })
        .populate('venda_id', 'nome_jogador')
        .sort({ timestamp: -1 });
        
    const formatadas = comissoes.map(c => ({
        ...c.toObject(),
        data_formatada: formatarDataBR(c.timestamp),
        nome_jogador: c.venda_id ? c.venda_id.nome_jogador : '?'
    }));
    
    const pendentes = await Comissao.aggregate([
        { $match: { cambista_id: new mongoose.Types.ObjectId(req.session.cambistaId), status_pagamento: 'pendente' } },
        { $group: { _id: null, total: { $sum: '$valor_comissao' } } }
    ]);
    
    res.json({ success: true, comissoes: formatadas, totalPendente: pendentes[0] ? pendentes[0].total : 0 });
});


// --- LÓGICA DO JOGO (SOCKET.IO) ---
const nomesBots = ["Maria Souza", "João Pereira", "Ana Costa", "Carlos Santos", "Sofia Oliveira", "Pedro Almeida", "Lucas Rodrigues", "Beatriz Lima", "Guilherme Azevedo", "Gustavo Lima", "Larissa Manoela", "Neymar Junior", "Anitta", "Roberto Carlos", "Silvio Santos"]; 
const TEMPO_ENTRE_NUMEROS = 5000;
const MAX_VENCEDORES_HISTORICO = 10;
const MIN_CARTELAS_POR_BOT = 1, MAX_CARTELAS_POR_BOT = 5;
const LIMITE_FALTANTES_QUASELA = 5, MAX_JOGADORES_QUASELA = 5;

let estadoJogo = "ESPERANDO";
let tempoRestante = 20;
let intervaloSorteio = null;
let numerosDisponiveis = [];
let numerosSorteados = [];
let jogadores = {};

function gerarIdUnico() { return Math.random().toString(36).substring(2, 6); }

// --- RNG SEGURO (Substituindo Math.random) ---
function gerarNumerosAleatorios(qtd, min, max) { 
    const nums = new Set(); 
    // Garante que não trava se o intervalo for menor que a qtd pedida
    if (max - min + 1 < qtd) return []; 
    
    while(nums.size < qtd) {
        // randomInt gera um inteiro criptograficamente seguro: [min, max)
        // Por isso usamos max + 1 no limite superior
        nums.add(randomInt(min, max + 1)); 
    }
    return Array.from(nums); 
}

function gerarDadosCartela(sId) {
    const c = [];
    const cols = [
        gerarNumerosAleatorios(5, 1, 15), gerarNumerosAleatorios(5, 16, 30),
        gerarNumerosAleatorios(4, 31, 45), gerarNumerosAleatorios(5, 46, 60),
        gerarNumerosAleatorios(5, 61, 75)
    ];
    for(let i=0; i<5; i++) {
        const linha = [];
        for(let j=0; j<5; j++) {
            if(j===2 && i===2) linha.push("FREE");
            else if(j===2) linha.push(cols[j][i>2?i-1:i]);
            else linha.push(cols[j][i]);
        }
        c.push(linha);
    }
    return { c_id: gerarIdUnico(), s_id: sId, data: c };
}

function checarVencedorLinha(cartelaData, sorteados) { 
    const c = cartelaData.data; const s = new Set(sorteados); s.add("FREE");
    for(let i=0; i<5; i++) if(c[i].every(n => s.has(n))) return true; 
    for(let i=0; i<5; i++) if(c.every(l => s.has(l[i]))) return true;
    if(c.every((l,i) => s.has(l[i]))) return true;
    if(c.every((l,i) => s.has(l[4-i]))) return true;
    return false; 
}
function checarVencedorCartelaCheia(cartelaData, sorteadosSet) {
    const c = cartelaData.data; const s = new Set(sorteadosSet); s.add("FREE");
    for(let i=0; i<5; i++) for(let j=0; j<5; j++) if(!s.has(c[i][j])) return false;
    return true;
}
function contarFaltantesParaCheia(cartelaData, sSet) {
    let f = 0; const c = cartelaData.data;
    for(let i=0; i<5; i++) for(let j=0; j<5; j++) if(c[i][j]!=="FREE" && !sSet.has(c[i][j])) f++;
    return f;
}

function getContagemJogadores() {
    const arr = Object.values(jogadores);
    return { total: arr.length, reais: arr.filter(j => !j.isBot && !j.isManual).length };
}

async function getUltimosVencedores() {
    const v = await Vencedor.find().sort({ timestamp: -1 }).limit(MAX_VENCEDORES_HISTORICO);
    return v.map(x => ({ sorteioId: x.sorteio_id, premio: x.premio, nome: x.nome }));
}

async function getAdminStatusData() {
    const idSorteioAtual = sorteioEspecialEmAndamento ? SORTEIO_ESPECIAL_DATAHORA : numeroDoSorteio;

    const statusData = {
        estado: estadoJogo,
        sorteioAtual: idSorteioAtual,
        tempoRestante: (estadoJogo === 'ESPERANDO') ? tempoRestante : null,
        jogadoresReais: getContagemJogadores().reais,
        vendasProximoSorteio: { qtd_cartelas: 0, valor_total: 0 },
        receitaDoDia: 0,
        proximoSorteioId: 0
    };

    try {
        let proximoSorteioId = 0;
        let matchCriteria = {};

        if (sorteioEspecialEmAndamento) {
            proximoSorteioId = idSorteioAtual;
            matchCriteria = { tipo_sorteio: 'especial_agendado', sorteio_id_especial: idSorteioAtual };
        } else {
            proximoSorteioId = (estadoJogo === 'ESPERANDO') ? numeroDoSorteio : numeroDoSorteio + 1;
            matchCriteria = { tipo_sorteio: 'regular', sorteio_id: proximoSorteioId };
        }
        statusData.proximoSorteioId = proximoSorteioId;

        const vendasRes = await Venda.aggregate([
            { $match: matchCriteria },
            { $group: { _id: null, qtd: { $sum: 1 }, total: { $sum: "$valor_total" } } }
        ]);

        if (vendasRes.length > 0) {
            statusData.vendasProximoSorteio = { 
                qtd_cartelas: vendasRes[0].qtd, 
                valor_total: vendasRes[0].total 
            };
        }

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const receitaRes = await Venda.aggregate([
            { $match: { timestamp: { $gte: startOfDay, $lte: endOfDay } } },
            { $group: { _id: null, total: { $sum: "$valor_total" } } }
        ]);

        if (receitaRes.length > 0) {
            statusData.receitaDoDia = receitaRes[0].total;
        }

    } catch (error) {
        console.error("Erro ao calcular status do admin:", error);
    }

    return statusData;
}

// Loop Principal
setInterval(() => {
    verificarSorteioEspecial();
    if (estadoJogo === "ESPERANDO" && !sorteioEspecialEmAndamento) {
        tempoRestante--;
        if (tempoRestante % 5 === 0) salvarEstadoJogo(); // Salva periodicamente na espera
        
        if (tempoRestante <= 0) {
            estadoJogo = "JOGANDO_LINHA";
            io.emit('iniciarJogo');
            iniciarNovaRodada();
        } else {
            io.emit('cronometroUpdate', { tempo: tempoRestante, sorteioId: numeroDoSorteio, estado: estadoJogo });
        }
    } else {
        const idAtual = sorteioEspecialEmAndamento ? SORTEIO_ESPECIAL_DATAHORA : numeroDoSorteio;
        io.emit('estadoJogoUpdate', { sorteioId: idAtual, estado: estadoJogo });
    }
}, 1000);

async function verificarSorteioEspecial() {
    if (SORTEIO_ESPECIAL_ATIVO !== 'true' || !SORTEIO_ESPECIAL_DATAHORA || sorteioEspecialEmAndamento || estadoJogo !== 'ESPERANDO') return;
    try {
        const agendado = new Date(SORTEIO_ESPECIAL_DATAHORA + "-04:00");
        if (new Date() >= agendado) await iniciarSorteioEspecial();
    } catch(e) { console.error('Data especial inválida'); }
}

async function iniciarSorteioEspecial() {
    sorteioEspecialEmAndamento = true;
    estadoJogo = "JOGANDO_CHEIA";
    jogadores = {};
    numerosDisponiveis = Array.from({length:75}, (_,i)=>i+1);
    numerosSorteados = [];
    if(intervaloSorteio) clearInterval(intervaloSorteio);

    const vendas = await Venda.find({ tipo_sorteio: 'especial_agendado', sorteio_id_especial: SORTEIO_ESPECIAL_DATAHORA });
    vendas.forEach(v => {
        const cartelas = JSON.parse(v.cartelas_json);
        jogadores[`especial_${v._id}`] = { nome: v.nome_jogador, telefone: v.telefone, isManual: true, cartelas };
    });

    const nBots = randomInt(MIN_BOTS_ATUAL, MAX_BOTS_ATUAL + 1); // Crypto Random
    for(let i=0; i<nBots; i++) {
        const bC = [];
        for(let k=0; k<3; k++) bC.push(gerarDadosCartela(SORTEIO_ESPECIAL_DATAHORA));
        jogadores[`bot_${gerarIdUnico()}`] = { nome: nomesBots[i%nomesBots.length], isBot: true, cartelas: bC };
    }
    
    // SALVA O ESTADO
    await salvarEstadoJogo();

    io.emit('iniciarJogo');
    io.emit('estadoJogoUpdate', { sorteioId: SORTEIO_ESPECIAL_DATAHORA, estado: estadoJogo });
    io.emit('contagemJogadores', getContagemJogadores());
    io.emit('atualizarQuaseLa', []);
    
    setTimeout(() => { intervaloSorteio = setInterval(sortearNumero, TEMPO_ENTRE_NUMEROS); }, 5000);
}

function iniciarNovaRodada() {
    if (sorteioEspecialEmAndamento) return;
    numerosDisponiveis = Array.from({length:75}, (_,i)=>i+1);
    numerosSorteados = [];
    if(intervaloSorteio) clearInterval(intervaloSorteio);
    
    const novosJogadores = {};
    for(const id in jogadores) {
        if(jogadores[id].isManual && jogadores[id].cartelas[0].s_id == numeroDoSorteio) novosJogadores[id] = jogadores[id];
    }
    jogadores = novosJogadores;

    const nBots = randomInt(MIN_BOTS_ATUAL, MAX_BOTS_ATUAL + 1); // Crypto Random
    for(let i=0; i<nBots; i++) {
        const bC = [];
        // RandomInt para qtd de cartelas: 1 a 3
        const qtdCartelasBot = randomInt(1, 4); 
        for(let k=0; k<qtdCartelasBot; k++) bC.push(gerarDadosCartela(numeroDoSorteio));
        
        // RandomInt para nome
        const nomeIndex = randomInt(0, nomesBots.length);
        jogadores[`bot_${gerarIdUnico()}`] = { nome: nomesBots[nomeIndex], isBot: true, cartelas: bC };
    }

    // SALVA O ESTADO
    salvarEstadoJogo();

    io.emit('estadoJogoUpdate', { sorteioId: numeroDoSorteio, estado: estadoJogo });
    io.emit('contagemJogadores', getContagemJogadores());
    io.emit('atualizarQuaseLa', []);
    
    setTimeout(() => { intervaloSorteio = setInterval(sortearNumero, TEMPO_ENTRE_NUMEROS); }, 5000);
}

async function sortearNumero() {
    if(numerosDisponiveis.length === 0) { terminarRodada(null); return; }
    
    // --- SORTEIO SEGURO COM CRYPTO ---
    // Escolhe um índice aleatório dentro do array de disponíveis
    const indiceSorteado = randomInt(0, numerosDisponiveis.length);
    const num = numerosDisponiveis.splice(indiceSorteado, 1)[0];
    
    numerosSorteados.push(num);
    io.emit('novoNumeroSorteado', num);
    
    // --- PERSISTÊNCIA CRÍTICA: SALVA A CADA PEDRA ---
    await salvarEstadoJogo();
    
    const sSet = new Set(numerosSorteados);
    const idSorteio = sorteioEspecialEmAndamento ? SORTEIO_ESPECIAL_DATAHORA : numeroDoSorteio;
    
    if(estadoJogo === "JOGANDO_LINHA") {
        for(const sid in jogadores) {
            const jog = jogadores[sid];
            for(let i=0; i<jog.cartelas.length; i++) {
                if(jog.cartelas[i].s_id != idSorteio) continue;
                if(checarVencedorLinha(jog.cartelas[i], numerosSorteados)) {
                    await salvarVencedor(idSorteio, 'Linha', jog.nome, jog.telefone, jog.cartelas[i].c_id);
                    const sock = io.sockets.sockets.get(sid);
                    if(sock && !jog.isBot && !jog.isManual) {
                        sock.emit('voceGanhouLinha', { cartelaGanhadora: jog.cartelas[i], indiceCartela: i, premioValor: PREMIO_LINHA });
                        sock.broadcast.emit('alguemGanhouLinha', { nome: jog.nome });
                    } else io.emit('alguemGanhouLinha', { nome: jog.nome });
                    
                    estadoJogo = "JOGANDO_CHEIA";
                    await salvarEstadoJogo(); // Salva a mudança de estado
                    io.emit('estadoJogoUpdate', { sorteioId: idSorteio, estado: estadoJogo });
                    return; 
                }
            }
        }
    }
    
    if(estadoJogo === "JOGANDO_CHEIA") {
        for(const sid in jogadores) {
            const jog = jogadores[sid];
            for(let i=0; i<jog.cartelas.length; i++) {
                if(jog.cartelas[i].s_id != idSorteio) continue;
                if(checarVencedorCartelaCheia(jog.cartelas[i], sSet)) {
                    clearInterval(intervaloSorteio);
                    estadoJogo = "ANUNCIANDO_VENCEDOR";
                    await salvarEstadoJogo(); // Salva o fim do sorteio
                    io.emit('estadoJogoUpdate', { sorteioId: idSorteio, estado: estadoJogo });
                    
                    await salvarVencedor(idSorteio, 'Cartela Cheia', jog.nome, jog.telefone, jog.cartelas[i].c_id);
                    
                    setTimeout(() => {
                        const premioValor = sorteioEspecialEmAndamento 
                            ? parseFloat(String(Config.findOne({chave:'sorteio_especial_valor'}).valor || '1000')) 
                            : PREMIO_CHEIA;
                            
                        const dadosVencedor = { nome: jog.nome, cartelaGanhadora: jog.cartelas[i], indiceCartela: i, premioValor: premioValor };
                        const sock = (!jog.isBot && !jog.isManual) ? sid : null;
                        terminarRodada(dadosVencedor, sock);
                    }, 5000);
                    return;
                }
            }
        }
    }
    
    const perto = [];
    for(const sid in jogadores) {
        if(!jogadores[sid].cartelas) continue;
        for(const c of jogadores[sid].cartelas) {
            if(c.s_id != idSorteio) continue;
            const f = contarFaltantesParaCheia(c, sSet);
            if(f > 0 && f <= LIMITE_FALTANTES_QUASELA) perto.push({ nome: jogadores[sid].nome, faltam: f });
        }
    }
    io.emit('atualizarQuaseLa', perto.sort((a,b)=>a.faltam-b.faltam).slice(0, MAX_JOGADORES_QUASELA));
}

async function salvarVencedor(sid, premio, nome, tel, cid) {
    await Vencedor.create({ sorteio_id: sid, premio, nome, telefone: tel, cartela_id: cid });
    const u = await getUltimosVencedores();
    io.emit('atualizarVencedores', u);
}

async function terminarRodada(vencedor, socketId) {
    if(vencedor) {
        if(socketId && io.sockets.sockets.get(socketId)) {
            io.to(socketId).emit('voceGanhouCartelaCheia', vencedor);
            io.sockets.sockets.get(socketId).broadcast.emit('alguemGanhouCartelaCheia', { nome: vencedor.nome });
        } else {
            io.emit('alguemGanhouCartelaCheia', { nome: vencedor.nome });
        }
    } else io.emit('jogoTerminouSemVencedor');

    if(sorteioEspecialEmAndamento) {
        sorteioEspecialEmAndamento = false;
        await Config.findOneAndUpdate({ chave: 'sorteio_especial_ativo' }, { valor: 'false' }, { upsert: true });
        await Config.findOneAndUpdate({ chave: 'sorteio_especial_datahora' }, { valor: '' }, { upsert: true });
        await carregarConfiguracoes();
    } else {
        numeroDoSorteio++;
        await Config.findOneAndUpdate({ chave: 'numero_sorteio_atual' }, { valor: String(numeroDoSorteio) }, { upsert: true });
    }
    
    tempoRestante = DURACAO_ESPERA_ATUAL;
    estadoJogo = "ESPERANDO";
    await salvarEstadoJogo(); // Salva que voltou para espera

    io.emit('estadoJogoUpdate', { sorteioId: numeroDoSorteio, estado: estadoJogo });
    io.emit('atualizarQuaseLa', []);
}

// IO Connection
io.on('connection', async (socket) => {
    const idAtual = sorteioEspecialEmAndamento ? SORTEIO_ESPECIAL_DATAHORA : numeroDoSorteio;
    const cont = getContagemJogadores();
    const ultimos = await getUltimosVencedores();
    const configs = await Config.find({});
    const configMap = {}; configs.forEach(c => configMap[c.chave] = c.valor);

    socket.emit('estadoInicial', {
        sorteioId: idAtual,
        estado: estadoJogo,
        tempoRestante: (estadoJogo==='ESPERANDO' && !sorteioEspecialEmAndamento) ? tempoRestante : 0,
        jogadoresOnline: cont.total,
        jogadoresReais: cont.reais,
        ultimosVencedores: ultimos,
        numerosSorteados: numerosSorteados, // Manda o histórico para quem reconecta
        configuracoes: configMap
    });

    socket.on('criarPagamento', async (dados, cb) => {
        const { nome, telefone, quantidade, refCode } = dados;
        let cambistaIdParaSalvar = null;

        if (refCode) {
            const cambista = await Cambista.findOne({ usuario: refCode, ativo: true });
            if (cambista) cambistaIdParaSalvar = cambista._id;
        }

        try {
            if(!process.env.BASE_URL) return cb({success:false, message:'URL base não configurada'});
            const preco = parseFloat(PRECO_CARTELA);
            const total = quantidade * preco;
            
            const payment = new Payment(mpClient);
            const body = {
                transaction_amount: total,
                description: `Compra ${quantidade} cartelas`,
                payment_method_id: 'pix',
                notification_url: `${process.env.BASE_URL}/webhook-mercadopago`,
                payer: { email: `jogador_${telefone}@bingo.com`, first_name: nome }
            };
            const response = await payment.create({ body });
            const pid = response.id.toString();
            
            dados.tipo_compra = 'regular';
            
            await PagamentoPendente.updateOne(
                { payment_id: pid },
                { socket_id: socket.id, dados_compra_json: JSON.stringify(dados), cambista_id: cambistaIdParaSalvar },
                { upsert: true }
            );
            
            cb({ success: true, qrCodeBase64: response.point_of_interaction.transaction_data.qr_code_base64, qrCodeCopiaCola: response.point_of_interaction.transaction_data.qr_code, paymentId: pid });
        } catch(e) { console.error(e); cb({success:false}); }
    });

    socket.on('criarPagamentoEspecial', async (dados, cb) => {
        const { nome, telefone, quantidade, refCode } = dados;
        let cambistaIdParaSalvar = null;

        if (refCode) {
            const cambista = await Cambista.findOne({ usuario: refCode, ativo: true });
            if (cambista) cambistaIdParaSalvar = cambista._id;
        }

        try {
            if(!process.env.BASE_URL) return cb({success:false, message:'URL base não configurada'});
            const preco = parseFloat(PRECO_CARTELA_ESPECIAL_ATUAL);
            const total = quantidade * preco;
            
            const payment = new Payment(mpClient);
            const body = {
                transaction_amount: total,
                description: `Compra Especial ${quantidade} cartelas`,
                payment_method_id: 'pix',
                notification_url: `${process.env.BASE_URL}/webhook-mercadopago`,
                payer: { email: `jogador_${telefone}@bingo.com`, first_name: nome }
            };
            const response = await payment.create({ body });
            const pid = response.id.toString();
            
            dados.tipo_compra = 'especial';
            
            await PagamentoPendente.updateOne(
                { payment_id: pid },
                { socket_id: socket.id, dados_compra_json: JSON.stringify(dados), cambista_id: cambistaIdParaSalvar },
                { upsert: true }
            );
            
            cb({ success: true, qrCodeBase64: response.point_of_interaction.transaction_data.qr_code_base64, qrCodeCopiaCola: response.point_of_interaction.transaction_data.qr_code, paymentId: pid });
        } catch(e) { console.error(e); cb({success:false}); }
    });
    
    socket.on('checarMeuPagamento', async (data) => {
        const v = await Venda.findOne({ payment_id: data.paymentId });
        if(v) socket.emit('pagamentoAprovado', { vendaId: v.id, nome: v.nome_jogador, telefone: v.telefone });
    });

    socket.on('buscarCartelasPorTelefone', async (data, cb) => {
        const vendas = await Venda.find({ 
            telefone: data.telefone,
            $or: [
                { tipo_sorteio: 'especial_agendado' },
                { tipo_sorteio: 'regular', sorteio_id: { $gte: numeroDoSorteio - 5 } }
            ]
        }).sort({ timestamp: -1 }).limit(20);
        
        const formatadas = vendas.map(v => ({
            id: v.id,
            sorteio_id: v.sorteio_id,
            sorteio_id_especial: v.sorteio_id_especial,
            quantidade_cartelas: v.quantidade_cartelas,
            data_formatada: formatarDataBR(v.timestamp),
            nome_jogador: v.nome_jogador,
            tipo_sorteio: v.tipo_sorteio
        }));
        
        const proximo = (estadoJogo==="ESPERANDO" && !sorteioEspecialEmAndamento) ? numeroDoSorteio : numeroDoSorteio+1;
        cb({ success: true, vendas: formatadas, proximoSorteioId: proximo });
    });
    
    socket.on('checarMeusPremios', async (data, cb) => {
        const p = await Vencedor.find({ telefone: data.telefone }).sort({ timestamp: -1 });
        const formatados = p.map(x => ({...x.toObject(), data_formatada: formatarDataBR(x.timestamp)}));
        if(formatados.length > 0) cb({ success: true, premios: formatados });
        else cb({ success: false });
    });
    
    socket.on('buscarMinhasCartelas', async (data) => {
        try {
            const v = await Venda.findById(data.vendaId);
            if(v && v.nome_jogador === data.nome) socket.emit('cartelasEncontradas', { cartelas: JSON.parse(v.cartelas_json) });
            else socket.emit('cartelasNaoEncontradas');
        } catch(e) { socket.emit('cartelasNaoEncontradas'); }
    });

    socket.on('registerPlayer', (p) => {
        if(p && p.cartelas.length > 0) {
            const sId = p.cartelas[0].s_id;
            const valido = sorteioEspecialEmAndamento ? SORTEIO_ESPECIAL_DATAHORA : numeroDoSorteio;
            if(sId == valido) {
                jogadores[socket.id] = { nome: p.nome, telefone: p.telefone, cartelas: p.cartelas };
                io.emit('contagemJogadores', getContagemJogadores());
            } else socket.emit('cartelaAntiga');
        }
    });
    
    socket.on('getAdminStatus', async () => {
        try {
            const statusData = await getAdminStatusData();
            socket.emit('adminStatusUpdate', statusData);
        } catch (e) {
            console.error("Erro ao processar getAdminStatus:", e);
        }
    });
    
    socket.on('disconnect', () => {
        if(jogadores[socket.id]) { delete jogadores[socket.id]; io.emit('contagemJogadores', getContagemJogadores()); }
    });
});

// Inicialização
(async () => {
    await inicializarDados();
    await carregarConfiguracoes();

    // --- LÓGICA DE RECUPERAÇÃO APÓS CRASH/RESTART ---
    try {
        const salvo = await GameState.findOne({ chave: 'estado_atual' });
        // Se existe um estado salvo e não é 'ESPERANDO' (ou seja, caiu no meio do jogo)
        if (salvo && salvo.estado && salvo.estado !== 'ESPERANDO') {
            console.log("⚠️ RECUPERANDO JOGO APÓS REINICIALIZAÇÃO DO SERVIDOR...");
            
            estadoJogo = salvo.estado;
            numeroDoSorteio = salvo.numero_sorteio;
            numerosSorteados = salvo.numeros_sorteados || [];
            numerosDisponiveis = salvo.numeros_disponiveis || [];
            tempoRestante = salvo.tempo_restante;
            sorteioEspecialEmAndamento = salvo.sorteio_especial_em_andamento || false;

            // Se estava jogando, retoma o loop de sorteio
            if (estadoJogo.includes('JOGANDO')) {
                if(intervaloSorteio) clearInterval(intervaloSorteio);
                intervaloSorteio = setInterval(sortearNumero, TEMPO_ENTRE_NUMEROS);
                console.log(`✅ Jogo recuperado! ${numerosSorteados.length} números já sorteados.`);
            }
        } else {
            // Se estava esperando ou não tinha jogo, limpa o estado para garantir
            await GameState.deleteOne({ chave: 'estado_atual' });
        }
    } catch(e) {
        console.error("Erro ao tentar recuperar estado do jogo:", e);
    }

    server.listen(PORTA, () => console.log(`Servidor Mongo rodando na porta ${PORTA}`));
})();
