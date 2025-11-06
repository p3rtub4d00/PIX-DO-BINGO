document.addEventListener('DOMContentLoaded', () => {

    // Seletores
    const welcomeEl = document.getElementById('cambista-welcome');
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

    let precoPorCartela = 5.00; // Valor padrão, será atualizado

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

    // 1. Carregar Status do Cambista (Saldo e Nome)
    async function carregarStatus() {
        try {
            const response = await fetch('/cambista/meu-status');
            if (!response.ok) {
                if(response.status === 403) { window.location.href = '/cambista/login.html'; }
                throw new Error('Falha ao carregar dados.');
            }
            const data = await response.json();

            if (data.success) {
                welcomeEl.textContent = `Bem-vindo, ${data.usuario}!`;
                saldoEl.textContent = formatarBRL(data.saldo);
                precoPorCartela = parseFloat(data.precoCartela || '5.00'); // Pega o preço da cartela
                atualizarCustoVenda(); // Atualiza o custo
            } else {
                throw new Error(data.message);
            }
        } catch (err) {
            welcomeEl.textContent = "Erro ao carregar";
            saldoEl.textContent = "R$ --,--";
        }
    }

    // 2. Atualizar custo da venda
    function atualizarCustoVenda() {
        const qtd = parseInt(quantidadeInput.value) || 0;
        const custo = qtd * precoPorCartela;
        custoVendaEl.textContent = `Custo total desta venda: ${formatarBRL(custo)}`;
    }
    quantidadeInput.addEventListener('input', atualizarCustoVenda);

    // 3. Listener do formulário "Gerar Venda"
    formGerar.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = nomeInput.value.trim();
        const telefone = telefoneInput.value.trim();
        const quantidade = parseInt(quantidadeInput.value);

        if (!nome || !quantidade || quantidade < 1) {
            mostrarStatus(vendaStatusEl, 'Preencha o nome do jogador e a quantidade.', false);
            return;
        }

        if (!confirm(`Confirmar venda de ${quantidade} cartela(s) para ${nome}?`)) {
            return;
        }

        btnGerar.disabled = true;
        btnGerar.textContent = 'Gerando...';
        previewContainer.innerHTML = ''; 
        avisoImpressao.textContent = 'Gerando cartelas...';
        avisoImpressao.style.display = 'block'; 
        btnImprimir.style.display = 'none';

        try {
            const response = await fetch('/cambista/gerar-cartelas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ nome, telefone, quantidade }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Sucesso!
                mostrarStatus(vendaStatusEl, 'Venda registrada! Cartelas geradas abaixo.', true);
                formGerar.reset(); // Limpa o formulário
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
            mostrarStatus(vendaStatusEl, error.message, false);
            avisoImpressao.textContent = `Erro: ${error.message}`;
        } finally {
            btnGerar.disabled = false;
            btnGerar.textContent = 'Gerar e Vender';
        }
    });

    // 4. Funções de Impressão (copiadas do painel.js)
    btnImprimir.addEventListener('click', () => { window.print(); });

    function criarVisualCartela(cartelaObj, nomeJogador) {
        const divCartela = document.createElement('div'); divCartela.classList.add('mini-cartela');
        const header = document.createElement('div'); header.classList.add('mini-cartela-header');
        header.innerHTML = `
            <span class="nome-jogador">${nomeJogador || ''}</span>
            <span>Sorteio: #${cartelaObj?.s_id || '?'}</span>
            <span>ID: ${cartelaObj?.c_id || '?'}</span>
        `;
        divCartela.appendChild(header);
        const grid = document.createElement('div'); grid.classList.add('mini-cartela-grid');
        const matriz = cartelaObj?.data || [];
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                const numDiv = document.createElement('div'); numDiv.classList.add('mini-cartela-num');
                const valor = matriz[i]?.[j]; // Acesso seguro
                if (valor === 'FREE') { numDiv.textContent = 'FREE'; numDiv.classList.add('free'); }
                else { numDiv.textContent = valor || '?'; }
                grid.appendChild(numDiv);
            }
        }
        divCartela.appendChild(grid); return divCartela;
    }

    // Carrega tudo ao iniciar
    carregarStatus();
});
