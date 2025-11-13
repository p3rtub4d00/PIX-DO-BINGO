document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================
    // == SELETORES GLOBAIS
    // ==========================================================
    const welcomeEl = document.getElementById('cambista-welcome');
    let cambistaUsername = ''; // Vamos salvar o nome de usuário aqui

    // --- Seletores de Venda Manual (Crédito) ---
    const saldoEl = document.getElementById('cambista-saldo');
    const formGerar = document.getElementById('form-gerar-cartelas-cambista');
    const nomeInput = document.getElementById('manual-nome');
    const telefoneInput = document.getElementById('manual-telefone');
    const quantidadeInput = document.getElementById('quantidade-manual');
    const custoVendaEl = document.getElementById('custo-venda');
    const btnGerar = document.getElementById('btn-gerar-manual');
    const vendaStatusEl = document.getElementById('venda-status');
    const previewContainer = document.getElementById('cartelas-preview-container');
    const avisoImpressao = document.getElementById('aviso-impressao');
    const btnImprimir = document.getElementById('btn-imprimir');
    
    // --- Seletores de Venda Online (Comissão/Afiliado) ---
    const linkAfiliadoInput = document.getElementById('link-afiliado');
    const btnCopiarLink = document.getElementById('btn-copiar-link');
    const comissaoPendenteEl = document.getElementById('comissao-pendente');
    const comissaoPagaEl = document.getElementById('comissao-paga');
    const tabelaComissoesCorpo = document.getElementById('tabela-comissoes-corpo');


    let precoPorCartela = 5.00; // Valor padrão, será atualizado

    // ==========================================================
    // == FUNÇÕES AUXILIARES
    // ==========================================================
    
    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ 0,00';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function mostrarStatus(elemento, mensagem, sucesso = true) {
        if (!elemento) return;
        elemento.textContent = mensagem;
        elemento.className = sucesso ? 'status-message status-success' : 'status-message status-error';
        elemento.style.display = 'block';
        setTimeout(() => { elemento.style.display = 'none'; }, 5000);
    }

    // ==========================================================
    // == CARREGAMENTO INICIAL (STATUS DO CAMBISTA)
    // ==========================================================
    async function carregarStatus() {
        try {
            const response = await fetch('/cambista/meu-status');
            if (!response.ok) {
                if(response.status === 403) { window.location.href = '/cambista/login.html'; }
                throw new Error('Falha ao carregar dados.');
            }
            const data = await response.json();

            if (data.success) {
                // Salva o nome de usuário para usar no link
                cambistaUsername = data.usuario; 
                
                welcomeEl.textContent = `Bem-vindo, ${data.usuario}!`;
                saldoEl.textContent = formatarBRL(data.saldo);
                precoPorCartela = parseFloat(data.precoCartela || '5.00'); 
                atualizarCustoVenda(); 
                
                // --- NOVO: Gera o link de afiliado ---
                gerarLinkAfiliado();
            } else {
                throw new Error(data.message);
            }
        } catch (err) {
            welcomeEl.textContent = "Erro ao carregar";
            saldoEl.textContent = "R$ --,--";
        }
    }

    // ==========================================================
    // == LÓGICA DE VENDA MANUAL (CRÉDITO)
    // ==========================================================
    
    function atualizarCustoVenda() {
        if (!quantidadeInput || !custoVendaEl) return;
        const qtd = parseInt(quantidadeInput.value) || 0;
        const custo = qtd * precoPorCartela;
        custoVendaEl.textContent = `Custo total desta venda: ${formatarBRL(custo)}`;
    }
    if(quantidadeInput) quantidadeInput.addEventListener('input', atualizarCustoVenda);

    if (formGerar) {
        formGerar.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = nomeInput.value.trim();
            const telefone = telefoneInput.value.trim();
            const quantidade = parseInt(quantidadeInput.value);

            if (!nome || !quantidade || quantidade < 1) {
                mostrarStatus(vendaStatusEl, 'Preencha o nome do jogador e a quantidade.', false);
                return;
            }
            if (!confirm(`Confirmar venda MANUAL de ${quantidade} cartela(s) para ${nome}? O valor será debitado dos seus créditos.`)) {
                return;
            }

            btnGerar.disabled = true;
            btnGerar.textContent = 'Gerando...';
            previewContainer.innerHTML = ''; 
            avisoImpressao.textContent = 'Gerando cartelas...';
            avisoImpressao.style.display = 'block'; 
            btnImprimir.style.display = 'none';

            try {
                const response = await fetch('/cambista/gerar-cartelas', { // Rota de venda manual
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ nome, telefone, quantidade }),
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    mostrarStatus(vendaStatusEl, 'Venda registrada! Cartelas geradas abaixo.', true);
                    formGerar.reset(); 
                    saldoEl.textContent = formatarBRL(data.novoSaldo); // Atualiza o saldo na tela
                    
                    data.cartelas.forEach(cartelaObj => {
                        previewContainer.appendChild(criarVisualCartela(cartelaObj, nome));
                    });
                    avisoImpressao.style.display = 'none';
                    btnImprimir.style.display = 'block';

                } else {
                    throw new Error(data.message || 'Erro desconhecido.');
                }
            } catch (error) {
                mostrarStatus(vendaStatusEl, error.message, false);
                avisoImpressao.textContent = `Erro: ${error.message}`;
            } finally {
                btnGerar.disabled = false;
                btnGerar.textContent = 'Gerar e Vender';
            }
        });
    }

    // Funções de Impressão (para venda manual)
    if(btnImprimir) btnImprimir.addEventListener('click', () => { window.print(); });

    // ==========================================================
    // ===== MODIFICAÇÃO: Função criarVisualCartela (CAMBISTA) =====
    // ==========================================================
    function criarVisualCartela(cartelaObj, nomeJogador) {
        const divCartela = document.createElement('div'); divCartela.classList.add('mini-cartela');
        
        // 1. Cabeçalho
        const header = document.createElement('div'); header.classList.add('mini-cartela-header');
        header.innerHTML = `
            <span class="nome-jogador">${nomeJogador || ''}</span>
            <span>Sorteio: #${cartelaObj?.s_id || '?'}</span>
            <span>ID: ${cartelaObj?.c_id || '?'}</span>
        `;
        divCartela.appendChild(header);
        
        // 2. Grid de Números
        const grid = document.createElement('div'); grid.classList.add('mini-cartela-grid');
        const matriz = cartelaObj?.data || [];
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                const numDiv = document.createElement('div'); numDiv.classList.add('mini-cartela-num');
                const valor = matriz[i]?.[j]; 
                if (valor === 'FREE') { numDiv.textContent = 'FREE'; numDiv.classList.add('free'); }
                else { numDiv.textContent = valor || '?'; }
                grid.appendChild(numDiv);
            }
        }
        divCartela.appendChild(grid); 
        
        // 3. Rodapé com o Aviso (ADICIONADO)
        const footer = document.createElement('div');
        footer.classList.add('mini-cartela-footer');
        footer.innerHTML = `
            <p><strong>Atenção:</strong> Em caso de prêmio (Linha ou Cheia), entre em contato pelo <strong>WhatsApp 69 99908-3361</strong> para resgatar. O pagamento do prêmio pode demorar ate 48h.</p>
        `;
        divCartela.appendChild(footer);
        // --- Fim da Modificação ---
        
        return divCartela;
    }
    // ==========================================================


    // ==========================================================
    // == LÓGICA DE VENDA ONLINE (AFILIADO/COMISSÃO)
    // ==========================================================

    function gerarLinkAfiliado() {
        if (!linkAfiliadoInput) return;
        // Gera o link completo baseado na URL atual, mas aponta para o index.html
        const urlBase = `${window.location.origin}/index.html`;
        linkAfiliadoInput.value = `${urlBase}?ref=${cambistaUsername}`;
    }

    if (btnCopiarLink) {
        btnCopiarLink.addEventListener('click', () => {
            linkAfiliadoInput.select();
            try {
                navigator.clipboard.writeText(linkAfiliadoInput.value);
                btnCopiarLink.textContent = "Copiado!";
                setTimeout(() => { btnCopiarLink.textContent = "Copiar Link"; }, 2000);
            } catch (err) {
                alert('Erro ao copiar. Selecione o link manualmente.');
            }
        });
    }
    
    async function carregarComissoes() {
        if (!tabelaComissoesCorpo || !comissaoPendenteEl || !comissaoPagaEl) return;

        try {
            const response = await fetch('/cambista/minhas-comissoes');
            if (!response.ok) {
                 if(response.status === 403) { window.location.href = '/cambista/login.html'; }
                 throw new Error('Falha ao carregar comissões.');
            }
            const data = await response.json();

            tabelaComissoesCorpo.innerHTML = '';
            
            if (data.success) {
                // Preenche os totais
                comissaoPendenteEl.textContent = formatarBRL(data.totais.total_pendente);
                comissaoPagaEl.textContent = formatarBRL(data.totais.total_pago);

                // Preenche a tabela
                if (data.comissoes.length > 0) {
                    data.comissoes.forEach(com => {
                        const linha = document.createElement('tr');
                        const statusClasse = com.status_pagamento === 'pendente' ? 'status-pendente' : 'status-pago';
                        
                        linha.innerHTML = `
                            <td class="col-data">${com.data_formatada}</td>
                            <td>${com.cliente_nome}</td>
                            <td class="col-valor">${formatarBRL(com.valor_venda)}</td>
                            <td class="col-valor" style="font-weight:bold; color:var(--color-pix-green);">${formatarBRL(com.valor_comissao)}</td>
                            <td class="col-status"><span class="status-pagamento ${statusClasse}">${com.status_pagamento}</span></td>
                        `;
                        tabelaComissoesCorpo.appendChild(linha);
                    });
                } else {
                    tabelaComissoesCorpo.innerHTML = `<tr><td colspan="5" style="text-align: center;">Nenhuma comissão online registrada.</td></tr>`;
                }
            } else {
                throw new Error(data.message || 'Erro ao processar dados de comissão.');
            }
        } catch (err) {
            tabelaComissoesCorpo.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">${err.message}</td></tr>`;
        }
    }


    // ==========================================================
    // == INICIALIZAÇÃO
    // ==========================================================
    carregarStatus();
    carregarComissoes();

});
