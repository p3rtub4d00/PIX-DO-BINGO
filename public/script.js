document.addEventListener('DOMContentLoaded', () => {

    const urlParamsGlobal = new URLSearchParams(window.location.search);
    const refCodeGlobal = urlParamsGlobal.get('ref'); 
    if (refCodeGlobal) sessionStorage.setItem('bingo_ref_code', refCodeGlobal);

    let socket;
    try { socket = io(); console.log("Socket conectado."); }
    catch (err) { console.error("Erro Socket:", err); }

    // Variáveis Globais
    let PRECO_CARTELA_ATUAL = 5.00;
    let PRECO_CARTELA_ESPECIAL_ATUAL = 10.00;
    let TIPO_COMPRA_ATUAL = 'regular';
    let METODO_PAGAMENTO_ATUAL = 'pix'; // 'pix' ou 'carteira'
    
    // Estado do Usuário
    let usuarioLogado = null; // { id, nome, telefone, saldo }

    // --- SELETORES GERAIS ---
    const btnLoginModal = document.getElementById('btn-login-modal');
    const btnCadastroModal = document.getElementById('btn-cadastro-modal');
    const guestButtons = document.getElementById('guest-buttons');
    const loggedUserInfo = document.getElementById('logged-user-info');
    const userNameDisplay = document.getElementById('user-name-display');
    const userBalanceDisplay = document.getElementById('user-balance-display');
    const btnLogout = document.getElementById('btn-logout');
    const btnAbrirCarteira = document.getElementById('btn-abrir-carteira');

    // Modais Auth
    const modalLogin = document.getElementById('modal-login');
    const modalCadastro = document.getElementById('modal-cadastro');
    const modalCarteira = document.getElementById('modal-carteira');
    const formLogin = document.getElementById('form-login');
    const formCadastro = document.getElementById('form-cadastro');
    const linkIrCadastro = document.getElementById('link-ir-cadastro');

    // Modal Checkout
    const modalCheckout = document.getElementById('modal-checkout');
    const tabPix = document.querySelector('.tab-btn[data-method="pix"]');
    const tabCarteira = document.getElementById('tab-carteira'); 
    const areaPix = document.getElementById('area-pagamento-pix');
    const areaCarteira = document.getElementById('area-pagamento-carteira');
    const btnPagarSaldo = document.getElementById('btn-pagar-saldo');
    const msgErroSaldo = document.getElementById('msg-erro-saldo');
    const carteiraSaldoModal = document.getElementById('carteira-saldo-modal');
    const modalNome = document.getElementById('modal-nome');
    const modalTelefone = document.getElementById('modal-telefone');
    
    // Carteira Depósito
    const btnGerarDeposito = document.getElementById('btn-gerar-deposito');
    const inputDepositoValor = document.getElementById('deposito-valor');
    const areaDepositoPix = document.getElementById('deposito-pix-area');
    const inputDepositoCopia = document.getElementById('deposito-copia-cola');
    const btnCopiarDeposito = document.getElementById('btn-copiar-deposito');

    // --- FUNÇÕES AUXILIARES ---
    function formatarBRL(val) { return parseFloat(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

    // --- AUTENTICAÇÃO ---
    async function checkLogin() {
        try {
            const res = await fetch('/jogador/dados');
            const data = await res.json();
            if (data.success) {
                usuarioLogado = data;
                atualizarInterfaceLogado();
            } else {
                usuarioLogado = null;
                guestButtons.style.display = 'block';
                loggedUserInfo.style.display = 'none';
            }
        } catch(e) { console.error(e); }
    }

    function atualizarInterfaceLogado() {
        guestButtons.style.display = 'none';
        loggedUserInfo.style.display = 'flex';
        userNameDisplay.textContent = `Olá, ${usuarioLogado.nome.split(' ')[0]}`;
        userBalanceDisplay.textContent = formatarBRL(usuarioLogado.saldo);
        
        // Preenche modal de checkout se aberto
        if(modalNome) modalNome.value = usuarioLogado.nome;
        if(modalTelefone) modalTelefone.value = usuarioLogado.telefone;
        if(carteiraSaldoModal) carteiraSaldoModal.textContent = formatarBRL(usuarioLogado.saldo);
    }

    checkLogin(); // Executa ao carregar

    // Eventos de Auth
    if(btnLoginModal) btnLoginModal.onclick = () => modalLogin.style.display = 'flex';
    if(btnCadastroModal) btnCadastroModal.onclick = () => modalCadastro.style.display = 'flex';
    document.querySelectorAll('.modal-close').forEach(el => el.onclick = function() { this.closest('.modal-overlay').style.display = 'none'; });
    if(linkIrCadastro) linkIrCadastro.onclick = (e) => { e.preventDefault(); modalLogin.style.display='none'; modalCadastro.style.display='flex'; };

    if(formLogin) formLogin.onsubmit = async (e) => {
        e.preventDefault();
        const telefone = document.getElementById('login-telefone').value;
        const senha = document.getElementById('login-senha').value;
        const res = await fetch('/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({telefone, senha}) });
        const data = await res.json();
        if(data.success) {
            modalLogin.style.display = 'none';
            checkLogin();
        } else alert(data.message);
    };

    if(formCadastro) formCadastro.onsubmit = async (e) => {
        e.preventDefault();
        const nome = document.getElementById('cad-nome').value;
        const telefone = document.getElementById('cad-telefone').value;
        const senha = document.getElementById('cad-senha').value;
        const res = await fetch('/auth/cadastro', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome, telefone, senha}) });
        const data = await res.json();
        if(data.success) {
            modalCadastro.style.display = 'none';
            checkLogin();
        } else alert(data.message);
    };

    if(btnLogout) btnLogout.onclick = async () => {
        await fetch('/auth/logout', { method:'POST' });
        window.location.reload();
    };

    // --- CARTEIRA E DEPÓSITO ---
    if(btnAbrirCarteira) btnAbrirCarteira.onclick = async () => {
        if(!usuarioLogado) return;
        document.getElementById('carteira-saldo-valor').textContent = formatarBRL(usuarioLogado.saldo);
        modalCarteira.style.display = 'flex';
        carregarTransacoes();
    };

    async function carregarTransacoes() {
        const div = document.getElementById('historico-transacoes');
        div.innerHTML = 'Carregando...';
        const res = await fetch('/jogador/transacoes');
        const data = await res.json();
        if(data.success && data.transacoes) {
            div.innerHTML = '';
            data.transacoes.forEach(t => {
                const tipoClass = t.tipo === 'deposito' ? 'tipo-deposito' : 'tipo-compra';
                div.innerHTML += `<div class="transacao-item ${tipoClass}">
                    <span>${t.descricao || t.tipo}</span>
                    <span>${formatarBRL(t.valor)}</span>
                </div>`;
            });
        } else div.innerHTML = 'Sem transações.';
    }

    if(btnGerarDeposito) btnGerarDeposito.onclick = () => {
        const valor = inputDepositoValor.value;
        if(valor < 1) return alert("Valor mínimo R$ 1,00");
        
        btnGerarDeposito.disabled = true;
        btnGerarDeposito.textContent = "Gerando...";
        
        socket.emit('criarDeposito', {
            nome: usuarioLogado.nome,
            telefone: usuarioLogado.telefone,
            valor: valor,
            jogadorId: usuarioLogado.id // Importante para identificar no webhook
        }, (data) => {
            btnGerarDeposito.disabled = false;
            btnGerarDeposito.textContent = "Gerar PIX Depósito";
            if(data.success) {
                areaDepositoPix.style.display = 'block';
                inputDepositoCopia.value = data.qrCodeCopiaCola;
            } else alert("Erro ao gerar PIX.");
        });
    };

    if(btnCopiarDeposito) btnCopiarDeposito.onclick = () => {
        inputDepositoCopia.select();
        document.execCommand('copy');
        btnCopiarDeposito.textContent = "Copiado!";
    };

    // --- CHECKOUT (PAGAMENTO) ---
    // Lógica das Abas
    if(tabPix) tabPix.onclick = () => mudarAbaPagamento('pix');
    if(tabCarteira) tabCarteira.onclick = () => mudarAbaPagamento('carteira');

    function mudarAbaPagamento(metodo) {
        METODO_PAGAMENTO_ATUAL = metodo;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        if(metodo === 'pix') {
            tabPix.classList.add('active');
            areaPix.style.display = 'block';
            areaCarteira.style.display = 'none';
        } else {
            // Verifica se está logado
            if(!usuarioLogado) {
                alert("Você precisa entrar na sua conta para usar o saldo.");
                mudarAbaPagamento('pix');
                modalLogin.style.display = 'flex';
                return;
            }
            tabCarteira.classList.add('active');
            areaPix.style.display = 'none';
            areaCarteira.style.display = 'block';
            if(carteiraSaldoModal) carteiraSaldoModal.textContent = formatarBRL(usuarioLogado.saldo);
        }
    }

    // Pagar com Saldo
    if(btnPagarSaldo) btnPagarSaldo.onclick = async () => {
        const qtd = document.getElementById('modal-quantidade').value;
        const refCode = sessionStorage.getItem('bingo_ref_code');
        
        btnPagarSaldo.disabled = true;
        btnPagarSaldo.textContent = "Processando...";
        msgErroSaldo.style.display = 'none';

        const res = await fetch('/jogador/comprar-com-saldo', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                quantidade: qtd,
                tipo_compra: TIPO_COMPRA_ATUAL,
                refCode: refCode
            })
        });
        const data = await res.json();
        
        if(data.success) {
            alert("Compra realizada com sucesso!");
            checkLogin(); // Atualiza saldo na tela
            window.location.href = `espera.html?venda=${data.vendaId}`;
        } else {
            msgErroSaldo.textContent = data.message || "Erro na compra.";
            msgErroSaldo.style.display = 'block';
            btnPagarSaldo.disabled = false;
            btnPagarSaldo.textContent = "Confirmar Compra";
        }
    };

    // Socket Event: Depósito Confirmado
    if(socket) {
        socket.on('depositoConfirmado', (data) => {
            alert(`Depósito confirmado! Saldo adicionado.`);
            checkLogin();
            modalCarteira.style.display = 'none';
            // Se estiver no checkout, atualiza o saldo lá também
            if(carteiraSaldoModal) carteiraSaldoModal.textContent = formatarBRL(usuarioLogado.saldo + data.novoSaldo); // Estimativa visual rápida
        });
    }

    // --- LÓGICA EXISTENTE DO SCRIPT.JS (INTEGRADA) ---
    const btnJogueAgora = document.getElementById('btn-jogue-agora');
    const btnJogueEspecial = document.getElementById('btn-jogue-especial');
    const modalTitulo = document.getElementById('modal-titulo');
    const modalLabelPrecoEl = document.getElementById('modal-label-preco');
    const modalPrecoEl = document.getElementById('modal-preco');
    const modalQuantidadeInput = document.getElementById('modal-quantidade');
    const btnGerarPix = document.getElementById('btn-gerar-pix');
    const aguardandoPagamentoEl = document.getElementById('aguardando-pagamento');
    const etapaDados = document.getElementById('etapa-dados');
    const etapaPix = document.getElementById('etapa-pix');
    const pixQrCodeImg = document.getElementById('pix-qrcode-img');
    const pixCopiaColaInput = document.getElementById('pix-copia-cola');
    const btnCopiarPix = document.getElementById('btn-copiar-pix');
    
    let pollerInterval = null;

    if (btnJogueAgora) {
        btnJogueAgora.addEventListener('click', () => {
            TIPO_COMPRA_ATUAL = 'regular';
            if(modalTitulo) modalTitulo.textContent = 'Complete seu Pedido';
            modalCheckout.style.display = 'flex';
            mudarAbaPagamento('pix'); // Reset para PIX ao abrir
            atualizarPrecoTotalModal();
        });
    }

    if (btnJogueEspecial) {
        btnJogueEspecial.addEventListener('click', () => {
            TIPO_COMPRA_ATUAL = 'especial';
            if(modalTitulo) modalTitulo.textContent = 'Sorteio Especial';
            modalCheckout.style.display = 'flex';
            mudarAbaPagamento('pix');
            atualizarPrecoTotalModal();
        });
    }

    function atualizarPrecoTotalModal() {
        if (!modalQuantidadeInput || !modalPrecoEl) return;
        const precoUnitario = (TIPO_COMPRA_ATUAL === 'especial') ? PRECO_CARTELA_ESPECIAL_ATUAL : PRECO_CARTELA_ATUAL;
        if(modalLabelPrecoEl) modalLabelPrecoEl.textContent = formatarBRL(precoUnitario);
        let qtd = parseInt(modalQuantidadeInput.value) || 1;
        modalPrecoEl.textContent = formatarBRL(qtd * precoUnitario);
    }
    if(modalQuantidadeInput) modalQuantidadeInput.addEventListener('input', atualizarPrecoTotalModal);

    if(btnGerarPix) {
        btnGerarPix.addEventListener('click', () => {
            // Lógica existente de gerar PIX (mantida, mas agora verifica se tem session para vincular)
            const nome = document.getElementById('modal-nome').value;
            const telefone = document.getElementById('modal-telefone').value;
            const qtd = document.getElementById('modal-quantidade').value;
            const refCode = sessionStorage.getItem('bingo_ref_code');
            const evento = (TIPO_COMPRA_ATUAL === 'especial') ? 'criarPagamentoEspecial' : 'criarPagamento';
            
            btnGerarPix.disabled = true; btnGerarPix.textContent = "Gerando...";
            
            // Passa jogadorId se logado
            const dadosPayload = { nome, telefone, quantidade: qtd, refCode, jogadorId: usuarioLogado ? usuarioLogado.id : null };

            socket.emit(evento, dadosPayload, (data) => {
                if(data.success) {
                    pixQrCodeImg.src = `data:image/png;base64,${data.qrCodeBase64}`;
                    pixCopiaColaInput.value = data.qrCodeCopiaCola;
                    etapaDados.style.display = 'none';
                    etapaPix.style.display = 'block';
                    aguardandoPagamentoEl.style.display = 'block';
                    
                    sessionStorage.setItem('bingo_usuario_nome', nome);
                    sessionStorage.setItem('bingo_usuario_telefone', telefone);
                    
                    // Iniciar Polling manual (socket.on('pagamentoAprovado') já cuida do resto)
                    if(pollerInterval) clearInterval(pollerInterval);
                    pollerInterval = setInterval(() => {
                        socket.emit('checarMeuPagamento', { paymentId: data.paymentId });
                    }, 3000);
                } else {
                    alert("Erro ao gerar PIX.");
                    btnGerarPix.disabled = false;
                }
            });
        });
    }

    if(btnCopiarPix) {
        btnCopiarPix.addEventListener('click', () => {
            pixCopiaColaInput.select();
            document.execCommand('copy');
            btnCopiarPix.textContent = "Copiado!";
        });
    }

    socket.on('pagamentoAprovado', (data) => {
        if(pollerInterval) clearInterval(pollerInterval);
        alert("Pagamento Aprovado!");
        window.location.href = `espera.html?venda=${data.vendaId}`;
    });

    const formRecuperar = document.getElementById('form-recuperar-cartelas');
    const inputTelefoneRecuperar = document.getElementById('modal-telefone-recuperar');
    const btnRecuperar = document.getElementById('btn-recuperar-cartelas');
    
    if (formRecuperar) {
        formRecuperar.addEventListener('submit', (e) => {
            e.preventDefault();
            const telefone = inputTelefoneRecuperar.value.trim();
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) {
                alert("Telefone inválido.");
                return;
            }
            btnRecuperar.disabled = true;
            btnRecuperar.textContent = 'Buscando...';
            sessionStorage.setItem('bingo_usuario_telefone', telefone);

            socket.emit('buscarCartelasPorTelefone', { telefone }, (data) => {
                btnRecuperar.disabled = false;
                btnRecuperar.textContent = 'Ver Minhas Compras';
                if (data.success) {
                    // Função criarModalResultados deve ser implementada ou estar disponível se usada
                    // Como não estava no script original que você enviou, assumo que você a tem ou
                    // ela faz parte do código que não foi incluído.
                    // Se não tiver, avise-me.
                    if(typeof criarModalResultados === 'function') {
                        criarModalResultados(data.vendas, data.proximoSorteioId);
                    } else {
                        console.log("Cartelas encontradas:", data.vendas);
                        alert("Cartelas encontradas! Verifique o console.");
                    }
                } else {
                    alert(data.message || 'Erro ao buscar cartelas.');
                }
            });
        });
    }
});
