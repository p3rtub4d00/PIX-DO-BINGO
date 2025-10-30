const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const Database = require('better-sqlite3');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORTA = process.env.PORT || 3000;

// ==========================================================
// *** IMPORTANTE: CONFIGURAÇÃO DO MERCADO PAGO V3 ***
// ==========================================================
// MODIFICAÇÃO 1: Usar Variável de Ambiente
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN; 

const mpClient = new MercadoPagoConfig({ 
    accessToken: MERCADOPAGO_ACCESS_TOKEN,
    options: { timeout: 5000 }
});

if (!MERCADOPAGO_ACCESS_TOKEN) {
    console.warn("AVISO: MERCADOPAGO_ACCESS_TOKEN não foi configurado nas variáveis de ambiente.");
}

const pagamentosPendentes = {};
// ==========================================================


// ==========================================================
// *** BANCO DE DADOS SQLITE (Estrutura Completa) ***
// ==========================================================

// MODIFICAÇÃO 2: Usar Variável de Ambiente para o caminho do DB
// Isso permite que o Render salve o DB no Disco Persistente
const dbPath = process.env.DATABASE_PATH || 'bingo_data.db'; 
const db = new Database(dbPath);
console.log(`Conectado ao banco de dados em: ${dbPath}`);

db.exec(`
    CREATE TABLE IF NOT EXISTS configuracoes (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE IF NOT EXISTS vencedores (id INTEGER PRIMARY KEY AUTOINCREMENT, sorteio_id INTEGER NOT NULL, premio TEXT NOT NULL, nome TEXT NOT NULL, telefone TEXT, cartela_id TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, status_pagamento TEXT DEFAULT 'Pendente' NOT NULL );
    CREATE TABLE IF NOT EXISTS usuarios_admin (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT UNIQUE NOT NULL, senha TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expire INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS vendas (id INTEGER PRIMARY KEY AUTOINCREMENT, sorteio_id INTEGER NOT NULL, nome_jogador TEXT NOT NULL, telefone TEXT, quantidade_cartelas INTEGER NOT NULL, valor_total REAL NOT NULL, tipo_venda TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
`);
const adminExists = db.prepare('SELECT COUNT(*) as count FROM usuarios_admin').get().count > 0;
if (!adminExists) { db.prepare('INSERT INTO usuarios_admin (usuario, senha) VALUES (?, ?)').run('admin', 'admin123'); console.log("Usuário 'admin' criado."); }
db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('premio_linha', '100.00')").run();
db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('premio_cheia', '500.00')").run();
db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('preco_cartela', '5.00')").run();
db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('sorteio_especial_ativo', 'true')").run();
db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('sorteio_especial_valor', '1000.00')").run();
db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('sorteio_especial_data', 'Dia 25/10/2026 às 19:00')").run();
db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('duracao_espera', '20')").run();
db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('min_bots', '80')").run();
db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('max_bots', '150')").run();

// (O resto do seu código de DB, SESSÃO, MIDDLEWARES, etc. continua aqui... eu vou pular para a próxima modificação)
// ... (código de migração do DB) ...
// ... (código de configuração de sessão) ...

// MODIFICAÇÃO 3: Usar Variável de Ambiente para a Session Secret
const SESSION_SECRET = process.env.SESSION_SECRET || 'seu_segredo_muito_secreto_e_longo_troque_isso!';
if (SESSION_SECRET === 'seu_segredo_muito_secreto_e_longo_troque_isso!') { console.warn("AVISO: Usando chave secreta padrão para sessão..."); }
app.use(session({ store: store, secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true, sameSite: 'lax' } }));

app.use(express.json()); 

// ==========================================================
// *** WEBHOOK MERCADO PAGO (NOVO) ***
// ==========================================================
app.post('/webhook-mercadopago', (req, res) => {
    console.log("Webhook do Mercado Pago recebido!");
    
    if (req.body.type === 'payment') {
        const paymentId = req.body.data.id;
        console.log(`Webhook: ID de Pagamento recebido: ${paymentId}`);

        const payment = new Payment(mpClient);
        payment.get({ id: paymentId })
            .then(pagamento => {
                const status = pagamento.status;
                console.log(`Webhook: Status do Pagamento ${paymentId} é: ${status}`);

                if (status === 'approved' && pagamentosPendentes[paymentId]) {
                    
                    const { socketId, dadosCompra } = pagamentosPendentes[paymentId];
                    const socket = io.sockets.sockets.get(socketId);

                    if (!socket) {
                        console.error(`Webhook ERRO: Socket ${socketId} não encontrado. O jogador pode ter desconectado.`);
                        delete pagamentosPendentes[paymentId]; 
                        return;
                    }

                    console.log(`Webhook: Socket ${socketId} encontrado. Gerando cartelas para ${dadosCompra.nome}...`);

                    try {
                        let sorteioAlvo = (estadoJogo === "ESPERANDO") ? numeroDoSorteio : numeroDoSorteio + 1;
                        const preco = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'preco_cartela'").get();
                        const precoUnitarioAtual = parseFloat(preco.valor || '5.00');
                        const valorTotal = dadosCompra.quantidade * precoUnitarioAtual;
                        
                        const stmtVenda = db.prepare(`INSERT INTO vendas (sorteio_id, nome_jogador, telefone, quantidade_cartelas, valor_total, tipo_venda) VALUES (?, ?, ?, ?, ?, ?)`);
                        stmtVenda.run(sorteioAlvo, dadosCompra.nome, dadosCompra.telefone || null, dadosCompra.quantidade, valorTotal, 'Online');
                        
                        const cartelasGeradas = [];
                        for (let i = 0; i < dadosCompra.quantidade; i++) {
                            cartelasGeradas.push(gerarDadosCartela(sorteioAlvo));
                        }
                        
                        console.log(`Webhook: Venda registrada e ${cartelasGeradas.length} cartelas geradas.`);

                        socket.emit('pagamentoAprovado', {cartelas: cartelasGeradas, nome: dadosCompra.nome, telefone: dadosCompra.telefone});

                        delete pagamentosPendentes[paymentId];

                    } catch (dbError) {
                        console.error("Webhook ERRO CRÍTICO ao salvar no DB ou gerar cartelas:", dbError);
                        if (socket) socket.emit('pagamentoErro', { message: 'Erro ao registrar sua compra após o pagamento. Contate o suporte.' });
                    }

                } else if (status === 'cancelled' || status === 'rejected') {
                    delete pagamentosPendentes[paymentId];
                    const socket = io.sockets.sockets.get(pagamentosPendentes[paymentId]?.socketId);
                    if(socket) socket.emit('pagamentoErro', { message: 'Seu pagamento foi recusado ou cancelado.' });
                }
            })
            .catch(error => {
                console.error("Webhook ERRO: Falha ao buscar pagamento no Mercado Pago:", error);
            });
    }

    res.sendStatus(200);
});

// ... (Todo o resto do seu server.js: carregarConfiguracoes, rotas públicas, rotas admin, etc. permanece igual) ...
// ... (pulando para a seção io.on('connection')) ...

// ==========================================================
// *** LÓGICA DO JOGO (SOCKET.IO) (MODIFICADA) ***
// ==========================================================

// ... (definição de nomesBots, funções de gerar cartela, checar vencedor, etc.) ...
// ... (pulando para io.on('connection')) ...

// (As funções: gerarIdUnico, gerarNumerosAleatorios, gerarDadosCartela, checarVencedorLinha, checarVencedorCartelaCheia, contarFaltantesParaCheia, setInterval, iniciarNovaRodada, sortearNumero, salvarVencedorNoDB, terminarRodada, getContagemJogadores, getUltimosVencedoresDoDB, getAdminStatusData)
// ... (COLE TODO O RESTANTE DO SEU SERVER.JS A PARTIR DAQUI) ...
// ... (A ÚNICA MUDANÇA É DENTRO DO 'socket.on('criarPagamento', ...)' ABAIXO) ...

// Colando o resto do server.js para garantir que está completo
// ==========================================================
// *** VARIÁVEIS GLOBAIS DE CONFIGURAÇÃO (MODIFICADA) ***
// ==========================================================
// ... (Já definido acima) ...

// ==========================================================
// *** ROTAS PÚBLICAS (ANTES DO STATIC) ***
// ==========================================================
// ... (Já definido acima) ...

// ==========================================================
// *** ARQUIVOS ESTÁTICOS (DEPOIS DAS ROTAS CUSTOMIZADAS) ***
// ==========================================================
// ... (Já definido acima) ...

// ==========================================================
// *** ROTAS DE ADMINISTRAÇÃO ***
// ==========================================================
// ... (Todas as suas rotas admin: /admin/login, checkAdmin, /admin/painel.html, /admin/logout, /admin/premios-e-preco, /admin/gerar-cartelas, /admin/relatorios.html, /admin/api/vendas, /admin/api/vendas/limpar, /admin/vencedores.html, /admin/api/vencedores, /admin/api/vencedor/pagar, /admin/api/vencedores/limpar, app.use('/admin', ...)) ...
// ... (COLE TODO O SEU BLOCO DE ROTAS ADMIN AQUI) ...
// Colando o bloco de rotas admin para garantir:
app.post('/admin/login', (req, res) => {
    const { usuario, senha } = req.body; console.log(`Tentativa de login admin para usuário: ${usuario}`);
    if (!usuario || !senha) return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
    try {
        const stmt = db.prepare('SELECT * FROM usuarios_admin WHERE usuario = ?'); const adminUser = stmt.get(usuario);
        if (adminUser && adminUser.senha === senha) { // Lembrete: Usar bcrypt
            req.session.isAdmin = true; req.session.usuario = adminUser.usuario; console.log(`Login admin bem-sucedido para: ${adminUser.usuario}`);
            req.session.save(err => { if (err) { console.error("Erro ao salvar sessão:", err); return res.status(500).json({ success: false, message: 'Erro interno ao iniciar sessão.' }); } return res.json({ success: true }); });
        } else { console.log(`Falha no login admin para: ${usuario}`); return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' }); }
    } catch (error) { console.error("Erro durante o login admin:", error); return res.status(500).json({ success: false, message: 'Erro interno do servidor.' }); }
});
// function checkAdmin... (já definida acima)
app.get('/admin/painel.html', checkAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin', 'painel.html')); });
app.get('/admin/logout', (req, res) => { req.session.destroy((err) => { if (err) { console.error("Erro ao fazer logout:", err); return res.status(500).send("Erro ao sair."); } console.log("Usuário admin deslogado."); res.clearCookie('connect.sid'); res.redirect('/admin/login.html'); }); });

app.get('/admin/premios-e-preco', checkAdmin, (req, res) => {
    try {
        const stmt = db.prepare("SELECT chave, valor FROM configuracoes");
        const configs = stmt.all();
        const configMap = configs.reduce((acc, config) => { acc[config.chave] = config.valor; return acc; }, {});
        res.json(configMap);
    } catch (error) { console.error("Erro ao buscar configs admin:", error); res.status(500).json({ success: false, message: "Erro ao buscar configurações." }); }
});

app.post('/admin/premios-e-preco', checkAdmin, (req, res) => {
    const {
        premio_linha, premio_cheia, preco_cartela, duracao_espera,
        min_bots, max_bots,
        sorteio_especial_ativo, sorteio_especial_valor, sorteio_especial_data
    } = req.body;
    console.log(`Admin ${req.session.usuario} está atualizando configurações.`);
    const linhaNum = parseFloat(premio_linha); const cheiaNum = parseFloat(premio_cheia); const precoNum = parseFloat(preco_cartela);
    const esperaNum = parseInt(duracao_espera, 10); 
    const minBotsNum = parseInt(min_bots, 10);
    const maxBotsNum = parseInt(max_bots, 10);

    if (isNaN(linhaNum) || isNaN(cheiaNum) || isNaN(precoNum) || linhaNum < 0 || cheiaNum < 0 || precoNum <= 0) { return res.status(400).json({ success: false, message: 'Valores de prêmio/preço inválidos.' }); }
    if (isNaN(esperaNum) || esperaNum < 10) { return res.status(400).json({ success: false, message: 'Tempo de Espera inválido (mínimo 10 segundos).' }); } 
    if (isNaN(minBotsNum) || minBotsNum < 0 || isNaN(maxBotsNum) || maxBotsNum < minBotsNum) { return res.status(400).json({ success: false, message: 'Valores de Bots inválidos (Mínimo deve ser >= 0 e Máximo deve ser >= Mínimo).' }); }
    
    const valorEspecialNum = parseFloat(sorteio_especial_valor) || 0.00;
    try {
        const stmt = db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)");
        db.transaction(() => {
            stmt.run('premio_linha', linhaNum.toFixed(2)); stmt.run('premio_cheia', cheiaNum.toFixed(2)); stmt.run('preco_cartela', precoNum.toFixed(2));
            stmt.run('duracao_espera', esperaNum.toString()); 
            stmt.run('min_bots', minBotsNum.toString());
            stmt.run('max_bots', maxBotsNum.toString());
            stmt.run('sorteio_especial_ativo', sorteio_especial_ativo); stmt.run('sorteio_especial_valor', valorEspecialNum.toFixed(2)); stmt.run('sorteio_especial_data', sorteio_especial_data);
        })();
        carregarConfiguracoes(); // Recarrega variáveis globais
        const stmtAll = db.prepare("SELECT chave, valor FROM configuracoes"); const configs = stmtAll.all(); const configMap = configs.reduce((acc, config) => { acc[config.chave] = config.valor; return acc; }, {});
        io.emit('configAtualizada', configMap);
        console.log("Configurações atualizadas no banco de dados e emitidas.");
        return res.json({ success: true, message: 'Configurações atualizadas com sucesso!' });
    } catch (error) { console.error("Erro ao salvar configurações:", error); return res.status(500).json({ success: false, message: 'Erro interno ao salvar configurações.' }); }
});

app.post('/admin/gerar-cartelas', checkAdmin, (req, res) => {
    const { quantidade, nome, telefone } = req.body;
    if (!nome || nome.trim() === '') { return res.status(400).json({ success: false, message: 'O Nome do Jogador é obrigatório.' }); }
    let sorteioAlvo = (estadoJogo === "ESPERANDO") ? numeroDoSorteio : numeroDoSorteio + 1;
    console.log(`Admin ${req.session.usuario} está registrando ${quantidade} cartelas para '${nome}' (Tel: ${telefone}) no Sorteio #${sorteioAlvo}.`);
    if (!quantidade || quantidade < 1 || quantidade > 100) { return res.status(400).json({ success: false, message: 'Quantidade inválida (1-100).' }); }
    try {
        const precoUnitarioAtual = parseFloat(PRECO_CARTELA); const valorTotal = quantidade * precoUnitarioAtual; const cartelasGeradas = [];
        for (let i = 0; i < quantidade; i++) { cartelasGeradas.push(gerarDadosCartela(sorteioAlvo)); }
        const manualPlayerId = `manual_${gerarIdUnico()}`; jogadores[manualPlayerId] = { nome: nome, telefone: telefone || null, isBot: false, isManual: true, cartelas: cartelasGeradas };
        const stmtVenda = db.prepare(`INSERT INTO vendas (sorteio_id, nome_jogador, telefone, quantidade_cartelas, valor_total, tipo_venda) VALUES (?, ?, ?, ?, ?, ?)`);
        stmtVenda.run(sorteioAlvo, nome, telefone || null, quantidade, valorTotal, 'Manual');
        console.log(`Geradas e REGISTRADAS ${cartelasGeradas.length} cartelas para '${nome}'. Venda registrada.`); io.emit('contagemJogadores', getContagemJogadores());
        return res.json(cartelasGeradas);
    } catch (error) { console.error("Erro ao gerar/registrar cartelas manuais:", error); return res.status(500).json({ success: false, message: 'Erro interno ao gerar cartelas.' }); }
});

app.get('/admin/relatorios.html', checkAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin', 'relatorios.html')); });
app.get('/admin/api/vendas', checkAdmin, (req, res) => {
    try {
        const stmt = db.prepare(`SELECT sorteio_id, nome_jogador, telefone, quantidade_cartelas, valor_total, tipo_venda, strftime('%d/%m/%Y %H:%M:%S', timestamp, 'localtime') as data_formatada FROM vendas ORDER BY timestamp DESC`);
        const vendas = stmt.all(); const totais = db.prepare(`SELECT SUM(valor_total) as faturamento_total, SUM(quantidade_cartelas) as cartelas_total FROM vendas`).get();
        res.json({ success: true, vendas: vendas, totais: totais });
    } catch (error) { console.error("Erro ao buscar relatório de vendas:", error); res.status(500).json({ success: false, message: 'Erro interno ao buscar relatório.' }); }
});

app.post('/admin/api/vendas/limpar', checkAdmin, (req, res) => {
    console.log(`Admin ${req.session.usuario} está limpando o histórico de vendas.`);
    try {
        const stmt = db.prepare('DELETE FROM vendas');
        const info = stmt.run();
        console.log(`Histórico de vendas limpo. ${info.changes} linhas removidas.`);
        res.json({ success: true, message: 'Histórico de vendas limpo com sucesso!', changes: info.changes });
    } catch (error) {
        console.error("Erro ao limpar relatório de vendas:", error);
        res.status(500).json({ success: false, message: 'Erro interno ao limpar relatório.' });
    }
});

app.get('/admin/vencedores.html', checkAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin', 'vencedores.html')); });
app.get('/admin/api/vencedores', checkAdmin, (req, res) => {
    try {
        const stmt = db.prepare(`SELECT id, sorteio_id, premio, nome, telefone, status_pagamento, strftime('%d/%m/%Y %H:%M:%S', timestamp, 'localtime') as data_formatada FROM vencedores ORDER BY timestamp DESC`);
        const vencedores = stmt.all(); res.json({ success: true, vencedores: vencedores });
    } catch (error) { console.error("Erro ao buscar relatório de vencedores:", error); res.status(500).json({ success: false, message: 'Erro interno ao buscar relatório.' }); }
});
app.post('/admin/api/vencedor/pagar', checkAdmin, (req, res) => {
    const { id } = req.body; if (!id) { return res.status(400).json({ success: false, message: 'ID do vencedor é obrigatório.' }); }
    try {
        const stmt = db.prepare("UPDATE vencedores SET status_pagamento = 'Pago' WHERE id = ?"); const info = stmt.run(id);
        if (info.changes > 0) { console.log(`Admin ${req.session.usuario} marcou o vencedor ID #${id} como 'Pago'.`); res.json({ success: true, message: 'Status atualizado para Pago!' }); }
        else { res.status(404).json({ success: false, message: 'Vencedor não encontrado.' }); }
    } catch (error) { console.error("Erro ao atualizar status de pagamento:", error); res.status(500).json({ success: false, message: 'Erro interno ao atualizar status.' }); }
});

app.post('/admin/api/vencedores/limpar', checkAdmin, (req, res) => {
    console.log(`Admin ${req.session.usuario} está limpando o histórico de vencedores.`);
    try {
        const stmt = db.prepare('DELETE FROM vencedores');
        const info = stmt.run();
        console.log(`Histórico de vencedores limpo. ${info.changes} linhas removidas.`);
        res.json({ success: true, message: 'Histórico de vencedores limpo com sucesso!', changes: info.changes });
    } catch (error) {
        console.error("Erro ao limpar relatório de vencedores:", error);
        res.status(500).json({ success: false, message: 'Erro interno ao limpar relatório.' });
    }
});

app.use('/admin', checkAdmin, express.static(path.join(__dirname, 'public', 'admin')));
// ==========================================================

// ==========================================================
// *** LÓGICA DO JOGO (SOCKET.IO) (MODIFICADA) ***
// ==========================================================
// ... (nomesBots, funções de gerar cartela, etc.) ...
// Colando o bloco de lógica de jogo para garantir:
const nomesBots = [
    // Nomes Pessoais
    "Maria Souza", "João Pereira", "Ana Costa", "Carlos Santos", "Sofia Oliveira", "Pedro Almeida", "Laura Ferreira", "Lucas Rodrigues", "Beatriz Lima", "Guilherme Azevedo",
    "Arthur Silva", "Alice Santos", "Bernardo Oliveira", "Manuela Rodrigues", "Heitor Ferreira", "Valentina Alves", "Davi Pereira", "Helena Lima", "Lorenzo Souza", "Isabella Costa",
    "Miguel Martins", "Sophia Rocha", "Theo Gonçalves", "Júlia Carvalho", "Gabriel Gomes", "Heloísa Mendes", "Pedro Henrique Ribeiro", "Maria Clara Dias", "Matheus Cardoso", "Isadora Vieira",
    "Enzo Fernandes", "Lívia Pinto", "Nicolas Andrade", "Maria Luísa Barbosa", "Benjamin Teixeira", "Ana Clara Nogueira", "Samuel Correia", "Lorena Rezende", "Rafael Duarte", "Cecília Freitas",
    "Gustavo Campos", "Yasmin Sales", "Daniel Moura", "Isabelly Viana", "Felipe Cunha", "Sarah Morais", "Lucas Gabriel Castro", "Ana Júlia Ramos", "João Miguel Pires", "Esther Aragão",
    "Murilo Farias", "Emanuelly Melo", "Bryan Macedo", "Mariana Barros", "Eduardo Cavalcanti", "Rebeca Borges", "Leonardo Monteiro", "Ana Laura Brandão", "Henrique Lins", "Clarice Dantas",
    "Cauã Azevedo", "Agatha Gusmão", "Vinícius Peixoto", "Gabrielly Benites", "João Guilherme Guedes", "Melissa Siqueira",
    // Nomes de Bares Genéricos
    "Bar do Zé", "Bar da Esquina", "Cantinho do Amigo", "Boteco do Manolo", "Bar Central", "Adega do Portuga", "Bar & Petiscos", "Ponto Certo Bar", "Bar Vira Copo", "Skina Bar",
    "Recanto do Chopp", "Bar do Gato", "Toca do Urso Bar", "Bar Boa Vista", "Empório do Bar", "Bar da Praça", "Boteco da Vila", "Bar Avenida", "Bar Estrela", "Parada Obrigatória Bar",
    // Nomes de Distribuidoras Genéricas
    "Distribuidora Silva", "Adega & Cia", "Disk Bebidas Rápido", "Central de Bebidas", "Distribuidora Irmãos Unidos", "Ponto Frio Bebidas", "Império das Bebidas", "Distribuidora Confiança", "SOS Bebidas", "Mundo das Bebidas",
    "Planeta Gelo & Bebidas", "Distribuidora Aliança", "O Rei da Cerveja", "Point das Bebidas", "Distribuidora Amigão", "Bebidas Delivery Já", "Varanda Bebidas", "Distribuidora Campeã", "Expresso Bebidas", "Top Beer Distribuidora",
    // Apelidos/Personagens
    "Ricardão", "Paty", "Beto", "Juju", "Zeca", "Lulu", "Tio Sam", "Dona Flor", "Professor", "Capitão", "Alemão", "Baixinho", "Careca", "Japa", "Madruga", "Xará", "Campeão", "Princesa", "Chefe"
];

// ... (funções gerarIdUnico, gerarNumerosAleatorios, etc.) ...
// ... (funções checarVencedorLinha, checarVencedorCartelaCheia, etc.) ...
// ... (constantes TEMPO_ENTRE_NUMEROS, etc.) ...
// ... (variáveis let numeroDoSorteio, etc.) ...
// ... (função setInterval) ...
// ... (função iniciarNovaRodada) ...
// ... (função sortearNumero) ...
// ... (função salvarVencedorNoDB) ...
// ... (função terminarRodada) ...
// ... (função getContagemJogadores) ...
// ... (função getUltimosVencedoresDoDB) ...
// ... (função getAdminStatusData) ...
// Colando as funções para garantir
function gerarIdUnico() { return Math.random().toString(36).substring(2, 6) + '-' + Math.random().toString(36).substring(2, 6); }
function gerarNumerosAleatorios(quantidade, min, max) { const numeros = new Set(); while (numeros.size < quantidade) { const aleatorio = Math.floor(Math.random() * (max - min + 1)) + min; numeros.add(aleatorio); } return Array.from(numeros); }
function gerarDadosCartela(sorteioId) { const cartela = []; const colunas = [ gerarNumerosAleatorios(5, 1, 15), gerarNumerosAleatorios(5, 16, 30), gerarNumerosAleatorios(4, 31, 45), gerarNumerosAleatorios(5, 46, 60), gerarNumerosAleatorios(5, 61, 75) ]; for (let i = 0; i < 5; i++) { const linha = []; for (let j = 0; j < 5; j++) { if (j === 2 && i === 2) { linha.push("FREE"); } else if (j === 2) { linha.push(colunas[j][i > 2 ? i - 1 : i]); } else { linha.push(colunas[j][i]); } } cartela.push(linha); } return { c_id: gerarIdUnico(), s_id: sorteioId, data: cartela }; }
function checarVencedorLinha(cartelaData, numerosSorteados) { const cartela = cartelaData.data; const numerosComFree = new Set(numerosSorteados); numerosComFree.add("FREE"); for (let i = 0; i < 5; i++) { if (cartela[i].every(num => numerosComFree.has(num))) return true; } for (let i = 0; i < 5; i++) { if (cartela.every(linha => numerosComFree.has(linha[i]))) return true; } if (cartela.every((linha, i) => numerosComFree.has(linha[i]))) return true; if (cartela.every((linha, i) => numerosComFree.has(linha[4-i]))) return true; return false; }
function checarVencedorCartelaCheia(cartelaData, numerosSorteados) { const cartela = cartelaData.data; const numerosComFree = new Set(numerosSorteados); numerosComFree.add("FREE"); for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) { if (!numerosComFree.has(cartela[i][j])) return false; } } return true; }
function contarFaltantesParaCheia(cartelaData, numerosSorteadosSet) { if (!cartelaData || !cartelaData.data) return 99; const cartela = cartelaData.data; let faltantes = 0; for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) { const num = cartela[i][j]; if (num !== "FREE" && !numerosSorteadosSet.has(num)) { faltantes++; } } } return faltantes; }

const TEMPO_ENTRE_NUMEROS = 5000;
const MAX_VENCEDORES_HISTORICO = 10;
const MIN_CARTELAS_POR_BOT = 1; const MAX_CARTELAS_POR_BOT = 5;
const LIMITE_FALTANTES_QUASELA = 5; const MAX_JOGADORES_QUASELA = 5;
let numeroDoSorteio = 500; let estadoJogo = "ESPERANDO";
let tempoRestante = DURACAO_ESPERA_ATUAL; 
let intervaloSorteio = null; let numerosDisponiveis = []; let numerosSorteados = []; let jogadores = {};

setInterval(() => {
    if (estadoJogo === "ESPERANDO") {
        tempoRestante--;
        if (tempoRestante <= 0) {
            console.log("DEBUG: Tempo esgotado! Tentando iniciar nova rodada...");
            estadoJogo = "JOGANDO_LINHA";
            console.log("DEBUG: Estado alterado para JOGANDO_LINHA.");
            try { io.emit('iniciarJogo'); console.log("DEBUG: Evento 'iniciarJogo' emitido."); }
            catch (emitError) { console.error("DEBUG: Erro ao emitir 'iniciarJogo':", emitError); }
            try { iniciarNovaRodada(); console.log("DEBUG: Chamada para iniciarNovaRodada() concluída."); }
            catch (startRoundError) { console.error("DEBUG: Erro ao chamar iniciarNovaRodada():", startRoundError); }
        } else { io.emit('cronometroUpdate', { tempo: tempoRestante, sorteioId: numeroDoSorteio, estado: estadoJogo }); }
    } else { io.emit('estadoJogoUpdate', { sorteioId: numeroDoSorteio, estado: estadoJogo }); }
}, 1000);

function iniciarNovaRodada() {
    console.log("DEBUG: Dentro de iniciarNovaRodada().");
    console.log(`Servidor: Iniciando Sorteio #${numeroDoSorteio}... Próximo prêmio: LINHA`);
    try {
        numerosDisponiveis = Array.from({ length: 75 }, (_, i) => i + 1); numerosSorteados = []; console.log("DEBUG: Arrays de números resetados.");
        if (intervaloSorteio) { clearInterval(intervaloSorteio); intervaloSorteio = null; console.log("DEBUG: Intervalo de sorteio anterior limpo."); }
        const jogadoresManuais = {};
        for (const id in jogadores) { if (jogadores[id].isManual) { if(jogadores[id].cartelas.length > 0 && jogadores[id].cartelas[0].s_id === numeroDoSorteio) { console.log(`Mantendo jogador manual '${jogadores[id].nome}' para o Sorteio #${numeroDoSorteio}`); jogadoresManuais[id] = jogadores[id]; } else { console.log(`Descartando jogador manual '${jogadores[id].nome}' do sorteio anterior.`); } } }
        jogadores = jogadoresManuais;
        
        const numBots = Math.floor(Math.random() * (MAX_BOTS_ATUAL - MIN_BOTS_ATUAL + 1)) + MIN_BOTS_ATUAL;
        
        console.log(`Servidor: Adicionando ${numBots} bots para a rodada #${numeroDoSorteio}.`);
        for (let i = 0; i < numBots; i++) { const botId = `bot_${gerarIdUnico()}`; const botNome = nomesBots[Math.floor(Math.random() * nomesBots.length)]; const numCartelasBot = Math.floor(Math.random() * (MAX_CARTELAS_POR_BOT - MIN_CARTELAS_POR_BOT + 1)) + MIN_CARTELAS_POR_BOT; const botCartelas = []; for (let j = 0; j < numCartelasBot; j++) { botCartelas.push(gerarDadosCartela(numeroDoSorteio)); } jogadores[botId] = { nome: botNome, telefone: null, isBot: true, cartelas: botCartelas }; }
        console.log("DEBUG: Jogadores/Bots preparados.");
        io.emit('estadoJogoUpdate', { sorteioId: numeroDoSorteio, estado: estadoJogo }); io.emit('contagemJogadores', getContagemJogadores()); io.emit('atualizarQuaseLa', []);
        console.log("DEBUG: Emits de atualização enviados.");
        setTimeout(() => {
             console.log("DEBUG: Dentro do setTimeout para iniciar sorteio.");
             console.log("Servidor: Começando a sortear números.");
             try { if (intervaloSorteio) { console.warn("DEBUG: Tentativa de iniciar um novo intervalo de sorteio, mas um já existia. Limpando o antigo."); clearInterval(intervaloSorteio); } intervaloSorteio = setInterval(sortearNumero, TEMPO_ENTRE_NUMEROS); console.log("DEBUG: setInterval(sortearNumero) iniciado."); }
             catch (setIntervalError) { console.error("DEBUG: Erro ao iniciar setInterval(sortearNumero):", setIntervalError); }
        }, 5000);
        console.log("DEBUG: setTimeout para iniciar sorteio agendado.");
    } catch (error) { console.error("DEBUG: Erro DENTRO de iniciarNovaRodada:", error); }
}

function sortearNumero() {
    if (!numerosDisponiveis || numerosDisponiveis.length === 0) { console.log("Todos os números sorteados."); terminarRodada(null, null); return; }
    const indiceAleatorio = Math.floor(Math.random() * numerosDisponiveis.length); const numeroSorteado = numerosDisponiveis.splice(indiceAleatorio, 1)[0];
    numerosSorteados.push(numeroSorteado); console.log(`Servidor: Sorteou ${numeroSorteado}`);
    io.emit('novoNumeroSorteado', numeroSorteado);
    const numerosSorteadosSet = new Set(numerosSorteados);
    const getNome = (jogador, id) => { if (jogador.nome) return jogador.nome; if (jogador.isBot) return `Bot [${id.substring(0,4)}]`; return `Jogador [${id.substring(0,4)}]`; };
    let vencedorLinhaEncontrado = false;
    if (estadoJogo === "JOGANDO_LINHA") {
        for (const socketId in jogadores) { const jogador = jogadores[socketId]; if (!jogador.cartelas || jogador.cartelas.length === 0) continue; for (let i = 0; i < jogador.cartelas.length; i++) { const cartela = jogador.cartelas[i]; if (cartela.s_id !== numeroDoSorteio) continue; if (checarVencedorLinha(cartela, numerosSorteados)) { 
            console.log(`DEBUG: Vencedor da LINHA encontrado: ${getNome(jogador, socketId)}`); 
            const nomeVencedor = getNome(jogador, socketId); 
            salvarVencedorNoDB({ sorteioId: numeroDoSorteio, premio: "Linha", nome: jogador.nome, telefone: jogador.telefone, cartelaId: cartela.c_id }); 
            
            const winningSocket = io.sockets.sockets.get(socketId); 

            if (!jogador.isBot && !jogador.isManual && winningSocket) { 
                winningSocket.emit('voceGanhouLinha', { cartelaGanhadora: cartela, indiceCartela: i, premioValor: PREMIO_LINHA }); 
                winningSocket.broadcast.emit('alguemGanhouLinha', { nome: nomeVencedor });
            } else {
                io.emit('alguemGanhouLinha', { nome: nomeVencedor }); 
            }
            
            estadoJogo = "JOGANDO_CHEIA"; 
            io.emit('estadoJogoUpdate', { sorteioId: numeroDoSorteio, estado: estadoJogo }); 
            console.log("Servidor: Próximo prêmio: CARTELA CHEIA"); 
            vencedorLinhaEncontrado = true; 
            break; 
        } } if (vencedorLinhaEncontrado) break; }
    }
    if (estadoJogo === "JOGANDO_CHEIA") {
        for (const socketId in jogadores) { const jogador = jogadores[socketId]; if (!jogador.cartelas || jogador.cartelas.length === 0) continue; for (let i = 0; i < jogador.cartelas.length; i++) { const cartela = jogador.cartelas[i]; if (cartela.s_id !== numeroDoSorteio) continue; if (checarVencedorCartelaCheia(cartela, numerosSorteadosSet)) { 
            console.log(`DEBUG: Vencedor da CARTELA CHEIA encontrado: ${getNome(jogador, socketId)}`); 
            const nomeVencedor = getNome(jogador, socketId); 
            salvarVencedorNoDB({ sorteioId: numeroDoSorteio, premio: "Cartela Cheia", nome: jogador.nome, telefone: jogador.telefone, cartelaId: cartela.c_id }); 
            const dadosVencedor = { nome: nomeVencedor, telefone: jogador.telefone, cartelaGanhadora: cartela, indiceCartela: i, premioValor: PREMIO_CHEIA }; 
            terminarRodada(dadosVencedor, (jogador.isBot || jogador.isManual) ? null : socketId); 
            return; 
        } } }
    }
    if (estadoJogo === "JOGANDO_LINHA" || estadoJogo === "JOGANDO_CHEIA") {
        const jogadoresPerto = [];
        for (const socketId in jogadores) { const jogador = jogadores[socketId]; if (!jogador.cartelas || jogador.cartelas.length === 0) continue; for (const cartela of jogador.cartelas) { if (cartela.s_id !== numeroDoSorteio) continue; const faltantes = contarFaltantesParaCheia(cartela, numerosSorteadosSet); if (faltantes > 0 && faltantes <= LIMITE_FALTANTES_QUASELA) { jogadoresPerto.push({ nome: getNome(jogador, socketId), faltam: faltantes }); } } }
        jogadoresPerto.sort((a, b) => a.faltam - b.faltam); const topJogadores = jogadoresPerto.slice(0, MAX_JOGADORES_QUASELA); io.emit('atualizarQuaseLa', topJogadores);
    }
}

function salvarVencedorNoDB(vencedorInfo) {
    try {
        const stmt = db.prepare(`INSERT INTO vencedores (sorteio_id, premio, nome, telefone, cartela_id) VALUES (?, ?, ?, ?, ?)`);
        stmt.run(vencedorInfo.sorteioId, vencedorInfo.premio, vencedorInfo.nome || 'Bot/Manual', vencedorInfo.telefone, vencedorInfo.cartelaId);
        console.log(`Vencedor [${vencedorInfo.premio}] salvo no banco de dados (Status: Pendente).`);
        const ultimos = getUltimosVencedoresDoDB(); io.emit('atualizarVencedores', ultimos);
    } catch (err) { console.error("Erro ao salvar vencedor no DB:", err); }
}

function terminarRodada(vencedor, socketVencedor) {
    console.log("DEBUG: Dentro de terminarRodada().");
    if (intervaloSorteio) { clearInterval(intervaloSorteio); intervaloSorteio = null; console.log("DEBUG: Intervalo de sorteio parado em terminarRodada."); }
    else { console.warn("DEBUG: terminarRodada chamada, mas intervaloSorteio já era null."); }
    const idSorteioFinalizado = numeroDoSorteio;
    if (vencedor) { 
        if(socketVencedor && io.sockets.sockets.get(socketVencedor)) { 
            io.to(socketVencedor).emit('voceGanhouCartelaCheia', vencedor); 
            io.sockets.sockets.get(socketVencedor).broadcast.emit('alguemGanhouCartelaCheia', { nome: vencedor.nome }); 
        } else { 
            io.emit('alguemGanhouCartelaCheia', { nome: vencedor.nome }); 
        } 
    }
    else { io.emit('jogoTerminouSemVencedor'); }
    estadoJogo = "ESPERANDO";
    tempoRestante = DURACAO_ESPERA_ATUAL; 
    numeroDoSorteio++;
    io.emit('estadoJogoUpdate', { sorteioId: numeroDoSorteio, estado: estadoJogo }); io.emit('atualizarQuaseLa', []);
    console.log(`Servidor: Sorteio #${idSorteioFinalizado} terminado. Próximo será #${numeroDoSorteio} em ${Math.round(DURACAO_ESPERA_ATUAL / 60)} minutos (aprox).`); 
    console.log("DEBUG: terminarRodada() concluída.");
}

function getContagemJogadores() { 
    let total = 0; let reais = 0; 
    try { 
        if (jogadores && typeof jogadores === 'object') { 
            const players = Object.values(jogadores); 
            total = players.filter(j => j && j.nome).length; 
            reais = players.filter(j => j && j.nome && !j.isBot && !j.isManual).length; // Contagem correta aqui
        } 
    } catch (error) { 
        console.error("Erro crítico em getContagemJogadores:", error); 
        return { total: 0, reais: 0 }; 
    } 
    return { total, reais }; 
}
function getUltimosVencedoresDoDB(limite = MAX_VENCEDORES_HISTORICO) { try { const stmt = db.prepare(`SELECT sorteio_id as sorteioId, premio, nome FROM vencedores ORDER BY timestamp DESC LIMIT ?`); return stmt.all(limite); } catch (err) { console.error("Erro ao buscar vencedores no DB:", err); return []; } }

function getAdminStatusData() {
    const statusData = {
        estado: estadoJogo,
        sorteioAtual: numeroDoSorteio,
        tempoRestante: estadoJogo === 'ESPERANDO' ? tempoRestante : null,
        jogadoresReais: getContagemJogadores().reais
    };

    try {
        const proximoSorteioId = estadoJogo === 'ESPERANDO' ? numeroDoSorteio : numeroDoSorteio + 1;
        const vendasProximo = db.prepare(`
            SELECT COUNT(*) as qtd_cartelas, SUM(valor_total) as valor_total 
            FROM vendas 
            WHERE sorteio_id = ?
        `).get(proximoSorteioId);
        statusData.vendasProximoSorteio = vendasProximo || { qtd_cartelas: 0, valor_total: 0 };
        statusData.proximoSorteioId = proximoSorteioId;

        const receitaDia = db.prepare(`
            SELECT SUM(valor_total) as valor_total_dia
            FROM vendas
            WHERE DATE(timestamp, 'localtime') = DATE('now', 'localtime')
        `).get();
        statusData.receitaDoDia = receitaDia.valor_total_dia || 0;

    } catch (error) {
        console.error("Erro ao buscar dados de status admin:", error);
        statusData.vendasProximoSorteio = { qtd_cartelas: 'Erro', valor_total: 'Erro' };
        statusData.receitaDoDia = 'Erro';
    }

    return statusData;
}


io.on('connection', (socket) => {
    console.log(`Novo usuário conectado: ${socket.id}`);
    try {
        const contagemInicial = getContagemJogadores(); const ultimosVencedoresDB = getUltimosVencedoresDoDB();
        const totalOnline = contagemInicial ? contagemInicial.total : 0; const reaisOnline = contagemInicial ? contagemInicial.reais : 0;
        const stmt = db.prepare("SELECT chave, valor FROM configuracoes"); const configs = stmt.all(); const configMap = configs.reduce((acc, config) => { acc[config.chave] = config.valor; return acc; }, {});
        socket.emit('estadoInicial', { sorteioId: numeroDoSorteio, estado: estadoJogo, tempoRestante: estadoJogo === 'ESPERANDO' ? tempoRestante : 0, jogadoresOnline: totalOnline, jogadoresReais: reaisOnline, ultimosVencedores: ultimosVencedoresDB, numerosSorteados: numerosSorteados, ultimoNumero: numerosSorteados.length > 0 ? numerosSorteados[numerosSorteados.length - 1] : null, quaseLa: [], configuracoes: configMap });
    } catch (error) { console.error("Erro ao emitir estado inicial:", error); }
    
    // *** INÍCIO DA MODIFICAÇÃO: LÓGICA DE PAGAMENTO REAL ***
    socket.on('criarPagamento', async (dadosCompra, callback) => {
        try {
            const { nome, telefone, quantidade } = dadosCompra;
            
            // 1. Calcula o valor total
            const preco = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'preco_cartela'").get();
            const precoUnitarioAtual = parseFloat(preco.valor || '5.00');
            const valorTotal = quantidade * precoUnitarioAtual;
            
            console.log(`Servidor: Usuário ${nome} (${telefone}) quer comprar ${quantidade} cartela(s). Total: R$${valorTotal.toFixed(2)}.`);

            // 2. Cria o pagamento no Mercado Pago
            const payment = new Payment(mpClient);
            const body = {
                transaction_amount: valorTotal,
                description: `Compra de ${quantidade} cartela(s) - Bingo do Pix`,
                payment_method_id: 'pix',
                // MODIFICAÇÃO 4: Usar Variável de Ambiente
                notification_url: `${process.env.BASE_URL || 'https://SEU_DOMINIO_HTTPS_AQUI'}/webhook-mercadopago`,
                payer: {
                    email: `jogador_${telefone}@bingo.com`, // Email fictício, mas obrigatório
                    first_name: nome,
                    last_name: "Jogador",
                    // identificação fictícia
                },
                date_of_expiration: new Date(Date.now() + (10 * 60 * 1000)).toISOString().replace("Z", "-03:00") // 10 min
            };

            const response = await payment.create({ body });
            
            // 3. Armazena os dados do pagamento pendente
            const paymentId = response.id.toString();
            pagamentosPendentes[paymentId] = {
                socketId: socket.id,
                dadosCompra: dadosCompra
            };
            
            console.log(`Pagamento PIX ${paymentId} criado para socket ${socket.id}.`);

            // 4. Envia o QR Code de volta para o cliente
            const qrCodeBase64 = response.point_of_interaction.transaction_data.qr_code_base64;
            const qrCodeCopiaCola = response.point_of_interaction.transaction_data.qr_code;
            
            if (typeof callback === 'function') {
                callback({ success: true, qrCodeBase64, qrCodeCopiaCola });
            }

        } catch(error) {
            console.error("Erro em criarPagamento no Mercado Pago:", error.cause || error.message);
            if (typeof callback === 'function') {
                callback({ success: false, message: 'Erro ao gerar QR Code. Verifique o Access Token do Servidor.' });
            }
        }
    });
    // *** FIM DA MODIFICAÇÃO ***
    
    socket.on('registerPlayer', (playerData) => { try { if (playerData && playerData.cartelas && playerData.cartelas.length > 0) { const s_id_cartela = playerData.cartelas[0].s_id; if (s_id_cartela === numeroDoSorteio || (estadoJogo === "ESPERANDO")) { console.log(`Servidor: Registrando jogador ${playerData.nome} (${socket.id}) para o Sorteio #${numeroDoSorteio}.`); jogadores[socket.id] = { nome: playerData.nome, telefone: playerData.telefone, isBot: false, isManual: false, cartelas: playerData.cartelas }; io.emit('contagemJogadores', getContagemJogadores()); } else { console.warn(`Servidor: Jogador ${playerData.nome} (${socket.id}) tentou entrar no Sorteio #${numeroDoSorteio} com cartela inválida (Sorteio #${s_id_cartela}, Estado: ${estadoJogo}). REJEITADO.`); socket.emit('cartelaAntiga'); } } } catch(error) { console.error("Erro em registerPlayer:", error); } });
    socket.on('disconnect', () => { console.log(`Usuário desconectado: ${socket.id}`); const eraJogadorRegistrado = jogadores[socket.id] && jogadores[socket.id].nome && !jogadores[socket.id].isBot && !jogadores[socket.id].isManual; delete jogadores[socket.id]; if (eraJogadorRegistrado) { try { io.emit('contagemJogadores', getContagemJogadores()); } catch (error) { console.error("Erro ao emitir contagemJogadores no disconnect:", error); } } });
    
    socket.on('getAdminStatus', () => {
        try {
            const statusData = getAdminStatusData();
            socket.emit('adminStatusUpdate', statusData);
        } catch (error) {
            console.error("Erro ao processar getAdminStatus:", error);
            socket.emit('adminStatusUpdate', { error: 'Falha ao buscar status.' });
        }
    });
});
// ==========================================================

// ==========================================================
// Iniciar o Servidor
// ==========================================================
server.listen(PORTA, () => {
    console.log(`Servidor "Bingo do Pix" rodando!`);
    // console.log(`Banco de dados conectado: bingo_data.db`); // Removido para usar o dbPath
    console.log(`Acesse em http://localhost:${PORTA}`);
    console.log(`Login Admin: http://localhost:${PORTA}/admin/login.html`);
    console.log(`Dashboard (com anúncio): http://localhost:${PORTA}/dashboard`);
});

// --- FECHAR O BANCO AO SAIR ---
process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));