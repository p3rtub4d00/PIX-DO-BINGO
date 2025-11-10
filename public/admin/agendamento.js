document.addEventListener('DOMContentLoaded', () => {

    // --- Seletores do DOM ---
    const formAgendar = document.getElementById('form-agendar-sorteio');
    const tabelaCorpo = document.getElementById('tabela-agendamentos-corpo');
    const statusMensagem = document.getElementById('agendar-status');

    // --- Campos do Formulário de Criação ---
    const inputNome = document.getElementById('sorteio-nome');
    const inputPremioLinha = document.getElementById('sorteio-premio-linha');
    const inputPremioCheia = document.getElementById('sorteio-premio-cheia');
    const inputPrecoCartela = document.getElementById('sorteio-preco-cartela');
    const inputDataAbertura = document.getElementById('sorteio-data-abertura');
    const inputDataSorteio = document.getElementById('sorteio-data-sorteio');
    const btnAgendar = document.getElementById('btn-agendar-sorteio');

    // ==========================================================
    // ===== INÍCIO DA ATUALIZAÇÃO (SELETORES DO MODAL) =====
    // ==========================================================
    // --- Seletores do Modal de Edição ---
    const modalEditar = document.getElementById('modal-editar-agendamento');
    const modalEditarTitulo = document.getElementById('modal-editar-titulo');
    const modalEditarForm = document.getElementById('form-editar-sorteio');
    const modalEditarId = document.getElementById('modal-editar-id');
    const modalEditarNome = document.getElementById('modal-editar-nome');
    const modalEditarPremioLinha = document.getElementById('modal-editar-premio-linha');
    const modalEditarPremioCheia = document.getElementById('modal-editar-premio-cheia');
    const modalEditarPrecoCartela = document.getElementById('modal-editar-preco-cartela');
    const modalEditarDataAbertura = document.getElementById('modal-editar-data-abertura');
    const modalEditarDataSorteio = document.getElementById('modal-editar-data-sorteio');
    const btnSalvarEdicao = document.getElementById('btn-salvar-edicao');
    const btnFecharModal = document.getElementById('modal-editar-fechar');
    const editarStatusMensagem = document.getElementById('editar-status');
    // ==========================================================
    // ===== FIM DA ATUALIZAÇÃO (SELETORES DO MODAL) =====
    // ==========================================================


    // --- Funções Auxiliares ---

    // Função para formatar BRL
    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ 0,00';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // Função para exibir mensagens de status
    function mostrarStatus(elemento, mensagem, sucesso = true) {
        elemento.textContent = mensagem;
        elemento.className = sucesso ? 'status-message status-success' : 'status-message status-error';
        elemento.style.display = 'block';
        setTimeout(() => { elemento.style.display = 'none'; }, 5000);
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
                        case 'EM_SORTEIO': statusClass = 'status-pendente'; break;
                        case 'CONCLUIDO': statusClass = 'status-pago'; break; // TODO: Mudar para cinza
                        default: statusClass = 'status-pendente';
                    }

                    // ==========================================================
                    // ===== INÍCIO DA ATUALIZAÇÃO (BOTÕES DE AÇÃO) =====
                    // ==========================================================
                    
                    // Lógica para desabilitar botões
                    const podeDeletar = sorteio.status === 'AGENDADO';
                    const podeEditar = sorteio.status === 'AGENDADO' || sorteio.status === 'VENDENDO';

                    linha.innerHTML = `
                        <td>${sorteio.id}</td>
                        <td>${sorteio.nome_sorteio}</td>
                        <td>${formatarBRL(sorteio.premio_linha)} / ${formatarBRL(sorteio.premio_cheia)}</td>
                        <td>${formatarBRL(sorteio.preco_cartela)}</td>
                        <td>${sorteio.data_abertura_f}</td>
                        <td>${sorteio.data_sorteio_f}</td>
                        <td><span class="status-pagamento ${statusClass}">${sorteio.status}</span></td>
                        <td class="col-acao">
                            <button 
                                class="btn-editar" 
                                data-id="${sorteio.id}" 
                                ${!podeEditar ? 'disabled' : ''}
                                title="${podeEditar ? 'Editar Sorteio' : 'Não é possível editar um sorteio que está em andamento ou concluído'}"
                            >Editar</button>
                            <button 
                                class="btn-deletar-agendamento" 
                                data-id="${sorteio.id}" 
                                ${!podeDeletar ? 'disabled' : ''}
                                title="${podeDeletar ? 'Deletar Sorteio' : 'Só é possível deletar sorteios com status AGENDADO'}"
                            >Deletar</button>
                        </td>
                    `;
                    // ==========================================================
                    // ===== FIM DA ATUALIZAÇÃO (BOTÕES DE AÇÃO) =====
                    // ==========================================================
                    
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
            mostrarStatus(statusMensagem, "A data de abertura das vendas deve ser ANTERIOR à data do sorteio.", false);
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
                mostrarStatus(statusMensagem, 'Sorteio agendado com sucesso!', true);
                formAgendar.reset();
                carregarAgendamentos(); // Atualiza a lista
            } else {
                throw new Error(data.message || 'Erro desconhecido ao agendar.');
            }
        } catch (error) {
            mostrarStatus(statusMensagem, error.message, false);
        } finally {
            btnAgendar.disabled = false;
            btnAgendar.textContent = 'Agendar Sorteio';
        }
    });

    // ==========================================================
    // ===== INÍCIO DA ATUALIZAÇÃO (LÓGICA DO MODAL DE EDIÇÃO) =====
    // ==========================================================

    // Função para fechar o modal
    function fecharModalEdicao() {
        if (modalEditar) modalEditar.style.display = 'none';
        if (editarStatusMensagem) editarStatusMensagem.style.display = 'none';
        if (modalEditarForm) modalEditarForm.reset();
    }

    // Adiciona listener para fechar o modal
    if(btnFecharModal) btnFecharModal.addEventListener('click', fecharModalEdicao);
    if(modalEditar) modalEditar.addEventListener('click', (e) => {
        if (e.target === modalEditar) fecharModalEdicao();
    });

    // Função para abrir o modal e preencher com dados
    async function abrirModalEdicao(id) {
        try {
            const response = await fetch(`/admin/api/agendamentos/${id}`);
            if (!response.ok) throw new Error('Falha ao buscar dados do sorteio.');
            
            const data = await response.json();
            if (!data.success) throw new Error(data.message);
            
            const sorteio = data.sorteio;

            // Preenche o formulário
            modalEditarTitulo.textContent = `Editar Sorteio #${sorteio.id}`;
            modalEditarId.value = sorteio.id;
            modalEditarNome.value = sorteio.nome_sorteio;
            modalEditarPremioLinha.value = sorteio.premio_linha;
            modalEditarPremioCheia.value = sorteio.premio_cheia;
            modalEditarPrecoCartela.value = sorteio.preco_cartela;
            modalEditarDataAbertura.value = sorteio.data_abertura_vendas_input;
            modalEditarDataSorteio.value = sorteio.data_sorteio_input;
            
            // Exibe o modal
            modalEditar.style.display = 'flex';
            
        } catch (error) {
            // Usa o status de agendamento principal para mostrar o erro
            mostrarStatus(statusMensagem, error.message, false);
        }
    }

    // Listener do formulário de EDIÇÃO
    modalEditarForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = modalEditarId.value;

        const dadosSorteio = {
            nome: modalEditarNome.value,
            premioLinha: parseFloat(modalEditarPremioLinha.value),
            premioCheia: parseFloat(modalEditarPremioCheia.value),
            precoCartela: parseFloat(modalEditarPrecoCartela.value),
            dataAbertura: modalEditarDataAbertura.value,
            dataSorteio: modalEditarDataSorteio.value
        };

        if (new Date(dadosSorteio.dataAbertura) >= new Date(dadosSorteio.dataSorteio)) {
            mostrarStatus(editarStatusMensagem, "A data de abertura deve ser ANTERIOR à data do sorteio.", false);
            return;
        }

        btnSalvarEdicao.disabled = true;
        btnSalvarEdicao.textContent = 'Salvando...';

        try {
            const response = await fetch(`/admin/api/agendamentos/editar/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(dadosSorteio),
            });
            const data = await response.json();

            if (response.ok && data.success) {
                mostrarStatus(editarStatusMensagem, 'Sorteio atualizado com sucesso!', true);
                setTimeout(() => {
                    fecharModalEdicao();
                    carregarAgendamentos(); // Atualiza a lista na página principal
                }, 1500);
            } else {
                throw new Error(data.message || 'Erro desconhecido ao salvar.');
            }
        } catch (error) {
            mostrarStatus(editarStatusMensagem, error.message, false);
        } finally {
            btnSalvarEdicao.disabled = false;
            btnSalvarEdicao.textContent = 'Salvar Alterações';
        }
    });

    // --- Listener para Deletar E EDITAR (Delegação de Evento) ---
    tabelaCorpo.addEventListener('click', async (e) => {
        
        // --- Botão DELETAR ---
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
                        mostrarStatus(statusMensagem, 'Agendamento deletado com sucesso.', true);
                        carregarAgendamentos(); // Recarrega a lista
                    } else {
                        throw new Error(data.message || 'Erro ao deletar.');
                    }
                } catch (error) {
                    mostrarStatus(statusMensagem, error.message, false);
                    e.target.disabled = false;
                    e.target.textContent = 'Deletar';
                }
            }
        }

        // --- Botão EDITAR ---
        if (e.target.classList.contains('btn-editar')) {
            const id = e.target.dataset.id;
            abrirModalEdicao(id);
        }
    });
    
    // ==========================================================
    // ===== FIM DA ATUALIZAÇÃO (LÓGICA DO MODAL DE EDIÇÃO) =====
    // ==========================================================


    // --- Carregamento Inicial ---
    carregarAgendamentos();
});
