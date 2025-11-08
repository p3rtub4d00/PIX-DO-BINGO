document.addEventListener('DOMContentLoaded', () => {

    // --- Seletores do DOM ---
    const formCriarRifa = document.getElementById('form-criar-rifa');
    const inputNomePremio = document.getElementById('rifa-nome-premio');
    const inputDescricao = document.getElementById('rifa-descricao');
    const inputValorNumero = document.getElementById('rifa-valor-numero');
    // [!!] NOVO SELETOR ADICIONADO
    const inputDataSorteio = document.getElementById('rifa-data-sorteio'); 
    const criarRifaStatus = document.getElementById('criar-rifa-status');

    const rifaAtivaInfoEl = document.getElementById('rifa-ativa-info');
    const nenhumaRifaAtivaEl = document.getElementById('nenhuma-rifa-ativa');
    const rifaAtivaNome = document.getElementById('rifa-ativa-nome');
    // [!!] NOVO SELETOR ADICIONADO
    const rifaAtivaData = document.getElementById('rifa-ativa-data'); 
    const rifaAtivaValor = document.getElementById('rifa-ativa-valor');
    const rifaAtivaQtd = document.getElementById('rifa-ativa-qtd');
    const rifaAtivaTotal = document.getElementById('rifa-ativa-total');
    const btnEncerrarRifa = document.getElementById('btn-encerrar-rifa');

    const tabelaCorpo = document.getElementById('tabela-vendas-rifa-corpo');

    let rifaAtivaId = null; // Guarda o ID da rifa ativa

    // --- Funções Auxiliares ---
    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ 0,00';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function mostrarStatus(elemento, mensagem, sucesso = true) {
        elemento.textContent = mensagem;
        elemento.className = sucesso ? 'status-message status-success' : 'status-message status-error';
        elemento.style.display = 'block';
        setTimeout(() => { elemento.style.display = 'none'; }, 5000);
    }

    // --- Funções Principais ---

    // 1. Carrega a Rifa Ativa e suas Vendas
    async function carregarRifaAtiva() {
        // Limpa a tabela e o status
        tabelaCorpo.innerHTML = `<tr><td colspan="5" style="text-align: center;">Carregando...</td></tr>`;
        rifaAtivaInfoEl.style.display = 'none';
        nenhumaRifaAtivaEl.style.display = 'none';
        
        try {
            // (Esta rota '/admin/api/rifa/ativa' ainda será criada no server.js)
            const response = await fetch('/admin/api/rifa/ativa'); 
            
            if (!response.ok) {
                if (response.status === 403) { window.location.href = '/admin/login.html'; }
                throw new Error('Falha ao buscar dados da rifa.');
            }
            
            const data = await response.json();

            if (data.success && data.rifa) {
                // Temos uma rifa ativa!
                const rifa = data.rifa;
                rifaAtivaId = rifa.id; // Salva o ID
                
                // Preenche o card "Rifa Ativa"
                rifaAtivaNome.textContent = rifa.nome_premio;
                // [!!] MOSTRA A DATA DO SORTEIO
                rifaAtivaData.textContent = rifa.data_sorteio_prevista || 'Não definida'; 
                rifaAtivaValor.textContent = formatarBRL(rifa.valor_numero);
                rifaAtivaQtd.textContent = rifa.numeros_vendidos || 0;
                rifaAtivaTotal.textContent = formatarBRL(rifa.total_arrecadado);
                rifaAtivaInfoEl.style.display = 'block';
                nenhumaRifaAtivaEl.style.display = 'none';

                // Preenche a tabela de números vendidos
                preencherTabelaVendas(data.vendas);

            } else {
                // Nenhuma rifa ativa encontrada
                rifaAtivaId = null;
                rifaAtivaInfoEl.style.display = 'none';
                nenhumaRifaAtivaEl.style.display = 'block';
                tabelaCorpo.innerHTML = `<tr><td colspan="5" style="text-align: center;">Nenhuma rifa ativa para exibir vendas.</td></tr>`;
            }

        } catch (error) {
            console.error("Erro ao carregar rifa:", error);
            tabelaCorpo.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">${error.message}</td></tr>`;
            nenhumaRifaAtivaEl.textContent = 'Erro ao carregar dados.';
            nenhumaRifaAtivaEl.style.display = 'block';
        }
    }

    // 2. Preenche a tabela de vendas
    function preencherTabelaVendas(vendas) {
        tabelaCorpo.innerHTML = ''; // Limpa "Carregando..."
        if (!vendas || vendas.length === 0) {
            tabelaCorpo.innerHTML = `<tr><td colspan="5" style="text-align: center;">Nenhum número vendido ainda.</td></tr>`;
            return;
        }

        vendas.forEach(venda => {
            const linha = document.createElement('tr');
            
            // Formata os números: ["0001", "0002", "0003"] -> "0001, 0002, 0003"
            const numerosFormatados = venda.numeros ? venda.numeros.join(', ') : 'Erro ao gerar';
            
            // Formata o status
            const statusClasse = venda.status_pagamento === 'Pago' ? 'status-pago' : 'status-pendente';

            linha.innerHTML = `
                <td class="col-data">${venda.data_formatada || '--'}</td>
                <td>${venda.nome_jogador.replace(/</g, "&lt;")}</td>
                <td class="col-telefone">${venda.telefone || '--'}</td>
                <td><span class="status-pagamento ${statusClasse}">${venda.status_pagamento}</span></td>
                <td><small>${numerosFormatados}</small></td>
            `;
            tabelaCorpo.appendChild(linha);
        });
    }

    // 3. Listener do formulário "Criar Nova Rifa"
    formCriarRifa.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = inputNomePremio.value;
        const descricao = inputDescricao.value;
        const valor = parseFloat(inputValorNumero.value);
        // [!!] CAPTURA O NOVO CAMPO
        const dataSorteio = inputDataSorteio.value; 
        const btn = formCriarRifa.querySelector('button');

        // [!!] ATUALIZA A VALIDAÇÃO
        if (!nome || !valor || valor <= 0 || !dataSorteio) {
            mostrarStatus(criarRifaStatus, 'Nome, Valor e Data do Sorteio são obrigatórios.', false);
            return;
        }
        
        if (!confirm("Criar esta nova rifa? A rifa ativa anterior (se houver) será desativada.")) {
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Criando...';
        
        try {
            // [!!] ATUALIZAÇÃO: Envia a 'dataSorteio' para o servidor
            const response = await fetch('/admin/api/rifa/criar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ nome, descricao, valor, dataSorteio }),
            });
            const data = await response.json();

            if (response.ok && data.success) {
                mostrarStatus(criarRifaStatus, `Rifa "${nome}" criada e ativada!`, true);
                formCriarRifa.reset();
                carregarRifaAtiva(); // Atualiza a tela inteira
            } else {
                throw new Error(data.message || 'Erro desconhecido.');
            }
        } catch (error) {
            mostrarStatus(criarRifaStatus, error.message, false);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Criar e Ativar Rifa';
        }
    });

    // 4. Listener para o botão "Encerrar Rifa"
    btnEncerrarRifa.addEventListener('click', async () => {
        if (!rifaAtivaId) {
            alert("Nenhum ID de rifa ativa encontrado.");
            return;
        }
        
        if (!confirm("Tem certeza que deseja encerrar (desativar) esta rifa? Os clientes não poderão mais comprar números para ela.")) {
            return;
        }
        
        btnEncerrarRifa.disabled = true;
        btnEncerrarRifa.textContent = 'Encerrando...';

        try {
            // (Esta rota '/admin/api/rifa/encerrar' ainda será criada no server.js)
             const response = await fetch('/admin/api/rifa/encerrar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ rifaId: rifaAtivaId }),
            });
            const data = await response.json();
            
            if (response.ok && data.success) {
                alert("Rifa encerrada com sucesso!");
                carregarRifaAtiva(); // Atualiza a tela
            } else {
                 throw new Error(data.message || 'Erro desconhecido.');
            }
        } catch (error) {
            alert(`Erro ao encerrar rifa: ${error.message}`);
        } finally {
            btnEncerrarRifa.disabled = false;
            btnEncerrarRifa.textContent = 'Encerrar Rifa (Desativar)';
        }
    });


    // Carrega tudo ao iniciar a página
    carregarRifaAtiva();
});
