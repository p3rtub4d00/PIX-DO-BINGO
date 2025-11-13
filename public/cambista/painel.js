@@ -1,6 +1,6 @@
document.addEventListener('DOMContentLoaded', () => {

    // Seletores
    // Seletores Antigos
    const welcomeEl = document.getElementById('cambista-welcome');
    const saldoEl = document.getElementById('cambista-saldo');
    const formGerar = document.getElementById('form-gerar-cartelas-cambista');
@@ -14,6 +14,17 @@ document.addEventListener('DOMContentLoaded', () => {
    const avisoImpressao = document.getElementById('aviso-impressao');
    const btnImprimir = document.getElementById('btn-imprimir');

    // ==================================================
    // --- INÍCIO DA MODIFICAÇÃO (NOVOS SELETORES) ---
    // ==================================================
    const comissaoPendenteEl = document.getElementById('cambista-comissao-pendente');
    const linkAfiliadoInput = document.getElementById('cambista-link');
    const btnCopiarLink = document.getElementById('btn-copiar-link');
    const tabelaComissoesCorpo = document.getElementById('tabela-comissoes-corpo');
    // ==================================================
    // --- FIM DA MODIFICAÇÃO (NOVOS SELETORES) ---
    // ==================================================

    let precoPorCartela = 5.00; // Valor padrão, será atualizado

    // Função para formatar BRL
@@ -46,6 +57,18 @@ document.addEventListener('DOMContentLoaded', () => {
                saldoEl.textContent = formatarBRL(data.saldo);
                precoPorCartela = parseFloat(data.precoCartela || '5.00'); // Pega o preço da cartela
                atualizarCustoVenda(); // Atualiza o custo
                
                // ==================================================
                // --- INÍCIO DA MODIFICAÇÃO (EXIBIR LINK) ---
                // ==================================================
                if (linkAfiliadoInput) {
                    // Monta o link de afiliado
                    linkAfiliadoInput.value = window.location.origin + '/index.html?ref=' + data.usuario;
                }
                // ==================================================
                // --- FIM DA MODIFICAÇÃO (EXIBIR LINK) ---
                // ==================================================

            } else {
                throw new Error(data.message);
            }
@@ -63,7 +86,7 @@ document.addEventListener('DOMContentLoaded', () => {
    }
    quantidadeInput.addEventListener('input', atualizarCustoVenda);

    // 3. Listener do formulário "Gerar Venda"
    // 3. Listener do formulário "Gerar Venda" (Venda Física)
    formGerar.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = nomeInput.value.trim();
@@ -96,20 +119,17 @@ document.addEventListener('DOMContentLoaded', () => {
            const data = await response.json();

            if (response.ok && data.success) {
                // Sucesso!
                mostrarStatus(vendaStatusEl, 'Venda registrada! Cartelas geradas abaixo.', true);
                formGerar.reset(); // Limpa o formulário
                formGerar.reset(); 
                saldoEl.textContent = formatarBRL(data.novoSaldo); // Atualiza o saldo na tela

                // Renderiza as cartelas para impressão
                data.cartelas.forEach(cartelaObj => {
                    previewContainer.appendChild(criarVisualCartela(cartelaObj, nome));
                });
                avisoImpressao.style.display = 'none';
                btnImprimir.style.display = 'block';

            } else {
                // Erro (ex: saldo insuficiente)
                throw new Error(data.message || 'Erro desconhecido.');
            }
        } catch (error) {
@@ -147,6 +167,69 @@ document.addEventListener('DOMContentLoaded', () => {
        divCartela.appendChild(grid); return divCartela;
    }


    // ==================================================
    // --- INÍCIO DA MODIFICAÇÃO (FUNÇÕES DE AFILIADO) ---
    // ==================================================

    // 5. Botão de Copiar Link
    if (btnCopiarLink) {
        btnCopiarLink.addEventListener('click', () => {
            linkAfiliadoInput.select();
            try {
                navigator.clipboard.writeText(linkAfiliadoInput.value);
                btnCopiarLink.textContent = "Copiado!";
                setTimeout(() => { btnCopiarLink.textContent = "Copiar"; }, 2000);
            } catch (err) {
                alert('Erro ao copiar. Selecione manualmente.');
            }
        });
    }

    // 6. Carregar Comissões Online
    async function carregarComissoes() {
        if (!tabelaComissoesCorpo || !comissaoPendenteEl) return;

        try {
            const response = await fetch('/cambista/minhas-comissoes');
            if (!response.ok) throw new Error('Falha ao carregar comissões.');
            const data = await response.json();

            if (data.success) {
                // Atualiza o total pendente
                comissaoPendenteEl.textContent = formatarBRL(data.totalPendente);

                // Preenche a tabela
                tabelaComissoesCorpo.innerHTML = ''; // Limpa "Carregando..."
                if (data.comissoes.length > 0) {
                    data.comissoes.forEach(c => {
                        const statusClasse = c.status_pagamento === 'pendente' ? 'status-pendente' : 'status-pago';
                        const linha = document.createElement('tr');
                        linha.innerHTML = `
                            <td class="col-data">${c.data_formatada}</td>
                            <td class="col-nome">${c.nome_jogador}</td>
                            <td class="col-valor">${formatarBRL(c.valor_venda)}</td>
                            <td class="col-valor">${formatarBRL(c.valor_comissao)}</td>
                            <td class="col-status"><span class="status-pagamento ${statusClasse}">${c.status_pagamento}</span></td>
                        `;
                        tabelaComissoesCorpo.appendChild(linha);
                    });
                } else {
                    tabelaComissoesCorpo.innerHTML = `<tr><td colspan="5" style="text-align: center;">Nenhuma comissão registrada.</td></tr>`;
                }
            } else {
                throw new Error(data.message);
            }
        } catch (err) {
            tabelaComissoesCorpo.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">${err.message}</td></tr>`;
            comissaoPendenteEl.textContent = "Erro";
        }
    }
    // ==================================================
    // --- FIM DA MODIFICAÇÃO (FUNÇÕES DE AFILIADO) ---
    // ==================================================

    // Carrega tudo ao iniciar
    carregarStatus();
    carregarComissoes(); // <-- CHAMA A NOVA FUNÇÃO
});
