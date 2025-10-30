document.addEventListener('DOMContentLoaded', () => {
    console.log("Página de Relatórios carregada.");

    const totalArrecadadoEl = document.getElementById('total-arrecadado');
    const totalCartelasEl = document.getElementById('total-cartelas');
    const tabelaCorpo = document.getElementById('tabela-vendas-corpo');
    // *** INÍCIO DA MODIFICAÇÃO: SELETOR DO BOTÃO ***
    const btnLimparVendas = document.getElementById('btn-limpar-vendas');
    // *** FIM DA MODIFICAÇÃO ***

    // Função para formatar BRL
    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ 0,00';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // Função para buscar dados do relatório
    async function carregarRelatorio() {
        if (!tabelaCorpo || !totalArrecadadoEl || !totalCartelasEl) {
            console.error("Elementos do relatório não encontrados!");
            return;
        }
        
        // Limpa a tabela antes de carregar
        tabelaCorpo.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">Carregando dados...</td></tr>`;

        try {
            const response = await fetch('/admin/api/vendas', {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                 let errorMsg = `Erro ${response.status}`;
                 try { const errorData = await response.json(); errorMsg = errorData.message || errorMsg; } catch(e){}
                 if(response.status === 403) { // Sessão expirou
                      alert("Sua sessão expirou. Faça login novamente.");
                      window.location.href = '/admin/login.html';
                      return;
                 }
                 throw new Error(errorMsg);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Preenche os resumos
                totalArrecadadoEl.textContent = formatarBRL(data.totais.faturamento_total);
                totalCartelasEl.textContent = data.totais.cartelas_total || 0;
                
                // Preenche a tabela
                preencherTabela(data.vendas);
            } else {
                throw new Error(data.message || "Erro ao buscar dados.");
            }

        } catch (error) {
            console.error("Falha ao carregar relatório:", error);
            tabelaCorpo.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 20px;">Erro ao carregar relatório: ${error.message}</td></tr>`;
        }
    }

    // Função para preencher a tabela com os dados
    function preencherTabela(vendas) {
        tabelaCorpo.innerHTML = ''; // Limpa "Carregando..."
        if (!vendas || vendas.length === 0) {
            tabelaCorpo.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">Nenhuma venda registrada ainda.</td></tr>`;
            return;
        }
        
        vendas.forEach(venda => {
            const linha = document.createElement('tr');
            
            // Adiciona classe de estilo para o tipo
            const tipoClasse = venda.tipo_venda === 'Manual' ? 'tipo-manual' : 'tipo-online';
            
            linha.innerHTML = `
                <td class="col-data">${venda.data_formatada || '--'}</td>
                <td class="col-sorteio">${venda.sorteio_id}</td>
                <td class="col-nome">${venda.nome_jogador.replace(/</g, "&lt;")}</td>
                <td class="col-telefone">${venda.telefone || '--'}</td>
                <td class="col-qtd">${venda.quantidade_cartelas}</td>
                <td class="col-valor">${formatarBRL(venda.valor_total)}</td>
                <td class="col-tipo"><span class="${tipoClasse}">${venda.tipo_venda}</span></td>
            `;
            tabelaCorpo.appendChild(linha);
        });
    }

    // *** INÍCIO DA MODIFICAÇÃO: OUVINTE DO BOTÃO LIMPAR ***
    if (btnLimparVendas) {
        btnLimparVendas.addEventListener('click', async () => {
            
            // 1ª Confirmação
            const confirm1 = confirm("TEM CERTEZA ABSOLUTA?\n\nEsta ação vai apagar TODO o histórico de vendas PERMANENTEMENTE.\n\nIsso não pode ser desfeito.");
            if (!confirm1) {
                return;
            }
            
            // 2ª Confirmação (ainda mais segura)
            const confirm2 = prompt("Esta é sua última chance. Para confirmar que deseja apagar todos os dados de vendas, digite 'APAGAR' em letras maiúsculas:");
            if (confirm2 !== 'APAGAR') {
                alert("Confirmação inválida. A ação foi cancelada.");
                return;
            }

            // Desabilita o botão
            btnLimparVendas.disabled = true;
            btnLimparVendas.textContent = 'Apagando...';

            try {
                const response = await fetch('/admin/api/vendas/limpar', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json' 
                    }
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    alert(`Sucesso! ${result.changes} registros de vendas foram apagados.`);
                    // Recarrega os dados da tabela (que agora estarão vazios)
                    carregarRelatorio(); 
                } else {
                    throw new Error(result.message || "Erro desconhecido do servidor.");
                }

            } catch (error) {
                console.error("Erro ao limpar vendas:", error);
                alert(`Falha ao apagar: ${error.message}`);
            } finally {
                // Reabilita o botão
                btnLimparVendas.disabled = false;
                btnLimparVendas.textContent = 'Limpar Histórico';
            }
        });
    }
    // *** FIM DA MODIFICAÇÃO ***

    // Carrega o relatório ao iniciar a página
    carregarRelatorio();
});