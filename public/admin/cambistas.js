document.addEventListener('DOMContentLoaded', () => {

    // Seletores de formulário
    const formCriar = document.getElementById('form-criar-cambista');
    const formCreditos = document.getElementById('form-add-creditos');

    // Seletores de campos
    const inputUsuario = document.getElementById('cambista-usuario');
    const inputSenha = document.getElementById('cambista-senha');
    const selectCambistaRecarga = document.getElementById('select-cambista-recarga');
    const inputValorRecarga = document.getElementById('valor-recarga');
    
    // Seletores de tabela e status
    const tabelaCorpo = document.getElementById('tabela-cambistas-corpo');
    const criarStatus = document.getElementById('criar-status');
    const recargaStatus = document.getElementById('recarga-status');

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

    // Função para carregar a lista de cambistas (na tabela e no select)
    async function carregarCambistas() {
        if (!tabelaCorpo || !selectCambistaRecarga) return;

        // *** COLSPAN ATUALIZADO PARA 5 ***
        tabelaCorpo.innerHTML = `<tr><td colspan="5" style="text-align: center;">Carregando...</td></tr>`;
        selectCambistaRecarga.innerHTML = '<option value="">Carregando...</option>';
        selectCambistaRecarga.disabled = true;

        try {
            const response = await fetch('/admin/api/cambistas');
            if (!response.ok) {
                 if(response.status === 403) { window.location.href = '/admin/login.html'; }
                 throw new Error('Falha ao carregar lista de cambistas.');
            }
            const data = await response.json();

            if (data.success) {
                tabelaCorpo.innerHTML = '';
                selectCambistaRecarga.innerHTML = '<option value="">Selecione um cambista</option>';
                
                if (data.cambistas.length === 0) {
                    // *** COLSPAN ATUALIZADO PARA 5 ***
                     tabelaCorpo.innerHTML = `<tr><td colspan="5" style="text-align: center;">Nenhum cambista criado.</td></tr>`;
                }

                data.cambistas.forEach(c => {
                    // Adiciona na tabela
                    const linha = document.createElement('tr');
                    
                    // *** INÍCIO DA ATUALIZAÇÃO (Lógica do Botão) ***
                    const statusTexto = c.ativo ? 'Ativo' : 'Inativo';
                    const statusClasse = c.ativo ? 'status-pago' : 'status-pendente'; // Reusa classes CSS
                    const botaoTexto = c.ativo ? 'Desativar' : 'Ativar';
                    // Reusa classes de botão: 'btn-perigo' (vermelho) e 'btn-pagar' (verde)
                    const botaoClasse = c.ativo ? 'btn-perigo' : 'btn-pagar'; 
                    
                    linha.innerHTML = `
                        <td>${c.id}</td>
                        <td>${c.usuario}</td>
                        <td>${formatarBRL(c.saldo_creditos)}</td>
                        <td><span class="status-pagamento ${statusClasse}">${statusTexto}</span></td>
                        <td class="col-acao">
                            <button class="btn-toggle-status ${botaoClasse}" data-id="${c.id}" style="font-size: 0.85em; padding: 5px 10px; width: 80px;">
                                ${botaoTexto}
                            </button>
                        </td>
                    `;
                    // *** FIM DA ATUALIZAÇÃO ***

                    tabelaCorpo.appendChild(linha);

                    // Adiciona no select (apenas se estiver ativo)
                    if (c.ativo) {
                        const option = document.createElement('option');
                        option.value = c.id;
                        option.textContent = `${c.usuario} (Saldo: ${formatarBRL(c.saldo_creditos)})`;
                        selectCambistaRecarga.appendChild(option);
                    }
                });
                selectCambistaRecarga.disabled = false;
            } else {
                throw new Error(data.message || 'Erro ao processar dados.');
            }
        } catch (error) {
            console.error(error);
            // *** COLSPAN ATUALIZADO PARA 5 ***
            tabelaCorpo.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">${error.message}</td></tr>`;
            selectCambistaRecarga.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    }

    // Listener do formulário "Criar Cambista"
    formCriar.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usuario = inputUsuario.value;
        const senha = inputSenha.value;
        const btn = formCriar.querySelector('button');
        
        if (!usuario || !senha) {
            mostrarStatus(criarStatus, 'Usuário e Senha são obrigatórios.', false);
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Criando...';
        
        try {
             const response = await fetch('/admin/api/cambistas/criar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ usuario, senha }),
            });
            const data = await response.json();

            if (response.ok && data.success) {
                mostrarStatus(criarStatus, `Cambista "${usuario}" criado com sucesso!`, true);
                formCriar.reset();
                carregarCambistas(); // Atualiza a lista
            } else {
                throw new Error(data.message || 'Erro desconhecido.');
            }
        } catch (error) {
            mostrarStatus(criarStatus, error.message, false);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Criar Cambista';
        }
    });

    // Listener do formulário "Adicionar Créditos"
    formCreditos.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cambistaId = selectCambistaRecarga.value;
        const valor = parseFloat(inputValorRecarga.value);
        const btn = formCreditos.querySelector('button');

        if (!cambistaId || !valor || valor <= 0) {
            mostrarStatus(recargaStatus, 'Selecione um cambista e insira um valor válido.', false);
            return;
        }
        
        if (!confirm(`Tem certeza que deseja adicionar ${formatarBRL(valor)} em créditos para este cambista?`)) {
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Adicionando...';
        
        try {
             const response = await fetch('/admin/api/cambistas/adicionar-creditos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ cambistaId, valor }),
            });
            const data = await response.json();

            if (response.ok && data.success) {
                mostrarStatus(recargaStatus, `Créditos adicionados com sucesso! Novo saldo: ${formatarBRL(data.novoSaldo)}`, true);
                formCreditos.reset();
                carregarCambistas(); // Atualiza a lista
            } else {
                throw new Error(data.message || 'Erro desconhecido.');
            }
        } catch (error) {
            mostrarStatus(recargaStatus, error.message, false);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Adicionar Créditos';
        }
    });

    // ==========================================================
    // *** NOVO CÓDIGO (LÓGICA PARA O BOTÃO ATIVAR/DESATIVAR) ***
    // ==========================================================
    
    // Delegação de evento para os botões na tabela
    tabelaCorpo.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-toggle-status')) {
            const id = e.target.dataset.id;
            const cambistaUsuario = e.target.closest('tr').cells[1].textContent;
            const acao = e.target.textContent;

            if (confirm(`Tem certeza que deseja ${acao.toLowerCase()} o cambista "${cambistaUsuario}"?`)) {
                toggleCambistaStatus(id, e.target);
            }
        }
    });

    async function toggleCambistaStatus(id, botao) {
        const acaoOriginal = botao.textContent;
        botao.disabled = true;
        botao.textContent = '...';

        try {
            const response = await fetch('/admin/api/cambistas/toggle-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ cambistaId: id }),
            });
            const data = await response.json();

            if (response.ok && data.success) {
                // Atualizar a UI
                const novoStatus = data.novoStatus; // true ou false
                const linha = botao.closest('tr');
                const statusSpan = linha.querySelector('.status-pagamento');

                if (novoStatus === true) {
                    statusSpan.textContent = 'Ativo';
                    statusSpan.className = 'status-pagamento status-pago';
                    botao.textContent = 'Desativar';
                    botao.className = 'btn-toggle-status btn-perigo';
                } else {
                    statusSpan.textContent = 'Inativo';
                    statusSpan.className = 'status-pagamento status-pendente';
                    botao.textContent = 'Ativar';
                    botao.className = 'btn-toggle-status btn-pagar';
                }
                
                // Recarrega a lista para atualizar o dropdown de Recarga (remover/adicionar o nome)
                // Usamos um pequeno delay para o admin ver a mudança antes da lista recarregar
                setTimeout(carregarCambistas, 500);
                
            } else {
                throw new Error(data.message || 'Erro ao atualizar status.');
            }
        } catch (err) {
            // Reusa o status box da recarga para exibir o erro
            mostrarStatus(recargaStatus, err.message, false); 
            botao.textContent = acaoOriginal;
        } finally {
            botao.disabled = false;
        }
    }
    // ==========================================================
    // *** FIM DO NOVO CÓDIGO ***
    // ==========================================================


    // Carrega tudo ao iniciar
    carregarCambistas();
});
