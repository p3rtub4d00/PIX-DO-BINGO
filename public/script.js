document.addEventListener('DOMContentLoaded', () => {

    let socket;
    try { socket = io(); console.log("Conectado ao servidor Socket.IO."); }
    catch (err) { console.error("Erro ao conectar ao Socket.IO:", err); alert("Erro de conexão com o servidor. Recarregue."); }

    // --- Variável Global para Preço (será atualizada) ---
    let PRECO_CARTELA_ATUAL = 5.00; // Valor padrão inicial

    // --- Seletores do DOM ---
    const modal = document.getElementById('modal-checkout');
    const btnCloseModal = document.querySelector('.modal-close');
    const btnJogueAgora = document.getElementById('btn-jogue-agora');
    
    const etapaDados = document.getElementById('etapa-dados');
    const etapaPix = document.getElementById('etapa-pix');
    const btnGerarPix = document.getElementById('btn-gerar-pix'); 
    
    // --- (INÍCIO) Seletores para Correção ---
    const pixQrCodeImg = document.getElementById('pix-qrcode-img');
    const pixQrContainer = document.getElementById('pix-qrcode-container'); // Container da imagem
    const pixCopiaColaInput = document.getElementById('pix-copia-cola');
    const pixCopiaContainer = pixCopiaColaInput.closest('.form-grupo'); // Container do Copia/Cola
    // --- (FIM) Seletores para Correção ---
    
    const aguardandoPagamentoEl = document.getElementById('aguardando-pagamento');

    const modalNome = document.getElementById('modal-nome');
    const modalTelefone = document.getElementById('modal-telefone');
    const modalQuantidadeInput = document.getElementById('modal-quantidade');
    const modalPrecoEl = document.getElementById('modal-preco');
    const indexPremioLinhaEl = document.getElementById('index-premio-linha');
    const indexPremioCheiaEl = document.getElementById('index-premio-cheia');
    const indexPrecoCartelaEl = document.getElementById('index-preco-cartela'); // Span no botão
    const modalLabelPrecoEl = document.getElementById('modal-label-preco'); // Span no label do modal

    const premioEspecialContainer = document.getElementById('premio-especial');
    const especialValorEl = document.getElementById('especial-valor');
    const especialDataEl = document.getElementById('especial-data');

    // *** INÍCIO DA ATUALIZAÇÃO (Seletores do Quadro de Status) ***
    const statusSorteioBox = document.getElementById('status-sorteio-box');
    const statusTitulo = document.getElementById('status-titulo');
    const statusCronometro = document.getElementById('status-cronometro');
    const statusSubtexto = document.getElementById('status-subtexto');
    const btnAssistirVivo = document.getElementById('btn-assistir-vivo');
    // *** FIM DA ATUALIZAÇÃO ***

    let pollerInterval = null; 
    let currentPaymentId = null; 

    // --- Função para formatar valor BRL ---
    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ --,--';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // --- Função para ATUALIZAR exibição de preços/prêmios (ATUALIZADA) ---
    function atualizarValoresExibidos(data) {
        if (!data) return;
        console.log("Atualizando exibição de valores:", data);
        
        // Sorteio Padrão
        if(indexPremioLinhaEl) indexPremioLinhaEl.textContent = formatarBRL(data.premio_linha);
        if(indexPremioCheiaEl) indexPremioCheiaEl.textContent = formatarBRL(data.premio_cheia);

        // Atualiza preço da cartela e recalcula o total no modal se estiver aberto
        const novoPreco = parseFloat(data.preco_cartela);
        if (!isNaN(novoPreco) && novoPreco > 0) {
            PRECO_CARTELA_ATUAL = novoPreco; // Atualiza variável global
            const precoFormatado = formatarBRL(PRECO_CARTELA_ATUAL);
            if(indexPrecoCartelaEl) indexPrecoCartelaEl.textContent = precoFormatado;
            if(modalLabelPrecoEl) modalLabelPrecoEl.textContent = precoFormatado;
            atualizarPrecoTotalModal(); // Recalcula total no modal
        }
        
        // --- LÓGICA DO SORTEIO ESPECIAL ---
        if (data.sorteio_especial_ativo === 'true') {
            if (especialValorEl) especialValorEl.textContent = formatarBRL(data.sorteio_especial_valor);
            if (especialDataEl) especialDataEl.textContent = `🗓️ ${data.sorteio_especial_data} 🕖`;
            if (premioEspecialContainer) premioEspecialContainer.style.display = 'block'; // Mostra
        } else {
            if (premioEspecialContainer) premioEspecialContainer.style.display = 'none'; // Esconde
        }
    }

    // --- *** INÍCIO DA ATUALIZAÇÃO (Função do Quadro de Status) *** ---
    function atualizarStatusBox(estado, tempo) {
        if (!statusSorteioBox) return; // Se o elemento não existir, sai

        if (estado === 'ESPERANDO') {
            statusSorteioBox.className = 'card status-esperando';
            statusTitulo.textContent = 'PRÓXIMO SORTEIO EM:';
            
            // Formata o tempo
            const minutos = Math.floor(tempo / 60);
            let segundos = tempo % 60;
            segundos = segundos < 10 ? '0' + segundos : segundos;
            statusCronometro.textContent = `${minutos}:${segundos}`;
            
            statusCronometro.style.display = 'block';
            statusSubtexto.textContent = 'Garanta já sua cartela!';
            btnAssistirVivo.style.display = 'none';
            
            // Muda o botão principal
            btnJogueAgora.innerHTML = `Comprar Cartela (<span id="index-preco-cartela">${formatarBRL(PRECO_CARTELA_ATUAL)}</span>)`;

        } else { // JOGANDO_LINHA, JOGANDO_CHEIA, ANUNCIANDO_VENCEDOR
            statusSorteioBox.className = 'card status-jogando';
            
            let textoEstado = 'SORTEIO AO VIVO!';
            if (estado === 'JOGANDO_LINHA') {
                textoEstado = 'AO VIVO: VALENDO LINHA!';
            } else if (estado === 'JOGANDO_CHEIA') {
                textoEstado = 'AO VIVO: VALENDO CARTELA CHEIA!';
            } else if (estado === 'ANUNCIANDO_VENCEDOR') {
                textoEstado = 'AO VIVO: ANUNCIANDO VENCEDOR!';
            }
            
            statusTitulo.textContent = textoEstado;
            statusCronometro.style.display = 'none'; // Esconde o timer
            statusSubtexto.textContent = 'As compras agora valem para o próximo sorteio.';
            btnAssistirVivo.style.display = 'block'; // Mostra o botão de assistir

            // Muda o botão principal
            btnJogueAgora.innerHTML = `Comprar p/ Próximo Sorteio (<span id="index-preco-cartela">${formatarBRL(PRECO_CARTELA_ATUAL)}</span>)`;
        }
    }
    // --- *** FIM DA ATUALIZAÇÃO *** ---


    // --- Funções de Polling de Pagamento (Sem alteração) ---
    function checarPagamento() {
        if (currentPaymentId && socket.connected) {
            console.log(`Polling: Checando status do pagamento ${currentPaymentId}...`);
            socket.emit('checarMeuPagamento', { paymentId: currentPaymentId });
        } else {
            console.log("Polling: Pulado (sem ID de pagamento ou socket desconectado).");
        }
    }
    function iniciarVerificadorPagamento(paymentId) {
        pararVerificadorPagamento();
        console.log(`Iniciando verificador para Payment ID: ${paymentId}`);
        currentPaymentId = paymentId; 
        checarPagamento();
        pollerInterval = setInterval(checarPagamento, 3000); 
    }
    function pararVerificadorPagamento() {
        if (pollerInterval) {
            console.log("Parando verificador de pagamento.");
            clearInterval(pollerInterval);
            pollerInterval = null;
        }
        currentPaymentId = null; // Limpa o ID
    }


    // --- Função para Fechar o Modal ---
    function fecharModal() { 
        if(modal) modal.style.display = 'none'; 
        if(etapaDados) etapaDados.style.display = 'block';
        if(etapaPix) etapaPix.style.display = 'none';
        if(btnGerarPix) { 
            btnGerarPix.disabled = false; 
            btnGerarPix.textContent = "Gerar PIX"; 
        } 
        
        // --- CORREÇÃO: Garante que os campos reapareçam ---
        if(pixQrContainer) pixQrContainer.style.display = 'block';
        if(pixCopiaContainer) pixCopiaContainer.style.display = 'block';
        
        pararVerificadorPagamento(); 
    }

    // --- Event Listeners (Sem alteração) ---
    if (btnJogueAgora && modal) {
        btnJogueAgora.addEventListener('click', () => {
            console.log("Botão 'Jogue Agora!' clicado.");
            modal.style.display = 'flex';
            atualizarPrecoTotalModal();
             if(modalNome) modalNome.focus();
        });
    } else { console.error("Erro: Botão 'Jogue Agora' ou Modal não encontrado."); }

    function atualizarPrecoTotalModal() {
        if (!modalQuantidadeInput || !modalPrecoEl) return;
        let quantidade = parseInt(modalQuantidadeInput.value);
        quantidade = (!quantidade || quantidade < 1) ? 1 : quantidade;
        const precoTotal = quantidade * PRECO_CARTELA_ATUAL; 
        modalPrecoEl.textContent = formatarBRL(precoTotal);
    }
    if(modalQuantidadeInput) {
        modalQuantidadeInput.addEventListener('input', atualizarPrecoTotalModal);
        modalQuantidadeInput.addEventListener('change', atualizarPrecoTotalModal);
    }

    if(btnCloseModal) btnCloseModal.addEventListener('click', fecharModal);
    if(modal) modal.addEventListener('click', (event) => { if (event.target === modal) fecharModal(); });

    // ==========================================================
    // --- CORREÇÃO (1/2): LÓGICA DE GERAR PIX ---
    // ==========================================================
    if (btnGerarPix && modalNome && modalTelefone && modalQuantidadeInput && socket) {
        btnGerarPix.addEventListener('click', () => {
            const nome = modalNome.value.trim(); const telefone = modalTelefone.value.trim(); const quantidade = parseInt(modalQuantidadeInput.value);
            if (!nome || !telefone || !quantidade || quantidade < 1) { alert("Preencha todos os campos."); return; }
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) { alert("Telefone inválido."); return; }
            
            console.log("Solicitando PIX..."); 
            btnGerarPix.textContent = "Gerando..."; 
            btnGerarPix.disabled = true;
            
            // Garante que os campos estão visíveis
            if(pixQrContainer) pixQrContainer.style.display = 'block';
            if(pixCopiaContainer) pixCopiaContainer.style.display = 'block';

            socket.emit('criarPagamento', { nome, telefone, quantidade }, (data) => {
                
                if (data && data.success && data.qrCodeCopiaCola) { // <-- Verificamos se qrCodeCopiaCola existe
                    console.log("PIX Recebido, Payment ID:", data.paymentId);

                    // --- INÍCIO DA CORREÇÃO ---
                    // Geramos o QR Code usando a string 'Copia e Cola'
                    const qrCodeString = encodeURIComponent(data.qrCodeCopiaCola);
                    pixQrCodeImg.src = `https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl=${qrCodeString}`;
                    pixQrCodeImg.style.display = 'block'; // Garante que está visível
                    // --- FIM DA CORREÇÃO ---

                    pixCopiaColaInput.value = data.qrCodeCopiaCola;
                    
                    etapaDados.style.display = 'none';
                    etapaPix.style.display = 'block';
                    aguardandoPagamentoEl.style.display = 'block';
                    
                    sessionStorage.setItem('bingo_usuario_nome', nome); 
                    sessionStorage.setItem('bingo_usuario_telefone', telefone);
                    sessionStorage.setItem('bingo_payment_id', data.paymentId); 
                    
                    iniciarVerificadorPagamento(data.paymentId);

                } else {
                    alert(`Erro: ${data.message || 'Não foi possível gerar o PIX.'}`);
                    btnGerarPix.textContent = "Gerar PIX"; 
                    btnGerarPix.disabled = false;
                }
            });
        });
    } else { console.error("Erro: Elementos do modal ou socket não encontrados para 'Gerar PIX'."); }
    
    if(btnCopiarPix && pixCopiaColaInput) {
        btnCopiarPix.addEventListener('click', () => {
            pixCopiaColaInput.select();
            try {
                navigator.clipboard.writeText(pixCopiaColaInput.value); // API moderna
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

    // --- Ouvintes do Socket.IO (ATUALIZADOS) ---
    if (socket) {
        socket.on('configAtualizada', (data) => {
            console.log("Recebida atualização de configurações via Socket.IO.");
            atualizarValoresExibidos(data); 
        });

        socket.on('estadoInicial', (data) => {
             console.log("Recebido estado inicial com configurações.");
             if (data.configuracoes) {
                 atualizarValoresExibidos(data.configuracoes);
             }
             // *** INÍCIO DA ATUALIZAÇÃO (Estado Inicial) ***
             atualizarStatusBox(data.estado, data.tempoRestante); 
             // *** FIM DA ATUALIZAÇÃO ***
        });

        // *** INÍCIO DA ATUALIZAÇÃO (Novos Ouvintes de Status) ***
        socket.on('cronometroUpdate', (data) => {
            // data = { tempo, sorteioId, estado }
            if (data.estado === 'ESPERANDO') {
                atualizarStatusBox(data.estado, data.tempo);
            }
        });

        socket.on('estadoJogoUpdate', (data) => {
            // data = { sorteioId, estado }
            atualizarStatusBox(data.estado, 0); // O tempo não importa aqui
        });
        // *** FIM DA ATUALIZAÇÃO ***

        socket.on('pagamentoAprovado', (data) => {
            console.log(`Pagamento Aprovado! Venda ID: ${data.vendaId}`);
            
            pararVerificadorPagamento(); 
            sessionStorage.removeItem('bingo_payment_id'); 
            
            const nomeSalvo = sessionStorage.getItem('bingo_usuario_nome');
            if (nomeSalvo !== data.nome) {
                 console.warn("Pagamento aprovado, mas o nome não bate. Ignorando.");
                 return;
            }
            
            if (modal.style.display === 'flex' && etapaPix.style.display === 'block') {
                alert("Pagamento confirmado!\n\nCartelas geradas.\nIndo para a sala de espera.");
                fecharModal(); 
                modalNome.value = ""; 
                modalTelefone.value = ""; 
                modalQuantidadeInput.value = "1";
            }
            
            window.location.href = `espera.html?venda=${data.vendaId}`;
        });

        socket.on('pagamentoErro', (data) => {
            alert(`Erro no servidor de pagamento: ${data.message}`);
            pararVerificadorPagamento();
            sessionStorage.removeItem('bingo_payment_id'); 
            fecharModal(); 
        });

        socket.on('connect', () => {
            console.log("Socket reconectado.");
            const paymentIdSalvo = sessionStorage.getItem('bingo_payment_id');
            if (paymentIdSalvo) {
                console.log("Reconectado. Reiniciando verificador para paymentId salvo.");
                iniciarVerificadorPagamento(paymentIdSalvo);
            }
        });
        
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                console.log("Aba do navegador ficou visível.");
                const paymentIdSalvo = sessionStorage.getItem('bingo_payment_id');
                if (paymentIdSalvo) {
                    console.log("Aba visível. Forçando uma checagem de pagamento.");
                    checarPagamento(); 
                }
            }
        });
    }
    
    // ==========================================================
    // --- CORREÇÃO (2/2): LÓGICA DE RECARREGAMENTO DE PÁGINA ---
    // ==========================================================
    const paymentIdSalvo = sessionStorage.getItem('bingo_payment_id');
    if (paymentIdSalvo) {
        console.log(`Encontrado paymentId ${paymentIdSalvo} no sessionStorage ao carregar. Iniciando verificador.`);
        modal.style.display = 'flex';
        etapaDados.style.display = 'none';
        etapaPix.style.display = 'block';
        aguardandoPagamentoEl.style.display = 'block';

        // --- INÍCIO DA CORREÇÃO ---
        // Oculta a área do QR Code e Copia/Cola, mostrando apenas o spinner,
        // pois não salvamos o código no sessionStorage (apenas o paymentId).
        if(pixQrContainer) pixQrContainer.style.display = 'none';
        if(pixCopiaContainer) pixCopiaContainer.style.display = 'none';
        // --- FIM DA CORREÇÃO ---
        
        iniciarVerificadorPagamento(paymentIdSalvo);
    }
});
