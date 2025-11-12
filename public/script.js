document.addEventListener('DOMContentLoaded', () => {

    // --- CÓDIGO DO MODAL DE MANUTENÇÃO REMOVIDO ---

    // ==================================================
    // --- INÍCIO DA MODIFICAÇÃO (CAPTURA DE AFILIADO) ---
    // ==================================================
    const urlParamsGlobal = new URLSearchParams(window.location.search);
    const refCodeGlobal = urlParamsGlobal.get('ref'); // ?ref=USUARIO

    if (refCodeGlobal) {
        console.log(`Link de referência detectado: ${refCodeGlobal}`);
        // Salva no sessionStorage para não perder se o usuário recarregar
        sessionStorage.setItem('bingo_ref_code', refCodeGlobal);
    }
    // ==================================================
    // --- FIM DA MODIFICAÇÃO (CAPTURA DE AFILIADO) ---
    // ==================================================

    let socket;
    try { 
        socket = io(); 
        console.log("Conectado ao servidor Socket.IO."); 
    }
    catch (err) { console.error("Erro ao conectar ao Socket.IO:", err); alert("Erro de conexão com o servidor. Recarregue."); }

    // --- Variáveis Globais para Preço (será atualizada) ---
    let PRECO_CARTELA_ATUAL = 5.00; // Valor padrão inicial
    let PRECO_CARTELA_ESPECIAL_ATUAL = 10.00; // Valor padrão inicial
    let TIPO_COMPRA_ATUAL = 'regular'; // Controla qual tipo de compra está no modal

    // --- Seletores do DOM ---
    const modal = document.getElementById('modal-checkout');
    const btnCloseModal = document.querySelector('.modal-close');
    const btnJogueAgora = document.getElementById('btn-jogue-agora');
    
    const btnJogueEspecial = document.getElementById('btn-jogue-especial'); // Botão novo
    
    // --- ================================================== ---
    // --- INÍCIO DA MODIFICAÇÃO (Novos Seletores) ---
    // --- ================================================== ---
    const modalTitulo = document.getElementById('modal-titulo') || document.getElementById('modal-titulo-sorteio'); // Pega o ID novo ou antigo
    const premioInfoContainer = document.getElementById('premio-info'); // O box do sorteio REGULAR
    // --- ================================================== ---
    // --- FIM DA MODIFICAÇÃO ---
    // --- ================================================== ---

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

    const especialPrecoCartelaEl = document.getElementById('especial-preco-cartela'); // Span no botão especial

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

    // --- ================================================== ---
    // --- INÍCIO DA MODIFICAÇÃO (BOTÃO REGULAR APARECENDO) ---
    // --- ================================================== ---
    function atualizarValoresExibidos(data) {
        if (!data) return;
        console.log("Atualizando exibição de valores:", data);
        
        // Sorteio Padrão
        if(indexPremioLinhaEl) indexPremioLinhaEl.textContent = formatarBRL(data.premio_linha);
        if(indexPremioCheiaEl) indexPremioCheiaEl.textContent = formatarBRL(data.premio_cheia);

        const novoPreco = parseFloat(data.preco_cartela);
        if (!isNaN(novoPreco) && novoPreco > 0) {
            PRECO_CARTELA_ATUAL = novoPreco;
            const precoFormatado = formatarBRL(PRECO_CARTELA_ATUAL);
            if(indexPrecoCartelaEl) indexPrecoCartelaEl.textContent = precoFormatado;
        }
        
        // --- LÓGICA DO SORTEIO ESPECIAL (ATUALIZADA) ---
        if (data.sorteio_especial_ativo === 'true' && data.sorteio_especial_datahora) {
            // Se o sorteio especial está ATIVO:
            
            // 1. Mostra o box do Sorteio Especial
            if (especialValorEl) especialValorEl.textContent = formatarBRL(data.sorteio_especial_valor);
            
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

            const novoPrecoEspecial = parseFloat(data.sorteio_especial_preco_cartela);
            if (!isNaN(novoPrecoEspecial) && novoPrecoEspecial > 0) {
                PRECO_CARTELA_ESPECIAL_ATUAL = novoPrecoEspecial;
                if(especialPrecoCartelaEl) especialPrecoCartelaEl.textContent = formatarBRL(PRECO_CARTELA_ESPECIAL_ATUAL);
            }
            
            if (premioEspecialContainer) premioEspecialContainer.style.display = 'block'; // Mostra o especial
            
            // 2. MOSTRA o box do Sorteio Regular (para testes)
            if (premioInfoContainer) premioInfoContainer.style.display = 'block'; // <-- ESTA LINHA PERMITE TESTES

        } else {
            // Se o sorteio especial está INATIVO:
            
            // 1. Esconde o box do Sorteio Especial
            if (premioEspecialContainer) premioEspecialContainer.style.display = 'none'; 
            
            // 2. MOSTRA o box do Sorteio Regular
            if (premioInfoContainer) premioInfoContainer.style.display = 'block';
        }
        
        // Recalcula o total no modal (caso esteja aberto e os preços mudem)
        atualizarPrecoTotalModal();
    }
    // --- ================================================== ---
    // --- FIM DA MODIFICAÇÃO ---
    // --- ================================================== ---

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
            if (estado === 'JOGANDO_LINHA') {
                textoEstado = 'AO VIVO: VALENDO LINHA!';
            } else if (estado === 'JOGANDO_CHEIA') {
                textoEstado = 'AO VIVO: VALENDO CARTELA CHEIA!';
            } else if (estado === 'ANUNCIANDO_VENCEDOR') {
                textoEstado = 'AO VIVO: ANUNCIANDO VENCEDOR!';
            }
            
            statusTitulo.textContent = textoEstado;
            if (statusCronometro) statusCronometro.style.display = 'none';
            if (statusSubtexto) statusSubtexto.textContent = 'As compras agora valem para o próximo sorteio.';
            if (btnAssistirVivo) btnAssistirVivo.style.display = 'block'; 

            if (btnJogueAgora) btnJogueAgora.innerHTML = `Comprar p/ Próximo Sorteio (<span id="index-preco-cartela">${formatarBRL(PRECO_CARTELA_ATUAL)}</span>)`;
        }
    }

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
        currentPaymentId = null;
    }

    function fecharModal() { 
        if(modal) modal.style.display = 'none'; 
        if(etapaDados) etapaDados.style.display = 'block';
        if(etapaPix) etapaPix.style.display = 'none';
        if(btnGerarPix) { 
            btnGerarPix.disabled = false; 
            btnGerarPix.textContent = "Gerar PIX"; 
        } 
        
        if(pixQrContainer) pixQrContainer.style.display = 'block';
        if(pixCopiaContainer) pixCopiaContainer.style.display = 'block';
        
        pararVerificadorPagamento(); 
    }

    // --- ================================================== ---
    // --- INÍCIO DA MODIFICAÇÃO (Listeners dos botões) ---
    // --- ================================================== ---
    
    if (btnJogueAgora && modal) {
        btnJogueAgora.addEventListener('click', () => {
            console.log("Botão 'Jogue Agora!' (Regular) clicado.");
            TIPO_COMPRA_ATUAL = 'regular';
            if(modalTitulo) modalTitulo.textContent = 'Complete seu Pedido';
            
            modal.style.display = 'flex';
            atualizarPrecoTotalModal();
             if(modalNome) modalNome.focus();
        });
    } else { console.warn("Aviso: Botão 'Jogue Agora' (regular) ou Modal não encontrado."); }

    if (btnJogueEspecial && modal) {
        btnJogueEspecial.addEventListener('click', () => {
            console.log("Botão 'Jogue Agora!' (Especial) clicado.");
            TIPO_COMPRA_ATUAL = 'especial';
            if(modalTitulo) modalTitulo.textContent = 'Sorteio Especial';
            
            modal.style.display = 'flex';
            atualizarPrecoTotalModal();
             if(modalNome) modalNome.focus();
        });
    } else { console.warn("Aviso: Botão 'Jogue Especial' ou Modal não encontrado."); }
    

    function atualizarPrecoTotalModal() {
        if (!modalQuantidadeInput || !modalPrecoEl || !modalLabelPrecoEl) return;
        
        const precoUnitario = (TIPO_COMPRA_ATUAL === 'especial') 
            ? PRECO_CARTELA_ESPECIAL_ATUAL 
            : PRECO_CARTELA_ATUAL;
            
        modalLabelPrecoEl.textContent = formatarBRL(precoUnitario);
        
        let quantidade = parseInt(modalQuantidadeInput.value);
        quantidade = (!quantidade || quantidade < 1) ? 1 : quantidade;
        
        const precoTotal = quantidade * precoUnitario; 
        modalPrecoEl.textContent = formatarBRL(precoTotal);
    }
    // --- ================================================== ---
    // --- FIM DA MODIFICAÇÃO ---
    // --- ================================================== ---
    
    
    if(modalQuantidadeInput) {
        modalQuantidadeInput.addEventListener('input', atualizarPrecoTotalModal);
        modalQuantidadeInput.addEventListener('change', atualizarPrecoTotalModal);
    }

    if(btnCloseModal) btnCloseModal.addEventListener('click', fecharModal);
    if(modal) modal.addEventListener('click', (event) => { if (event.target === modal) fecharModal(); });

    if (btnGerarPix && modalNome && modalTelefone && modalQuantidadeInput && socket) {
        btnGerarPix.addEventListener('click', () => {
            const nome = modalNome.value.trim(); const telefone = modalTelefone.value.trim(); const quantidade = parseInt(modalQuantidadeInput.value);
            if (!nome || !telefone || !quantidade || quantidade < 1) { alert("Preencha todos os campos."); return; }
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) { alert("Telefone inválido."); return; }
            
            console.log(`Solicitando PIX para compra do tipo: ${TIPO_COMPRA_ATUAL}`); 
            btnGerarPix.textContent = "Gerando..."; 
            btnGerarPix.disabled = true;
            
            if(pixQrContainer) pixQrContainer.style.display = 'block';
            if(pixCopiaContainer) pixCopiaContainer.style.display = 'block';

            // --- ================================================== ---
            // --- INÍCIO DA MODIFICAÇÃO (Lógica de emissão) ---
            // --- ================================================== ---
            const eventoSocket = (TIPO_COMPRA_ATUAL === 'especial') 
                ? 'criarPagamentoEspecial' 
                : 'criarPagamento';
                
            sessionStorage.setItem('bingo_tipo_compra', TIPO_COMPRA_ATUAL);
            
            // Pega o código de referência salvo
            const refCodeAtual = sessionStorage.getItem('bingo_ref_code');

            socket.emit(eventoSocket, { nome, telefone, quantidade, refCode: refCodeAtual }, (data) => {
            // --- ================================================== ---
            // --- FIM DA MODIFICAÇÃO ---
            // --- ================================================== ---
                
                if (data && data.success) {
                    console.log("PIX Recebido, Payment ID:", data.paymentId);

                    pixQrCodeImg.src = `data:image/png;base64,${data.qrCodeBase64}`;
                    pixQrCodeImg.style.display = 'block';

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
                    sessionStorage.removeItem('bingo_tipo_compra'); 
                }
            });
        });
    } else { console.error("Erro: Elementos do modal ou socket não encontrados para 'Gerar PIX'."); }
    
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
             atualizarStatusBox(data.estado, data.tempoRestante); 
        });

        socket.on('cronometroUpdate', (data) => {
            if (data.estado === 'ESPERANDO') {
                atualizarStatusBox(data.estado, data.tempo);
            }
        });

        socket.on('estadoJogoUpdate', (data) => {
            atualizarStatusBox(data.estado, 0);
        });

        socket.on('pagamentoAprovado', (data) => {
            console.log(`Pagamento Aprovado! Venda ID: ${data.vendaId}`);
            
            pararVerificadorPagamento(); 
            sessionStorage.removeItem('bingo_payment_id'); 
            
            const nomeSalvo = sessionStorage.getItem('bingo_usuario_nome');
            if (nomeSalvo !== data.nome) {
                 console.warn("Pagamento aprovado, mas o nome não bate. Ignorando.");
                 return;
            }
            
            // --- ================================================== ---
            // --- INÍCIO DA MODIFICAÇÃO (Lógica de redirecionamento) ---
            // --- ================================================== ---
            const tipoCompraSalvo = sessionStorage.getItem('bingo_tipo_compra') || 'regular';
            sessionStorage.removeItem('bingo_tipo_compra'); 
            
            if(modalNome) modalNome.value = ""; 
            if(modalTelefone) modalTelefone.value = ""; 
            if(modalQuantidadeInput) modalQuantidadeInput.value = "1";
            
            if (modal && modal.style.display === 'flex' && etapaPix && etapaPix.style.display === 'block') {
                fecharModal();
                
                if (tipoCompraSalvo === 'especial') {
                    alert("Pagamento confirmado!\n\Suas cartelas para o Sorteio Especial estão garantidas. Você pode consultá-las a qualquer momento na seção 'Ver Minhas Compras'.");
                } else {
                    alert("Pagamento confirmado!\n\nCartelas geradas.\nIndo para a sala de espera.");
                    window.location.href = `espera.html?venda=${data.vendaId}`;
                }
            } else if (tipoCompraSalvo === 'regular') {
                window.location.href = `espera.html?venda=${data.vendaId}`;
            }
            // --- ================================================== ---
            // --- FIM DA MODIFICAÇÃO ---
            // --- ================================================== ---
        });

        socket.on('pagamentoErro', (data) => {
            alert(`Erro no servidor de pagamento: ${data.message}`);
            pararVerificadorPagamento();
            sessionStorage.removeItem('bingo_payment_id'); 
            sessionStorage.removeItem('bingo_tipo_compra'); 
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
    
    const paymentIdSalvo = sessionStorage.getItem('bingo_payment_id');
    if (paymentIdSalvo) {
        console.log(`Encontrado paymentId ${paymentIdSalvo} no sessionStorage ao carregar. Iniciando verificador.`);
        if (modal) modal.style.display = 'flex';
        if (etapaDados) etapaDados.style.display = 'none';
        if (etapaPix) etapaPix.style.display = 'block';
        if (aguardandoPagamentoEl) aguardandoPagamentoEl.style.display = 'block';

        if(pixQrContainer) pixQrContainer.style.display = 'none';
        if(pixCopiaContainer) pixCopiaContainer.style.display = 'none';
        
        iniciarVerificadorPagamento(paymentIdSalvo);
    }

    
    const formRecuperar = document.getElementById('form-recuperar-cartelas');
    const inputTelefoneRecuperar = document.getElementById('modal-telefone-recuperar');
    const btnRecuperar = document.getElementById('btn-recuperar-cartelas');
    
    const btnChecarPremios = document.getElementById('btn-checar-premios');
    
    let modalResultados = null;
    
    function criarModalResultados(vendas, proximoSorteioId) {
        if (modalResultados) {
            modalResultados.remove();
        }

        modalResultados = document.createElement('div');
        modalResultados.classList.add('modal-overlay');
        modalResultados.style.display = 'flex';

        let htmlInterno = `
            <div class="modal-content">
                <span class="modal-close" id="modal-resultados-fechar">&times;</span>
                <h2 class="title-gradient">Minhas Compras</h2>
                <div id="modal-minhas-cartelas-lista">
        `;

        if (vendas && vendas.length > 0) {
            vendas.forEach(venda => {
                const eProximoSorteio = venda.sorteio_id == proximoSorteioId;
                
                // --- ================================================== ---
                // --- INÍCIO DA MODIFICAÇÃO (Lógica do Botão Entrar) ---
                // --- ================================================== ---
                
                let botaoHtml = '';
                if (venda.tipo_sorteio === 'especial_agendado') {
                     botaoHtml = `<button class="btn-comprar btn-entrar-jogo btn-destaque" data-venda-id="${venda.id}" data-nome="${venda.nome_jogador}">
                           Ver Cartelas (Especial)
                       </button>`;
                } else {
                    botaoHtml = eProximoSorteio 
                        ? `<button class="btn-comprar btn-entrar-jogo btn-destaque" data-venda-id="${venda.id}" data-nome="${venda.nome_jogador}">
                               Entrar na Sala de Espera
                           </button>`
                        : `<span class="jogo-encerrado-info">Jogo Encerrado</span>`;
                }
                
                const tipoTexto = venda.tipo_sorteio === 'especial_agendado' 
                    ? '<span style="color:var(--color-pix-green); font-weight:bold;">(Sorteio Especial)</span>' 
                    : '(Sorteio Regular)';

                // --- ================================================== ---
                // --- FIM DA MODIFICAÇÃO ---
                // --- ================================================== ---
                
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

        modalResultados.addEventListener('click', (e) => {
            if (e.target.id === 'modal-resultados-fechar' || e.target === modalResultados) {
                modalResultados.remove();
                modalResultados = null;
            }

            if (e.target.classList.contains('btn-entrar-jogo')) {
                const vendaId = e.target.dataset.vendaId;
                const nome = e.target.dataset.nome;
                
                sessionStorage.setItem('bingo_usuario_nome', nome);
                window.location.href = `espera.html?venda=${vendaId}`;
            }
        });
    }

    let modalPremios = null; 
    
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

    if (formRecuperar && inputTelefoneRecuperar && btnRecuperar && socket) {
        
        formRecuperar.addEventListener('submit', (e) => {
            e.preventDefault();
            const telefone = inputTelefoneRecuperar.value.trim();
            
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) {
                alert("Telefone inválido. Digite apenas números, incluindo o DDD (Ex: 69999658548).");
                return;
            }

            btnRecuperar.disabled = true;
            if (btnChecarPremios) btnChecarPremios.disabled = true;
            btnRecuperar.textContent = 'Buscando...';

            sessionStorage.setItem('bingo_usuario_telefone', telefone);

            socket.emit('buscarCartelasPorTelefone', { telefone }, (data) => {
                btnRecuperar.disabled = false;
                if (btnChecarPremios) btnChecarPremios.disabled = false;
                btnRecuperar.textContent = 'Ver Minhas Compras';

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
    
    if (btnChecarPremios && inputTelefoneRecuperar && btnRecuperar && socket) {
        
        btnChecarPremios.addEventListener('click', () => {
            const telefone = inputTelefoneRecuperar.value.trim();
            
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) {
                alert("Telefone inválido. Digite apenas números, incluindo o DDD (Ex: 69999658548).");
                return;
            }

            if (btnRecuperar) btnRecuperar.disabled = true;
            btnChecarPremios.disabled = true;
            btnChecarPremios.textContent = 'Verificando...';

            socket.emit('checarMeusPremios', { telefone }, (data) => {
                if (btnRecuperar) btnRecuperar.disabled = false;
                btnChecarPremios.disabled = false;
                btnChecarPremios.textContent = 'Verificar Prêmios';

                if (data.success) {
                    criarModalPremios(data.premios);
                } else {
                    alert(data.message || 'Nenhum prêmio encontrado para este telefone.');
                }
            });
        });
    }
    
});
