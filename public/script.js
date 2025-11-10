document.addEventListener('DOMContentLoaded', () => {

    let socket;
    try { 
        socket = io(); 
        console.log("Conectado ao servidor Socket.IO."); 
    }
    catch (err) { console.error("Erro ao conectar ao Socket.IO:", err); alert("Erro de conexão com o servidor. Recarregue."); }

    // --- Variáveis Globais para Preço (será atualizada) ---
    let PRECO_CARTELA_ATUAL = 5.00; // Valor padrão inicial
    
    // ==================================================
    // --- INÍCIO DAS MODIFICAÇÕES ---
    // ==================================================
    let PRECO_CARTELA_ESPECIAL_ATUAL = 10.00; // Valor padrão inicial
    let TIPO_COMPRA_ATUAL = 'regular'; // Controla qual tipo de compra está no modal
    // ==================================================
    // --- FIM DAS MODIFICAÇÕES ---
    // ==================================================


    // --- Seletores do DOM ---
    const modal = document.getElementById('modal-checkout');
    const btnCloseModal = document.querySelector('.modal-close');
    const btnJogueAgora = document.getElementById('btn-jogue-agora');
    
    // ==================================================
    // --- INÍCIO DAS MODIFICAÇÕES ---
    // ==================================================
    const btnJogueEspecial = document.getElementById('btn-jogue-especial'); // Botão novo
    const modalTitulo = document.getElementById('modal-titulo'); // Título do modal
    // ==================================================
    // --- FIM DAS MODIFICAÇÕES ---
    // ==================================================
    
    const etapaDados = document.getElementById('etapa-dados');
    const etapaPix = document.getElementById('etapa-pix');
    const btnGerarPix = document.getElementById('btn-gerar-pix'); 
    
    const btnCopiarPix = document.getElementById('btn-copiar-pix'); 
    const pixQrCodeImg = document.getElementById('pix-qrcode-img');
    const pixQrContainer = document.getElementById('pix-qrcode-container'); // Container da imagem
    const pixCopiaColaInput = document.getElementById('pix-copia-cola');
    const pixCopiaContainer = pixCopiaColaInput ? pixCopiaColaInput.closest('.form-grupo') : null; // Container do Copia/Cola
    
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

    // ==================================================
    // --- INÍCIO DAS MODIFICAÇÕES ---
    // ==================================================
    const especialPrecoCartelaEl = document.getElementById('especial-preco-cartela'); // Span no botão especial
    // ==================================================
    // --- FIM DAS MODIFICAÇÕES ---
    // ==================================================

    const statusSorteioBox = document.getElementById('status-sorteio-box');
    const statusTitulo = document.getElementById('status-titulo');
    const statusCronometro = document.getElementById('status-cronometro');
    const statusSubtexto = document.getElementById('status-subtexto');
    const btnAssistirVivo = document.getElementById('btn-assistir-vivo');

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
            // (O label do modal é atualizado quando ele abre)
        }
        
        // ==================================================
        // --- INÍCIO DAS MODIFICAÇÕES ---
        // ==================================================
        
        // --- LÓGICA DO SORTEIO ESPECIAL (ATUALIZADA) ---
        if (data.sorteio_especial_ativo === 'true') {
            if (especialValorEl) especialValorEl.textContent = formatarBRL(data.sorteio_especial_valor);
            
            // Formata a nova data 'datetime-local' (ex: 2025-11-10T19:00)
            const dataEspecial = data.sorteio_especial_datahora;
            if (especialDataEl && dataEspecial) {
                try {
                    const dataObj = new Date(dataEspecial);
                    const dataFormatada = dataObj.toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    especialDataEl.textContent = `🗓️ ${dataFormatada} 🕖`;
                } catch (e) {
                    especialDataEl.textContent = `🗓️ Data Inválida 🕖`;
                }
            } else if (especialDataEl) {
                especialDataEl.textContent = `🗓️ Data a definir 🕖`;
            }

            // Atualiza o preço da cartela especial
            const novoPrecoEspecial = parseFloat(data.sorteio_especial_preco_cartela);
            if (!isNaN(novoPrecoEspecial) && novoPrecoEspecial > 0) {
                PRECO_CARTELA_ESPECIAL_ATUAL = novoPrecoEspecial;
                if(especialPrecoCartelaEl) especialPrecoCartelaEl.textContent = formatarBRL(PRECO_CARTELA_ESPECIAL_ATUAL);
            }
            
            if (premioEspecialContainer) premioEspecialContainer.style.display = 'block'; // Mostra
        } else {
            if (premioEspecialContainer) premioEspecialContainer.style.display = 'none'; // Esconde
        }
        
        // Recalcula o total no modal (caso esteja aberto e os preços mudem)
        atualizarPrecoTotalModal();
        
        // ==================================================
        // --- FIM DAS MODIFICAÇÕES ---
        // ==================================================
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
            if (btnAssistirVivo) btnAssistirVivo.style.display = 'none';
            
            // Muda o botão principal
            if (btnJogueAgora) btnJogueAgora.innerHTML = `Comprar Cartela (<span id="index-preco-cartela">${formatarBRL(PRECO_CARTELA_ATUAL)}</span>)`;

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
            if (statusCronometro) statusCronometro.style.display = 'none'; // Esconde o timer
            if (statusSubtexto) statusSubtexto.textContent = 'As compras agora valem para o próximo sorteio.';
            if (btnAssistirVivo) btnAssistirVivo.style.display = 'block'; // Mostra o botão de assistir

            // Muda o botão principal
            if (btnJogueAgora) btnJogueAgora.innerHTML = `Comprar p/ Próximo Sorteio (<span id="index-preco-cartela">${formatarBRL(PRECO_CARTELA_ATUAL)}</span>)`;
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

    // --- Event Listeners (ATUALIZADOS) ---
    
    // ==================================================
    // --- INÍCIO DAS MODIFICAÇÕES ---
    // ==================================================
    
    // --- CLIQUE BOTÃO REGULAR ---
    if (btnJogueAgora && modal) {
        btnJogueAgora.addEventListener('click', () => {
            console.log("Botão 'Jogue Agora!' (Regular) clicado.");
            TIPO_COMPRA_ATUAL = 'regular';
            if(modalTitulo) modalTitulo.textContent = 'Complete seu Pedido';
            
            modal.style.display = 'flex';
            atualizarPrecoTotalModal();
             if(modalNome) modalNome.focus();
        });
    } else { console.error("Erro: Botão 'Jogue Agora' ou Modal não encontrado."); }

    // --- CLIQUE BOTÃO ESPECIAL ---
    if (btnJogueEspecial && modal) {
        btnJogueEspecial.addEventListener('click', () => {
            console.log("Botão 'Jogue Agora!' (Especial) clicado.");
            TIPO_COMPRA_ATUAL = 'especial';
            if(modalTitulo) modalTitulo.textContent = 'Sorteio Especial';
            
            modal.style.display = 'flex';
            atualizarPrecoTotalModal();
             if(modalNome) modalNome.focus();
        });
    } else { console.error("Erro: Botão 'Jogue Especial' ou Modal não encontrado."); }
    

    // --- ATUALIZAR PREÇO MODAL (MODIFICADO) ---
    function atualizarPrecoTotalModal() {
        if (!modalQuantidadeInput || !modalPrecoEl || !modalLabelPrecoEl) return;
        
        // Define o preço unitário baseado no tipo de compra
        const precoUnitario = (TIPO_COMPRA_ATUAL === 'especial') 
            ? PRECO_CARTELA_ESPECIAL_ATUAL 
            : PRECO_CARTELA_ATUAL;
            
        // Atualiza o label
        modalLabelPrecoEl.textContent = formatarBRL(precoUnitario);
        
        let quantidade = parseInt(modalQuantidadeInput.value);
        quantidade = (!quantidade || quantidade < 1) ? 1 : quantidade;
        
        const precoTotal = quantidade * precoUnitario; 
        modalPrecoEl.textContent = formatarBRL(precoTotal);
    }
    // ==================================================
    // --- FIM DAS MODIFICAÇÕES ---
    // ==================================================
    
    
    if(modalQuantidadeInput) {
        modalQuantidadeInput.addEventListener('input', atualizarPrecoTotalModal);
        modalQuantidadeInput.addEventListener('change', atualizarPrecoTotalModal);
    }

    if(btnCloseModal) btnCloseModal.addEventListener('click', fecharModal);
    if(modal) modal.addEventListener('click', (event) => { if (event.target === modal) fecharModal(); });

    // ==========================================================
    // --- LÓGICA DE GERAR PIX (MODIFICADA) ---
    // ==========================================================
    if (btnGerarPix && modalNome && modalTelefone && modalQuantidadeInput && socket) {
        btnGerarPix.addEventListener('click', () => {
            const nome = modalNome.value.trim(); const telefone = modalTelefone.value.trim(); const quantidade = parseInt(modalQuantidadeInput.value);
            if (!nome || !telefone || !quantidade || quantidade < 1) { alert("Preencha todos os campos."); return; }
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) { alert("Telefone inválido."); return; }
            
            console.log(`Solicitando PIX para compra do tipo: ${TIPO_COMPRA_ATUAL}`); 
            btnGerarPix.textContent = "Gerando..."; 
            btnGerarPix.disabled = true;
            
            // Garante que os campos estão visíveis
            if(pixQrContainer) pixQrContainer.style.display = 'block';
            if(pixCopiaContainer) pixCopiaContainer.style.display = 'block';

            // ==================================================
            // --- INÍCIO DAS MODIFICAÇÕES ---
            // ==================================================
            
            // Define qual evento de socket chamar (regular ou especial)
            const eventoSocket = (TIPO_COMPRA_ATUAL === 'especial') 
                ? 'criarPagamentoEspecial' 
                : 'criarPagamento';
                
            // Salva o tipo de compra no sessionStorage para o 'pagamentoAprovado' saber o que fazer
            sessionStorage.setItem('bingo_tipo_compra', TIPO_COMPRA_ATUAL);

            socket.emit(eventoSocket, { nome, telefone, quantidade }, (data) => {
            // ==================================================
            // --- FIM DAS MODIFICAÇÕES ---
            // ==================================================
                
                // --- VOLTANDO À LÓGICA ORIGINAL QUE USA Base64 ---
                if (data && data.success) {
                    console.log("PIX Recebido, Payment ID:", data.paymentId);

                    // --- INÍCIO DA CORREÇÃO ---
                    // Usando o 'qrCodeBase64' original
                    pixQrCodeImg.src = `data:image/png;base64,${data.qrCodeBase64}`;
                    pixQrCodeImg.style.display = 'block';
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
                    sessionStorage.removeItem('bingo_tipo_compra'); // Limpa se falhar
                }
            });
        });
    } else { console.error("Erro: Elementos do modal ou socket não encontrados para 'Gerar PIX'."); }
    
    // CORRIGIDO (btnCopiarPix agora está definido)
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
            
            // ==================================================
            // --- INÍCIO DAS MODIFICAÇÕES ---
            // ==================================================
            
            // Pega o tipo de compra que foi salvo antes de gerar o PIX
            const tipoCompraSalvo = sessionStorage.getItem('bingo_tipo_compra') || 'regular';
            sessionStorage.removeItem('bingo_tipo_compra'); // Limpa
            
            // Limpa os campos do modal
            if(modalNome) modalNome.value = ""; 
            if(modalTelefone) modalTelefone.value = ""; 
            if(modalQuantidadeInput) modalQuantidadeInput.value = "1";
            
            if (modal.style.display === 'flex' && etapaPix.style.display === 'block') {
                fecharModal();
                
                if (tipoCompraSalvo === 'especial') {
                    // Se for ESPECIAL, só avisa e fecha o modal
                    alert("Pagamento confirmado!\n\nSuas cartelas para o Sorteio Especial estão garantidas. Você pode consultá-las a qualquer momento na seção 'Ver Minhas Compras'.");
                    // Não redireciona
                } else {
                    // Se for REGULAR, redireciona para a sala de espera (comportamento antigo)
                    alert("Pagamento confirmado!\n\nCartelas geradas.\nIndo para a sala de espera.");
                    window.location.href = `espera.html?venda=${data.vendaId}`;
                }
            } else if (tipoCompraSalvo === 'regular') {
                // Se o modal não estava aberto mas era compra regular (ex: outra aba)
                window.location.href = `espera.html?venda=${data.vendaId}`;
            }
            // Se o modal não estava aberto e era 'especial', não faz nada (só foi aprovado em background)

            // ==================================================
            // --- FIM DAS MODIFICAÇÕES ---
            // ==================================================
        });

        socket.on('pagamentoErro', (data) => {
            alert(`Erro no servidor de pagamento: ${data.message}`);
            pararVerificadorPagamento();
            sessionStorage.removeItem('bingo_payment_id'); 
            sessionStorage.removeItem('bingo_tipo_compra'); // Limpa
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
    // --- LÓGICA DE RECARREGAMENTO DE PÁGINA (CORRIGIDA) ---
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

    
    // ==========================================================
    // ===== NOVO CÓDIGO: LÓGICA PARA RECUPERAR CARTELAS (COLE AQUI) =====
    // ==========================================================
    
    // 1. Seleciona o novo formulário e o botão
    const formRecuperar = document.getElementById('form-recuperar-cartelas');
    const inputTelefoneRecuperar = document.getElementById('modal-telefone-recuperar');
    const btnRecuperar = document.getElementById('btn-recuperar-cartelas');
    
    // ***** INÍCIO DA ATUALIZAÇÃO *****
    const btnChecarPremios = document.getElementById('btn-checar-premios');
    // ***** FIM DA ATUALIZAÇÃO *****
    
    
    // 2. Cria o modal de resultados (mas não o exibe)
    let modalResultados = null; // Guarda a referência do modal
    
    function criarModalResultados(vendas, proximoSorteioId) {
        // Se o modal já existe, remove
        if (modalResultados) {
            modalResultados.remove();
        }

        // Cria a estrutura do modal
        modalResultados = document.createElement('div');
        modalResultados.classList.add('modal-overlay');
        modalResultados.style.display = 'flex'; // Mostra imediatamente

        let htmlInterno = `
            <div class="modal-content">
                <span class="modal-close" id="modal-resultados-fechar">&times;</span>
                <h2 class="title-gradient">Minhas Compras</h2>
                <div id="modal-minhas-cartelas-lista">
        `;

        if (vendas && vendas.length > 0) {
            vendas.forEach(venda => {
                const eProximoSorteio = venda.sorteio_id == proximoSorteioId;
                
                // ***** INÍCIO DA ATUALIZAÇÃO *****
                // Mostra "Ver Jogo Encerrado" como texto, não como botão desabilitado
                // ==================================================
                // --- INÍCIO DAS MODIFICAÇÕES (Lógica do Botão Entrar) ---
                // ==================================================
                // Agora verifica se é um sorteio especial ou regular
                
                let botaoHtml = '';
                if (venda.tipo_sorteio === 'especial_agendado') {
                    // Se for especial, o botão sempre diz "Ver Cartelas" e leva para a espera
                    // (A lógica de redirecionar para o JOGO só acontece quando o server mandar)
                     botaoHtml = `<button class="btn-comprar btn-entrar-jogo btn-destaque" data-venda-id="${venda.id}" data-nome="${venda.nome_jogador}">
                           Ver Cartelas (Especial)
                       </button>`;
                } else {
                    // Lógica antiga para sorteios regulares
                    botaoHtml = eProximoSorteio 
                        ? `<button class="btn-comprar btn-entrar-jogo btn-destaque" data-venda-id="${venda.id}" data-nome="${venda.nome_jogador}">
                               Entrar na Sala de Espera
                           </button>`
                        : `<span class="jogo-encerrado-info">Jogo Encerrado</span>`;
                }
                
                // Define um texto para o tipo de sorteio
                const tipoTexto = venda.tipo_sorteio === 'especial_agendado' 
                    ? '<span style="color:var(--color-pix-green); font-weight:bold;">(Sorteio Especial)</span>' 
                    : '(Sorteio Regular)';

                // ==================================================
                // --- FIM DAS MODIFICAÇÕES ---
                // ==================================================
                
                // Salva o nome e telefone do jogador da primeira venda válida
                if (!sessionStorage.getItem('bingo_usuario_nome')) {
                    sessionStorage.setItem('bingo_usuario_nome', venda.nome_jogador);
                }
                
                htmlInterno += `
                    <div class="cartela-encontrada-item">
                        <div class="cartela-info-wrapper">
                            <span class="sorteio-id">Sorteio #${venda.sorteio_id} ${tipoTexto}</span>
                            <span class="sorteio-qtd">${venda.quantidade_cartelas} cartela(s)</span>
                            <span class="sorteio-data">Comprada em: ${venda.data_formatada}</span>
                        </div>
                        ${botaoHtml} 
                    </div>
                `;
            });
        } else {
            htmlInterno += `<p>Nenhuma compra recente encontrada para este telefone.</p>`;
        }

        htmlInterno += `
                </div>
            </div>
        `;
        
        modalResultados.innerHTML = htmlInterno;
        document.body.appendChild(modalResultados);

        // Adiciona eventos de clique ao novo modal
        modalResultados.addEventListener('click', (e) => {
            // Fechar modal
            if (e.target.id === 'modal-resultados-fechar' || e.target === modalResultados) {
                modalResultados.remove();
                modalResultados = null;
            }

            // Clicar no botão "Entrar" (Funciona para ambos os tipos agora)
            if (e.target.classList.contains('btn-entrar-jogo')) {
                const vendaId = e.target.dataset.vendaId;
                const nome = e.target.dataset.nome;
                
                // Salva o nome para a próxima página
                sessionStorage.setItem('bingo_usuario_nome', nome);
                // Redireciona para a sala de espera com o ID da Venda
                // A sala de espera.js vai lidar com o timer (seja regular ou especial)
                window.location.href = `espera.html?venda=${vendaId}`;
            }
        });
    }

    // ***** INÍCIO DA ATUALIZAÇÃO (Novo Modal de Prêmios) *****
    let modalPremios = null; // Guarda a referência
    
    function criarModalPremios(premios) {
        if (modalPremios) {
            modalPremios.remove();
        }
        modalPremios = document.createElement('div');
        modalPremios.classList.add('modal-overlay');
        modalPremios.style.display = 'flex';

        let htmlInterno = `
            <div class="modal-content" style="max-width: 600px;">
                <span class="modal-close" id="modal-premios-fechar">&times;</span>
                <h2 class="title-gradient">Meus Prêmios</h2>
                <div id="modal-meus-premios-lista">
        `;

        if (premios && premios.length > 0) {
            htmlInterno += `<p style="text-align: center; font-weight: bold; font-size: 1.1em; color: var(--color-pix-green);">Parabéns! Encontramos ${premios.length} prêmio(s) no seu número!</p>`;
            premios.forEach(premio => {
                const statusClasse = premio.status_pagamento === 'Pendente' ? 'status-pendente' : 'status-pago';
                htmlInterno += `
                    <div class="cartela-encontrada-item" style="border-left: 4px solid var(--color-pix-green);">
                        <div class="cartela-info-wrapper">
                            <span class="sorteio-id">Prêmio: ${premio.premio}</span>
                            <span class="sorteio-qtd">Sorteio #${premio.sorteio_id} (Nome: ${premio.nome})</span>
                            <span class="sorteio-data">Data: ${premio.data_formatada}</span>
                        </div>
                        <span class="status-pagamento ${statusClasse}" style="font-size: 0.9em; flex-shrink: 0;">${premio.status_pagamento}</span>
                    </div>
                `;
            });
            htmlInterno += `<p style="text-align: center; margin-top: 15px; font-size: 0.9em;">Se o status estiver "Pendente", entre em contato com a administração para receber.</p>`;
        } else {
            // Isso não deve acontecer se a 'data.success' for false, mas é um fallback.
            htmlInterno += `<p>Nenhum prêmio encontrado.</p>`;
        }

        htmlInterno += `
                </div>
            </div>
        `;
        modalPremios.innerHTML = htmlInterno;
        document.body.appendChild(modalPremios);

        modalPremios.addEventListener('click', (e) => {
            if (e.target.id === 'modal-premios-fechar' || e.target === modalPremios) {
                modalPremios.remove();
                modalPremios = null;
            }
        });
    }
    // ***** FIM DA ATUALIZAÇÃO (Novo Modal de Prêmios) *****


    // 3. Adiciona o listener ao formulário
    if (formRecuperar && inputTelefoneRecuperar && btnRecuperar && socket) {
        
        formRecuperar.addEventListener('submit', (e) => {
            e.preventDefault();
            const telefone = inputTelefoneRecuperar.value.trim();
            
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) {
                alert("Telefone inválido. Digite apenas números, incluindo o DDD (Ex: 69999658548).");
                return;
            }

            // ***** INÍCIO DA ATUALIZAÇÃO *****
            // Desabilita os dois botões
            btnRecuperar.disabled = true;
            btnChecarPremios.disabled = true;
            btnRecuperar.textContent = 'Buscando...';
            // ***** FIM DA ATUALIZAÇÃO *****


            // Salva o telefone para usar na próxima compra
            sessionStorage.setItem('bingo_usuario_telefone', telefone);

            socket.emit('buscarCartelasPorTelefone', { telefone }, (data) => {
                // ***** INÍCIO DA ATUALIZAÇÃO *****
                // Reabilita os dois botões
                btnRecuperar.disabled = false;
                btnChecarPremios.disabled = false;
                btnRecuperar.textContent = 'Ver Minhas Compras';
                // ***** FIM DA ATUALIZAÇÃO *****

                if (data.success) {
                    criarModalResultados(data.vendas, data.proximoSorteioId);
                } else {
                    alert(data.message || 'Erro ao buscar cartelas.');
                }
            });
        });

    } else {
        console.warn("Elementos de 'Recuperar Cartelas' não foram encontrados.");
    }
    
    // ***** INÍCIO DA ATUALIZAÇÃO (Listener do novo botão) *****
    if (btnChecarPremios && inputTelefoneRecuperar && btnRecuperar && socket) {
        
        btnChecarPremios.addEventListener('click', () => {
            const telefone = inputTelefoneRecuperar.value.trim();
            
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) {
                alert("Telefone inválido. Digite apenas números, incluindo o DDD (Ex: 69999658548).");
                return;
            }

            // Desabilita os dois botões
            btnRecuperar.disabled = true;
            btnChecarPremios.disabled = true;
            btnChecarPremios.textContent = 'Verificando...';

            socket.emit('checarMeusPremios', { telefone }, (data) => {
                // Reabilita os botões
                btnRecuperar.disabled = false;
                btnChecarPremios.disabled = false;
                btnChecarPremios.textContent = 'Verificar Prêmios';

                if (data.success) {
                    // SUCESSO! Encontrou prêmios.
                    criarModalPremios(data.premios);
                } else {
                    // FALHA! Não encontrou.
                    alert(data.message || 'Nenhum prêmio encontrado para este telefone.');
                }
            });
        });
    }
    // ***** FIM DA ATUALIZAÇÃO (Listener do novo botão) *****
    
    // ==========================================================
    // ===== FIM DO NOVO CÓDIGO "RECUPERAR CARTELAS" =====
    // ==========================================================

});