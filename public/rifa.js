document.addEventListener('DOMContentLoaded', () => {

    let socket;
    try { 
        socket = io(); 
        console.log("Conectado ao servidor Socket.IO."); 
    }
    catch (err) { console.error("Erro ao conectar ao Socket.IO:", err); alert("Erro de conexão com o servidor. Recarregue."); }

    // --- Variáveis Globais da Rifa ---
    let PRECO_POR_NUMERO = 0.00;
    let RIFA_ID_ATIVA = null; // Será preenchido ao carregar

    // --- Seletores do DOM ---
    const modal = document.getElementById('modal-checkout');
    const btnCloseModal = document.querySelector('.modal-close');
    
    // Seletores do Formulário de Compra
    const btnGerarPix = document.getElementById('btn-gerar-pix');
    const modalNome = document.getElementById('modal-nome');
    const modalTelefone = document.getElementById('modal-telefone');
    const modalQuantidadeInput = document.getElementById('modal-quantidade');
    const modalPrecoEl = document.getElementById('modal-preco');

    // Seletores da Etapa PIX (dentro do modal)
    const etapaPix = document.getElementById('etapa-pix');
    const btnCopiarPix = document.getElementById('btn-copiar-pix'); 
    const pixQrCodeImg = document.getElementById('pix-qrcode-img');
    const pixQrContainer = document.getElementById('pix-qrcode-container');
    const pixCopiaColaInput = document.getElementById('pix-copia-cola');
    const pixCopiaContainer = document.getElementById('pix-copia-container');
    const aguardandoPagamentoEl = document.getElementById('aguardando-pagamento');

    // Seletores de Informações da Rifa (na página)
    const rifaNomePremioEl = document.getElementById('rifa-nome-premio');
    const rifaDescricaoEl = document.getElementById('rifa-descricao');
    const rifaValorNumeroEl = document.getElementById('rifa-valor-numero');
    
    // Variáveis de Polling
    let pollerInterval = null; 
    let currentPaymentId = null; 
    let currentRifaVendaId = null;

    // --- Função para formatar valor BRL ---
    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ --,--';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // --- Função para Fechar o Modal ---
    function fecharModal() { 
        if(modal) modal.style.display = 'none'; 
        if(btnGerarPix) { 
            btnGerarPix.disabled = false; 
            btnGerarPix.textContent = "Comprar e Gerar PIX"; 
        } 
        pararVerificadorPagamento(); 
    }

    // --- Funções de Polling de Pagamento (adaptadas para Rifa) ---
    function checarPagamentoRifa() {
        if (currentPaymentId && currentRifaVendaId && socket.connected) {
            console.log(`Polling: Checando status do pagamento Rifa ${currentPaymentId}...`);
            socket.emit('checarMeuPagamentoRifa', { 
                paymentId: currentPaymentId,
                rifaVendaId: currentRifaVendaId 
            });
        }
    }
    function iniciarVerificadorPagamento(paymentId, rifaVendaId) {
        pararVerificadorPagamento();
        console.log(`Iniciando verificador para RifaVenda ID: ${rifaVendaId}`);
        currentPaymentId = paymentId; 
        currentRifaVendaId = rifaVendaId;
        checarPagamentoRifa();
        pollerInterval = setInterval(checarPagamentoRifa, 3000); 
    }
    function pararVerificadorPagamento() {
        if (pollerInterval) {
            clearInterval(pollerInterval);
            pollerInterval = null;
        }
        currentPaymentId = null;
        currentRifaVendaId = null;
    }

    // --- Funções de Atualização da Página ---
    function atualizarPrecoTotalModal() {
        if (!modalQuantidadeInput || !modalPrecoEl) return;
        let quantidade = parseInt(modalQuantidadeInput.value);
        quantidade = (!quantidade || quantidade < 1) ? 1 : quantidade;
        const precoTotal = quantidade * PRECO_POR_NUMERO; 
        modalPrecoEl.textContent = formatarBRL(precoTotal);
    }
    
    // Carrega os dados da rifa ativa para preencher a página
    async function carregarInfoRifa() {
        try {
            // (Esta rota '/api/rifa/publica' ainda será criada no server.js)
            const response = await fetch('/api/rifa/publica'); 
            const data = await response.json();

            if (data.success && data.rifa) {
                const rifa = data.rifa;
                RIFA_ID_ATIVA = rifa.id;
                PRECO_POR_NUMERO = parseFloat(rifa.valor_numero);
                
                rifaNomePremioEl.textContent = rifa.nome_premio;
                rifaDescricaoEl.textContent = rifa.descricao || "Participe e boa sorte!";
                rifaValorNumeroEl.textContent = formatarBRL(rifa.valor_numero);

                // Atualiza o preço no formulário
                atualizarPrecoTotalModal();

            } else {
                // Nenhuma rifa ativa
                document.getElementById('compra-rifa').innerHTML = 
                    '<h2>Nenhuma rifa ativa no momento.</h2><p>Por favor, volte mais tarde.</p>';
            }
        } catch (err) {
            console.error("Erro ao buscar info da rifa:", err);
            rifaNomePremioEl.textContent = "Erro ao carregar rifa";
        }
    }

    // --- Event Listeners ---
    if(modalQuantidadeInput) {
        modalQuantidadeInput.addEventListener('input', atualizarPrecoTotalModal);
        modalQuantidadeInput.addEventListener('change', atualizarPrecoTotalModal);
    }
    
    if(btnCloseModal) btnCloseModal.addEventListener('click', fecharModal);
    if(modal) modal.addEventListener('click', (event) => { if (event.target === modal) fecharModal(); });

    // --- Lógica de Gerar PIX ---
    if (btnGerarPix && modalNome && modalTelefone && modalQuantidadeInput && socket) {
        btnGerarPix.addEventListener('click', () => {
            const nome = modalNome.value.trim(); 
            const telefone = modalTelefone.value.trim(); 
            const quantidade = parseInt(modalQuantidadeInput.value);
            
            if (!nome || !telefone || !quantidade || quantidade < 1) { 
                alert("Preencha todos os campos."); return; 
            }
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) { 
                alert("Telefone inválido."); return; 
            }
            if (!RIFA_ID_ATIVA) {
                alert("Erro: Nenhuma rifa ativa encontrada. Recarregue a página."); return;
            }
            
            console.log("Solicitando PIX para Rifa..."); 
            btnGerarPix.textContent = "Gerando..."; 
            btnGerarPix.disabled = true;

            // Mostra o modal de pagamento
            modal.style.display = 'flex';
            etapaPix.style.display = 'block';
            aguardandoPagamentoEl.style.display = 'block';
            pixQrContainer.style.display = 'none'; // Esconde até ter a imagem
            pixCopiaContainer.style.display = 'none'; // Esconde até ter o código

            socket.emit('criarPagamentoRifa', 
                { nome, telefone, quantidade, rifaId: RIFA_ID_ATIVA }, 
                (data) => {
                
                if (data && data.success) {
                    console.log("PIX (Rifa) Recebido, Payment ID:", data.paymentId);

                    pixQrCodeImg.src = `data:image/png;base64,${data.qrCodeBase64}`;
                    pixQrCodeImg.style.display = 'block';
                    pixQrContainer.style.display = 'block';

                    pixCopiaColaInput.value = data.qrCodeCopiaCola;
                    pixCopiaContainer.style.display = 'block';
                    
                    // Salva os dados para o polling e para o comprovante
                    sessionStorage.setItem('rifa_payment_id', data.paymentId);
                    sessionStorage.setItem('rifa_venda_id', data.rifaVendaId);
                    
                    iniciarVerificadorPagamento(data.paymentId, data.rifaVendaId);

                } else {
                    alert(`Erro: ${data.message || 'Não foi possível gerar o PIX.'}`);
                    fecharModal();
                }
            });
        });
    }

    // --- Lógica do Botão Copiar (copiado do script.js) ---
    if(btnCopiarPix && pixCopiaColaInput) {
        btnCopiarPix.addEventListener('click', () => {
            pixCopiaColaInput.select();
            try {
                navigator.clipboard.writeText(pixCopiaColaInput.value); 
                btnCopiarPix.textContent = "Copiado!";
                setTimeout(() => { btnCopiarPix.textContent = "Copiar Código"; }, 2000);
            } catch (err) {
                try {
                    document.execCommand('copy');
                    btnCopiarPix.textContent = "Copiado!";
                    setTimeout(() => { btnCopiarPix.textContent = "Copiar Código"; }, 2000);
                } catch (err2) {
                    alert('Não foi possível copiar o código. Selecione manualmente.');
                }
            }
        });
    }

    // --- Ouvintes do Socket.IO ---
    if (socket) {
        socket.on('pagamentoRifaAprovado', (data) => {
            console.log(`Pagamento Rifa Aprovado! Venda ID: ${data.rifaVendaId}`);
            
            pararVerificadorPagamento(); 
            sessionStorage.removeItem('rifa_payment_id');
            // Mantemos o 'rifa_venda_id' para a página de comprovante
            
            if (modal.style.display === 'flex') {
                alert("Pagamento confirmado!\n\nSeus números da rifa foram gerados.\nIndo para o comprovante...");
            }
            
            // Redireciona para a nova página de comprovante da rifa
            window.location.href = `comprovante_rifa.html?vendaId=${data.rifaVendaId}`;
        });

        socket.on('connect', () => {
            console.log("Socket reconectado.");
            const paymentIdSalvo = sessionStorage.getItem('rifa_payment_id');
            const vendaIdSalva = sessionStorage.getItem('rifa_venda_id');
            
            if (paymentIdSalvo && vendaIdSalva) {
                console.log("Reconectado. Reiniciando verificador para rifa.");
                iniciarVerificadorPagamento(paymentIdSalvo, vendaIdSalva);
            }
        });
    }
    
    // --- Lógica de Recarregamento de Página ---
    const paymentIdSalvo = sessionStorage.getItem('rifa_payment_id');
    const vendaIdSalva = sessionStorage.getItem('rifa_venda_id');
    
    if (paymentIdSalvo && vendaIdSalva) {
        console.log(`Encontrado paymentId ${paymentIdSalvo} no sessionStorage ao carregar.`);
        // Reabre o modal de pagamento
        modal.style.display = 'flex';
        etapaPix.style.display = 'block';
        aguardandoPagamentoEl.style.display = 'block';
        
        // Esconde QR e Copia/Cola, pois não temos mais esses dados
        pixQrContainer.style.display = 'none';
        pixCopiaContainer.style.display = 'none';
        
        iniciarVerificadorPagamento(paymentIdSalvo, vendaIdSalva);
    }

    // --- Carregar dados iniciais da Rifa ---
    carregarInfoRifa();

});
