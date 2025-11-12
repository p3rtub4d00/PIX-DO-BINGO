document.addEventListener('DOMContentLoaded', () => {
    console.log("Página de Gestão de Comissões carregada.");

    const tabelaCorpo = document.getElementById('tabela-comissoes-corpo');
    const totalPendenteEl = document.getElementById('total-comissoes-pendentes');

    // Função para formatar BRL
    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ 0,00';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // Função para buscar dados
    async function carregarComissoes() {
        if (!tabelaCorpo || !totalPendenteEl) {
            console.error("Elementos da tabela ou resumo não encontrados!");
            return;
        }
        
        tabelaCorpo.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">Carregando dados...</td></tr>`;

        try {
            const response = await fetch('/admin/api/comissoes', {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                 let errorMsg = `Erro ${response.status}`;
                 try { const errorData = await response.json(); errorMsg = errorData.message || errorMsg; } catch(e){}
                 if(response.status === 403) { 
                      alert("Sua sessão expirou. Faça login novamente.");
                      window.location.href = '/admin/login.html';
                      return;
                 }
                 throw new Error(errorMsg);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Preenche o resumo
                totalPendenteEl.textContent = formatarBRL(data.totalPendente);
                // Preenche a tabela
                preencherTabela(data.comissoes);
            } else {
                throw new Error(data.message || "Erro ao buscar dados.");
            }

        } catch (error) {
            console.error("Falha ao carregar comissões:", error);
            tabelaCorpo.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 20px;">Erro ao carregar comissões: ${error.message}</td></tr>`;
        }
    }

    // Função para preencher a tabela com os dados
    function preencherTabela(comissoes) {
        tabelaCorpo.innerHTML = ''; // Limpa "Carregando..."
        if (!comissoes || comissoes.length === 0) {
            tabelaCorpo.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">Nenhuma comissão registrada.</td></tr>`;
            return;
        }
        
        comissoes.forEach(c => {
            const linha = document.createElement('tr');
            const statusClasse = c.status_pagamento === 'pendente' ? 'status-pendente' : 'status-pago';
            
            linha.innerHTML = `
                <td class="col-data">${c.data_formatada || '--'}</td>
                <td class="col-nome">${c.cambista_usuario.replace(/</g, "&lt;")}</td>
                <td class="col-nome">${c.nome_jogador.replace(/</g, "&lt;")}</td>
                <td class="col-valor">${formatarBRL(c.valor_venda)}</td>
                <td class="col-valor">${formatarBRL(c.valor_comissao)}</td>
                <td class="col-status">
                    <span class="status-pagamento ${statusClasse}">
                        ${c.status_pagamento}
                    </span>
                </td>
                <td class="col-acao">
                    ${c.status_pagamento === 'pendente' 
                        ? `<button class="btn-pagar" data-id="${c.id}">Marcar como Pago</button>`
                        : `<button class="btn-pago" disabled>Pago</button>`
                    }
                </td>
            `;
            tabelaCorpo.appendChild(linha);
        });
    }

    // Função para marcar uma comissão como paga
    async function marcarComoPago(id, botao) {
        botao.disabled = true;
        botao.textContent = 'Aguarde...';

        try {
            const response = await fetch('/admin/api/comissao/pagar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ id: id })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Atualiza a UI na linha específica
                const linha = botao.closest('tr');
                if (linha) {
                    const statusEl = linha.querySelector('.status-pagamento');
                    if (statusEl) {
                        statusEl.textContent = 'Pago';
                        statusEl.classList.remove('status-pendente');
                        statusEl.classList.add('status-pago');
                    }
                    botao.textContent = 'Pago';
                    botao.classList.remove('btn-pagar');
                    botao.classList.add('btn-pago');
                }
                // Recarrega os dados para atualizar o total pendente
                carregarComissoes();
            } else {
                throw new Error(result.message || "Erro ao atualizar status");
            }

        } catch (error) {
            console.error("Erro ao marcar como pago:", error);
            alert(`Erro ao salvar: ${error.message}`);
            botao.disabled = false;
            botao.textContent = 'Marcar como Pago';
        }
    }

    // Delegação de evento na tabela
    tabelaCorpo.addEventListener('click', (event) => {
        if (event.target.classList.contains('btn-pagar')) {
            const id = event.target.dataset.id;
            if (id) {
                if (confirm(`Confirmar pagamento para a comissão ID #${id}?`)) {
                    marcarComoPago(id, event.target);
                }
            }
        }
    });

    // Carrega o relatório ao iniciar a página
    carregarComissoes();
});
