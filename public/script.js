document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURAÇÃO INICIAL E SOCKET ---
    const urlParamsGlobal = new URLSearchParams(window.location.search);
    const refCodeGlobal = urlParamsGlobal.get('ref'); 
    if (refCodeGlobal) sessionStorage.setItem('bingo_ref_code', refCodeGlobal);

    let socket;
    try { 
        socket = io(); 
        console.log("Conectado ao servidor Socket.IO."); 
    } catch (err) { 
        console.error("Erro ao conectar ao Socket.IO:", err); 
        alert("Erro de conexão. Recarregue a página.");
    }

    // --- VARIÁVEIS GLOBAIS ---
    let PRECO_CARTELA_ATUAL = 5.00;
    let PRECO_CARTELA_ESPECIAL_ATUAL = 10.00;
    let TIPO_COMPRA_ATUAL = 'regular';
    let METODO_PAGAMENTO_ATUAL = 'pix'; // 'pix' ou 'carteira'
    
    // Estado do Usuário
    let usuarioLogado = null; // { id, nome, telefone, saldo }
    let pollerInterval = null;
    let currentPaymentId = null;

    // --- SELETORES GERAIS (INTERFACE) ---
    // Auth & Header
    const btnLoginModal = document.getElementById('btn-login-modal');
    const btnCadastroModal = document.getElementById('btn-cadastro-modal');
    const guestButtons = document.getElementById('guest-buttons');
    const loggedUserInfo = document.getElementById('logged-user-info');
    const userNameDisplay = document.getElementById('user-name-display');
    const userBalanceDisplay = document.getElementById('user-balance-display');
    const btnLogout = document.getElementById('btn-logout');
    const btnAbrirCarteira = document.getElementById('btn-abrir-carteira');

    // Modais
    const modalLogin = document.getElementById('modal-login');
    const modalCadastro = document.getElementById('modal-cadastro');
    const modalCarteira = document.getElementById('modal-carteira');
    const modalCheckout = document.getElementById('modal-checkout');
    
    // Forms Auth
    const formLogin = document.getElementById('form-login');
    const formCadastro = document.getElementById('form-cadastro');
    const linkIrCadastro = document.getElementById('link-ir-cadastro');

    // Elementos do Checkout
    const tabPix = document.querySelector('.tab-btn[data-method="pix"]');
    const tabCarteira = document.getElementById('tab-carteira');
    const areaPix = document.getElementById('area-pagamento-pix');
    const areaCarteira = document.getElementById('area-pagamento-carteira');
    const btnPagarSaldo = document.getElementById('btn-pagar-saldo');
    const msgErroSaldo = document.getElementById('msg-erro-saldo');
    const carteiraSaldoModal = document.getElementById('carteira-saldo-modal');
    const modalNome = document.getElementById('modal-nome');
    const modalTelefone = document.getElementById('modal-telefone');
    const modalQuantidadeInput = document.getElementById('modal-quantidade');
    const modalLabelPrecoEl = document.getElementById('modal-label-preco');
    const modalPrecoEl = document.getElementById('modal-preco');
    const btnGerarPix = document.getElementById('btn-gerar-pix');
    const modalTitulo = document.getElementById('modal-titulo');
    
    // Elementos PIX Checkout
    const etapaDados = document.getElementById('etapa-dados');
    const etapaPix = document.getElementById('etapa-pix');
    const pixQrCodeImg = document.getElementById('pix-qrcode-img');
    const pixCopiaColaInput = document.getElementById('pix-copia-cola');
    const btnCopiarPix = document.getElementById('btn-copiar-pix');
    const aguardandoPagamentoEl = document.getElementById('aguardando-pagamento');

    // Elementos Carteira (Depósito)
    const btnGerarDeposito = document.getElementById('btn-gerar-deposito');
    const inputDepositoValor = document.getElementById('deposito-valor');
    const areaDepositoPix = document.getElementById('deposito-pix-area');
    const inputDepositoCopia = document.getElementById('deposito-copia-cola');
    const btnCopiarDeposito = document.getElementById('btn-copiar-deposito');

    // Elementos da Home (Status e Prêmios)
    const statusSorteioBox = document.getElementById('status-sorteio-box');
    const statusTitulo = document.getElementById('status-titulo');
    const statusCronometro = document.getElementById('status-cronometro');
    const statusSubtexto = document.getElementById('status-subtexto');
    const btnAssistirVivo = document.getElementById('btn-assistir-vivo');
    const btnJogueAgora = document.getElementById('btn-jogue-agora');
    const btnJogueEspecial = document.getElementById('btn-jogue-especial');
    const indexPremioLinhaEl = document.getElementById('index-premio-linha');
    const indexPremioCheiaEl = document.getElementById('index-premio-cheia');
    const indexPrecoCartelaEl = document.getElementById('index-preco-cartela');
    const especialPrecoCartelaEl = document.getElementById('especial-preco-cartela');
    const premioEspecialContainer = document.getElementById('premio-especial');
    const premioInfoContainer = document.getElementById('premio-info');
    const especialValorEl = document.getElementById('especial-valor');
    const especialDataEl = document.getElementById('especial-data');

    // --- FUNÇÕES AUXILIARES ---
    function formatarBRL(val) {
        const numero = parseFloat(val);
        if (isNaN(numero)) return 'R$ --,--';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // --- LÓGICA DE AUTENTICAÇÃO ---
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
        } catch(e) { console.error("Erro checkLogin:", e); }
    }

    function atualizarInterfaceLogado() {
        guestButtons.style.display = 'none';
        loggedUserInfo.style.display = 'flex';
        userNameDisplay.textContent = `Olá, ${usuarioLogado.nome.split(' ')[0]}`;
        userBalanceDisplay.textContent = formatarBRL(usuarioLogado.saldo);
        
        // Preenche modal de checkout automaticamente
        if(modalNome) modalNome.value = usuarioLogado.nome;
        if(modalTelefone) modalTelefone.value = usuarioLogado.telefone;
        if(carteiraSaldoModal) carteiraSaldoModal.textContent = formatarBRL(usuarioLogado.saldo);
    }

    // Inicializa verificação de login
    checkLogin();

    // Listeners de Modais de Auth
    if(btnLoginModal) btnLoginModal.onclick = () => modalLogin.style.display = 'flex';
    if(btnCadastroModal) btnCadastroModal.onclick = () => modalCadastro.style.display = 'flex';
    
    // Fechar modais
    document.querySelectorAll('.modal-close').forEach(el => {
        el.onclick = function() { 
            this.closest('.modal-overlay').style.display = 'none'; 
            // Se fechar o checkout, reseta estados
            if(this.closest('#modal-checkout')) {
                etapaDados.style.display = 'block';
                etapaPix.style.display = 'none';
                pararVerificadorPagamento();
            }
        };
    });

    if(linkIrCadastro) linkIrCadastro.onclick = (e) => { 
        e.preventDefault(); 
        modalLogin.style.display='none'; 
        modalCadastro.style.display='flex'; 
    };

    // Submits de Auth
    if(formLogin) formLogin.onsubmit = async (e) => {
        e.preventDefault();
        const telefone = document.getElementById('login-telefone').value;
        const senha = document.getElementById('login-senha').value;
        const btn = formLogin.querySelector('button');
        btn.textContent = 'Entrando...'; btn.disabled = true;

        try {
            const res = await fetch('/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({telefone, senha}) });
            const data = await res.json();
            if(data.success) {
                modalLogin.style.display = 'none';
                checkLogin();
            } else alert(data.message);
        } catch(err) { alert("Erro de conexão."); }
        btn.textContent = 'Entrar'; btn.disabled = false;
    };

    if(formCadastro) formCadastro.onsubmit = async (e) => {
        e.preventDefault();
        const nome = document.getElementById('cad-nome').value;
        const telefone = document.getElementById('cad-telefone').value;
        const senha = document.getElementById('cad-senha').value;
        const btn = formCadastro.querySelector('button');
        btn.textContent = 'Cadastrando...'; btn.disabled = true;

        try {
            const res = await fetch('/auth/cadastro', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome, telefone, senha}) });
            const data = await res.json();
            if(data.success) {
                modalCadastro.style.display = 'none';
                checkLogin();
                alert("Cadastro realizado com sucesso!");
            } else alert(data.message);
        } catch(err) { alert("Erro de conexão."); }
        btn.textContent = 'Cadastrar'; btn.disabled = false;
    };

    if(btnLogout) btnLogout.onclick = async () => {
        await fetch('/auth/logout', { method:'POST' });
        window.location.reload();
    };

    // --- LÓGICA DA CARTEIRA (DEPÓSITO E EXTRATO) ---
    if(btnAbrirCarteira) btnAbrirCarteira.onclick = async () => {
        if(!usuarioLogado) return;
        document.getElementById('carteira-saldo-valor').textContent = formatarBRL(usuarioLogado.saldo);
        modalCarteira.style.display = 'flex';
        areaDepositoPix.style.display = 'none'; // Reseta área pix
        btnGerarDeposito.disabled = false;
        btnGerarDeposito.textContent = "Gerar PIX Depósito";
        carregarTransacoes();
    };

    async function carregarTransacoes() {
        const div = document.getElementById('historico-transacoes');
        div.innerHTML = 'Carregando...';
        try {
            const res = await fetch('/jogador/transacoes');
            const data = await res.json();
            if(data.success && data.transacoes && data.transacoes.length > 0) {
                div.innerHTML = '';
                data.transacoes.forEach(t => {
                    const tipoClass = t.tipo === 'deposito' ? 'tipo-deposito' : 'tipo-compra';
                    const dataFormatada = new Date(t.timestamp).toLocaleDateString('pt-BR');
                    div.innerHTML += `
                        <div class="transacao-item ${tipoClass}">
                            <span>${dataFormatada} - ${t.descricao || t.tipo}</span>
                            <span>${t.valor > 0 ? '+' : ''}${formatarBRL(t.valor)}</span>
                        </div>`;
                });
            } else div.innerHTML = '<p style="text-align:center; color:#888;">Sem transações recentes.</p>';
        } catch(e) { div.innerHTML = 'Erro ao carregar.'; }
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
            jogadorId: usuarioLogado.id // ID para o webhook identificar
        }, (data) => {
            if(data.success) {
                areaDepositoPix.style.display = 'block';
                inputDepositoCopia.value = data.qrCodeCopiaCola;
                // O botão fica desabilitado para evitar duplo clique, usuário copia o código
            } else {
                alert("Erro ao gerar PIX: " + (data.message || "Erro desconhecido"));
                btnGerarDeposito.disabled = false;
                btnGerarDeposito.textContent = "Gerar PIX Depósito";
            }
        });
    };

    if(btnCopiarDeposito) btnCopiarDeposito.onclick = () => {
        inputDepositoCopia.select();
        try {
            navigator.clipboard.writeText(inputDepositoCopia.value);
            btnCopiarDeposito.textContent = "Copiado!";
            setTimeout(() => btnCopiarDeposito.textContent = "Copiar", 2000);
        } catch (err) {
            document.execCommand('copy');
            btnCopiarDeposito.textContent = "Copiado!";
        }
    };

    // --- LÓGICA DE CHECKOUT (COMPRA) ---
    
    // Abrir Modal de Compra
    if (btnJogueAgora) {
        btnJogueAgora.addEventListener('click', () => {
            TIPO_COMPRA_ATUAL = 'regular';
            if(modalTitulo) modalTitulo.textContent = 'Complete seu Pedido';
            modalCheckout.style.display = 'flex';
            mudarAbaPagamento('pix'); // Padrão PIX
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

    // Cálculo do Preço no Modal
    function atualizarPrecoTotalModal() {
        if (!modalQuantidadeInput || !modalPrecoEl) return;
        const precoUnitario = (TIPO_COMPRA_ATUAL === 'especial') ? PRECO_CARTELA_ESPECIAL_ATUAL : PRECO_CARTELA_ATUAL;
        if(modalLabelPrecoEl) modalLabelPrecoEl.textContent = formatarBRL(precoUnitario);
        
        let qtd = parseInt(modalQuantidadeInput.value);
        if(!qtd || qtd < 1) qtd = 1;
        modalPrecoEl.textContent = formatarBRL(qtd * precoUnitario);
    }
    if(modalQuantidadeInput) modalQuantidadeInput.addEventListener('input', atualizarPrecoTotalModal);

    // Troca de Abas (PIX vs Carteira)
    if(tabPix) tabPix.onclick = (e) => { e.preventDefault(); mudarAbaPagamento('pix'); };
    if(tabCarteira) tabCarteira.onclick = (e) => { e.preventDefault(); mudarAbaPagamento('carteira'); };

    function mudarAbaPagamento(metodo) {
        METODO_PAGAMENTO_ATUAL = metodo;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        
        if(metodo === 'pix') {
            if(tabPix) tabPix.classList.add('active');
            areaPix.style.display = 'block';
            areaCarteira.style.display = 'none';
        } else {
            // Verifica login
            if(!usuarioLogado) {
                alert("Você precisa entrar na sua conta para usar o saldo.");
                mudarAbaPagamento('pix');
                modalLogin.style.display = 'flex';
                return;
            }
            if(tabCarteira) tabCarteira.classList.add('active');
            areaPix.style.display = 'none';
            areaCarteira.style.display = 'block';
            if(carteiraSaldoModal) carteiraSaldoModal.textContent = formatarBRL(usuarioLogado.saldo);
        }
    }

    // 1. Pagar com PIX
    if(btnGerarPix) {
        btnGerarPix.addEventListener('click', () => {
            const nome = document.getElementById('modal-nome').value.trim();
            const telefone = document.getElementById('modal-telefone').value.trim();
            const qtd = parseInt(document.getElementById('modal-quantidade').value);
            const refCode = sessionStorage.getItem('bingo_ref_code');
            const evento = (TIPO_COMPRA_ATUAL === 'especial') ? 'criarPagamentoEspecial' : 'criarPagamento';
            
            if(!nome || !telefone || qtd < 1) return alert("Preencha todos os campos.");

            btnGerarPix.disabled = true; btnGerarPix.textContent = "Gerando...";
            
            // Se estiver logado, manda o ID também para vincular caso ele tenha escolhido pagar com PIX mesmo estando logado
            const dadosPayload = { 
                nome, 
                telefone, 
                quantidade: qtd, 
                refCode, 
                jogadorId: usuarioLogado ? usuarioLogado.id : null 
            };

            socket.emit(evento, dadosPayload, (data) => {
                if(data.success) {
                    pixQrCodeImg.src = `data:image/png;base64,${data.qrCodeBase64}`;
                    pixCopiaColaInput.value = data.qrCodeCopiaCola;
                    
                    etapaDados.style.display = 'none';
                    etapaPix.style.display = 'block';
                    aguardandoPagamentoEl.style.display = 'block';
                    
                    // Salva dados temporários
                    sessionStorage.setItem('bingo_usuario_nome', nome);
                    sessionStorage.setItem('bingo_usuario_telefone', telefone);
                    sessionStorage.setItem('bingo_payment_id', data.paymentId);

                    iniciarVerificadorPagamento(data.paymentId);
                } else {
                    alert("Erro ao gerar PIX: " + data.message);
                    btnGerarPix.disabled = false; btnGerarPix.textContent = "Gerar PIX";
                }
            });
        });
    }

    // Copiar PIX Compra
    if(btnCopiarPix) {
        btnCopiarPix.addEventListener('click', () => {
            pixCopiaColaInput.select();
            document.execCommand('copy');
            btnCopiarPix.textContent = "Copiado!";
            setTimeout(() => btnCopiarPix.textContent = "Copiar Código", 2000);
        });
    }

    // 2. Pagar com Saldo (Carteira)
    if(btnPagarSaldo) btnPagarSaldo.onclick = async () => {
        const qtd = document.getElementById('modal-quantidade').value;
        const refCode = sessionStorage.getItem('bingo_ref_code');
        
        btnPagarSaldo.disabled = true;
        btnPagarSaldo.textContent = "Processando...";
        msgErroSaldo.style.display = 'none';

        try {
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
                // Atualiza sessão local
                sessionStorage.setItem('bingo_usuario_nome', usuarioLogado.nome);
                sessionStorage.setItem('bingo_usuario_telefone', usuarioLogado.telefone);
                
                alert("Compra realizada com sucesso!");
                checkLogin(); // Atualiza saldo na UI
                window.location.href = `espera.html?venda=${data.vendaId}`;
            } else {
                msgErroSaldo.textContent = data.message || "Erro na compra.";
                msgErroSaldo.style.display = 'block';
                btnPagarSaldo.disabled = false;
                btnPagarSaldo.textContent = "Confirmar Compra";
            }
        } catch(e) {
            msgErroSaldo.textContent = "Erro de conexão.";
            msgErroSaldo.style.display = 'block';
            btnPagarSaldo.disabled = false;
        }
    };

    // --- POLLING DE PAGAMENTO PIX ---
    function checarPagamento() {
        if (currentPaymentId && socket.connected) {
            socket.emit('checarMeuPagamento', { paymentId: currentPaymentId });
        }
    }
    function iniciarVerificadorPagamento(paymentId) {
        pararVerificadorPagamento();
        currentPaymentId = paymentId;
        pollerInterval = setInterval(checarPagamento, 3000);
    }
    function pararVerificadorPagamento() {
        if (pollerInterval) { clearInterval(pollerInterval); pollerInterval = null; }
        currentPaymentId = null;
    }

    // Eventos do Socket (Resposta do Polling)
    socket.on('pagamentoAprovado', (data) => {
        pararVerificadorPagamento();
        alert("Pagamento Aprovado!");
        window.location.href = `espera.html?venda=${data.vendaId}`;
    });

    // Evento do Socket (Confirmação de Depósito)
    socket.on('depositoConfirmado', (data) => {
        alert(`Depósito confirmado! Saldo adicionado.`);
        checkLogin(); // Atualiza o header
        modalCarteira.style.display = 'none'; 
        // Se estiver com o modal de checkout aberto na aba carteira, atualiza lá também
        if(carteiraSaldoModal && usuarioLogado) {
            // Pequeno delay para garantir que checkLogin atualizou o objeto usuarioLogado
            setTimeout(() => {
                carteiraSaldoModal.textContent = formatarBRL(usuarioLogado.saldo);
            }, 500);
        }
    });

    // --- ATUALIZAÇÃO DA INTERFACE DO JOGO (HOME) ---
    // Esta parte é crucial para preencher os "R$ ..." na página inicial

    function atualizarValoresExibidos(data) {
        if (!data) return;
        
        // Sorteio Padrão
        if(indexPremioLinhaEl) indexPremioLinhaEl.textContent = formatarBRL(data.premio_linha);
        if(indexPremioCheiaEl) indexPremioCheiaEl.textContent = formatarBRL(data.premio_cheia);

        const novoPreco = parseFloat(data.preco_cartela);
        if (!isNaN(novoPreco) && novoPreco > 0) {
            PRECO_CARTELA_ATUAL = novoPreco;
            if(indexPrecoCartelaEl) indexPrecoCartelaEl.textContent = formatarBRL(PRECO_CARTELA_ATUAL);
        }
        
        // Sorteio Especial
        if (data.sorteio_especial_ativo === 'true' && data.sorteio_especial_datahora) {
            if (especialValorEl) especialValorEl.textContent = formatarBRL(data.sorteio_especial_valor);
            
            const dataEspecial = data.sorteio_especial_datahora;
            if (especialDataEl && dataEspecial) {
                try {
                    const dataObj = new Date(dataEspecial);
                    const dataFormatada = dataObj.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    especialDataEl.textContent = `🗓️ ${dataFormatada} 🕖`;
                } catch (e) { especialDataEl.textContent = `🗓️ Data Inválida 🕖`; }
            }

            const novoPrecoEspecial = parseFloat(data.sorteio_especial_preco_cartela);
            if (!isNaN(novoPrecoEspecial) && novoPrecoEspecial > 0) {
                PRECO_CARTELA_ESPECIAL_ATUAL = novoPrecoEspecial;
                if(especialPrecoCartelaEl) especialPrecoCartelaEl.textContent = formatarBRL(PRECO_CARTELA_ESPECIAL_ATUAL);
            }
            
            if (premioEspecialContainer) premioEspecialContainer.style.display = 'block';
        } else {
            if (premioEspecialContainer) premioEspecialContainer.style.display = 'none';
        }
    }

    function atualizarStatusBox(estado, tempo) {
        if (!statusSorteioBox) return;

        if (estado === 'ESPERANDO') {
            statusSorteioBox.className = 'card status-esperando';
            statusTitulo.textContent = 'PRÓXIMO SORTEIO EM:';
            
            const minutos = Math.floor(tempo / 60);
            let segundos = tempo % 60;
            segundos = segundos < 10 ? '0' + segundos : segundos;
            statusCronometro.textContent = `${minutos}:${segundos}`;
            
            statusCronometro.style.display = 'block';
            statusSubtexto.textContent = 'Garanta já sua cartela!';
            if (btnAssistirVivo) btnAssistirVivo.style.display = 'none';
            if (btnJogueAgora) btnJogueAgora.innerHTML = `Comprar Cartela (<span id="index-preco-cartela">${formatarBRL(PRECO_CARTELA_ATUAL)}</span>)`;

        } else { 
            statusSorteioBox.className = 'card status-jogando';
            let textoEstado = 'SORTEIO AO VIVO!';
            if (estado === 'JOGANDO_LINHA') textoEstado = 'AO VIVO: VALENDO LINHA!';
            else if (estado === 'JOGANDO_CHEIA') textoEstado = 'AO VIVO: VALENDO CARTELA CHEIA!';
            
            statusTitulo.textContent = textoEstado;
            statusCronometro.style.display = 'none';
            statusSubtexto.textContent = 'As compras agora valem para o próximo sorteio.';
            if (btnAssistirVivo) btnAssistirVivo.style.display = 'block'; 
            if (btnJogueAgora) btnJogueAgora.innerHTML = `Comprar p/ Próximo Sorteio (<span id="index-preco-cartela">${formatarBRL(PRECO_CARTELA_ATUAL)}</span>)`;
        }
    }

    // Listeners do Socket para a Home
    socket.on('estadoInicial', (data) => {
         console.log("Recebido estado inicial.");
         if (data.configuracoes) atualizarValoresExibidos(data.configuracoes);
         atualizarStatusBox(data.estado, data.tempoRestante); 
    });

    socket.on('configAtualizada', (data) => {
        console.log("Configs atualizadas.");
        atualizarValoresExibidos(data); 
    });

    socket.on('cronometroUpdate', (data) => {
        if (data.estado === 'ESPERANDO') atualizarStatusBox(data.estado, data.tempo);
    });

    socket.on('estadoJogoUpdate', (data) => {
        atualizarStatusBox(data.estado, 0);
    });

    // --- "MINHAS CARTELAS" (Busca por telefone - legado/convidado) ---
    const formRecuperar = document.getElementById('form-recuperar-cartelas');
    const inputTelefoneRecuperar = document.getElementById('modal-telefone-recuperar');
    const btnRecuperar = document.getElementById('btn-recuperar-cartelas');
    const btnChecarPremios = document.getElementById('btn-checar-premios');

    if (formRecuperar) {
        formRecuperar.addEventListener('submit', (e) => {
            e.preventDefault();
            const telefone = inputTelefoneRecuperar.value.trim();
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) return alert("Telefone inválido.");
            
            btnRecuperar.disabled = true; btnRecuperar.textContent = 'Buscando...';
            sessionStorage.setItem('bingo_usuario_telefone', telefone);

            socket.emit('buscarCartelasPorTelefone', { telefone }, (data) => {
                btnRecuperar.disabled = false; btnRecuperar.textContent = 'Ver Minhas Compras';
                if (data.success && data.vendas.length > 0) {
                    criarModalResultados(data.vendas, data.proximoSorteioId);
                } else {
                    alert('Nenhuma compra encontrada para este telefone.');
                }
            });
        });
    }

    if (btnChecarPremios) {
        btnChecarPremios.addEventListener('click', () => {
            const telefone = inputTelefoneRecuperar.value.trim();
            if (!telefone) return alert("Digite o telefone primeiro.");
            btnChecarPremios.disabled = true; btnChecarPremios.textContent = 'Verificando...';
            socket.emit('checarMeusPremios', { telefone }, (data) => {
                btnChecarPremios.disabled = false; btnChecarPremios.textContent = 'Verificar Prêmios';
                if (data.success && data.premios.length > 0) {
                    criarModalPremios(data.premios);
                } else {
                    alert('Nenhum prêmio encontrado.');
                }
            });
        });
    }

    // Funções de Modal Dinâmico (Resultados e Prêmios)
    let modalResultados = null;
    function criarModalResultados(vendas, proximoSorteioId) {
        if (modalResultados) modalResultados.remove();
        modalResultados = document.createElement('div');
        modalResultados.classList.add('modal-overlay');
        modalResultados.style.display = 'flex';
        
        let html = `<div class="modal-content" style="max-height:80vh; overflow-y:auto;">
            <span class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</span>
            <h2 class="title-gradient">Minhas Compras</h2>
            <div id="modal-minhas-cartelas-lista">`;
            
        vendas.forEach(venda => {
            const isEspecial = venda.tipo_sorteio === 'especial_agendado';
            const isActive = isEspecial ? true : (venda.sorteio_id == proximoSorteioId);
            const tipoTexto = isEspecial ? '<strong style="color:var(--color-pix-green)">(Especial)</strong>' : '(Regular)';
            
            let btnHtml = isActive 
                ? `<button class="btn-small btn-destaque" onclick="window.location.href='espera.html?venda=${venda.id}'; sessionStorage.setItem('bingo_usuario_nome', '${venda.nome_jogador}')">Entrar</button>`
                : `<span style="font-size:0.8em; color:#777;">Encerrado</span>`;

            html += `<div style="border-bottom:1px solid #eee; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>Sorteio #${isEspecial ? venda.sorteio_id_especial : venda.sorteio_id}</strong> ${tipoTexto}<br>
                    <small>${venda.quantidade_cartelas} cartelas - ${venda.data_formatada}</small>
                </div>
                ${btnHtml}
            </div>`;
        });
        html += `</div></div>`;
        modalResultados.innerHTML = html;
        document.body.appendChild(modalResultados);
    }

    let modalPremios = null;
    function criarModalPremios(premios) {
        if (modalPremios) modalPremios.remove();
        modalPremios = document.createElement('div');
        modalPremios.classList.add('modal-overlay');
        modalPremios.style.display = 'flex';
        
        let html = `<div class="modal-content">
            <span class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</span>
            <h2 class="title-gradient">Meus Prêmios</h2>
            <div style="text-align:left; max-height:60vh; overflow-y:auto;">`;
            
        premios.forEach(p => {
            const statusClass = p.status_pagamento === 'Pendente' ? 'status-pendente' : 'status-pago';
            html += `<div style="border-left:4px solid var(--color-pix-green); padding:10px; margin-bottom:10px; background:#f9f9f9;">
                <strong>${p.premio}</strong> - Sorteio #${p.sorteio_id}<br>
                <small>${p.data_formatada}</small><br>
                Status: <span class="status-pagamento ${statusClass}" style="font-size:0.8em; padding:2px 5px; border-radius:3px;">${p.status_pagamento}</span>
            </div>`;
        });
        
        html += `<p style="margin-top:15px; font-size:0.9em; text-align:center;">Se Pendente, contate o suporte no WhatsApp.</p></div></div>`;
        modalPremios.innerHTML = html;
        document.body.appendChild(modalPremios);
    }

});
