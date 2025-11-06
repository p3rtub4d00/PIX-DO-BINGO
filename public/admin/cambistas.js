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

        tabelaCorpo.innerHTML = `<tr><td colspan="4" style="text-align: center;">Carregando...</td></tr>`;
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
                     tabelaCorpo.innerHTML = `<tr><td colspan="4" style="text-align: center;">Nenhum cambista criado.</td></tr>`;
                }

                data.cambistas.forEach(c => {
                    // Adiciona na tabela
                    const linha = document.createElement('tr');
                    linha.innerHTML = `
                        <td>${c.id}</td>
                        <td>${c.usuario}</td>
                        <td>${formatarBRL(c.saldo_creditos)}</td>
                        <td><span class="status-pagamento ${c.ativo ? 'status-pago' : 'status-pendente'}">${c.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    `;
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
            tabelaCorpo.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">${error.message}</td></tr>`;
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

    // Carrega tudo ao iniciar
    carregarCambistas();
});
