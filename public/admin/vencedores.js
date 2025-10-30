document.addEventListener('DOMContentLoaded', () => {
    console.log("Página de Gestão de Vencedores carregada.");

    const tabelaCorpo = document.getElementById('tabela-vencedores-corpo');
    // *** INÍCIO DA MODIFICAÇÃO: SELETOR DO BOTÃO ***
    const btnLimparVencedores = document.getElementById('btn-limpar-vencedores');
    // *** FIM DA MODIFICAÇÃO ***

    // Função para buscar dados do relatório de vencedores
    async function carregarVencedores() {
        if (!tabelaCorpo) {
            console.error("Elemento da tabela de vencedores não encontrado!");
            return;
        }
        
        // Limpa a tabela antes de carregar
        tabelaCorpo.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">Carregando dados...</td></tr>`;

        try {
            const response = await fetch('/admin/api/vencedores', {
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
                // Preenche a tabela
                preencherTabela(data.vencedores);
            } else {
                throw new Error(data.message || "Erro ao buscar dados.");
            }

        } catch (error) {
            console.error("Falha ao carregar vencedores:", error);
            tabelaCorpo.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 20px;">Erro ao carregar vencedores: ${error.message}</td></tr>`;
        }
    }

    // Função para preencher a tabela com os dados
    function preencherTabela(vencedores) {
        tabelaCorpo.innerHTML = ''; // Limpa "Carregando..."
        if (!vencedores || vencedores.length === 0) {
            tabelaCorpo.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">Nenhum vencedor registrado ainda.</td></tr>`;
            return;
        }
        
        vencedores.forEach(vencedor => {
            const linha = document.createElement('tr');
            
            // Define o conteúdo da linha
            linha.innerHTML = `
                <td class="col-data">${vencedor.data_formatada || '--'}</td>
                <td class="col-sorteio">${vencedor.sorteio_id}</td>
                <td class="col-premio">${vencedor.premio}</td>
                <td class="col-nome">${vencedor.nome.replace(/</g, "&lt;")}</td>
                <td class="col-telefone">${vencedor.telefone || '--'}</td>
                <td class="col-status">
                    <span class="status-pagamento ${vencedor.status_pagamento === 'Pendente' ? 'status-pendente' : 'status-pago'}">
                        ${vencedor.status_pagamento}
                    </span>
                </td>
                <td class="col-acao">
                    ${vencedor.status_pagamento === 'Pendente' 
                        ? `<button class="btn-pagar" data-id="${vencedor.id}">Marcar como Pago</button>`
                        : `<button class="btn-pago" disabled>Pago</button>`
                    }
                </td>
            `;
            tabelaCorpo.appendChild(linha);
        });
    }

    // Função para marcar um vencedor como pago
    async function marcarComoPago(id, botao) {
        botao.disabled = true;
        botao.textContent = 'Aguarde...';

        try {
            const response = await fetch('/admin/api/vencedor/pagar', {
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

    // Adiciona listener de eventos na tabela (Delegação de evento)
    tabelaCorpo.addEventListener('click', (event) => {
        if (event.target.classList.contains('btn-pagar')) {
            const id = event.target.dataset.id;
            if (id) {
                if (confirm(`Confirmar pagamento para o vencedor ID #${id}?`)) {
                    marcarComoPago(id, event.target);
                }
            }
        }
    });

    // *** INÍCIO DA MODIFICAÇÃO: OUVINTE DO BOTÃO LIMPAR ***
    if (btnLimparVencedores) {
        btnLimparVencedores.addEventListener('click', async () => {
            
            // 1ª Confirmação
            const confirm1 = confirm("TEM CERTEZA ABSOLUTA?\n\nEsta ação vai apagar TODO o histórico de VENCEDORES PERMANENTEMENTE.\n\nIsso não pode ser desfeito.");
            if (!confirm1) {
                return;
            }
            
            // 2ª Confirmação (ainda mais segura)
            const confirm2 = prompt("Esta é sua última chance. Para confirmar que deseja apagar todos os dados de VENCEDORES, digite 'APAGAR' em letras maiúsculas:");
            if (confirm2 !== 'APAGAR') {
                alert("Confirmação inválida. A ação foi cancelada.");
                return;
            }

            // Desabilita o botão
            btnLimparVencedores.disabled = true;
            btnLimparVencedores.textContent = 'Apagando...';

            try {
                const response = await fetch('/admin/api/vencedores/limpar', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json' 
                    }
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    alert(`Sucesso! ${result.changes} registros de vencedores foram apagados.`);
                    // Recarrega os dados da tabela (que agora estarão vazios)
                    carregarVencedores(); 
                } else {
                    throw new Error(result.message || "Erro desconhecido do servidor.");
                }

            } catch (error) {
                console.error("Erro ao limpar vencedores:", error);
                alert(`Falha ao apagar: ${error.message}`);
            } finally {
                // Reabilita o botão
                btnLimparVencedores.disabled = false;
                btnLimparVencedores.textContent = 'Limpar Histórico';
            }
        });
    }
    // *** FIM DA MODIFICAÇÃO ***

    // Carrega o relatório ao iniciar a página
    carregarVencedores();
});