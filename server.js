const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const bcrypt = require('bcrypt'); // Importa o bcrypt
const crypto = require('crypto'); // <-- ADICIONADO para a validação

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


        // *** ATUALIZAÇÃO (CAMBISTAS) ***
// 1. Cria a tabela de Cambistas
await db.query(`
           CREATE TABLE IF NOT EXISTS cambistas (
               id SERIAL PRIMARY KEY,
               usuario TEXT UNIQUE NOT NULL,
               senha TEXT NOT NULL,
               saldo_creditos REAL DEFAULT 0 NOT NULL,
               ativo BOOLEAN DEFAULT true NOT NULL,
               timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
           );
       `);
console.log("Tabela 'cambistas' verificada.");

// 2. Cria a tabela de Transações de Créditos (histórico)
await db.query(`
           CREATE TABLE IF NOT EXISTS transacoes_creditos (
               id SERIAL PRIMARY KEY,
               cambista_id INTEGER NOT NULL REFERENCES cambistas(id),
               admin_usuario TEXT NOT NULL,
               valor_alteracao REAL NOT NULL,
               tipo TEXT NOT NULL, -- 'recarga' ou 'venda'
               venda_id INTEGER NULL, -- ID da venda (se for do tipo 'venda')
               timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
           );
       `);
console.log("Tabela 'transacoes_creditos' verificada.");

// 3. Adiciona a coluna 'cambista_id' na tabela 'vendas'
try {
await db.query('ALTER TABLE vendas ADD COLUMN cambista_id INTEGER NULL REFERENCES cambistas(id)');
console.log("Coluna 'cambista_id' adicionada à tabela 'vendas'.");
} catch (e) {
if (e.code === '42701') {
console.log("Coluna 'cambista_id' já existe. Ignorando.");
} else {
throw e;
}
}
        // *** FIM DA ATUALIZAÇÃO (CAMBISTAS) ***

        
        // ===============================================
        // ===== INÍCIO: NOVAS TABELAS PARA RIFA =====
        // ===============================================

        // 1. Tabela para definir qual rifa está ativa
        await db.query(`
            CREATE TABLE IF NOT EXISTS rifas (
                id SERIAL PRIMARY KEY,
                nome_premio TEXT NOT NULL,
                descricao TEXT,
                valor_numero REAL NOT NULL,
                data_sorteio_prevista TEXT,
                ativo BOOLEAN DEFAULT true NOT NULL
            );
        `);
        console.log("Tabela 'rifas' verificada.");

        // 2. Tabela para guardar as VENDAS da rifa
        await db.query(`
            CREATE TABLE IF NOT EXISTS rifa_vendas (
                id SERIAL PRIMARY KEY,
                rifa_id INTEGER NOT NULL REFERENCES rifas(id),
                nome_jogador TEXT NOT NULL,
                telefone TEXT NOT NULL,
                quantidade_numeros INTEGER NOT NULL,
                valor_total REAL NOT NULL,
                payment_id TEXT,
                status_pagamento TEXT DEFAULT 'Pendente' NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Tabela 'rifa_vendas' verificada.");

        // 3. Tabela para guardar os NÚMEROS GERADOS (0000-9999)
        await db.query(`
            CREATE TABLE IF NOT EXISTS rifa_numeros (
                id SERIAL PRIMARY KEY,
                rifa_id INTEGER NOT NULL REFERENCES rifas(id),
                rifa_venda_id INTEGER NOT NULL REFERENCES rifa_vendas(id),
                numero_rifa TEXT NOT NULL, -- (ex: "6870")
                UNIQUE(rifa_id, numero_rifa) -- Garante que não haja números repetidos na mesma rifa
            );
        `);
        console.log("Tabela 'rifa_numeros' verificada.");

        // 4. Modificar a tabela de pagamentos pendentes para saber o TIPO
        try {
            await db.query("ALTER TABLE pagamentos_pendentes ADD COLUMN tipo_compra TEXT DEFAULT 'bingo' NOT NULL");
            console.log("Coluna 'tipo_compra' adicionada a 'pagamentos_pendentes'.");
        } catch (e) {
            if (e.code === '42701') {
                console.log("Coluna 'tipo_compra' já existe em 'pagamentos_pendentes'.");
            } else {
                throw e;
            }
        }
        
        // ===============================================
        // ===== FIM: NOVAS TABELAS PARA RIFA =====
        // ===============================================


// Verifica se o admin existe e qual sua senha (lógica de correção de senha)
const adminRes = await db.query('SELECT senha FROM usuarios_admin WHERE usuario = $1', ['admin']);

const saltRounds = 10;
const senhaHash = await bcrypt.hash('admin123', saltRounds);

if (adminRes.rows.length == 0) {
// Admin não existe, cria um novo
await db.query('INSERT INTO usuarios_admin (usuario, senha) VALUES ($1, $2)', ['admin', senhaHash]);
console.log("Usuário 'admin' criado com senha criptografada.");
} else {
// Admin existe, checa a senha
const senhaAtual = adminRes.rows[0].senha;
if (!senhaAtual.startsWith('$2')) {
await db.query('UPDATE usuarios_admin SET senha = $1 WHERE usuario = $2', [senhaHash, 'admin']);
console.log("Senha do 'admin' atualizada para formato criptografado.");
} else {
console.log("Usuário 'admin' já possui senha criptografada.");
}
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

const MERCADOPAGO_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET; 
if (!MERCADOPAGO_WEBHOOK_SECRET) {
    console.warn("AVISO DE SEGURANÇA: MERCADOPAGO_WEBHOOK_SECRET não configurado. Pagamentos NÃO SERÃO validados!");
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
// *** WEBHOOK CORRIGIDO (VERSÃO FINAL) ***
// Esta rota deve vir ANTES de 'app.use(express.json())'
// ==========================================================
app.post('/webhook-mercadopago', express.raw({ type: 'application/json' }), (req, res) => {
    console.log("Webhook do Mercado Pago recebido!");

    // --- 1. Parsear o body ANTES de tudo ---
    let reqBody;
    try {
        reqBody = JSON.parse(req.body.toString());
    } catch (e) {
        console.error("Webhook ERRO: Falha ao parsear JSON do body.");
        return res.sendStatus(400); // Bad Request
    }

    // --- 2. Validar a assinatura ---
    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id']; // <-- PRECISAMOS DESTE

    if (!signature || !requestId) { // <-- VALIDAMOS OS DOIS
        console.warn("Webhook REJEITADO: Cabeçalhos 'x-signature' ou 'x-request-id' ausentes.");
        return res.sendStatus(400); // Bad Request
    }

    if (MERCADOPAGO_WEBHOOK_SECRET) {
        try {
            // Se não tiver 'data.id', é um teste ou notificação diferente.
            if (!reqBody.data || !reqBody.data.id) {
                console.log("Webhook recebido sem 'data.id' (provavelmente um teste). Respondendo 200 OK.");
                return res.sendStatus(200); // Responde OK para o MP parar de enviar.
            }
            
            const dataId = String(reqBody.data.id); // ID do recurso (pagamento)
            
            const parts = signature.split(',').reduce((acc, part) => {
                const [key, value] = part.split('=');
                acc[key.trim()] = value.trim();
                return acc;
            }, {});

            const ts = parts.ts;
            const hash = parts.v1;

            if (!ts || !hash) {
                 console.warn("Webhook REJEITADO: Formato de assinatura inválido.");
                 return res.sendStatus(400);
            }
            
            // --- ESTA É A LINHA CRÍTICA QUE FOI CORRIGIDA (DE NOVO) ---
            // O template correto USA o request-id do header
            const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
            // --- FIM DA CORREÇÃO ---
            
            const hmac = crypto.createHmac('sha256', MERCADOPAGO_WEBHOOK_SECRET);
            hmac.update(template);
            const calculatedHash = hmac.digest('hex');

            if (calculatedHash !== hash) {
                console.error("Webhook REJEITADO: Assinatura inválida. (Calculado: %s, Recebido: %s)", calculatedHash, hash);
                return res.sendStatus(403); // Forbidden
            }
            console.log("Assinatura do Webhook validada com sucesso.");

        } catch (err) {
            console.error("Webhook ERRO: Falha ao calcular ou validar assinatura:", err.message);
            return res.sendStatus(400); // Bad Request por erro no processamento
        }
    } else {
        console.warn("AVISO: Processando Webhook SEM VALIDAÇÃO (MERCADOPAGO_WEBHOOK_SECRET não definida)");
    }

    // --- 3. Lógica do Jogo (código antigo, agora usando 'reqBody') ---
    if (reqBody.type === 'payment') {
        const paymentId = reqBody.data.id;
        console.log(`Webhook: ID de Pagamento (data.id) recebido: ${paymentId}`);

        const payment = new Payment(mpClient);
        payment.get({ id: paymentId })
            .then(async (pagamento) => {
                const status = pagamento.status;
                console.log(`Webhook: Status do Pagamento ${paymentId} é: ${status}`);

                if (status === 'approved') {
                    console.log(`Buscando payment_id ${paymentId} no banco de dados...`);
                    // Agora buscamos o tipo de compra também
                    const query = "SELECT * FROM pagamentos_pendentes WHERE payment_id = $1";
                    const pendingPaymentResult = await db.query(query, [paymentId]);

                    if (pendingPaymentResult.rows.length > 0) {
                        const pendingPayment = pendingPaymentResult.rows[0];
                        const dadosCompra = JSON.parse(pendingPayment.dados_compra_json);
                        
                        // ======================================================
                        // ===== INÍCIO DA BIFURCAÇÃO (RIFA vs BINGO) =====
                        // ======================================================

                        if (pendingPayment.tipo_compra === 'rifa') {
                            
                            // LÓGICA DA RIFA
                            console.log(`Webhook: Processando pagamento de RIFA ${paymentId}...`);
                            try {
                                const { rifaId, rifaVendaId, quantidade } = dadosCompra;

                                // Chama a função para gerar os números
                                const numerosGerados = await gerarNumerosRifa(rifaId, rifaVendaId, quantidade);
                                
                                // Atualiza a venda da rifa para 'Pago'
                                await db.query("UPDATE rifa_vendas SET status_pagamento = 'Pago' WHERE id = $1", [rifaVendaId]);
                                
                                console.log(`Webhook: Rifa ${paymentId} (Venda #${rifaVendaId}) processada com ${numerosGerados.length} números.`);

                                // Remove da tabela de pendentes
                                await db.query("DELETE FROM pagamentos_pendentes WHERE payment_id = $1", [paymentId]);

                            } catch (dbError) {
                                console.error("Webhook ERRO CRÍTICO ao salvar RIFA:", dbError);
                                // (O pagamento fica como 'Pendente' para o admin verificar)
                            }

                        } else {
                            
                            // LÓGICA DO BINGO (código antigo)
                            console.log(`Webhook: Processando pagamento de BINGO ${paymentId}...`);
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

                                await db.query("DELETE FROM pagamentos_pendentes WHERE payment_id = $1", [paymentId]);
                                console.log(`Pagamento ${paymentId} processado e removido do DB pendente.`);

                            } catch (dbError) {
                                console.error("Webhook ERRO CRÍTICO ao salvar BINGO:", dbError);
                            }
                        }
                        // ======================================================
                        // ===== FIM DA BIFURCAÇÃO =====
                        // ======================================================

                    } else {
                        console.warn(`Webhook: Pagamento ${paymentId} aprovado, mas NÃO FOI ENCONTRADO no banco 'pagamentos_pendentes'. (Pode ser um pagamento antigo ou um erro)`);
                    }
                } else if (status === 'cancelled' || status === 'rejected') {
                    // Limpa pagamentos pendentes de ambos os tipos (bingo e rifa)
                    await db.query("DELETE FROM pagamentos_pendentes WHERE payment_id = $1", [paymentId]);
                    // Também marca a rifa_venda como 'Cancelado' se existir
                    await db.query("UPDATE rifa_vendas SET status_pagamento = 'Cancelado' WHERE payment_id = $1 AND status_pagamento = 'Pendente'", [paymentId]);
                    
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
// *** MIDDLEWARES GERAIS ***
// 'express.json()' agora vem DEPOIS do Webhook
// ==========================================================
app.use(express.json()); 


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
// [!!] CORREÇÃO DO NOME DA PASTA: 'public' -> 'publico'
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'publico', 'index.html')); });

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

// [!!] CORREÇÃO DO NOME DA PASTA: 'public' -> 'publico'
app.get('/dashboard', (req, res) => { res.sendFile(path.join(__dirname, 'publico', 'anuncio.html')); });
app.get('/dashboard-real', (req, res) => { res.sendFile(path.join(__dirname, 'publico', 'dashboard.html')); });
app.get('/dashboard.html', (req, res) => { res.redirect('/dashboard'); });

// Rota de "ping" para manter o servidor do Render Hobby acordado
app.get('/ping', (req, res) => {
console.log("Ping recebido, mantendo o servidor acordado.");
res.status(200).send('pong');
});

// ==========================================================
// ===== INÍCIO: NOVA ROTA PÚBLICA (API DA RIFA) =====
// ==========================================================

// Rota para a página 'rifa.html' buscar os dados da rifa ativa
app.get('/api/rifa/publica', async (req, res) => {
    try {
        const query = "SELECT id, nome_premio, descricao, valor_numero FROM rifas WHERE ativo = true ORDER BY id DESC LIMIT 1";
        const result = await db.query(query);

        if (result.rows.length > 0) {
            res.json({ success: true, rifa: result.rows[0] });
        } else {
            res.json({ success: false, message: "Nenhuma rifa ativa encontrada." });
        }
    } catch (error) {
        console.error("Erro ao buscar /api/rifa/publica:", error);
        res.status(500).json({ success: false, message: "Erro ao buscar dados da rifa." });
    }
});

// ==========================================================
// ===== FIM: NOVA ROTA PÚBLICA (API DA RIFA) =====
// ==========================================================


// ==========================================================
// *** ATUALIZAÇÃO (ROTAS CAMBISTA) ***
// [!!] CORREÇÃO DO NOME DA PASTA: 'public' -> 'publico'
// ==========================================================
app.get('/cambista/login', (req, res) => { res.sendFile(path.join(__dirname, 'publico', 'cambista', 'login.html')); });
app.get('/cambista/login.html', (req, res) => { res.sendFile(path.join(__dirname, 'publico', 'cambista', 'login.html')); });
// Serve os arquivos estáticos (login.js, painel.js) da pasta /cambista
app.use('/cambista', express.static(path.join(__dirname, 'publico', 'cambista')));
// ==========================================================

// [!!] CORREÇÃO DO NOME DA PASTA: 'public' -> 'publico'
app.use(express.static(path.join(__dirname, 'publico')));

// ==========================================================
// *** ROTAS DE ADMINISTRAÇÃO (ATUALIZADO - LOGIN HASH) ***
// ==========================================================

// Convertido para 'async'
app.post('/admin/login', async (req, res) => {
const { usuario, senha } = req.body; console.log(`Tentativa de login admin para usuário: ${usuario}`);
if (!usuario || !senha) return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
try {
// *** ATUALIZAÇÃO (SENHA HASH) ***
const stmt = 'SELECT * FROM usuarios_admin WHERE usuario = $1';
const resDB = await db.query(stmt, [usuario]);
const adminUser = resDB.rows[0];

// Compara a senha digitada com o hash salvo no banco
if (adminUser && (await bcrypt.compare(senha, adminUser.senha))) {
req.session.isAdmin = true; req.session.usuario = adminUser.usuario; console.log(`Login admin bem-sucedido para: ${adminUser.usuario}`);
req.session.save(err => { if (err) { console.error("Erro ao salvar sessão:", err); return res.status(500).json({ success: false, message: 'Erro interno ao iniciar sessão.' }); } return res.json({ success: true }); });
} else {
console.log(`Falha no login admin para: ${usuario}`); return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
}
// *** FIM DA ATUALIZAÇÃO ***

} catch (error) { console.error("Erro durante o login admin:", error); return res.status(500).json({ success: false, message: 'Erro interno do servidor.' }); }
});

function checkAdmin(req, res, next) {
if (req.session && req.session.isAdmin) { return next(); }
else { console.log("Acesso negado à área admin. Redirecionando para login."); if (req.headers['x-requested-with'] === 'XMLHttpRequest' || (req.headers.accept && req.headers.accept.includes('json'))) { return res.status(403).json({ success: false, message: 'Acesso negado. Faça login novamente.' }); } return res.redirect('/admin/login.html'); }
}
// [!!] CORREÇÃO DO NOME DA PASTA: 'public' -> 'publico'
app.get('/admin/painel.html', checkAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'publico', 'admin', 'painel.html')); });
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

const cartelasGeradas = [];
for (let i = 0; i < quantidade; i++) { cartelasGeradas.push(gerarDadosCartela(sorteioAlvo)); }
const cartelasJSON = JSON.stringify(cartelasGeradas); 

const manualPlayerId = `manual_${gerarIdUnico()}`; 
jogadores[manualPlayerId] = { nome: nome, telefone: telefone || null, isBot: false, isManual: true, cartelas: cartelasGeradas };

const stmtVenda = `
           INSERT INTO vendas 
           (sorteio_id, nome_jogador, telefone, quantidade_cartelas, valor_total, tipo_venda, cartelas_json) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`;
// O payment_id e cambista_id de uma venda manual são null
await db.query(stmtVenda, [sorteioAlvo, nome, telefone || null, quantidade, valorTotal, 'Manual', cartelasJSON]);

console.log(`Geradas e REGISTRADAS ${cartelasGeradas.length} cartelas para '${nome}'. Venda registrada.`); io.emit('contagemJogadores', getContagemJogadores());
return res.json(cartelasGeradas); // Retorna as cartelas para o admin imprimir
} catch (error) { console.error("Erro ao gerar/registrar cartelas manuais:", error); return res.status(500).json({ success: false, message: 'Erro interno ao gerar cartelas.' }); }
});

// [!!] CORREÇÃO DO NOME DA PASTA: 'public' -> 'publico'
app.get('/admin/relatorios.html', checkAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'publico', 'admin', 'relatorios.html')); });

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

// [!!] CORREÇÃO DO NOME DA PASTA: 'public' -> 'publico'
app.get('/admin/vencedores.html', checkAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'publico', 'admin', 'vencedores.html')); });

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


// *** ATUALIZAÇÃO (CAMBISTAS) ***
// *** ATUALIZAÇÃO (ROTAS CAMBISTA) ***
// [!!] CORREÇÃO DO NOME DA PASTA: 'public' -> 'publico'
app.get('/admin/cambistas.html', checkAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'publico', 'admin', 'cambistas.html')); });

// Novas rotas de API para o Admin gerenciar cambistas
app.get('/admin/api/cambistas', checkAdmin, async (req, res) => {
try {
const result = await db.query('SELECT id, usuario, saldo_creditos, ativo FROM cambistas ORDER BY usuario');
res.json({ success: true, cambistas: result.rows });
} catch (err) {
console.error("Erro ao buscar cambistas:", err);
res.status(500).json({ success: false, message: "Erro ao buscar cambistas." });
}
});

app.post('/admin/api/cambistas/criar', checkAdmin, async (req, res) => {
const { usuario, senha } = req.body;
if (!usuario || !senha) {
return res.status(400).json({ success: false, message: "Usuário e Senha são obrigatórios." });
}

try {
const saltRounds = 10;
const senhaHash = await bcrypt.hash(senha, saltRounds);

const query = "INSERT INTO cambistas (usuario, senha) VALUES ($1, $2) RETURNING id";
const result = await db.query(query, [usuario, senhaHash]);

console.log(`Admin ${req.session.usuario} criou o cambista ${usuario} (ID: ${result.rows[0].id})`);
res.status(201).json({ success: true, message: "Cambista criado com sucesso!", id: result.rows[0].id });

} catch (err) {
if (err.code === '23505') { // Erro de 'unique violation'
console.error("Erro ao criar cambista: Usuário já existe.");
res.status(409).json({ success: false, message: "Este nome de usuário já está em uso." });
} else {
console.error("Erro ao criar cambista:", err);
res.status(500).json({ success: false, message: "Erro interno ao criar cambista." });
}
}
});

app.post('/admin/api/cambistas/adicionar-creditos', checkAdmin, async (req, res) => {
const { cambistaId, valor } = req.body;
const valorNum = parseFloat(valor);
const adminUsuario = req.session.usuario; // Pega o admin logado

if (!cambistaId || !valorNum || valorNum <= 0) {
return res.status(400).json({ success: false, message: "ID do cambista e valor válido são obrigatórios." });
}

const client = await pool.connect();
try {
await client.query('BEGIN');

// 1. Adiciona o saldo na tabela 'cambistas' e retorna o novo saldo
const saldoQuery = `
           UPDATE cambistas 
           SET saldo_creditos = saldo_creditos + $1 
           WHERE id = $2 
           RETURNING saldo_creditos, usuario
       `;
const saldoResult = await client.query(saldoQuery, [valorNum, cambistaId]);

if (saldoResult.rows.length === 0) {
throw new Error("Cambista não encontrado.");
}

const novoSaldo = saldoResult.rows[0].saldo_creditos;
const cambistaUsuario = saldoResult.rows[0].usuario;

// 2. Registra a transação no histórico
const logQuery = `
           INSERT INTO transacoes_creditos (cambista_id, admin_usuario, valor_alteracao, tipo)
           VALUES ($1, $2, $3, 'recarga')
       `;
await client.query(logQuery, [cambistaId, adminUsuario, valorNum]);

await client.query('COMMIT');

console.log(`Admin ${adminUsuario} adicionou ${valorNum} créditos para ${cambistaUsuario}. Novo saldo: ${novoSaldo}`);
res.json({ success: true, message: "Créditos adicionados!", novoSaldo: novoSaldo });

} catch (err) {
await client.query('ROLLBACK');
console.error("Erro ao adicionar créditos:", err);
res.status(500).json({ success: false, message: err.message || "Erro interno ao adicionar créditos." });
} finally {
client.release();
}
});
// *** FIM DA ATUALIZAÇÃO (CAMBISTAS) ***

// ==========================================================
// *** ROTA ADICIONADA: ATIVAR/DESATIVAR CAMBISTA ***
// ==========================================================
app.post('/admin/api/cambistas/toggle-status', checkAdmin, async (req, res) => {
    const { cambistaId } = req.body;
    if (!cambistaId) {
        return res.status(400).json({ success: false, message: "ID do cambista é obrigatório." });
    }

    try {
        // O comando SQL inverte o valor booleano 'ativo' (de true para false, ou false para true)
        const query = `
            UPDATE cambistas 
            SET ativo = NOT ativo 
            WHERE id = $1 
            RETURNING id, ativo, usuario
        `;
        const result = await db.query(query, [cambistaId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Cambista não encontrado." });
        }

        const novoStatus = result.rows[0].ativo;
        const usuario = result.rows[0].usuario;
        console.log(`Admin ${req.session.usuario} ${novoStatus ? 'ATIVOU' : 'DESATIVOU'} o cambista ${usuario} (ID: ${cambistaId})`);

        res.json({ success: true, novoStatus: novoStatus });

    } catch (err) {
        console.error("Erro ao alterar status do cambista:", err);
        res.status(500).json({ success: false, message: "Erro interno do servidor." });
    }
});
// ==========================================================
// *** FIM DA NOVA ROTA ***
// ==========================================================


// ==========================================================
// ===== INÍCIO: NOVAS ROTAS (API ADMIN RIFA) =====
// ==========================================================

// [!!] CORREÇÃO DO NOME DA PASTA: 'public' -> 'publico'
app.get('/admin/rifas.html', checkAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'publico', 'admin', 'rifas.html')); });

// Rota para o admin/rifas.js buscar os dados da rifa ativa e as vendas
app.get('/admin/api/rifa/ativa', checkAdmin, async (req, res) => {
    try {
        // 1. Encontra a rifa ativa
        const rifaQuery = "SELECT * FROM rifas WHERE ativo = true ORDER BY id DESC LIMIT 1";
        const rifaResult = await db.query(rifaQuery);

        if (rifaResult.rows.length === 0) {
            return res.json({ success: true, rifa: null, vendas: [] }); // Nenhuma rifa ativa
        }
        const rifa = rifaResult.rows[0];

        // 2. Busca os dados agregados (total vendido)
        const statsQuery = `
            SELECT 
                COUNT(n.id) as numeros_vendidos,
                SUM(v.valor_total) as total_arrecadado
            FROM rifa_vendas v
            JOIN rifa_numeros n ON n.rifa_venda_id = v.id
            WHERE v.rifa_id = $1 AND v.status_pagamento = 'Pago'
        `;
        const statsResult = await db.query(statsQuery, [rifa.id]);
        
        rifa.numeros_vendidos = statsResult.rows[0].numeros_vendidos || 0;
        rifa.total_arrecadado = statsResult.rows[0].total_arrecadado || 0;

        // 3. Busca a lista de vendas e números (agrupados)
        const vendasQuery = `
            SELECT 
                v.id, v.nome_jogador, v.telefone, v.status_pagamento,
                to_char(v.timestamp AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') as data_formatada,
                ARRAY_AGG(n.numero_rifa ORDER BY n.numero_rifa) as numeros
            FROM rifa_vendas v
            LEFT JOIN rifa_numeros n ON n.rifa_venda_id = v.id
            WHERE v.rifa_id = $1 AND v.status_pagamento IN ('Pago', 'Pendente')
            GROUP BY v.id
            ORDER BY v.timestamp DESC
        `;
        const vendasResult = await db.query(vendasQuery, [rifa.id]);

        res.json({ success: true, rifa: rifa, vendas: vendasResult.rows });

    } catch (error) {
        console.error("Erro ao buscar /admin/api/rifa/ativa:", error);
        res.status(500).json({ success: false, message: "Erro ao buscar dados da rifa." });
    }
});

// Rota para o admin criar uma nova rifa
app.post('/admin/api/rifa/criar', checkAdmin, async (req, res) => {
    const { nome, descricao, valor } = req.body;
    if (!nome || !valor || valor <= 0) {
        return res.status(400).json({ success: false, message: "Nome e Valor são obrigatórios." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Desativa todas as rifas antigas
        await client.query("UPDATE rifas SET ativo = false WHERE ativo = true");
        
        // 2. Cria a nova rifa
        const query = `
            INSERT INTO rifas (nome_premio, descricao, valor_numero, ativo)
            VALUES ($1, $2, $3, true)
            RETURNING id
        `;
        const result = await client.query(query, [nome, descricao || null, valor]);
        
        await client.query('COMMIT');
        
        console.log(`Admin ${req.session.usuario} criou a Rifa #${result.rows[0].id} (${nome})`);
        res.status(201).json({ success: true, message: "Rifa criada com sucesso!", id: result.rows[0].id });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Erro ao criar rifa:", err);
        res.status(500).json({ success: false, message: "Erro interno ao criar rifa." });
    } finally {
        client.release();
    }
});

// Rota para o admin encerrar (desativar) uma rifa
app.post('/admin/api/rifa/encerrar', checkAdmin, async (req, res) => {
    const { rifaId } = req.body;
    if (!rifaId) {
        return res.status(400).json({ success: false, message: "ID da Rifa é obrigatório." });
    }
    
    try {
        const query = "UPDATE rifas SET ativo = false WHERE id = $1";
        const result = await db.query(query, [rifaId]);
        
        if (result.rowCount > 0) {
            console.log(`Admin ${req.session.usuario} encerrou a Rifa #${rifaId}`);
            res.json({ success: true, message: "Rifa encerrada com sucesso." });
        } else {
            res.status(404).json({ success: false, message: "Rifa não encontrada." });
        }
    } catch (err) {
        console.error("Erro ao encerrar rifa:", err);
        res.status(500).json({ success: false, message: "Erro interno ao encerrar rifa." });
    }
});

// ==========================================================
// ===== FIM: NOVAS ROTAS (API ADMIN RIFA) =====
// ==========================================================

// [!!] CORREÇÃO DO NOME DA PASTA: 'public' -> 'publico'
app.use('/admin', checkAdmin, express.static(path.join(__dirname, 'publico', 'admin')));
// ==========================================================


// ==========================================================
// *** ATUALIZAÇÃO (ROTAS CAMBISTA) ***
// Define as rotas para o painel do cambista
// ==========================================================

// Middleware para checar se o cambista está logado na sessão
function checkCambista(req, res, next) {
    if (req.session && req.session.isCambista) {
        return next();
    } else {
        console.log("Acesso negado à área do cambista.");
        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(403).json({ success: false, message: 'Acesso negado. Faça login novamente.' });
        }
        return res.redirect('/cambista/login.html');
    }
}

// Rota de Login do Cambista
app.post('/cambista/login', async (req, res) => {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) {
        return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
    }
    
    try {
        const stmt = 'SELECT * FROM cambistas WHERE usuario = $1 AND ativo = true';
        const resDB = await db.query(stmt, [usuario]);
        const cambistaUser = resDB.rows[0];

        if (cambistaUser && (await bcrypt.compare(senha, cambistaUser.senha))) {
            // Logado! Salva na sessão
            req.session.isCambista = true;
            req.session.cambistaId = cambistaUser.id;
            req.session.cambistaUsuario = cambistaUser.usuario;
            console.log(`Login de cambista bem-sucedido para: ${cambistaUser.usuario}`);
            req.session.save(err => {
                if (err) {
                    console.error("Erro ao salvar sessão do cambista:", err);
                    return res.status(500).json({ success: false, message: 'Erro interno ao iniciar sessão.' });
                }
                return res.json({ success: true });
            });
        } else {
            console.log(`Falha no login de cambista para: ${usuario}`);
            return res.status(401).json({ success: false, message: 'Usuário, senha ou conta inativa.' });
        }
    } catch (error) {
        console.error("Erro durante o login do cambista:", error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

// Rota de Logout do Cambista
app.get('/cambista/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Erro ao fazer logout do cambista:", err);
            return res.status(500).send("Erro ao sair.");
        }
        console.log("Usuário cambista deslogado.");
        res.clearCookie('connect.sid');
        res.redirect('/cambista/login.html');
    });
});

// [!!] CORREÇÃO DO NOME DA PASTA: 'public' -> 'publico'
app.get('/cambista/painel.html', checkCambista, (req, res) => {
    res.sendFile(path.join(__dirname, 'publico', 'cambista', 'painel.html'));
});

// Rota para o Cambista ver seu status (protegida)
app.get('/cambista/meu-status', checkCambista, async (req, res) => {
    try {
        const query = "SELECT saldo_creditos FROM cambistas WHERE id = $1";
        const result = await db.query(query, [req.session.cambistaId]);
        
        res.json({
            success: true,
            usuario: req.session.cambistaUsuario,
            saldo: result.rows[0].saldo_creditos,
            precoCartela: PRECO_CARTELA // Envia o preço atual da cartela
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Erro ao buscar status." });
    }
});

// Rota para o Cambista gerar cartelas (protegida)
app.post('/cambista/gerar-cartelas', checkCambista, async (req, res) => {
    const { quantidade, nome, telefone } = req.body;
    const cambistaId = req.session.cambistaId;
    const cambistaUsuario = req.session.cambistaUsuario;

    if (!nome || !quantidade || quantidade < 1) {
        return res.status(400).json({ success: false, message: 'Nome do jogador e quantidade são obrigatórios.' });
    }

    const precoUnitario = parseFloat(PRECO_CARTELA);
    const custoTotal = quantidade * precoUnitario;
    let sorteioAlvo = (estadoJogo === "ESPERANDO") ? numeroDoSorteio : numeroDoSorteio + 1;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Pega o saldo do cambista e TRAVA A LINHA (FOR UPDATE)
        const saldoQuery = "SELECT saldo_creditos FROM cambistas WHERE id = $1 FOR UPDATE";
        const saldoResult = await client.query(saldoQuery, [cambistaId]);
        
        if (saldoResult.rows.length === 0) throw new Error("Cambista não encontrado.");
        
        const saldoAtual = parseFloat(saldoResult.rows[0].saldo_creditos);
        
        // 2. Verifica se tem saldo
        if (saldoAtual < custoTotal) {
            throw new Error(`Saldo insuficiente. Você tem ${saldoAtual.toFixed(2)} e a venda custa ${custoTotal.toFixed(2)}.`);
        }

        // 3. Deduz o saldo
        const novoSaldo = saldoAtual - custoTotal;
        await client.query("UPDATE cambistas SET saldo_creditos = $1 WHERE id = $2", [novoSaldo, cambistaId]);

        // 4. Gera as cartelas
        const cartelasGeradas = [];
        for (let i = 0; i < quantidade; i++) {
            cartelasGeradas.push(gerarDadosCartela(sorteioAlvo));
        }
        const cartelasJSON = JSON.stringify(cartelasGeradas);

        // 5. Registra a Venda
        const stmtVenda = `
            INSERT INTO vendas 
            (sorteio_id, nome_jogador, telefone, quantidade_cartelas, valor_total, tipo_venda, cartelas_json, cambista_id) 
            VALUES ($1, $2, $3, $4, $5, 'Cambista', $6, $7)
            RETURNING id
        `;
        const vendaResult = await client.query(stmtVenda, [sorteioAlvo, nome, telefone || null, quantidade, custoTotal, cartelasJSON, cambistaId]);
        const vendaId = vendaResult.rows[0].id;

        // 6. Registra a Transação de Crédito
        const logQuery = `
            INSERT INTO transacoes_creditos (cambista_id, admin_usuario, valor_alteracao, tipo, venda_id)
            VALUES ($1, $2, $3, 'venda', $4)
        `;
        await client.query(logQuery, [cambistaId, cambistaUsuario, -custoTotal, vendaId]);

        await client.query('COMMIT');

        // 7. Adiciona na memória do jogo (igual ao admin manual)
        const manualPlayerId = `manual_${gerarIdUnico()}`; 
        jogadores[manualPlayerId] = { nome: nome, telefone: telefone || null, isBot: false, isManual: true, cartelas: cartelasGeradas };
        io.emit('contagemJogadores', getContagemJogadores());
        
        console.log(`Cambista ${cambistaUsuario} vendeu ${quantidade} cartelas para ${nome}. Saldo restante: ${novoSaldo}`);
        res.json({ success: true, message: "Venda registrada!", cartelas: cartelasGeradas, novoSaldo: novoSaldo });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Erro na venda do cambista ${cambistaUsuario}:`, err);
        res.status(500).json({ success: false, message: err.message || "Erro interno ao processar venda." });
    } finally {
        client.release();
    }
});
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

// ===============================================
// ===== INÍCIO: NOVA FUNÇÃO (GERAR NÚMEROS RIFA) =====
// ===============================================

/**
 * Gera números de rifa aleatórios de 4 dígitos (0000-9999) para uma venda.
 * Tenta até 10 vezes por número para evitar colisões.
 */
async function gerarNumerosRifa(rifaId, rifaVendaId, quantidade) {
    const numerosGerados = [];
    const queryInsert = "INSERT INTO rifa_numeros (rifa_id, rifa_venda_id, numero_rifa) VALUES ($1, $2, $3)";
    
    for (let i = 0; i < quantidade; i++) {
        let numeroSorteado = null;
        let tentativas = 0;
        let numeroJaExiste = true;

        // Tenta gerar um número único
        while (numeroJaExiste && tentativas < 10) {
            // Gera um número de 0 a 9999 e formata para 4 dígitos (ex: "0005")
            numeroSorteado = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            
            try {
                // Tenta inserir. Se a restrição 'UNIQUE' falhar, ele dará erro
                await db.query(queryInsert, [rifaId, rifaVendaId, numeroSorteado]);
                numeroJaExiste = false; // Sucesso!
                numerosGerados.push(numeroSorteado);
            } catch (err) {
                if (err.code === '23505') { // Código de 'unique_violation' do PostgreSQL
                    console.warn(`Colisão de número da rifa (${numeroSorteado}). Tentando de novo...`);
                    tentativas++;
                    numeroJaExiste = true;
                } else {
                    // Outro erro (ex: rifa esgotada, erro de DB)
                    throw err; 
                }
            }
        }
        
        if (numeroJaExiste) {
             // Se falhou 10x em achar um número (rifa muito cheia)
             console.error(`Falha ao gerar número único para rifa ${rifaId} após 10 tentativas. Abortando esta venda.`);
             // Remove os números já inseridos desta venda para reverter
             await db.query("DELETE FROM rifa_numeros WHERE rifa_venda_id = $1", [rifaVendaId]);
             throw new Error("Não foi possível gerar números únicos. A rifa pode estar cheia.");
        }
    }
    
    return numerosGerados;
}

// ===============================================
// ===== FIM: NOVA FUNÇÃO (GERAR NÚMEROS RIFA) =====
// ===============================================


// --- Lógica Principal do Jogo (Convertida para PG) ---
let estadoJogo = "ESPERANDO";
let tempoRestante = 20; // [!!] CORREÇÃO: Esta linha será sobreposta pelo carregarConfiguracoes
let intervaloSorteio = null; let numerosDisponiveis = []; let numerosSorteados = []; let jogadores = {};

// [!!] CORREÇÃO DO BUG DO TIMER: O 'setInterval' foi movido para o final do arquivo,
// para que ele só comece DEPOIS que carregarConfiguracoes() definir o tempo correto.

function iniciarNovaRodada() {
console.log("DEBUG: Dentro de iniciarNovaRodada().");

// [!!] CORREÇÃO DO BUG DO TIMER: O tempo é resetado aqui, usando o valor carregado do DB
tempoRestante = DURACAO_ESPERA_ATUAL; 
console.log(`Servidor: Iniciando Sorteio #${numeroDoSorteio}... Próximo prêmio: LINHA. (Tempo: ${tempoRestante}s)`);

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

// ATUALIZAÇÃO (CORREÇÃO DO BUG DO DELAY)
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

// 3. Preparar os dados para o DB e para o fim da rodada
const vencedorInfoDB = { 
sorteioId: numeroDoSorteio, 
premio: "Cartela Cheia", 
nome: jogador.nome, 
telefone: jogador.telefone, 
cartelaId: cartela.c_id 
};
const dadosVencedor = { 
nome: nomeVencedor, 
telefone: jogador.telefone, 
cartelaGanhadora: cartela, 
indiceCartela: i, 
premioValor: PREMIO_CHEIA 
}; 
const socketVencedor = (jogador.isBot || jogador.isManual) ? null : socketId;

// 4. Esperar 5 segundos ANTES de salvar e anunciar
const TEMPO_DELAY_ANUNCIO = 5000; // 5 segundos
console.log(`Servidor: Esperando ${TEMPO_DELAY_ANUNCIO}ms para anunciar o vencedor...`);

setTimeout(async () => { // <-- Função dentro do timeout agora é async
console.log("Servidor: Anunciando vencedor e terminando a rodada.");

// 5. SALVA NO DB (e emite 'atualizarVencedores' para o dashboard)
await salvarVencedorNoDB(vencedorInfoDB); 

// 6. TERMINA A RODADA (e emite 'alguemGanhouCartelaCheia' para o jogo.html)
terminarRodada(dadosVencedor, socketVencedor); 
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
// tempoRestante já é resetado pela iniciarNovaRodada(), mas podemos garantir:
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
// Salva o pagamento pendente no DB, com o tipo 'bingo'
const dadosCompraJSON = JSON.stringify(dadosCompra);
const query = `
               INSERT INTO pagamentos_pendentes (payment_id, socket_id, dados_compra_json, tipo_compra)
               VALUES ($1, $2, $3, 'bingo')
               ON CONFLICT (payment_id) DO UPDATE SET
                   socket_id = EXCLUDED.socket_id,
                   dados_compra_json = EXCLUDED.dados_compra_json,
                   tipo_compra = EXCLUDED.tipo_compra,
                   timestamp = CURRENT_TIMESTAMP
           `;
await db.query(query, [paymentId, socket.id, dadosCompraJSON]);
console.log(`Pagamento PIX (Bingo) ${paymentId} salvo no DB para socket ${socket.id}.`);
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

// ==========================================================
// ===== INÍCIO: NOVOS OUVINTES (RIFA) =====
// ==========================================================

// ROTA PARA CRIAR PAGAMENTO DA RIFA
socket.on('criarPagamentoRifa', async (dadosCompra, callback) => {
    try {
        // [!!] CORREÇÃO: Pega o rifaId enviado pelo cliente
        const { nome, telefone, quantidade, rifaId } = dadosCompra; 

        // 1. Buscar a rifa ativa e seu preço
        const rifaRes = await db.query("SELECT valor_numero FROM rifas WHERE id = $1 AND ativo = true", [rifaId]);
        
        if (rifaRes.rows.length === 0) {
            return callback({ success: false, message: 'Nenhuma rifa ativa encontrada no momento.' });
        }
        const precoUnitario = parseFloat(rifaRes.rows[0].valor_numero);
        const valorTotal = quantidade * precoUnitario;

        console.log(`Servidor: Usuário ${nome} quer comprar ${quantidade} números da rifa #${rifaId}. Total: R$${valorTotal.toFixed(2)}.`);
        
        // Verifica se a BASE_URL foi configurada
        if (!process.env.BASE_URL) {
            console.error("ERRO GRAVE: BASE_URL não está configurada! O Webhook do MercadoPago falhará.");
            return callback({ success: false, message: 'Erro no servidor: URL de pagamento não configurada.' });
        }

        // 2. Criar a Venda Pendente na tabela 'rifa_vendas'
        const vendaQuery = `
            INSERT INTO rifa_vendas 
            (rifa_id, nome_jogador, telefone, quantidade_numeros, valor_total, status_pagamento)
            VALUES ($1, $2, $3, $4, $5, 'Pendente') 
            RETURNING id`;
        const vendaResult = await db.query(vendaQuery, [rifaId, nome, telefone, quantidade, valorTotal]);
        const rifaVendaId = vendaResult.rows[0].id;

        // 3. Criar o pagamento no MercadoPago
        const payment = new Payment(mpClient);
        const body = {
            transaction_amount: valorTotal,
            description: `Rifa #${rifaId} - ${quantidade} número(s) - Bingo do Pix`,
            payment_method_id: 'pix',
            notification_url: `${process.env.BASE_URL}/webhook-mercadopago`,
            payer: {
                email: `jogador_rifa_${telefone}@bingo.com`, 
                first_name: nome,
                last_name: "JogadorRifa",
            },
            date_of_expiration: new Date(Date.now() + (10 * 60 * 1000)).toISOString().replace("Z", "-03:00") // 10 min
        };
        const response = await payment.create({ body });
        const paymentId = response.id.toString();

        // 4. Atualizar a venda com o Payment ID
        await db.query("UPDATE rifa_vendas SET payment_id = $1 WHERE id = $2", [paymentId, rifaVendaId]);

        // 5. Salvar no 'pagamentos_pendentes' com o novo tipo 'rifa'
        // Guardamos o rifaVendaId para o webhook saber qual venda atualizar
        const dadosParaWebhook = JSON.stringify({ rifaId: rifaId, rifaVendaId: rifaVendaId, quantidade: quantidade });
        const query = `
            INSERT INTO pagamentos_pendentes (payment_id, socket_id, dados_compra_json, tipo_compra)
            VALUES ($1, $2, $3, 'rifa')
            ON CONFLICT (payment_id) DO UPDATE SET
                socket_id = EXCLUDED.socket_id,
                dados_compra_json = EXCLUDED.dados_compra_json,
                tipo_compra = EXCLUDED.tipo_compra,
                timestamp = CURRENT_TIMESTAMP`;
        await db.query(query, [paymentId, socket.id, dadosParaWebhook]);
        
        console.log(`Pagamento PIX (Rifa) ${paymentId} salvo no DB.`);

        // 6. Retornar dados do Pix para o cliente
        callback({ 
            success: true, 
            qrCodeBase64: response.point_of_interaction.transaction_data.qr_code_base64, 
            qrCodeCopiaCola: response.point_of_interaction.transaction_data.qr_code, 
            paymentId: paymentId,
            rifaVendaId: rifaVendaId // Envia o ID da venda para o polling
        });

    } catch(error) {
        console.error("Erro em criarPagamentoRifa:", error.cause || error.message);
        callback({ success: false, message: 'Erro ao gerar QR Code da Rifa.' });
    }
});

// ROTA PARA O POLLING DA RIFA (copiada e adaptada de checarMeuPagamento)
socket.on('checarMeuPagamentoRifa', async (data) => {
    try {
        const { paymentId, rifaVendaId } = data;
        if (!paymentId || !rifaVendaId) return;

        // Consulta a tabela de VENDAS DA RIFA
        const query = "SELECT id FROM rifa_vendas WHERE payment_id = $1 AND id = $2 AND status_pagamento = 'Pago'";
        const res = await db.query(query, [paymentId, rifaVendaId]);

        if (res.rows.length > 0) {
            console.log(`Polling: Pagamento Rifa ${paymentId} encontrado. Avisando cliente.`);
            // Avisa o cliente que o pagamento foi aprovado
            socket.emit('pagamentoRifaAprovado', {
                rifaVendaId: res.rows[0].id
            });
        }
    } catch (err) {
        console.error("Erro em checarMeuPagamentoRifa:", err);
    }
});

// ROTA PARA BUSCAR NÚMEROS DA RIFA (para a página de comprovante)
socket.on('buscarNumerosRifa', async (data, callback) => {
    try {
        const { rifaVendaId } = data;
        if (!rifaVendaId) {
            return callback({ success: false, message: 'ID da Venda não fornecido.' });
        }
        
        // Busca os dados da venda E os números gerados
        const vendaQuery = `
            SELECT 
                v.nome_jogador, v.telefone, v.quantidade_numeros, v.valor_total,
                to_char(v.timestamp AT TIME ZONE 'UTC', 'DD/MM/YYYY às HH24:MI') as data_formatada,
                r.nome_premio,
                ARRAY_AGG(n.numero_rifa ORDER BY n.numero_rifa) as numeros
            FROM rifa_vendas v
            JOIN rifas r ON v.rifa_id = r.id
            LEFT JOIN rifa_numeros n ON n.rifa_venda_id = v.id
            WHERE v.id = $1 AND v.status_pagamento = 'Pago'
            GROUP BY v.id, r.id
        `;
        const res = await db.query(vendaQuery, [rifaVendaId]);

        if (res.rows.length > 0) {
            callback({ success: true, comprovante: res.rows[0] });
        } else {
            callback({ success: false, message: 'Comprovante não encontrado ou pagamento ainda pendente.' });
        }
    } catch (err) {
        console.error("Erro ao buscar números da rifa:", err);
        callback({ success: false, message: 'Erro interno do servidor.' });
    }
});

// ==========================================================
// ===== FIM: NOVOS OUVINTES (RIFA) =====
// ==========================================================


// ==========================================================
// ===== "BUSCAR CARTELAS POR TELEFONE" (COM A CORREÇÃO) =====
// ==========================================================
socket.on('buscarCartelasPorTelefone', async (data, callback) => {
    const { telefone } = data;
    if (!telefone) {
        if (typeof callback === 'function') callback({ success: false, message: 'Telefone não fornecido.' });
        return;
    }

    console.log(`Servidor: Buscando cartelas para o telefone ${telefone}`);

    try {
        // Determina o ID do próximo sorteio
        const proximoSorteioId = (estadoJogo === "ESPERANDO") ? numeroDoSorteio : numeroDoSorteio + 1;

        const query = `
            SELECT 
                id, 
                sorteio_id, 
                quantidade_cartelas, 
                to_char(timestamp AT TIME ZONE 'UTC', 'DD/MM/YYYY às HH24:MI') as data_formatada,
                nome_jogador -- <--- [!!] CORREÇÃO APLICADA AQUI
            FROM vendas 
            WHERE telefone = $1 
            AND sorteio_id >= $2
            ORDER BY sorteio_id DESC, timestamp DESC
            LIMIT 10;
        `;
        
        const res = await db.query(query, [telefone, numeroDoSorteio]);

        if (res.rows.length > 0) {
            // Encontrou! Retorna a lista de vendas.
            if (typeof callback === 'function') {
                callback({ 
                    success: true, 
                    vendas: res.rows,
                    proximoSorteioId: proximoSorteioId // Envia o ID do próximo sorteio
                });
            }
        } else {
            // Não encontrou.
            console.log(`Servidor: Nenhuma cartela encontrada para ${telefone} (sorteio #${numeroDoSorteio} ou maior).`);
            if (typeof callback === 'function') callback({ success: false, message: 'Nenhuma cartela encontrada para este telefone.' });
        }

    } catch (error) {
        console.error("Erro ao buscar cartelas por telefone:", error);
        if (typeof callback === 'function') callback({ success: false, message: 'Erro interno do servidor.' });
    }
});
// ==========================================================
// ===== FIM DO BLOCO                                =====
// ==========================================================


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

// 3. [!!] CORREÇÃO DO BUG DO TIMER: Define o tempo restante APÓS carregar
tempoRestante = DURACAO_ESPERA_ATUAL;

// 4. Inicia o servidor web
server.listen(PORTA, () => {
console.log(`Servidor "Bingo do Pix" rodando!`);
console.log(`Conectado ao PostgreSQL em: ${process.env.DATABASE_URL ? 'Variável de Ambiente' : 'Configuração Padrão'}`);
console.log(`Acesse em http://localhost:${PORTA}`);
console.log(`Login Admin: http://localhost:${PORTA}/admin/login.html`);
console.log(`Dashboard (com anúncio): http://localhost:${PORTA}/dashboard`);
});

// 5. [!!] CORREÇÃO DO BUG DO TIMER: Inicia o cronômetro global AGORA.
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

})();


// --- FECHAR O BANCO AO SAIR (Atualizado para PG) ---
process.on('exit', () => pool.end());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));
