document.addEventListener('DOMContentLoaded', () => {

    // --- Seletores do DOM ---
    const formAgendar = document.getElementById('form-agendar-sorteio');
    const tabelaCorpo = document.getElementById('tabela-agendamentos-corpo');
    const statusMensagem = document.getElementById('agendar-status');

    // --- Campos do Formulário ---
    const inputNome = document.getElementById('sorteio-nome');
    const inputPremioLinha = document.getElementById('sorteio-premio-linha');
    const inputPremioCheia = document.getElementById('sorteio-premio-cheia');
    const inputPrecoCartela = document.getElementById('sorteio-preco-cartela');
    const inputDataAbertura = document.getElementById('sorteio-data-abertura');
    const inputDataSorteio = document.getElementById('sorteio-data-sorteio');
    const btnAgendar = document.getElementById('btn-agendar-sorteio');

    // --- Funções Auxiliares ---

    // Função para formatar BRL
    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ 0,00';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // Função para exibir mensagens de status
    function mostrarStatus(mensagem, sucesso = true) {
        statusMensagem.textContent = mensagem;
        statusMensagem.className = sucesso ? 'status-message status-success' : 'status-message status-error';
        statusMensagem.style.display = 'block';
        setTimeout(() => { statusMensagem.style.display = 'none'; }, 5000);
    }

    // --- Carregar Agendamentos ---
    async function carregarAgendamentos() {
        if (!tabelaCorpo) return;
        tabelaCorpo.innerHTML = `<tr><td colspan="8" style="text-align: center;">Carregando...</td></tr>`;

        try {
            const response = await fetch('/admin/api/agendamentos');
            if (!response.ok) {
                if(response.status === 403) { window.location.href = '/admin/login.html'; }
                throw new Error('Falha ao carregar agendamentos.');
            }
            const data = await response.json();

            if (data.success) {
                tabelaCorpo.innerHTML = ''; // Limpa a tabela
                if (data.agendamentos.length === 0) {
                    tabelaCorpo.innerHTML = `<tr><td colspan="8" style="text-align: center;">Nenhum sorteio agendado.</td></tr>`;
                    return;
                }

                data.agendamentos.forEach(sorteio => {
                    const linha = document.createElement('tr');
                    
                    // Define o status visual
                    let statusClass = '';
                    switch (sorteio.status) {
                        case 'AGENDADO': statusClass = 'status-pendente'; break;
                        case 'VENDENDO': statusClass = 'status-pago'; break; // Reusa a classe verde
                        case 'CONCLUIDO': statusClass = 'status-pago'; break; // TODO: Mudar para cinza
                        default: statusClass = 'status-pendente';
                    }

                    linha.innerHTML = `
                        <td>${sorteio.id}</td>
                        <td>${sorteio.nome_sorteio}</td>
                        <td>${formatarBRL(sorteio.premio_linha)} / ${formatarBRL(sorteio.premio_cheia)}</td>
                        <td>${formatarBRL(sorteio.preco_cartela)}</td>
                        <td>${sorteio.data_abertura_f}</td>
                        <td>${sorteio.data_sorteio_f}</td>
                        <td><span class="status-pagamento ${statusClass}">${sorteio.status}</span></td>
                        <td class="col-acao">
                            ${sorteio.status === 'AGENDADO' ? 
                                `<button class="btn-perigo btn-deletar-agendamento" data-id="${sorteio.id}" style="font-size: 0.85em; padding: 5px 10px;">Deletar</button>` :
                                `<button class="btn-pago" disabled style="font-size: 0.85em; padding: 5px 10px;">-</button>`
                            }
                        </td>
                    `;
                    tabelaCorpo.appendChild(linha);
                });
            } else {
                throw new Error(data.message || 'Erro ao processar dados.');
            }
        } catch (error) {
            console.error(error);
            tabelaCorpo.innerHTML = `<tr><td colspan="8" style="text-align: center; color: red;">${error.message}</td></tr>`;
        }
    }

    // --- Listener do Formulário de Agendamento ---
    formAgendar.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const dadosSorteio = {
            nome: inputNome.value,
            premioLinha: parseFloat(inputPremioLinha.value),
            premioCheia: parseFloat(inputPremioCheia.value),
            precoCartela: parseFloat(inputPrecoCartela.value),
            dataAbertura: inputDataAbertura.value,
            dataSorteio: inputDataSorteio.value
        };

        // Validação simples
        if (new Date(dadosSorteio.dataAbertura) >= new Date(dadosSorteio.dataSorteio)) {
            mostrarStatus("A data de abertura das vendas deve ser ANTERIOR à data do sorteio.", false);
            return;
        }

        btnAgendar.disabled = true;
        btnAgendar.textContent = 'Agendando...';

        try {
            const response = await fetch('/admin/api/agendamentos/criar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(dadosSorteio),
            });
            const data = await response.json();

            if (response.ok && data.success) {
                mostrarStatus('Sorteio agendado com sucesso!', true);
                formAgendar.reset();
                carregarAgendamentos(); // Atualiza a lista
            } else {
                throw new Error(data.message || 'Erro desconhecido ao agendar.');
            }
        } catch (error) {
            mostrarStatus(error.message, false);
        } finally {
            btnAgendar.disabled = false;
            btnAgendar.textContent = 'Agendar Sorteio';
        }
    });

    // --- Listener para Deletar Agendamento (Delegação de Evento) ---
    tabelaCorpo.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-deletar-agendamento')) {
            const id = e.target.dataset.id;
            const nomeSorteio = e.target.closest('tr').cells[1].textContent;
            
            if (confirm(`Tem certeza que deseja deletar o sorteio "${nomeSorteio}" (ID: ${id})?\n\nEsta ação só é permitida se o sorteio ainda estiver 'AGENDADO' (antes do início das vendas).`)) {
                
                e.target.disabled = true;
                e.target.textContent = '...';
                
                try {
                    const response = await fetch(`/admin/api/agendamentos/deletar/${id}`, {
                        method: 'DELETE',
                        headers: { 'Accept': 'application/json' }
                    });
                    const data = await response.json();
                    
                    if(response.ok && data.success) {
                        mostrarStatus('Agendamento deletado com sucesso.', true);
                        carregarAgendamentos(); // Recarrega a lista
                    } else {
                        throw new Error(data.message || 'Erro ao deletar.');
                    }
                } catch (error) {
                    mostrarStatus(error.message, false);
                    e.target.disabled = false;
                    e.target.textContent = 'Deletar';
                }
            }
        }
    });

    // --- Carregamento Inicial ---
    carregarAgendamentos();
});
