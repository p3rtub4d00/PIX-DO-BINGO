document.addEventListener('DOMContentLoaded', () => {
    
    // --- Seletores do DOM ---
    
    // Seção de Status
    const statusEstadoEl = document.getElementById('status-estado');
    const statusSorteioIdEl = document.getElementById('status-sorteio-id');
    const statusTempoRestanteEl = document.getElementById('status-tempo-restante');
    const statusVendasSorteioEl = document.getElementById('status-vendas-sorteio');
    const statusCartelasSorteioEl = document.getElementById('status-cartelas-sorteio');
    const statusJogadoresReaisEl = document.getElementById('status-jogadores-reais');
    const statusReceitaDiaEl = document.getElementById('status-receita-dia');

    // Seção de Configurações
    const formConfig = document.getElementById('form-config');
    const premioLinhaInput = document.getElementById('premio-linha');
    const premioCheiaInput = document.getElementById('premio-cheia');
    const precoCartelaInput = document.getElementById('preco-cartela');
    const duracaoEsperaInput = document.getElementById('duracao-espera');
    const minBotsInput = document.getElementById('min-bots');
    const maxBotsInput = document.getElementById('max-bots');
    const especialAtivoInput = document.getElementById('sorteio-especial-ativo');
    const especialValorInput = document.getElementById('sorteio-especial-valor');
    const especialDataInput = document.getElementById('sorteio-especial-data');
    const configStatusEl = document.getElementById('config-status');

    // Seção de Geração Manual
    const formGerarManual = document.getElementById('form-gerar-cartelas');
    const manualNomeInput = document.getElementById('manual-nome');
    const manualTelefoneInput = document.getElementById('manual-telefone');
    const manualQuantidadeInput = document.getElementById('quantidade-manual');
    const geradorSorteioIdEl = document.getElementById('gerador-sorteio-id');
    const gerarStatusEl = document.getElementById('gerar-status');
    const cartelasPreviewContainer = document.getElementById('cartelas-preview-container');
    const avisoImpressaoEl = document.getElementById('aviso-impressao');
    const btnImprimir = document.getElementById('btn-imprimir');

    // --- Socket.IO ---
    let socket;
    try {
        socket = io();
    } catch (err) {
        console.error("Erro ao conectar ao Socket.IO:", err);
        alert("Erro de conexão com o servidor. Recarregue.");
        return;
    }

    // --- Funções Auxiliares ---

    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ 0,00';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatarTempo(segundos) {
        if (segundos === null || isNaN(segundos)) return '--:--';
        const minutos = Math.floor(segundos / 60);
        const segs = segundos % 60;
        return `${minutos}:${segs < 10 ? '0' : ''}${segs}`;
    }

    function mostrarStatus(elemento, mensagem, sucesso = true) {
        elemento.textContent = mensagem;
        elemento.className = sucesso ? 'status-message status-success' : 'status-message status-error';
        elemento.style.display = 'block';
        setTimeout(() => { elemento.style.display = 'none'; }, 4000);
    }
    
    // --- 1. Lógica de Status (Socket.IO) ---
    socket.on('adminStatusUpdate', (data) => {
        if (!data) return;
        
        statusEstadoEl.textContent = data.estado || '--';
        statusSorteioIdEl.textContent = `#${data.proximoSorteioId || '---'}`;
        statusTempoRestanteEl.textContent = formatarTempo(data.tempoRestante);
        statusVendasSorteioEl.textContent = formatarBRL(data.vendasProximoSorteio?.valor_total);
        statusCartelasSorteioEl.textContent = data.vendasProximoSorteio?.qtd_cartelas || '0';
        statusJogadoresReaisEl.textContent = data.jogadoresReais || '0';
        statusReceitaDiaEl.textContent = formatarBRL(data.receitaDoDia);

        // Atualiza o ID do sorteio no gerador manual
        geradorSorteioIdEl.textContent = `#${data.proximoSorteioId || '---'}`;
    });
    
    // Pede uma atualização de status ao conectar
    socket.on('connect', () => {
        console.log("Conectado ao servidor, pedindo status...");
        socket.emit('getAdminStatus');
    });

    // Pede atualização de status periodicamente
    setInterval(() => {
        if (socket.connected) {
            socket.emit('getAdminStatus');
        }
    }, 5000); // Atualiza a cada 5 segundos

    // --- 2. Lógica de Configurações ---
    
    // Carrega as configurações atuais
    async function carregarConfiguracoes() {
        try {
            const response = await fetch('/admin/premios-e-preco');
            if (!response.ok) {
                 if(response.status === 403) { window.location.href = '/admin/login.html'; }
                 throw new Error('Falha ao carregar configurações.');
            }
            const data = await response.json();
            
            // Preenche o formulário
            premioLinhaInput.value = parseFloat(data.premio_linha).toFixed(2);
            premioCheiaInput.value = parseFloat(data.premio_cheia).toFixed(2);
            precoCartelaInput.value = parseFloat(data.preco_cartela).toFixed(2);
            duracaoEsperaInput.value = parseInt(data.duracao_espera, 10);
            minBotsInput.value = parseInt(data.min_bots, 10);
            maxBotsInput.value = parseInt(data.max_bots, 10);
            especialAtivoInput.checked = (data.sorteio_especial_ativo === 'true');
            especialValorInput.value = parseFloat(data.sorteio_especial_valor).toFixed(2);
            especialDataInput.value = data.sorteio_especial_data;

        } catch (error) {
            console.error(error);
            mostrarStatus(configStatusEl, error.message, false);
        }
    }

    // Salva as configurações
    formConfig.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = formConfig.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        const data = {
            premio_linha: premioLinhaInput.value,
            premio_cheia: premioCheiaInput.value,
            preco_cartela: precoCartelaInput.value,
            duracao_espera: duracaoEsperaInput.value,
            min_bots: minBotsInput.value,
            max_bots: maxBotsInput.value,
            sorteio_especial_ativo: especialAtivoInput.checked.toString(),
            sorteio_especial_valor: especialValorInput.value,
            sorteio_especial_data: especialDataInput.value
        };

        try {
            const response = await fetch('/admin/premios-e-preco', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (response.ok && result.success) {
                mostrarStatus(configStatusEl, 'Configurações salvas com sucesso!', true);
            } else {
                throw new Error(result.message || 'Erro desconhecido.');
            }
        } catch (error) {
            mostrarStatus(configStatusEl, error.message, false);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar Configurações';
        }
    });
    
    // --- 3. Lógica de Geração Manual ---
    
    formGerarManual.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = formGerarManual.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Gerando...';
        
        const data = {
            nome: manualNomeInput.value,
            telefone: manualTelefoneInput.value,
            quantidade: parseInt(manualQuantidadeInput.value, 10)
        };

        try {
            const response = await fetch('/admin/gerar-cartelas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json(); // Espera cartelas ou erro
            
            if (response.ok) {
                // 'result' é o array de cartelas
                mostrarStatus(gerarStatusEl, `${result.length} cartela(s) gerada(s) com sucesso.`, true);
                renderizarCartelas(result, data.nome);
                formGerarManual.reset(); // Limpa o formulário
            } else {
                // 'result' é { success: false, message: '...' }
                throw new Error(result.message || 'Erro ao gerar cartelas.');
            }
        } catch (error) {
            mostrarStatus(gerarStatusEl, error.message, false);
            renderizarCartelas([], null); // Limpa a área
        } finally {
            btn.disabled = false;
            btn.textContent = 'Gerar Cartelas';
        }
    });

    // Função para renderizar as cartelas
    function renderizarCartelas(cartelas = [], nomeJogador) {
        cartelasPreviewContainer.innerHTML = ''; // Limpa
        if (cartelas.length === 0) {
            avisoImpressaoEl.textContent = 'Nenhuma cartela gerada ainda. Use o formulário acima.';
            btnImprimir.style.display = 'none';
            return;
        }

        avisoImpressaoEl.textContent = 'Ajuste seu navegador para impressão térmica (ex: 80mm) se necessário.';
        btnImprimir.style.display = 'block';

        cartelas.forEach(cartelaObj => {
            const divCartela = document.createElement('div');
            divCartela.classList.add('mini-cartela');
            
            const header = document.createElement('div');
            header.classList.add('mini-cartela-header');
            header.innerHTML = `
                <span class="nome-jogador">${nomeJogador || ''}</span>
                <span>Sorteio: #${cartelaObj?.s_id || '?'}</span>
                <span>ID: ${cartelaObj?.c_id || '?'}</span>
            `;
            divCartela.appendChild(header);

            const grid = document.createElement('div');
            grid.classList.add('mini-cartela-grid');
            
            const matriz = cartelaObj?.data || [];
            for (let i = 0; i < 5; i++) {
                for (let j = 0; j < 5; j++) {
                    const numDiv = document.createElement('div');
                    numDiv.classList.add('mini-cartela-num');
                    const valor = matriz[i]?.[j]; // Acesso seguro
                    
                    if (valor === 'FREE') {
                        numDiv.textContent = 'FREE';
                        numDiv.classList.add('free');
                    } else {
                        numDiv.textContent = valor || '?';
                    }
                    grid.appendChild(numDiv);
                }
            }
            divCartela.appendChild(grid);
            cartelasPreviewContainer.appendChild(divCartela);
        });
    }

    // Botão de Imprimir
    btnImprimir.addEventListener('click', () => {
        window.print();
    });

    // --- Carregamento Inicial ---
    carregarConfiguracoes();

});
