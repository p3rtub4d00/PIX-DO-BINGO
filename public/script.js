document.addEventListener('DOMContentLoaded', () => {

    let socket;
    try { 
        socket = io(); 
        console.log("Conectado ao servidor Socket.IO."); 
    }
    catch (err) { console.error("Erro ao conectar ao Socket.IO:", err); alert("Erro de conexão com o servidor. Recarregue."); }

    // --- Variáveis Globais para o Sorteio Selecionado ---
    let sorteioSelecionadoId = null;
    let sorteioSelecionadoPreco = 0;
    let sorteioSelecionadoNome = "";

    // --- Seletores do DOM ---
    const modal = document.getElementById('modal-checkout');
    const btnCloseModal = document.querySelector('.modal-close');
    
    // NOVO: Container dos sorteios
    const sorteiosContainer = document.getElementById('sorteios-disponiveis-container');

    // Seletores do Modal
    const etapaDados = document.getElementById('etapa-dados');
    const etapaPix = document.getElementById('etapa-pix');
    const btnGerarPix = document.getElementById('btn-gerar-pix'); 
    const modalTituloSorteio = document.getElementById('modal-titulo-sorteio'); // NOVO
    
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
    const modalLabelPrecoEl = document.getElementById('modal-label-preco'); // Span no label do modal
    
    // Seletores de Polling
    let pollerInterval = null; 
    let currentPaymentId = null; 

    // --- Função para formatar valor BRL ---
    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ --,--';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // ==========================================================
    // ===== INÍCIO DA ATUALIZAÇÃO (CARREGAR SORTEIOS) =====
    // ==========================================================

    // Função para criar o HTML de um card de sorteio
    function criarCardSorteio(sorteio) {
        const card = document.createElement('div');
        card.className = 'sorteio-card';
        card.dataset.id = sorteio.id;
        card.dataset.nome = sorteio.nome_sorteio;
        card.dataset.preco = sorteio.preco_cartela;
        
        let botaoClasse = 'btn-destaque'; // Padrão (verde)
        let botaoTexto = 'Comprar';
        let dataTexto = sorteio.data_sorteio_f;

        if (sorteio.is_regular) {
            if (sorteio.status !== 'ESPERANDO') {
                botaoTexto = 'Comprar (Próximo)';
                dataTexto = `<span style="color: red; font-weight: 900;">AO VIVO</span>`;
            } else {
                 dataTexto = `<span style="color: var(--color-pix-green); font-weight: 900;">${sorteio.data_sorteio_f}</span>`;
            }
        } else {
            // É agendado
            botaoClasse = 'btn-comprar-azul';
            botaoTexto = 'Comprar Adiantado';
        }

        card.innerHTML = `
            <div class="sorteio-info">
                <h2>${sorteio.nome_sorteio}</h2>
                <div class="sorteio-info-detalhes">
                    <span>Prêmio Cheia: <strong>${formatarBRL(sorteio.premio_cheia)}</strong></span>
                    <span>Prêmio Linha: <strong>${formatarBRL(sorteio.premio_linha)}</strong></span>
                    <span class="preco-cartela">Preço: <strong>${formatarBRL(sorteio.preco_cartela)}</strong></span>
                    <span>Sorteio: <strong>${dataTexto}</strong></span>
                </div>
            </div>
            <button class="btn-comprar btn-jogue ${botaoClasse}">${botaoTexto}</button>
        `;
        return card;
    }

    // Função para buscar e renderizar os sorteios
    async function carregarSorteiosDisponiveis() {
        if (!sorteiosContainer) return;
        sorteiosContainer.innerHTML = '<p>Carregando sorteios disponíveis...</p>'; // Feedback
        
        try {
            const response = await fetch('/api/sorteios-disponiveis');
            if (!response.ok) {
                throw new Error('Não foi possível buscar os sorteios.');
            }
            const data = await response.json();
            
            if (data.success && data.sorteios.length > 0) {
                sorteiosContainer.innerHTML = ''; // Limpa o "carregando"
                data.sorteios.forEach(sorteio => {
                    const card = criarCardSorteio(sorteio);
                    sorteiosContainer.appendChild(card);
                });
            } else {
                sorteiosContainer.innerHTML = '<p>Nenhum sorteio disponível no momento. Volte mais tarde!</p>';
            }
        } catch (error) {
            console.error("Erro ao carregar sorteios:", error);
            sorteiosContainer.innerHTML = `<p style="color: red;">Erro ao carregar sorteios. Tente recarregar a página.</p>`;
        }
    }
    
    // ==========================================================
    // ===== FIM DA ATUALIZAÇÃO (CARREGAR SORTEIOS) =====
    // ==========================================================


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

    // ==========================================================
    // ===== INÍCIO DA ATUALIZAÇÃO (ABRIR MODAL DINÂMICO) =====
    // ==========================================================
    
    // Delegação de evento para os botões "Comprar"
    if (sorteiosContainer && modal) {
        sorteiosContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-jogue')) {
                const card = e.target.closest('.sorteio-card');
                if (!card) return;

                // 1. Salva os dados do sorteio selecionado
                sorteioSelecionadoId = card.dataset.id;
                sorteioSelecionadoPreco = parseFloat(card.dataset.preco);
                sorteioSelecionadoNome = card.dataset.nome;
                
                console.log(`Abrindo modal para Sorteio #${sorteioSelecionadoId} (${sorteioSelecionadoNome}) - Preço: ${sorteioSelecionadoPreco}`);

                // 2. Atualiza a interface do Modal
                if (modalTituloSorteio) modalTituloSorteio.textContent = sorteioSelecionadoNome;
                if (modalLabelPrecoEl) modalLabelPrecoEl.textContent = formatarBRL(sorteioSelecionadoPreco);
                
                // 3. Abre o modal e foca no nome
                modal.style.display = 'flex';
                atualizarPrecoTotalModal(); // Usa a nova variável global
                if(modalNome) modalNome.focus();
            }
        });
    } else { console.error("Erro: Container de sorteios ou Modal não encontrado."); }

    function atualizarPrecoTotalModal() {
        if (!modalQuantidadeInput || !modalPrecoEl) return;
        let quantidade = parseInt(modalQuantidadeInput.value);
        quantidade = (!quantidade || quantidade < 1) ? 1 : quantidade;
        // ATUALIZADO: Usa o preço do sorteio selecionado
        const precoTotal = quantidade * sorteioSelecionadoPreco; 
        modalPrecoEl.textContent = formatarBRL(precoTotal);
    }
    // ==========================================================
    // ===== FIM DA ATUALIZAÇÃO (ABRIR MODAL DINÂMICO) =====
    // ==========================================================
    
    if(modalQuantidadeInput) {
        modalQuantidadeInput.addEventListener('input', atualizarPrecoTotalModal);
        modalQuantidadeInput.addEventListener('change', atualizarPrecoTotalModal);
    }

    if(btnCloseModal) btnCloseModal.addEventListener('click', fecharModal);
    if(modal) modal.addEventListener('click', (event) => { if (event.target === modal) fecharModal(); });

    // ==========================================================
    // ===== INÍCIO DA ATUALIZAÇÃO (GERAR PIX DINÂMICO) =====
    // ==========================================================
    if (btnGerarPix && modalNome && modalTelefone && modalQuantidadeInput && socket) {
        btnGerarPix.addEventListener('click', () => {
            const nome = modalNome.value.trim(); 
            const telefone = modalTelefone.value.trim(); 
            const quantidade = parseInt(modalQuantidadeInput.value);
            
            // Validação
            if (!nome || !telefone || !quantidade || quantidade < 1) { alert("Preencha todos os campos."); return; }
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) { alert("Telefone inválido."); return; }
            if (!sorteioSelecionadoId) { alert("Erro: Sorteio não selecionado. Feche este modal e tente novamente."); return; }

            console.log("Solicitando PIX..."); 
            btnGerarPix.textContent = "Gerando..."; 
            btnGerarPix.disabled = true;
            
            // Garante que os campos estão visíveis
            if(pixQrContainer) pixQrContainer.style.display = 'block';
            if(pixCopiaContainer) pixCopiaContainer.style.display = 'block';

            // Envia o ID do sorteio junto com os dados da compra
            const dadosCompra = {
                nome,
                telefone,
                quantidade,
                sorteioId: sorteioSelecionadoId // Envia o ID do sorteio
            };

            socket.emit('criarPagamento', dadosCompra, (data) => {
                
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
                }
            });
        });
    } else { console.error("Erro: Elementos do modal ou socket não encontrados para 'Gerar PIX'."); }
    // ==========================================================
    // ===== FIM DA ATUALIZAÇÃO (GERAR PIX DINÂMICO) =====
    // ==========================================================

    
    // Botão de Copiar (Sem alterações)
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
        
        // ATUALIZADO: Recarrega os sorteios quando conecta
        socket.on('connect', () => {
            console.log("Socket reconectado.");
            carregarSorteiosDisponiveis(); // Busca a lista nova de sorteios

            // Lógica de polling (sem alteração)
            const paymentIdSalvo = sessionStorage.getItem('bingo_payment_id');
            if (paymentIdSalvo) {
                console.log("Reconectado. Reiniciando verificador para paymentId salvo.");
                iniciarVerificadorPagamento(paymentIdSalvo);
            }
        });

        // ATUALIZADO: Recarrega os sorteios quando um jogo começa (para atualizar o status do regular)
        socket.on('iniciarJogo', () => {
             console.log("Recebido 'iniciarJogo'. Recarregando lista de sorteios.");
             carregarSorteiosDisponiveis();
        });

        // ATUALIZADO: Recarrega os sorteios quando o cronômetro roda (para atualizar o tempo)
        socket.on('cronometroUpdate', (data) => {
            // ATUALIZAÇÃO: Só recarrega a lista se o estado for 'ESPERANDO'
            if (data.estado === 'ESPERANDO' && data.tempo % 10 === 0) { // Atualiza a lista a cada 10 segundos
                 carregarSorteiosDisponiveis();
            }
        });
        
        // REMOVIDO: 'configAtualizada' e 'estadoInicial' não são mais necessários
        // para atualizar a UI de preços/status.

        // Ouvintes de pagamento e aba (sem alteração)
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
    // ===== CÓDIGO "RECUPERAR CARTELAS" (Sem alterações) =====
    // ==========================================================
    
    // 1. Seleciona o novo formulário e o botão
    const formRecuperar = document.getElementById('form-recuperar-cartelas');
    const inputTelefoneRecuperar = document.getElementById('modal-telefone-recuperar');
    const btnRecuperar = document.getElementById('btn-recuperar-cartelas');
    const btnChecarPremios = document.getElementById('btn-checar-premios');
    
    
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
                
                const botaoHtml = eProximoSorteio 
                    ? `<button class="btn-comprar btn-entrar-jogo btn-destaque" data-venda-id="${venda.id}" data-nome="${venda.nome_jogador}">
                           Entrar na Sala de Espera
                       </button>`
                    : `<span class="jogo-encerrado-info">Jogo Encerrado</span>`;
                
                // Salva o nome e telefone do jogador da primeira venda válida
                if (!sessionStorage.getItem('bingo_usuario_nome')) {
                    sessionStorage.setItem('bingo_usuario_nome', venda.nome_jogador);
                }
                
                htmlInterno += `
                    <div class="cartela-encontrada-item">
                        <div class="cartela-info-wrapper">
                            <span class="sorteio-id">Sorteio #${venda.sorteio_id}</span>
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

            // Clicar no botão "Entrar"
            if (e.target.classList.contains('btn-entrar-jogo')) {
                const vendaId = e.target.dataset.vendaId;
                const nome = e.target.dataset.nome;
                
                // Salva o nome para a próxima página
                sessionStorage.setItem('bingo_usuario_nome', nome);
                // Redireciona para a sala de espera com o ID da Venda
                window.location.href = `espera.html?venda=${vendaId}`;
            }
        });
    }

    
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


    // 3. Adiciona o listener ao formulário
    if (formRecuperar && inputTelefoneRecuperar && btnRecuperar && socket) {
        
        formRecuperar.addEventListener('submit', (e) => {
            e.preventDefault();
            const telefone = inputTelefoneRecuperar.value.trim();
            
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) {
                alert("Telefone inválido. Digite apenas números, incluindo o DDD (Ex: 69912345678).");
                return;
            }

            btnRecuperar.disabled = true;
            btnChecarPremios.disabled = true;
            btnRecuperar.textContent = 'Buscando...';


            // Salva o telefone para usar na próxima compra
            sessionStorage.setItem('bingo_usuario_telefone', telefone);

            socket.emit('buscarCartelasPorTelefone', { telefone }, (data) => {
                btnRecuperar.disabled = false;
                btnChecarPremios.disabled = false;
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
                alert("Telefone inválido. Digite apenas números, incluindo o DDD (Ex: 69912345678).");
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
    // ==========================================================
    // ===== FIM DO CÓDIGO "RECUPERAR CARTELAS" =====
    // ==========================================================


    // Carregamento inicial dos sorteios ao abrir a página
    carregarSorteiosDisponiveis();

});
