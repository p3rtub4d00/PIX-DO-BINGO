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
    const pixQrCodeImg = document.getElementById('pix-qrcode-img');
    const pixCopiaColaInput = document.getElementById('pix-copia-cola');
    const btnCopiarPix = document.getElementById('btn-copiar-pix');
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

    // --- Função para Fechar o Modal ---
    function fecharModal() { 
        if(modal) modal.style.display = 'none'; 
        // Reseta o modal para a etapa 1
        if(etapaDados) etapaDados.style.display = 'block';
        if(etapaPix) etapaPix.style.display = 'none';
        if(btnGerarPix) { 
            btnGerarPix.disabled = false; 
            btnGerarPix.textContent = "Gerar PIX"; 
        } 
    }

    // --- Event Listener para ABRIR o Modal ---
    if (btnJogueAgora && modal) {
        btnJogueAgora.addEventListener('click', () => {
            console.log("Botão 'Jogue Agora!' clicado.");
            modal.style.display = 'flex';
            atualizarPrecoTotalModal(); // Calcula o preço total inicial (para 1 cartela)
             if(modalNome) modalNome.focus();
        });
    } else { console.error("Erro: Botão 'Jogue Agora' ou Modal não encontrado."); }

    // --- Event Listener para CALCULAR o Preço TOTAL no Modal ---
    function atualizarPrecoTotalModal() {
        if (!modalQuantidadeInput || !modalPrecoEl) return;
        let quantidade = parseInt(modalQuantidadeInput.value);
        quantidade = (!quantidade || quantidade < 1) ? 1 : quantidade;
        const precoTotal = quantidade * PRECO_CARTELA_ATUAL; // Usa preço global
        modalPrecoEl.textContent = formatarBRL(precoTotal);
    }
    if(modalQuantidadeInput) {
        modalQuantidadeInput.addEventListener('input', atualizarPrecoTotalModal);
        modalQuantidadeInput.addEventListener('change', atualizarPrecoTotalModal);
    }

    // --- Event Listeners para Fechar o Modal ---
    if(btnCloseModal) btnCloseModal.addEventListener('click', fecharModal);
    if(modal) modal.addEventListener('click', (event) => { if (event.target === modal) fecharModal(); });

    // --- Event Listener para GERAR PIX (Substitui a simulação) ---
    if (btnGerarPix && modalNome && modalTelefone && modalQuantidadeInput && socket) {
        btnGerarPix.addEventListener('click', () => {
            const nome = modalNome.value.trim(); const telefone = modalTelefone.value.trim(); const quantidade = parseInt(modalQuantidadeInput.value);
            if (!nome || !telefone || !quantidade || quantidade < 1) { alert("Preencha todos os campos."); return; }
            if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) { alert("Telefone inválido."); return; }
            
            console.log("Solicitando PIX..."); 
            btnGerarPix.textContent = "Gerando..."; 
            btnGerarPix.disabled = true;

            socket.emit('criarPagamento', { nome, telefone, quantidade }, (data) => {
                
                if (data && data.success) {
                    console.log("PIX Recebido:", data);
                    // Preenche os dados do PIX
                    pixQrCodeImg.src = `data:image/png;base64,${data.qrCodeBase64}`;
                    pixCopiaColaInput.value = data.qrCodeCopiaCola;
                    
                    // Muda para a etapa 2
                    etapaDados.style.display = 'none';
                    etapaPix.style.display = 'block';
                    aguardandoPagamentoEl.style.display = 'block';

                } else {
                    alert(`Erro: ${data.message || 'Não foi possível gerar o PIX.'}`);
                    btnGerarPix.textContent = "Gerar PIX"; 
                    btnGerarPix.disabled = false;
                }
            });
        });
    } else { console.error("Erro: Elementos do modal ou socket não encontrados para 'Gerar PIX'."); }
    
    // --- Botão de Copiar PIX ---
    if(btnCopiarPix && pixCopiaColaInput) {
        btnCopiarPix.addEventListener('click', () => {
            pixCopiaColaInput.select();
            try {
                navigator.clipboard.writeText(pixCopiaColaInput.value); // API moderna
                btnCopiarPix.textContent = "Copiado!";
                setTimeout(() => { btnCopiarPix.textContent = "Copiar Código"; }, 2000);
            } catch (err) {
                // Fallback para document.execCommand
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

    // --- Ouvinte Socket.IO para Atualização de Configs ---
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
        });

        // *** INÍCIO DA ATUALIZAÇÃO (Ouvinte de Pagamento) ***
        socket.on('pagamentoAprovado', (data) => {
            // data agora é: { vendaId, nome, telefone }
            console.log(`Pagamento Aprovado! Venda ID: ${data.vendaId}`);
            
            // Salva os dados no sessionStorage para a próxima página
            // NÃO salvamos mais as cartelas aqui.
            sessionStorage.setItem('bingo_usuario_nome', data.nome); 
            sessionStorage.setItem('bingo_usuario_telefone', data.telefone);
            
            alert("Pagamento confirmado!\n\nCartelas geradas.\nIndo para a sala de espera.");
            
            fecharModal(); 
            modalNome.value = ""; 
            modalTelefone.value = ""; 
            modalQuantidadeInput.value = "1";
            
            // Redireciona para a sala de espera, passando o ID da Venda na URL
            window.location.href = `espera.html?venda=${data.vendaId}`;
        });
        // *** FIM DA ATUALIZAÇÃO ***

        socket.on('pagamentoErro', (data) => {
            alert(`Erro no pagamento: ${data.message}`);
            fecharModal(); // Fecha o modal para o usuário tentar de novo
        });
    }
});
