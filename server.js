const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const { MercadoPagoConfig, Payment } = require('mercadopago');

// --- INÍCIO DAS MUDANÇAS NO BANCO DE DADOS ---
const { Pool } = require('pg');
const PgStore = require('connect-pg-simple')(session);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // (Opcional) Descomente se o Render reclamar de SSL
    // ssl: {
    //   rejectUnauthorized: false
    // }
});

const db = {
    query: (text, params) => pool.query(text, params),
};

console.log("Conectando ao banco de dados PostgreSQL...");

// Função assíncrona para criar as tabelas se não existirem
async function inicializarBanco() {
    console.log("Verificando estrutura do banco de dados...");
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS configuracoes (
                chave TEXT PRIMARY KEY, 
                valor TEXT
            );
        `);
        
        await db.query(`
            CREATE TABLE IF NOT EXISTS vencedores (
                id SERIAL PRIMARY KEY, 
                sorteio_id INTEGER NOT NULL, 
                premio TEXT NOT NULL, 
                nome TEXT NOT NULL, 
                telefone TEXT, 
                cartela_id TEXT, 
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, 
                status_pagamento TEXT DEFAULT 'Pendente' NOT NULL 
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS usuarios_admin (
                id SERIAL PRIMARY KEY, 
                usuario TEXT UNIQUE NOT NULL, 
                senha TEXT NOT NULL
            );
        `);
        
        // Tabela "sessions" é criada automaticamente pelo connect-pg-simple

        await db.query(`
            CREATE TABLE IF NOT EXISTS vendas (
                id SERIAL PRIMARY KEY, 
                sorteio_id INTEGER NOT NULL, 
                nome_jogador TEXT NOT NULL, 
                telefone TEXT, 
                quantidade_cartelas INTEGER NOT NULL, 
                valor_total REAL NOT NULL, 
                tipo_venda TEXT NOT NULL, 
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Adiciona coluna de cartelas
        try {
            await db.query('ALTER TABLE vendas ADD COLUMN cartelas_json TEXT');
            console.log("Coluna 'cartelas_json' adicionada à tabela 'vendas'.");
        } catch (e) {
            if (e.code === '42701') {
                console.log("Coluna 'cartelas_json' já existe. Ignorando.");
            } else {
                throw e;
            }
        }
        
        // *** ATUALIZAÇÃO (POLLING DE PAGAMENTO) ***
        // Adiciona coluna 'payment_id' na tabela 'vendas'
        try {
            await db.query('ALTER TABLE vendas ADD COLUMN payment_id TEXT');
            console.log("Coluna 'payment_id' adicionada à tabela 'vendas'.");
        } catch (e) {
            if (e.code === '42701') {
                console.log("Coluna 'payment_id' já existe. Ignorando.");
            } else {
                throw e;
            }
        }
        // *** FIM DA ATUALIZAÇÃO ***

        // Cria a tabela para pagamentos pendentes
        await db.query(`
            CREATE TABLE IF NOT EXISTS pagamentos_pendentes (
                payment_id TEXT PRIMARY KEY,
                socket_id TEXT NOT NULL,
                dados_compra_json TEXT NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Tabela 'pagamentos_pendentes' verificada.");
        
        // Verifica se o admin existe
        const adminRes = await db.query('SELECT COUNT(*) as count FROM usuarios_admin WHERE usuario = $1', ['admin']);
        if (adminRes.rows[0].count == 0) {
            // ATENÇÃO: A senha 'admin123' AINDA É INSEGURA. Devemos corrigir isso depois.
            await db.query('INSERT INTO usuarios_admin (usuario, senha) VALUES ($1, $2)', ['admin', 'admin123']);
            console.log("Usuário 'admin' criado.");
        }

        // Insere configurações padrão
        const configs = [
            { chave: 'premio_linha', valor: '100.00' },
            { chave: 'premio_cheia', valor: '500.00' },
            { chave: 'preco_cartela', valor: '5.00' },
            { chave: 'sorteio_especial_ativo', valor: 'true' },
            { chave: 'sorteio_especial_valor', valor: '1000.00' },
            { chave: 'sorteio_especial_data', valor: 'Dia 25/10/2026 às 19:00' },
            { chave: 'duracao_espera', valor: '20' },
            { chave: 'min_bots', valor: '80' },
            { chave: 'max_bots', valor: '150' },
            { chave: 'numero_sorteio_atual', valor: '500' }
        ];

        const configQuery = 'INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO NOTHING';
        for (const config of configs) {
            await db.query(configQuery, [config.chave, config.valor]);
        }
        
        console.log("Estrutura do banco de dados verificada e configurada.");

    } catch (err) {
        console.error("ERRO CRÍTICO AO INICIALIZAR O BANCO DE DADOS:", err);
        process.exit(1); 
    }
}
// --- FIM DAS MUDANÇAS NO BANCO DE DADOS ---


const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORTA = process.env.PORT || 3000;

// ==========================================================
// *** CONFIGURAÇÃO DO MERCADO PAGO ***
// ==========================================================
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN; 

const mpClient = new MercadoPagoConfig({ 
    accessToken: MERCADOPAGO_ACCESS_TOKEN,
    options: { timeout: 5000 }
});

if (!MERCADOPAGO_ACCESS_TOKEN) {
    console.warn("AVISO: MERCADOPAGO_ACCESS_TOKEN não foi configurado nas variáveis de ambiente.");
}
// ==========================================================


// ==========================================================
// *** CONFIGURAÇÃO DE SESSÃO (Atualizada para PG) ***
// ==========================================================
const store = new PgStore({
    pool: pool, // Usa o pool de conexão do PG
    tableName: 'sessions', // Nome da tabela
    pruneSessionInterval: 60 // Limpa sessões expiradas a cada 60s
});

const SESSION_SECRET = process.env.SESSION_SECRET || 'seu_segredo_muito_secreto_e_longo_troque_isso!';
if (SESSION_SECRET === 'seu_segredo_muito_secreto_e_longo_troque_isso!') { console.warn("AVISO: Usando chave secreta padrão para sessão..."); }
app.use(session({ store: store, secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true, sameSite: 'lax' } }));

// ==========================================================
// *** MIDDLEWARES GERAIS ***
// ==========================================================
app.use(express.json()); 

// ==========================================================
// *** WEBHOOK MERCADO PAGO (ATUALIZADO - SEM SOCKET) ***
// ==========================================================
app.post('/webhook-mercadopago', (req, res) => {
    console.log("Webhook do Mercado Pago recebido!");
    
    if (req.body.type === 'payment') {
        const paymentId = req.body.data.id;
        console.log(`Webhook: ID de Pagamento recebido: ${paymentId}`);

        const payment = new Payment(mpClient);
        payment.get({ id: paymentId })
            .then(async (pagamento) => { // Trocado para 'async'
                const status = pagamento.status;
                console.log(`Webhook: Status do Pagamento ${paymentId} é: ${status}`);

                // *** ATUALIZAÇÃO (POLLING DE PAGAMENTO) ***
                if (status === 'approved') {
                    // 1. Busca o pagamento pendente no BANCO DE DADOS
                    console.log(`Buscando payment_id ${paymentId} no banco de dados...`);
                    const query = "SELECT * FROM pagamentos_pendentes WHERE payment_id = $1";
                    const pendingPaymentResult = await db.query(query, [paymentId]);

                    if (pendingPaymentResult.rows.length > 0) {
                        const pendingPayment = pendingPaymentResult.rows[0];
                        // const socketId = pendingPayment.socket_id; // Não precisamos mais disso
                        const dadosCompra = JSON.parse(pendingPayment.dados_compra_json);
                        
                        console.log(`Pagamento pendente ${paymentId} encontrado. Processando...`);
                        
                        // Não precisamos mais do socket. Se ele desconectou, o poller do cliente vai pegar.
                        // const socket = io.sockets.sockets.get(socketId);
                        
                        try {
                            let sorteioAlvo = (estadoJogo === "ESPERANDO") ? numeroDoSorteio : numeroDoSorteio + 1;
                            const precoRes = await db.query("SELECT valor FROM configuracoes WHERE chave = $1", ['preco_cartela']);
                            const preco = precoRes.rows[0];
                            const precoUnitarioAtual = parseFloat(preco.valor || '5.00');
                            const valorTotal = dadosCompra.quantidade * precoUnitarioAtual;
                            
                            const cartelasGeradas = [];
                            for (let i = 0; i < dadosCompra.quantidade; i++) {
                                cartelasGeradas.push(gerarDadosCartela(sorteioAlvo));
                            }
                            const cartelasJSON = JSON.stringify(cartelasGeradas); 

                            // Query atualizada para salvar o JSON e o payment_id
                            const stmtVenda = `
                                INSERT INTO vendas 
                                (sorteio_id, nome_jogador, telefone, quantidade_cartelas, valor_total, tipo_venda, cartelas_json, payment_id) 
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                                RETURNING id`; 
                            
                            const vendaResult = await db.query(stmtVenda, [
                                sorteioAlvo, dadosCompra.nome, dadosCompra.telefone || null, 
                                dadosCompra.quantidade, valorTotal, 'Online', cartelasJSON, paymentId
                            ]);
                            const vendaId = vendaResult.rows[0].id; 
                            
                            console.log(`Webhook: Venda #${vendaId} (Payment ID: ${paymentId}) registrada no banco.`);

                            // NÃO emitimos mais 'pagamentoAprovado' daqui
                            // O cliente vai perguntar (poll) e encontrar essa venda

                            // 2. Deleta o pagamento pendente do banco, pois foi processado
                            await db.query("DELETE FROM pagamentos_pendentes WHERE payment_id = $1", [paymentId]);
                            console.log(`Pagamento ${paymentId} processado e removido do DB pendente.`);

                        } catch (dbError) {
                            console.error("Webhook ERRO CRÍTICO ao salvar no DB ou gerar cartelas:", dbError);
                            // Se der erro aqui, o pagamento fica no 'pagamentos_pendentes' para análise manual
                        }
                    } else {
                         console.warn(`Webhook: Pagamento ${paymentId} aprovado, mas NÃO FOI ENCONTRADO no banco 'pagamentos_pendentes'. (Pode ser um pagamento antigo ou um erro)`);
                    }
                // *** FIM DA ATUALIZAÇÃO ***

                } else if (status === 'cancelled' || status === 'rejected') {
                    // Se foi cancelado ou rejeitado, limpa do banco
                    await db.query("DELETE FROM pagamentos_pendentes WHERE payment_id = $1", [paymentId]);
                    console.log(`Pagamento ${paymentId} (${status}) removido do DB.`);
                }
            })
            .catch(error => {
                console.error("Webhook ERRO: Falha ao buscar pagamento no Mercado Pago:", error);
            });
    }

    res.sendStatus(200);
});

// ==========================================================
// *** VARIÁVEIS GLOBAIS DE CONFIGURAÇÃO (Atualizado para PG) ***
// ==========================================================
let PREMIO_LINHA = '100.00'; let PREMIO_CHEIA = '500.00'; let PRECO_CARTELA = '5.00';
let DURACAO_ESPERA_ATUAL = 20; 
let MIN_BOTS_ATUAL = 80;
let MAX_BOTS_ATUAL = 150;
let numeroDoSorteio = 500; // Valor padrão, será sobrescrito

// Convertido para 'async'
async function carregarConfiguracoes() {
    try {
        // Pede também o 'numero_sorteio_atual'
        const res = await db.query("SELECT chave, valor FROM configuracoes WHERE chave IN ($1, $2, $3, $4, $5, $6, $7)", 
            ['premio_linha', 'premio_cheia', 'preco_cartela', 'duracao_espera', 'min_bots', 'max_bots', 'numero_sorteio_atual']);
        
        const configs = res.rows.reduce((acc, row) => {
            acc[row.chave] = row.valor;
            return acc;
        }, {});

        PREMIO_LINHA = configs.premio_linha || '100.00';
        PREMIO_CHEIA = configs.premio_cheia || '500.00';
        PRECO_CARTELA = configs.preco_cartela || '5.00';
        DURACAO_ESPERA_ATUAL = parseInt(configs.duracao_espera, 10) || 20;
        if (isNaN(DURACAO_ESPERA_ATUAL) || DURACAO_ESPERA_ATUAL < 10) DURACAO_ESPERA_ATUAL = 10; 

        MIN_BOTS_ATUAL = parseInt(configs.min_bots, 10) || 80;
        MAX_BOTS_ATUAL = parseInt(configs.max_bots, 10) || 150;
        if (isNaN(MIN_BOTS_ATUAL) || MIN_BOTS_ATUAL < 0) MIN_BOTS_ATUAL = 0;
        if (isNaN(MAX_BOTS_ATUAL) || MAX_BOTS_ATUAL < MIN_BOTS_ATUAL) MAX_BOTS_ATUAL = MIN_BOTS_ATUAL;

        // Carrega o número do sorteio do banco para a variável global
        numeroDoSorteio = parseInt(configs.numero_sorteio_atual, 10) || 500;
        if (isNaN(numeroDoSorteio)) numeroDoSorteio = 500;

        console.log(`Configurações de Jogo carregadas: Linha=R$${PREMIO_LINHA}, Cheia=R$${PREMIO_CHEIA}, Cartela=R$${PRECO_CARTELA}, Espera=${DURACAO_ESPERA_ATUAL}s, Bots(${MIN_BOTS_ATUAL}-${MAX_BOTS_ATUAL})`); 
        console.log(`Servidor: Sorteio atual carregado do banco: #${numeroDoSorteio}`); // Novo log

    } catch (err) { console.error("Erro ao carregar configurações do DB:", err); }
}
// (Será chamado no final do arquivo, após a inicialização do DB)

// ==========================================================
// *** ROTAS PÚBLICAS (Atualizado para PG) ***
// ==========================================================
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// Convertido para 'async'
app.get('/api/config', async (req, res) => {
    try {
        const stmt = "SELECT chave, valor FROM configuracoes";
        const resDB = await db.query(stmt);
        const configs = resDB.rows;
        
        const configMap = configs.reduce((acc, config) => {
            acc[config.chave] = config.valor;
            return acc;
        }, {});
        res.json(configMap);
    } catch (error) {
        console.error("Erro ao buscar /api/config:", error);
        res.status(500).json({ success: false, message: "Erro ao buscar configurações." });
    }
});

app.get('/dashboard', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'anuncio.html')); });
app.get('/dashboard-real', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/dashboard.html', (req, res) => { res.redirect('/dashboard'); });
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================
// *** ROTAS DE ADMINISTRAÇÃO (Atualizado para PG) ***
// ==========================================================

// Convertido para 'async'
app.post('/admin/login', async (req, res) => {
    const { usuario, senha } = req.body; console.log(`Tentativa de login admin para usuário: ${usuario}`);
    if (!usuario || !senha) return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
    try {
        const stmt = 'SELECT * FROM usuarios_admin WHERE usuario = $1';
        const resDB = await db.query(stmt, [usuario]);
        const adminUser = resDB.rows[0]; // .get() vira .rows[0]

        if (adminUser && adminUser.senha === senha) { // Lembrete: Usar bcrypt
            req.session.isAdmin = true; req.session.usuario = adminUser.usuario; console.log(`Login admin bem-sucedido para: ${adminUser.usuario}`);
            req.session.save(err => { if (err) { console.error("Erro ao salvar sessão:", err); return res.status(500).json({ success: false, message: 'Erro interno ao iniciar sessão.' }); } return res.json({ success: true }); });
        } else { console.log(`Falha no login admin para: ${usuario}`); return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' }); }
    } catch (error) { console.error("Erro durante o login admin:", error); return res.status(500).json({ success: false, message: 'Erro interno do servidor.' }); }
});

function checkAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) { return next(); }
    else { console.log("Acesso negado à área admin. Redirecionando para login."); if (req.headers['x-requested-with'] === 'XMLHttpRequest' || (req.headers.accept && req.headers.accept.includes('json'))) { return res.status(403).json({ success: false, message: 'Acesso negado. Faça login novamente.' }); } return res.redirect('/admin/login.html'); }
}
app.get('/admin/painel.html', checkAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin', 'painel.html')); });
app.get('/admin/logout', (req, res) => { req.session.destroy((err) => { if (err) { console.error("Erro ao fazer logout:", err); return res.status(500).send("Erro ao sair."); } console.log("Usuário admin deslogado."); res.clearCookie('connect.sid'); res.redirect('/admin/login.html'); }); });

// Convertido para 'async'
app.get('/admin/premios-e-preco', checkAdmin, async (req, res) => {
    try {
        const stmt = "SELECT chave, valor FROM configuracoes";
        const resDB = await db.query(stmt);
        const configs = resDB.rows; // .all() vira .rows
        const configMap = configs.reduce((acc, config) => { acc[config.chave] = config.valor; return acc; }, {});
        res.json(configMap);
    } catch (error) { console.error("Erro ao buscar configs admin:", error); res.status(500).json({ success: false, message: "Erro ao buscar configurações." }); }
});

// Convertido para 'async' e Transação PG
app.post('/admin/premios-e-preco', checkAdmin, async (req, res) => {
    const {
        premio_linha, premio_cheia, preco_cartela, duracao_espera,
        min_bots, max_bots,
        sorteio_especial_ativo, sorteio_especial_valor, sorteio_especial_data
    } = req.body;
    console.log(`Admin ${req.session.usuario} está atualizando configurações.`);
    
    // (Validação continua a mesma)
    const linhaNum = parseFloat(premio_linha); const cheiaNum = parseFloat(premio_cheia); const precoNum = parseFloat(preco_cartela);
    const esperaNum = parseInt(duracao_espera, 10); 
    const minBotsNum = parseInt(min_bots, 10);
    const maxBotsNum = parseInt(max_bots, 10);
    if (isNaN(linhaNum) || isNaN(cheiaNum) || isNaN(precoNum) || linhaNum < 0 || cheiaNum < 0 || precoNum <= 0) { return res.status(400).json({ success: false, message: 'Valores de prêmio/preço inválidos.' }); }
    if (isNaN(esperaNum) || esperaNum < 10) { return res.status(400).json({ success: false, message: 'Tempo de Espera inválido (mínimo 10 segundos).' }); } 
    if (isNaN(minBotsNum) || minBotsNum < 0 || isNaN(maxBotsNum) || maxBotsNum < minBotsNum) { return res.status(400).json({ success: false, message: 'Valores de Bots inválidos (Mínimo deve ser >= 0 e Máximo deve ser >= Mínimo).' }); }
    const valorEspecialNum = parseFloat(sorteio_especial_valor) || 0.00;

    // Transação em PostgreSQL
    const client = await pool.connect(); // Pega uma conexão do pool
    try {
        await client.query('BEGIN'); // Inicia a transação
        
        // 'INSERT OR REPLACE' vira 'INSERT ... ON CONFLICT ... DO UPDATE'
        const query = `
            INSERT INTO configuracoes (chave, valor) 
            VALUES ($1, $2) 
            ON CONFLICT (chave) 
            DO UPDATE SET valor = EXCLUDED.valor;
        `;
        
        await client.query(query, ['premio_linha', linhaNum.toFixed(2)]);
        await client.query(query, ['premio_cheia', cheiaNum.toFixed(2)]);
        await client.query(query, ['preco_cartela', precoNum.toFixed(2)]);
        await client.query(query, ['duracao_espera', esperaNum.toString()]);
        await client.query(query, ['min_bots', minBotsNum.toString()]);
        await client.query(query, ['max_bots', maxBotsNum.toString()]);
        await client.query(query, ['sorteio_especial_ativo', sorteio_especial_ativo]);
        await client.query(query, ['sorteio_especial_valor', valorEspecialNum.toFixed(2)]);
        await client.query(query, ['sorteio_especial_data', sorteio_especial_data]);
        
        await client.query('COMMIT'); // Confirma a transação
        
        await carregarConfiguracoes(); // Recarrega variáveis globais (agora é async)
        
        const resDB = await db.query("SELECT chave, valor FROM configuracoes");
        const configs = resDB.rows;
        const configMap = configs.reduce((acc, config) => { acc[config.chave] = config.valor; return acc; }, {});
        
        io.emit('configAtualizada', configMap);
        console.log("Configurações atualizadas no banco de dados e emitidas.");
        return res.json({ success: true, message: 'Configurações atualizadas com sucesso!' });

    } catch (error) {
        await client.query('ROLLBACK'); // Desfaz a transação em caso de erro
        console.error("Erro ao salvar configurações:", error); 
        return res.status(500).json({ success: false, message: 'Erro interno ao salvar configurações.' });
    } finally {
        client.release(); // Libera a conexão de volta para o pool
    }
});

// Convertido para 'async'
app.post('/admin/gerar-cartelas', checkAdmin, async (req, res) => {
    const { quantidade, nome, telefone } = req.body;
    if (!nome || nome.trim() === '') { return res.status(400).json({ success: false, message: 'O Nome do Jogador é obrigatório.' }); }
    let sorteioAlvo = (estadoJogo === "ESPERANDO") ? numeroDoSorteio : numeroDoSorteio + 1;
    console.log(`Admin ${req.session.usuario} está registrando ${quantidade} cartelas para '${nome}' (Tel: ${telefone}) no Sorteio #${sorteioAlvo}.`);
    if (!quantidade || quantidade < 1 || quantidade > 100) { return res.status(400).json({ success: false, message: 'Quantidade inválida (1-100).' }); }
    try {
        const precoUnitarioAtual = parseFloat(PRECO_CARTELA); const valorTotal = quantidade * precoUnitarioAtual; 
        
        // *** ATUALIZAÇÃO (Salvar Cartelas Manuais) ***
        const cartelasGeradas = [];
        for (let i = 0; i < quantidade; i++) { cartelasGeradas.push(gerarDadosCartela(sorteioAlvo)); }
        const cartelasJSON = JSON.stringify(cartelasGeradas); // Converte para JSON
        // *** FIM DA ATUALIZAÇÃO ***
        
        const manualPlayerId = `manual_${gerarIdUnico()}`; 
        jogadores[manualPlayerId] = { nome: nome, telefone: telefone || null, isBot: false, isManual: true, cartelas: cartelasGeradas };
        
        // *** ATUALIZAÇÃO (Query do Banco) ***
        const stmtVenda = `
            INSERT INTO vendas 
            (sorteio_id, nome_jogador, telefone, quantidade_cartelas, valor_total, tipo_venda, cartelas_json) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)`;
        // O payment_id de uma venda manual é null
        await db.query(stmtVenda, [sorteioAlvo, nome, telefone || null, quantidade, valorTotal, 'Manual', cartelasJSON]);
        // *** FIM DA ATUALIZAÇÃO ***
        
        console.log(`Geradas e REGISTRADAS ${cartelasGeradas.length} cartelas para '${nome}'. Venda registrada.`); io.emit('contagemJogadores', getContagemJogadores());
        return res.json(cartelasGeradas); // Retorna as cartelas para o admin imprimir
    } catch (error) { console.error("Erro ao gerar/registrar cartelas manuais:", error); return res.status(500).json({ success: false, message: 'Erro interno ao gerar cartelas.' }); }
});

app.get('/admin/relatorios.html', checkAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin', 'relatorios.html')); });

// Convertido para 'async' e sintaxe PG
app.get('/admin/api/vendas', checkAdmin, async (req, res) => {
    try {
        // 'strftime' (SQLite) vira 'to_char' (PostgreSQL)
        const stmt = `
            SELECT sorteio_id, nome_jogador, telefone, quantidade_cartelas, valor_total, tipo_venda, 
                   to_char(timestamp AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI:SS') as data_formatada 
            FROM vendas 
            ORDER BY timestamp DESC
        `;
        const vendasRes = await db.query(stmt);
        const vendas = vendasRes.rows;
        
        const totaisRes = await db.query(`SELECT SUM(valor_total) as faturamento_total, SUM(quantidade_cartelas) as cartelas_total FROM vendas`);
        const totais = totaisRes.rows[0];
        
        res.json({ success: true, vendas: vendas, totais: totais });
    } catch (error) { console.error("Erro ao buscar relatório de vendas:", error); res.status(500).json({ success: false, message: 'Erro interno ao buscar relatório.' }); }
});

// Convertido para 'async'
app.post('/admin/api/vendas/limpar', checkAdmin, async (req, res) => {
    console.log(`Admin ${req.session.usuario} está limpando o histórico de vendas.`);
    try {
        const stmt = 'DELETE FROM vendas'; // 'TRUNCATE TABLE vendas' seria mais rápido
        const info = await db.query(stmt);
        console.log(`Histórico de vendas limpo. ${info.rowCount} linhas removidas.`);
        res.json({ success: true, message: 'Histórico de vendas limpo com sucesso!', changes: info.rowCount });
    } catch (error) {
        console.error("Erro ao limpar relatório de vendas:", error);
        res.status(500).json({ success: false, message: 'Erro interno ao limpar relatório.' });
    }
});

app.get('/admin/vencedores.html', checkAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin', 'vencedores.html')); });

// Convertido para 'async' e sintaxe PG
app.get('/admin/api/vencedores', checkAdmin, async (req, res) => {
    try {
        const stmt = `
            SELECT id, sorteio_id, premio, nome, telefone, status_pagamento, 
                   to_char(timestamp AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI:SS') as data_formatada 
            FROM vencedores 
            ORDER BY timestamp DESC
        `;
        const resDB = await db.query(stmt);
        const vencedores = resDB.rows;
        res.json({ success: true, vencedores: vencedores });
    } catch (error) { console.error("Erro ao buscar relatório de vencedores:", error); res.status(500).json({ success: false, message: 'Erro interno ao buscar relatório.' }); }
});

// Convertido para 'async'
app.post('/admin/api/vencedor/pagar', checkAdmin, async (req, res) => {
    const { id } = req.body; if (!id) { return res.status(400).json({ success: false, message: 'ID do vencedor é obrigatório.' }); }
    try {
        const stmt = "UPDATE vencedores SET status_pagamento = 'Pago' WHERE id = $1";
        const info = await db.query(stmt, [id]);
        
        if (info.rowCount > 0) { // .changes vira .rowCount
            console.log(`Admin ${req.session.usuario} marcou o vencedor ID #${id} como 'Pago'.`); 
            res.json({ success: true, message: 'Status atualizado para Pago!' }); 
        }
        else { res.status(404).json({ success: false, message: 'Vencedor não encontrado.' }); }
    } catch (error) { console.error("Erro ao atualizar status de pagamento:", error); res.status(500).json({ success: false, message: 'Erro interno ao atualizar status.' }); }
});

// Convertido para 'async'
app.post('/admin/api/vencedores/limpar', checkAdmin, async (req, res) => {
    console.log(`Admin ${req.session.usuario} está limpando o histórico de vencedores.`);
    try {
        const stmt = 'DELETE FROM vencedores';
        const info = await db.query(stmt);
        console.log(`Histórico de vencedores limpo. ${info.rowCount} linhas removidas.`);
        res.json({ success: true, message: 'Histórico de vencedores limpo com sucesso!', changes: info.rowCount });
    } catch (error) {
        console.error("Erro ao limpar relatório de vencedores:", error);
        res.status(500).json({ success: false, message: 'Erro interno ao limpar relatório.' });
    }
});

app.use('/admin', checkAdmin, express.static(path.join(__dirname, 'public', 'admin')));
// ==========================================================

// ==========================================================
// *** LÓGICA DO JOGO (SOCKET.IO) (Funções auxiliares) ***
// ==========================================================

// Constantes do Jogo
const TEMPO_ENTRE_NUMEROS = 5000;
const MAX_VENCEDORES_HISTORICO = 10;
const MIN_CARTELAS_POR_BOT = 1; const MAX_CARTELAS_POR_BOT = 5;
const LIMITE_FALTANTES_QUASELA = 5; const MAX_JOGADORES_QUASELA = 5;

const nomesBots = [ "Maria Souza", "João Pereira", "Ana Costa", "Carlos Santos", "Sofia Oliveira", "Pedro Almeida", "Laura Ferreira", "Lucas Rodrigues", "Beatriz Lima", "Guilherme Azevedo", "Arthur Silva", "Alice Santos", "Bernardo Oliveira", "Manuela Rodrigues", "Heitor Ferreira", "Valentina Alves", "Davi Pereira", "Helena Lima", "Lorenzo Souza", "Isabella Costa", "Miguel Martins", "Sophia Rocha", "Theo Gonçalves", "Júlia Carvalho", "Gabriel Gomes", "Heloísa Mendes", "Pedro Henrique Ribeiro", "Maria Clara Dias", "Matheus Cardoso", "Isadora Vieira", "Enzo Fernandes", "Lívia Pinto", "Nicolas Andrade", "Maria Luísa Barbosa", "Benjamin Teixeira", "Ana Clara Nogueira", "Samuel Correia", "Lorena Rezende", "Rafael Duarte", "Cecília Freitas", "Gustavo Campos", "Yasmin Sales", "Daniel Moura", "Isabelly Viana", "Felipe Cunha", "Sarah Morais", "Lucas Gabriel Castro", "Ana Júlia Ramos", "João Miguel Pires", "Esther Aragão", "Murilo Farias", "Emanuelly Melo", "Bryan Macedo", "Mariana Barros", "Eduardo Cavalcanti", "Rebeca Borges", "Leonardo Monteiro", "Ana Laura Brandão", "Henrique Lins", "Clarice Dantas", "Cauã Azevedo", "Agatha Gusmão", "Vinícius Peixoto", "Gabrielly Benites", "João Guilherme Guedes", "Melissa Siqueira", "Bar do Zé", "Bar da Esquina", "Cantinho do Amigo", "Boteco do Manolo", "Bar Central", "Adega do Portuga", "Bar & Petiscos", "Ponto Certo Bar", "Bar Vira Copo", "Skina Bar", "Recanto do Chopp", "Bar do Gato", "Toca do Urso Bar", "Bar Boa Vista", "Empório do Bar", "Bar da Praça", "Boteco da Vila", "Bar Avenida", "Bar Estrela", "Parada Obrigatória Bar", "Distribuidora Silva", "Adega & Cia", "Disk Bebidas Rápido", "Central de Bebidas", "Distribuidora Irmãos Unidos", "Ponto Frio Bebidas", "Império das Bebidas", "Distribuidora Confiança", "SOS Bebidas", "Mundo das Bebidas", "Planeta Gelo & Bebidas", "Distribuidora Aliança", "O Rei da Cerveja", "Point das Bebidas", "Distribuidora Amigão", "Bebidas Delivery Já", "Varanda Bebidas", "Distribuidora Campeã", "Expresso Bebidas", "Top Beer Distribuidora", "Ricardão", "Paty", "Beto", "Juju", "Zeca", "Lulu", "Tio Sam", "Dona Flor", "Professor", "Capitão", "Alemão", "Baixinho", "Careca", "Japa", "Madruga", "Xará", "Campeão", "Princesa", "Chefe", "Arthur Moreira", "Alice Ribeiro", "Bernardo Rocha", "Manuela Alves", "Heitor Martins", "Valentina Barbosa", "Davi Barros", "Helena Soares", "Lorenzo Ferreira", "Isabella Gomes", "Miguel Pereira", "Sophia Rodrigues", "Theo Almeida", "Júlia Lima", "Gabriel Souza", "Heloísa Oliveira", "Pedro Henrique Santos", "Maria Clara Silva", "Matheus Costa", "Isadora Mendes", "Enzo Castro", "Lívia Andrade", "Nicolas Pinto", "Maria Luísa Cunha", "Benjamin Dias", "Ana Clara Azevedo", "Samuel Lopes", "Lorena Matos", "Rafael Nunes", "Cecília Gonçalves", "Gustavo Mendes", "Yasmin Correia", "Daniel Farias", "Isabelly Cardoso", "Felipe Neves", "Sarah Campos", "Lucas Gabriel Reis", "Ana Júlia Meireles", "João Miguel Viana", "Esther Pires", "Murilo Sales", "Emanuelly Freire", "Bryan Silveira", "Mariana Magalhães", "Eduardo Bastos", "Rebeca Santana", "Leonardo Teixeira", "Ana Laura Gomes", "Henrique Vieira", "Clarice Moraes", "Cauã Duarte", "Agatha Rezende", "Vinícius Monteiro", "Gabrielly Nogueira", "João Guilherme Guerra", "Melissa Xavier", "Davi Lucca", "Maria Eduarda", "Anthony", "Elisa", "João Lucas", "Maria Alice", "Erick", "Lavínia", "Fernando", "Letícia", "Rodrigo", "Nicole", "Otávio", "Gabriela", "Igor", "Yasmin", "Francisco", "Mariana", "Benício", "Eloá", "Victor", "Clara", "Cauê", "Lívia", "João Pedro", "Beatriz", "Breno", "Laís", "Vicente", "Ayla", "Fábio", "Alícia", "Diego", "Estela", "Luiz Felipe", "Catarina", "Emanuel", "Vitória", "André", "Olívia", "Nathan", "Maitê", "Ruan", "Mirella", "Davi Luiz", "Heloísa", "Kaique", "Luna", "Bruno", "Lara", "Noah", "Maria Fernanda", "Thiago", "Isis", "Ravi", "Antonella", "Caio", "Liz", "Eduardo", "Maria Vitória", "Pedro Lucas", "Agatha", "Luiz Miguel", "Ana Luísa", "Antônio", "Pietra", "Enrico", "Marina", "João Gabriel", "Rebeca", "Augusto", "Ana Beatriz", "Isaac", "Alexia", "Lucca", "Bianca", "Otávio", "Esther", "Davi Miguel", "Ana Vitória", "Calebe", "Evelyn", "Luiz Gustavo", "Aurora", "Henrique", "Livia", "Ryan", "Milena", "Yuri", "Natália", "Benjamin", "Maria Flor", "Luiz Otávio", "Ana Liz", "Emanuel", "Elisa", "Davi Lucas", "Maria Helena", "Ian", "Rafaela", "Guilherme", "Melissa", "Luiz Henrique", "Mirela", "Breno", "Isabel", "Matheus Henrique", "Ana Sophia", "Oliver", "Maria Cecília", "Levi", "Ana Lívia", "Enzo Gabriel", "Joana", "Joaquim", "Clarice", "Davi", "Isabelly", "Bryan", "Stella", "Samuel", "Maria Valentina", "Heitor", "Ana", "Adega do Vale", "Distribuidora Premium", "Bar do Chico", "O Canecão Bar", "Bebidas & Cia", "Stop Beer", "Bar do Ponto", "Casa da Cerveja", "Toca da Onça Bar", "Império da Bebida", "Distribuidora Gela Guela", "Bar da Galera", "Point do Litrão", "Cantina do Sabor", "Bar do Mineiro", "Adega 24 Horas", "O Botecão", "Distribuidora Central", "Bar do Lago", "Rota da Cerveja", "Vem Que Tem Bebidas", "Bar do Pescador", "Adega Imperial", "Boteco do Rei", "Distribuidora Expresso", "Bar do Paulista", "Beer Point Distribuidora", "Bar dos Artistas", "Gelo e Bebidas Express", "Boteco do Alto", "Cantinho da Cerveja", "Bar do Arlindo", "Toma Todas Distribuidora", "Bar da Torre", "Adega dos Amigos", "Bar do Comércio", "Distribuidora Ouro Verde", "Bar da Boa", "Mundo da Gela", "Boteco Pé de Serra", "Distribuidora Copo Cheio", "Bar do China", "Adega Noturna", "Boteco do Frazão", "Gela Rápido", "Bar do Beto", "Point da Bebida", "Bar do Cais", "Distribuidora Zero Grau", "Boteco do Estudante", "Adega e Tabacaria Prime", "Bar do Nando", "Distribuidora do Trabalhador", "Bar da Matriz", "SOS Cerveja", "Boteco do Parque", "Distribuidora São Jorge", "Bar do Mário", "Bebidas.com", "O Encontro Bar", "Distribuidora Água na Boca", "Bar do Bigode", "Adega Fênix", "Boteco do Léo", "Distribuidora Monte Carlo", "Bar da Ponte", "Casa do Gelo", "Bar do Tio", "Distribuidora Elite", "Boteco do Tchê", "Adega do Chefe", "Bar do Juarez", "Disk Gelo e Bebidas", "Bar do Meio", "Ponto do Malte", "Boteco do Alex", "Distribuidora Sol Nascente", "Bar do Nelson", "Mestre Cervejeiro Adega", "Bar do Valdir", "Distribuidora Premium", "Bar do Nogueira", "Armazém da Bebida", "Boteco do Careca", "Planeta Bebidas", "Bar do Elias", "Adega do Bairro", "Boteco do Sítio", "Distribuidora Pit Stop", "Bar do Osmar", "Distribuidora Bom Preço", "Bar do Wilson", "Mundo da Cerveja", "Boteco do Ceará", "Casa da Bebida", "Bar do Gaúcho", "Adega e Conveniência", "Boteco do Portuga", "Distribuidora Real", "Bar do Dito", "Camila Alves", "Diego Fernandes", "Larissa Barbosa", "Rodrigo Nogueira", "Bruna Melo", "Sérgio Azevedo", "Letícia Cunha", "Marcos Rocha", "Amanda Freitas", "Renato Borges", "Juliana Teixeira", "Felipe Dantas", "Patrícia Sales", "Thiago Gusmão", "Carolina Pires", "Anderson Viana", "Vanessa Morais", "Márcio Aragão", "Jéssica Peixoto", "Leandro Siqueira", "Tatiane Campos", "Ricardo Rezende", "Elaine Correia", "Fábio Benites", "Adriana Guedes", "Marcelo Ramos", "Daniela Castro", "Alexandre Lins", "Aline Brandão", "César Dantas", "Cristiane Gusmão", "Vinícius Peixoto", "Fernanda Benites", "Rafael Guedes", "Cláudia Siqueira", "Roberto Campos", "Priscila Rezende", "Márcio Correia", "Luciana Benites", "Carlos Guedes", "Valéria Castro", "Rogério Lins", "Renata Brandão", "Sandro Dantas", "Mônica Gusmão", "André Peixoto", "Simone Benites", "Jonas Guedes", "Débora Siqueira", "Raul Campos", "Regina Rezende", "Gustavo Correia", "Elisa Benites", "Leonardo Guedes", "Tânia Castro", "Jorge Lins", "Sandra Brandão", "Paulo Dantas", "Vera Gusmão", "Nelson Peixoto", "Ângela Benites", "Fábio Guedes", "Cintia Siqueira", "William Campos", "Rosa Rezende", "Otávio Correia", "Ester Benites", "Douglas Guedes", "Gisele Castro", "Ricardo Lins", "Teresa Brandão", "Alex Dantas", "Célia Gusmão", "Anderson Peixoto", "Eliane Benites", "Marcelo Guedes", "Cristina Siqueira", "Rodrigo Campos", "Lúcia Rezende", "Antônio Correia", "Isabela Benites", "Bruno Guedes", "Débora Castro", "Fernando Lins", "Manuela Brandão", "Ronaldo Dantas", "Vânia Gusmão", "Felipe Peixoto", "Carolina Benites", "Jorge Guedes", "Elisa Siqueira", "Ricardo Campos", "Lídia Rezende", "Marcos Correia", "Estela Benites", "Pedro Guedes", "Patrícia Castro", "Rafael Lins", "Carla Brandão", "Sérgio Dantas", "Marta Gusmão", "Rui Peixoto", "Luana Benites", "Caio Guedes", "Simone Siqueira", "Vitor Campos", "Clara Rezende", "José Correia", "Laura Benites", "Guilherme Guedes", "Bar do Cumpadi", "Adega do Beco", "Distribuidora do Gole", "Boteco do Litoral", "Cantinho da Birita", "Bar e Mercearia Sol", "Rei da Gelada", "Taberna do Zé", "Distribuidora Tio Patinhas", "Bar Aconchego", "Bebidas da Hora", "Bar do Ferrugem", "Adega do Povo", "Boteco do Gringo", "Distribuidora Stop Gelo", "Bar do Sombra", "Cervejaria da Esquina", "Bar do Peixe", "Armazém do Gelo", "Boteco do Nono", "Distribuidora do Chefe", "Bar do Tatu", "Adega do Frade", "Boteco do Zeca", "Geladão Bebidas", "Bar do Russo", "Ponto da Skol", "Bar do Gordo", "Distribuidora Central do Gelo", "Boteco do Baiano", "Adega e Conveniência 24h", "Bar do Neno", "Distribuidora 3 Irmãos", "Bar do Brejo", "Bebidas e Cia Express", "Boteco do Bigode", "Distribuidora do Bairro", "Bar do Tênis", "Casa do Whisky", "Boteco do Vovô", "Distribuidora do Japa", "Bar do Caju", "Adega do Mestre", "Boteco do China", "Império da Gela", "Bar do Preto", "Ponto da Brahma", "Bar do Jota", "Distribuidora do Ponto", "Boteco do Mineiro", "Adega Ouro Fino", "Bar do Pirata", "Distribuidora do Gordo", "Boteco do Alemão", "Bebidas.com", "Bar do Zoinho", "Cerveja & Gelo", "Bar do Toca", "Distribuidora Gela Mais", "Boteco do Gela", "Adega do Bira", "Bar do Poeta", "Distribuidora do Zé", "Boteco do Farol", "Sempre Gela", "Bar do Pescador", "Armazém da Cerveja", "Bar do Tonho", "Distribuidora do Parque", "Boteco da Madrugada", "Adega do Lago", "Bar do Corvo", "Distribuidora do Vale", "Boteco do Lampião", "Gelo & conveniência", "Bar do Tiozinho", "Canto da Cerveja", "Bar do Vaguinho", "Distribuidora do Trevo", "Boteco do Beco", "Adega da Serra", "Bar do Tim", "Distribuidora do Sol", "Boteco do Morro", "Point do Gelo", "Bar do Cabelo", "Conveniência do Gelo", "Bar do Guto", "Distribuidora do Cais", "Boteco do Rio", "Adega do Mar", "Bar do Tita", "Distribuidora da Praça", "Boteco da Ponte", "Gela Gela Bebidas", "Bar do Vitão", "Cervejaria do Bairro", "Bar do Fred", "Distribuidora da Ilha", "Boteco do Sertão" ];
function gerarIdUnico() { return Math.random().toString(36).substring(2, 6) + '-' + Math.random().toString(36).substring(2, 6); }
function gerarNumerosAleatorios(quantidade, min, max) { const numeros = new Set(); while (numeros.size < quantidade) { const aleatorio = Math.floor(Math.random() * (max - min + 1)) + min; numeros.add(aleatorio); } return Array.from(numeros); }
function gerarDadosCartela(sorteioId) { const cartela = []; const colunas = [ gerarNumerosAleatorios(5, 1, 15), gerarNumerosAleatorios(5, 16, 30), gerarNumerosAleatorios(4, 31, 45), gerarNumerosAleatorios(5, 46, 60), gerarNumerosAleatorios(5, 61, 75) ]; for (let i = 0; i < 5; i++) { const linha = []; for (let j = 0; j < 5; j++) { if (j === 2 && i === 2) { linha.push("FREE"); } else if (j === 2) { linha.push(colunas[j][i > 2 ? i - 1 : i]); } else { linha.push(colunas[j][i]); } } cartela.push(linha); } return { c_id: gerarIdUnico(), s_id: sorteioId, data: cartela }; }
function checarVencedorLinha(cartelaData, numerosSorteados) { const cartela = cartelaData.data; const numerosComFree = new Set(numerosSorteados); numerosComFree.add("FREE"); for (let i = 0; i < 5; i++) { if (cartela[i].every(num => numerosComFree.has(num))) return true; } for (let i = 0; i < 5; i++) { if (cartela.every(linha => numerosComFree.has(linha[i]))) return true; } if (cartela.every((linha, i) => numerosComFree.has(linha[i]))) return true; if (cartela.every((linha, i) => numerosComFree.has(linha[4-i]))) return true; return false; }
function checarVencedorCartelaCheia(cartelaData, numerosSorteados) { const cartela = cartelaData.data; const numerosComFree = new Set(numerosSorteados); numerosComFree.add("FREE"); for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) { if (!numerosComFree.has(cartela[i][j])) return false; } } return true; }
function contarFaltantesParaCheia(cartelaData, numerosSorteadosSet) { if (!cartelaData || !cartelaData.data) return 99; const cartela = cartelaData.data; let faltantes = 0; for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) { const num = cartela[i][j]; if (num !== "FREE" && !numerosSorteadosSet.has(num)) { faltantes++; } } } return faltantes; }

// --- Lógica Principal do Jogo (Convertida para PG) ---
let estadoJogo = "ESPERANDO";
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

async function sortearNumero() { // Convertido para 'async'
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
            
            // Agora é 'await'
            await salvarVencedorNoDB({ sorteioId: numeroDoSorteio, premio: "Linha", nome: jogador.nome, telefone: jogador.telefone, cartelaId: cartela.c_id }); 
            
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

    // ATUALIZAÇÃO (DELAY VENCEDOR)
    if (estadoJogo === "JOGANDO_CHEIA") {
        for (const socketId in jogadores) { const jogador = jogadores[socketId]; if (!jogador.cartelas || jogador.cartelas.length === 0) continue; for (let i = 0; i < jogador.cartelas.length; i++) { const cartela = jogador.cartelas[i]; if (cartela.s_id !== numeroDoSorteio) continue; 
            
            if (checarVencedorCartelaCheia(cartela, numerosSorteadosSet)) { 
                console.log(`DEBUG: Vencedor da CARTELA CHEIA encontrado: ${getNome(jogador, socketId)}`); 
                const nomeVencedor = getNome(jogador, socketId); 

                // 1. Parar o sorteio de novos números IMEDIATAMENTE
                if (intervaloSorteio) {
                    clearInterval(intervaloSorteio);
                    intervaloSorteio = null;
                    console.log("DEBUG: Sorteio pausado. Vencedor encontrado.");
                }

                // 2. Mudar o estado para "travar" o jogo
                estadoJogo = "ANUNCIANDO_VENCEDOR"; // Novo estado
                io.emit('estadoJogoUpdate', { sorteioId: numeroDoSorteio, estado: estadoJogo });

                // 3. Preparar os dados do vencedor (Salva no DB)
                await salvarVencedorNoDB({ sorteioId: numeroDoSorteio, premio: "Cartela Cheia", nome: jogador.nome, telefone: jogador.telefone, cartelaId: cartela.c_id }); 
                const dadosVencedor = { nome: nomeVencedor, telefone: jogador.telefone, cartelaGanhadora: cartela, indiceCartela: i, premioValor: PREMIO_CHEIA }; 
                const socketVencedor = (jogador.isBot || jogador.isManual) ? null : socketId;

                // 4. Esperar 5 segundos ANTES de anunciar
                const TEMPO_DELAY_ANUNCIO = 5000; // 5 segundos
                console.log(`Servidor: Esperando ${TEMPO_DELAY_ANUNCIO}ms para anunciar o vencedor...`);
                
                setTimeout(() => {
                    console.log("Servidor: Anunciando vencedor e terminando a rodada.");
                    terminarRodada(dadosVencedor, socketVencedor); // <-- CHAMADA ATRASADA
                }, TEMPO_DELAY_ANUNCIO);
                
                return; // Para o loop de checagem de vencedores
            } 
        } }
    }


    if (estadoJogo === "JOGANDO_LINHA" || estadoJogo === "JOGANDO_CHEIA") {
        const jogadoresPerto = [];
        for (const socketId in jogadores) { const jogador = jogadores[socketId]; if (!jogador.cartelas || jogador.cartelas.length === 0) continue; for (const cartela of jogador.cartelas) { if (cartela.s_id !== numeroDoSorteio) continue; const faltantes = contarFaltantesParaCheia(cartela, numerosSorteadosSet); if (faltantes > 0 && faltantes <= LIMITE_FALTANTES_QUASELA) { jogadoresPerto.push({ nome: getNome(jogador, socketId), faltam: faltantes }); } } }
        jogadoresPerto.sort((a, b) => a.faltam - b.faltam); const topJogadores = jogadoresPerto.slice(0, MAX_JOGADORES_QUASELA); io.emit('atualizarQuaseLa', topJogadores);
    }
}

// Convertido para 'async'
async function salvarVencedorNoDB(vencedorInfo) {
    try {
        const stmt = `INSERT INTO vencedores (sorteio_id, premio, nome, telefone, cartela_id) VALUES ($1, $2, $3, $4, $5)`;
        await db.query(stmt, [vencedorInfo.sorteioId, vencedorInfo.premio, vencedorInfo.nome || 'Bot/Manual', vencedorInfo.telefone, vencedorInfo.cartelaId]);
        
        console.log(`Vencedor [${vencedorInfo.premio}] salvo no banco de dados (Status: Pendente).`);
        
        const ultimos = await getUltimosVencedoresDoDB(); // 'await'
        io.emit('atualizarVencedores', ultimos);
    } catch (err) { console.error("Erro ao salvar vencedor no DB:", err); }
}

// A função agora é 'async' para salvar no banco
async function terminarRodada(vencedor, socketVencedor) {
    console.log("DEBUG: Dentro de terminarRodada().");
    
    // A limpeza do intervalo agora é feita ANTES, na função 'sortearNumero'
    if (intervaloSorteio) { 
        clearInterval(intervaloSorteio); 
        intervaloSorteio = null; 
        console.warn("DEBUG: Intervalo de sorteio parado em terminarRodada (não deveria acontecer se o delay funcionou).");
    }
    
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
    
    // Incrementa o número do sorteio e SALVA no banco
    numeroDoSorteio++; // Incrementa a variável global
    try {
        // Salva o NOVO número no banco
        const query = `
            INSERT INTO configuracoes (chave, valor) 
            VALUES ($1, $2) 
            ON CONFLICT (chave) 
            DO UPDATE SET valor = EXCLUDED.valor;
        `;
        await db.query(query, ['numero_sorteio_atual', numeroDoSorteio.toString()]);
        console.log(`Servidor: Sorteio #${idSorteioFinalizado} terminado. Próximo será #${numeroDoSorteio} (Salvo no DB).`); 
    } catch (err) {
        console.error("ERRO CRÍTICO AO SALVAR NÚMERO DO SORTEIO:", err);
        // O jogo continua, mas o próximo reinício voltará para o número antigo
    }

    io.emit('estadoJogoUpdate', { sorteioId: numeroDoSorteio, estado: estadoJogo }); io.emit('atualizarQuaseLa', []);
    console.log("DEBUG: terminarRodada() concluída.");
}

function getContagemJogadores() { 
    let total = 0; let reais = 0; 
    try { 
        if (jogadores && typeof jogadores === 'object') { 
            const players = Object.values(jogadores); 
            total = players.filter(j => j && j.nome).length; 
            reais = players.filter(j => j && j.nome && !j.isBot && !j.isManual).length;
        } 
    } catch (error) { 
        console.error("Erro crítico em getContagemJogadores:", error); 
        return { total: 0, reais: 0 }; 
    } 
    return { total, reais }; 
}

// Convertido para 'async'
async function getUltimosVencedoresDoDB(limite = MAX_VENCEDORES_HISTORICO) { 
    try { 
        const stmt = `SELECT sorteio_id as "sorteioId", premio, nome FROM vencedores ORDER BY timestamp DESC LIMIT $1`;
        const resDB = await db.query(stmt, [limite]);
        return resDB.rows; 
    } catch (err) { 
        console.error("Erro ao buscar vencedores no DB:", err); 
        return []; 
    } 
}

// Convertido para 'async'
async function getAdminStatusData() {
    const statusData = {
        estado: estadoJogo,
        sorteioAtual: numeroDoSorteio,
        tempoRestante: estadoJogo === 'ESPERANDO' ? tempoRestante : null,
        jogadoresReais: getContagemJogadores().reais
    };

    try {
        const proximoSorteioId = estadoJogo === 'ESPERANDO' ? numeroDoSorteio : numeroDoSorteio + 1;
        
        const vendasProximoRes = await db.query(`
            SELECT COUNT(*) as qtd_cartelas, SUM(valor_total) as valor_total 
            FROM vendas 
            WHERE sorteio_id = $1
        `, [proximoSorteioId]);
        
        statusData.vendasProximoSorteio = vendasProximoRes.rows[0] || { qtd_cartelas: 0, valor_total: 0 };
        statusData.proximoSorteioId = proximoSorteioId;

        // 'date()' (SQLite) vira '::date' (PostgreSQL)
        const receitaDiaRes = await db.query(`
            SELECT SUM(valor_total) as valor_total_dia
            FROM vendas
            WHERE (timestamp AT TIME ZONE 'UTC')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
        `);
        statusData.receitaDoDia = receitaDiaRes.rows[0].valor_total_dia || 0;

    } catch (error) {
        console.error("Erro ao buscar dados de status admin:", error);
        statusData.vendasProximoSorteio = { qtd_cartelas: 'Erro', valor_total: 'Erro' };
        statusData.receitaDoDia = 'Erro';
    }

    return statusData;
}


// Convertido para 'async'
io.on('connection', async (socket) => {
    console.log(`Novo usuário conectado: ${socket.id}`);
    try {
        const contagemInicial = getContagemJogadores(); 
        const ultimosVencedoresDB = await getUltimosVencedoresDoDB(); // 'await'
        const totalOnline = contagemInicial ? contagemInicial.total : 0; 
        const reaisOnline = contagemInicial ? contagemInicial.reais : 0;
        
        const resDB = await db.query("SELECT chave, valor FROM configuracoes");
        const configs = resDB.rows;
        const configMap = configs.reduce((acc, config) => { acc[config.chave] = config.valor; return acc; }, {});
        
        socket.emit('estadoInicial', { 
            sorteioId: numeroDoSorteio, 
            estado: estadoJogo, 
            tempoRestante: estadoJogo === 'ESPERANDO' ? tempoRestante : 0, 
            jogadoresOnline: totalOnline, 
            jogadoresReais: reaisOnline, 
            ultimosVencedores: ultimosVencedoresDB, 
            numerosSorteados: numerosSorteados, 
            ultimoNumero: numerosSorteados.length > 0 ? numerosSorteados[numerosSorteados.length - 1] : null, 
            quaseLa: [], 
            configuracoes: configMap 
        });
    } catch (error) { console.error("Erro ao emitir estado inicial:", error); }
    
    // --- FUNÇÃO DE PAGAMENTO ATUALIZADA (SALVA PENDENTE NO DB) ---
    socket.on('criarPagamento', async (dadosCompra, callback) => {
        try {
            const { nome, telefone, quantidade } = dadosCompra;
            
            const precoRes = await db.query("SELECT valor FROM configuracoes WHERE chave = $1", ['preco_cartela']);
            const preco = precoRes.rows[0];
            const precoUnitarioAtual = parseFloat(preco.valor || '5.00');
            const valorTotal = quantidade * precoUnitarioAtual;
            
            console.log(`Servidor: Usuário ${nome} (${telefone}) quer comprar ${quantidade} cartela(s). Total: R$${valorTotal.toFixed(2)}.`);

            // Verifica se a BASE_URL foi configurada
            if (!process.env.BASE_URL) {
                console.error("ERRO GRAVE: BASE_URL não está configurada! O Webhook do MercadoPago falhará.");
                // Retorna um erro para o usuário imediatamente
                if (typeof callback === 'function') {
                    callback({ success: false, message: 'Erro no servidor: URL de pagamento não configurada.' });
                }
                return; // Impede a continuação
            }

            const payment = new Payment(mpClient);
            const body = {
                transaction_amount: valorTotal,
                description: `Compra de ${quantidade} cartela(s) - Bingo do Pix`,
                payment_method_id: 'pix',
                notification_url: `${process.env.BASE_URL}/webhook-mercadopago`,
                payer: {
                    email: `jogador_${telefone}@bingo.com`, 
                    first_name: nome,
                    last_name: "Jogador",
                },
                date_of_expiration: new Date(Date.now() + (10 * 60 * 1000)).toISOString().replace("Z", "-03:00") // 10 min
            };

            const response = await payment.create({ body });
            
            const paymentId = response.id.toString();
            
            // *** ATUALIZAÇÃO (PAGAMENTOS PENDENTES) ***
            // Salva o pagamento pendente no DB, não na variável
            const dadosCompraJSON = JSON.stringify(dadosCompra);
            const query = `
                INSERT INTO pagamentos_pendentes (payment_id, socket_id, dados_compra_json)
                VALUES ($1, $2, $3)
                ON CONFLICT (payment_id) DO UPDATE SET
                    socket_id = EXCLUDED.socket_id,
                    dados_compra_json = EXCLUDED.dados_compra_json,
                    timestamp = CURRENT_TIMESTAMP
            `;
            await db.query(query, [paymentId, socket.id, dadosCompraJSON]);
            console.log(`Pagamento PIX ${paymentId} salvo no DB para socket ${socket.id}.`);
            // *** FIM DA ATUALIZAÇÃO ***

            const qrCodeBase64 = response.point_of_interaction.transaction_data.qr_code_base64;
            const qrCodeCopiaCola = response.point_of_interaction.transaction_data.qr_code;
            
            if (typeof callback === 'function') {
                // *** ATUALIZAÇÃO (POLLING DE PAGAMENTO) ***
                // Retorna o paymentId para o cliente
                callback({ success: true, qrCodeBase64, qrCodeCopiaCola, paymentId: paymentId });
            }

        } catch(error) {
            console.error("Erro em criarPagamento no Mercado Pago:", error.cause || error.message);
            if (typeof callback === 'function') {
                callback({ success: false, message: 'Erro ao gerar QR Code. Verifique o Access Token do Servidor.' });
            }
        }
    });
    // --- FIM DA FUNÇÃO DE PAGAMENTO ---
    
    socket.on('registerPlayer', (playerData) => { try { if (playerData && playerData.cartelas && playerData.cartelas.length > 0) { const s_id_cartela = playerData.cartelas[0].s_id; if (s_id_cartela === numeroDoSorteio || (estadoJogo === "ESPERANDO")) { console.log(`Servidor: Registrando jogador ${playerData.nome} (${socket.id}) para o Sorteio #${numeroDoSorteio}.`); jogadores[socket.id] = { nome: playerData.nome, telefone: playerData.telefone, isBot: false, isManual: false, cartelas: playerData.cartelas }; io.emit('contagemJogadores', getContagemJogadores()); } else { console.warn(`Servidor: Jogador ${playerData.nome} (${socket.id}) tentou entrar no Sorteio #${numeroDoSorteio} com cartela inválida (Sorteio #${s_id_cartela}, Estado: ${estadoJogo}). REJEITADO.`); socket.emit('cartelaAntiga'); } } } catch(error) { console.error("Erro em registerPlayer:", error); } });
    socket.on('disconnect', () => { console.log(`Usuário desconectado: ${socket.id}`); const eraJogadorRegistrado = jogadores[socket.id] && jogadores[socket.id].nome && !jogadores[socket.id].isBot && !jogadores[socket.id].isManual; delete jogadores[socket.id]; if (eraJogadorRegistrado) { try { io.emit('contagemJogadores', getContagemJogadores()); } catch (error) { console.error("Erro ao emitir contagemJogadores no disconnect:", error); } } });
    
    // Convertido para 'async'
    socket.on('getAdminStatus', async () => {
        try {
            const statusData = await getAdminStatusData(); // 'await'
            socket.emit('adminStatusUpdate', statusData);
        } catch (error) {
            console.error("Erro ao processar getAdminStatus:", error);
            socket.emit('adminStatusUpdate', { error: 'Falha ao buscar status.' });
        }
    });

    // Ouvinte para buscar cartelas
    socket.on('buscarMinhasCartelas', async (data) => {
        try {
            const { vendaId, nome } = data;
            if (!vendaId || !nome) {
                console.warn(`Cliente ${socket.id} pediu cartelas com dados inválidos.`);
                socket.emit('cartelasNaoEncontradas');
                return;
            }
            
            // Busca no banco de dados
            const query = "SELECT cartelas_json, nome_jogador FROM vendas WHERE id = $1";
            const res = await db.query(query, [vendaId]);
            
            if (res.rows.length > 0) {
                const venda = res.rows[0];
                // Verificação de segurança simples
                if (venda.nome_jogador === nome) {
                    console.log(`Encontrada Venda #${vendaId} para ${nome}. Enviando cartelas.`);
                    const cartelas = JSON.parse(venda.cartelas_json);
                    socket.emit('cartelasEncontradas', { cartelas: cartelas });
                } else {
                    // Nome não bate com o ID
                    console.warn(`Cliente ${socket.id} tentou pegar Venda #${vendaId} (Nome: ${venda.nome_jogador}) usando o nome ${nome}. REJEITADO.`);
                    socket.emit('cartelasNaoEncontradas');
                }
            } else {
                console.warn(`Cliente ${socket.id} pediu Venda #${vendaId}, mas ela não foi encontrada.`);
                socket.emit('cartelasNaoEncontradas');
            }
        } catch (error) {
            console.error("Erro ao buscar cartelas:", error);
            socket.emit('cartelasNaoEncontradas');
        }
    });
    
    // *** ATUALIZAÇÃO (POLLING DE PAGAMENTO) ***
    // Novo ouvinte para o cliente checar o status do pagamento
    socket.on('checarMeuPagamento', async (data) => {
        try {
            const { paymentId } = data;
            if (!paymentId) return;

            // Consulta a tabela de VENDAS (não a de pendentes)
            const query = "SELECT id, nome_jogador, telefone FROM vendas WHERE payment_id = $1";
            const res = await db.query(query, [paymentId]);

            if (res.rows.length > 0) {
                // Pagamento foi processado pelo webhook e a venda existe!
                const venda = res.rows[0];
                console.log(`Polling: Pagamento ${paymentId} encontrado (Venda #${venda.id}). Avisando cliente ${socket.id}`);
                
                // Avisa o cliente que o pagamento foi aprovado
                socket.emit('pagamentoAprovado', {
                    vendaId: venda.id,
                    nome: venda.nome_jogador,
                    telefone: venda.telefone
                });
            } else {
                // Pagamento ainda não está na tabela de vendas. O cliente continua esperando.
                // Não fazemos nada, o cliente vai perguntar de novo.
            }
        } catch (err) {
            console.error("Erro ao checar status de pagamento (checarMeuPagamento):", err);
        }
    });
    // *** FIM DA ATUALIZAÇÃO ***

});
// ==========================================================

// ==========================================================
// Iniciar o Servidor
// ==========================================================

// (Função IIFE 'async' para permitir 'await' no nível superior)
(async () => {
    // 1. Inicializa o banco de dados (cria tabelas, etc.)
    await inicializarBanco();
    
    // 2. Carrega as configurações (Prêmios, Preços E NÚMERO DO SORTEIO)
    await carregarConfiguracoes();

    // 3. Inicia o servidor web
    server.listen(PORTA, () => {
        console.log(`Servidor "Bingo do Pix" rodando!`);
        console.log(`Conectado ao PostgreSQL em: ${process.env.DATABASE_URL ? 'Variável de Ambiente' : 'Configuração Padrão'}`);
        console.log(`Acesse em http://localhost:${PORTA}`);
        console.log(`Login Admin: http://localhost:${PORTA}/admin/login.html`);
        console.log(`Dashboard (com anúncio): http://localhost:${PORTA}/dashboard`);
    });
})();


// --- FECHAR O BANCO AO SAIR (Atualizado para PG) ---
process.on('exit', () => pool.end());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));
