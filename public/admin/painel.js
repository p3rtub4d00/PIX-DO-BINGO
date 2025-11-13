document.addEventListener('DOMContentLoaded', () => {

    // --- INÍCIO: SOCKET.IO E STATUS REAL ---
    let socket;
    try {
        socket = io();
        console.log("Conectado ao servidor Socket.IO para status.");
    } catch (err) {
        console.error("Erro ao conectar ao Socket.IO:", err);
        const errorEl = document.getElementById('admin-status-error');
        if (errorEl) {
            errorEl.textContent = "Erro de conexão com o servidor para status em tempo real.";
            errorEl.style.display = 'block';
        }
    }

    // Seletores para os elementos de status
    const statusJogoEl = document.getElementById('admin-status-jogo');
    const sorteioAtualEl = document.getElementById('admin-sorteio-atual');
    const tempoRestanteEl = document.getElementById('admin-tempo-restante');
    const jogadoresReaisEl = document.getElementById('admin-jogadores-reais');
    const vendasProximoEl = document.getElementById('admin-vendas-proximo');
    const receitaDiaEl = document.getElementById('admin-receita-dia');
    const proximoSorteioIdEl = document.getElementById('admin-proximo-sorteio-id');
    const adminStatusErrorEl = document.getElementById('admin-status-error');

    // Função para formatar o tempo restante
    function formatarTempo(segundos) {
        if (segundos === null || segundos === undefined || segundos < 0) return "--:--";
        const min = Math.floor(segundos / 60);
        const seg = segundos % 60;
        return `${min}:${seg < 10 ? '0' : ''}${seg}`;
    }

    // Função para formatar valores BRL
    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero) || valor === null || valor === undefined) return 'R$ --,--';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // Função para atualizar a interface com os dados de status
    function atualizarStatusAdmin(data) {
        if (!statusJogoEl) return; // Se os elementos não existem, não faz nada
        if (data.error) {
            if (adminStatusErrorEl) {
                adminStatusErrorEl.textContent = `Erro ao buscar status: ${data.error}`;
                adminStatusErrorEl.style.display = 'block';
            }
            return;
        }
        if (adminStatusErrorEl) adminStatusErrorEl.style.display = 'none';

        statusJogoEl.textContent = data.estado ? data.estado.replace('_', ' ') : 'Desconhecido';
        sorteioAtualEl.textContent = `#${data.sorteioAtual || '---'}`;
        tempoRestanteEl.textContent = formatarTempo(data.tempoRestante);
        jogadoresReaisEl.textContent = data.jogadoresReais !== undefined ? data.jogadoresReais : '--';
        
        if (data.vendasProximoSorteio) {
            const qtd = data.vendasProximoSorteio.qtd_cartelas || 0;
            const valor = data.vendasProximoSorteio.valor_total || 0;
            vendasProximoEl.textContent = `${qtd} cartelas (${formatarBRL(valor)})`;
        } else {
             vendasProximoEl.textContent = `0 cartelas (R$ 0,00)`;
        }
         if(proximoSorteioIdEl) proximoSorteioIdEl.textContent = data.proximoSorteioId || '---';

        receitaDiaEl.textContent = formatarBRL(data.receitaDoDia);
    }

    // Pede atualização de status a cada 5 segundos
    if (socket) {
        setInterval(() => {
            socket.emit('getAdminStatus');
        }, 5000); // 5000 ms = 5 segundos

        // Ouve a resposta do servidor
        socket.on('adminStatusUpdate', (data) => {
            console.log("Status recebido:", data);
            atualizarStatusAdmin(data);
        });

        // Pede o status uma vez assim que a página carrega
        socket.emit('getAdminStatus'); 
    }
    // --- FIM: SOCKET.IO E STATUS REAL ---


    // --- SEÇÃO GERADOR DE CARTELAS ---
    const formGerarCartelas = document.getElementById('form-gerar-cartelas');
    const nomeInput = document.getElementById('manual-nome');
    const telefoneInput = document.getElementById('manual-telefone');
    const quantidadeInput = document.getElementById('quantidade-manual');
    const btnGerar = document.getElementById('btn-gerar-manual');
    const previewContainer = document.getElementById('cartelas-preview-container');
    const avisoImpressao = document.getElementById('aviso-impressao');
    const btnImprimir = document.getElementById('btn-imprimir');

    if (formGerarCartelas && nomeInput && telefoneInput && quantidadeInput && btnGerar && previewContainer && avisoImpressao && btnImprimir) {
        formGerarCartelas.addEventListener('submit', async (event) => {
            event.preventDefault();
            const nome = nomeInput.value.trim();
            const telefone = telefoneInput.value.trim();
            const quantidade = parseInt(quantidadeInput.value);
            if (!nome) { alert("Por favor, insira o Nome do Jogador."); nomeInput.focus(); return; }
            if (!quantidade || quantidade < 1 || quantidade > 100) { alert("Por favor, insira uma quantidade entre 1 e 100."); quantidadeInput.focus(); return; }
            console.log(`Solicitando ${quantidade} cartelas para ${nome} ao servidor...`);
            btnGerar.disabled = true; btnGerar.textContent = 'Gerando...';
            previewContainer.innerHTML = ''; avisoImpressao.textContent = 'Gerando cartelas...';
            avisoImpressao.style.display = 'block'; btnImprimir.style.display = 'none';
            try {
                const response = await fetch('/admin/gerar-cartelas', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ nome, telefone, quantidade }),
                });
                if (!response.ok) {
                    let errorMsg = `Erro ${response.status}`;
                    try { const errorData = await response.json(); errorMsg = errorData.message || errorMsg; } catch(e){}
                    if(response.status === 403) { alert("Sua sessão expirou. Faça login novamente."); window.location.href = '/admin/login.html'; return; }
                    throw new Error(errorMsg);
                }
                const cartelas = await response.json();
                if (cartelas && cartelas.length > 0) {
                    cartelas.forEach(cartelaObj => {
                        previewContainer.appendChild(criarVisualCartela(cartelaObj, nome));
                    });
                    avisoImpressao.style.display = 'none';
                    btnImprimir.style.display = 'block';
                    nomeInput.value = '';
                    telefoneInput.value = '';
                    quantidadeInput.value = '1';
                } else { avisoImpressao.textContent = 'Nenhuma cartela foi gerada.'; btnImprimir.style.display = 'none'; }
            } catch (error) {
                console.error("Erro ao gerar cartelas:", error); alert(`Erro: ${error.message}`);
                avisoImpressao.textContent = `Erro: ${error.message}`; avisoImpressao.style.display = 'block'; btnImprimir.style.display = 'none';
            } finally { btnGerar.disabled = false; btnGerar.textContent = 'Gerar e Registrar'; }
        });

        btnImprimir.addEventListener('click', () => { window.print(); });

    } else {
        console.warn("Alguns elementos do gerador de cartelas não foram encontrados. A Geração Manual pode não funcionar.");
    }


    // ==========================================================
    // ===== MODIFICAÇÃO: Função criarVisualCartela =====
    // ==========================================================
    function criarVisualCartela(cartelaObj, nomeJogador) {
        const divCartela = document.createElement('div'); divCartela.classList.add('mini-cartela');
        
        // 1. Cabeçalho
        const header = document.createElement('div'); header.classList.add('mini-cartela-header');
        header.innerHTML = `
            <span class="nome-jogador">${nomeJogador || ''}</span>
            <span>Sorteio: #${cartelaObj?.s_id || '?'}</span>
            <span>ID: ${cartelaObj?.c_id || '?'}</span>
        `;
        divCartela.appendChild(header);
        
        // 2. Grid de Números
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
        divCartela.appendChild(grid); 

        // 3. Rodapé com o Aviso (ATUALIZADO)
        const footer = document.createElement('div');
        footer.classList.add('mini-cartela-footer');
        footer.innerHTML = `
            <p><strong>Atenção:</strong> Em caso de prêmio (Linha ou Cheia), entre em contato pelo <strong>WhatsApp 69 99908-3361</strong> para resgatar. O pagamento do prêmio pode demorar até 48h.</p>
        `;
        divCartela.appendChild(footer);
        // --- Fim da Modificação ---
        
        return divCartela;
    }
    // ==========================================================


    // --- SEÇÃO DE CONFIGURAÇÕES ---
    const formConfig = document.getElementById('form-config');
    const premioLinhaInput = document.getElementById('premio-linha');
    const premioCheiaInput = document.getElementById('premio-cheia');
    const precoCartelaInput = document.getElementById('preco-cartela');
    const duracaoEsperaInput = document.getElementById('duracao-espera'); 
    const minBotsInput = document.getElementById('min_bots');
    const maxBotsInput = document.getElementById('max_bots');
    const especialAtivoInput = document.getElementById('sorteio-especial-ativo');
    const especialValorInput = document.getElementById('sorteio-especial-valor');
    const especialDataHoraInput = document.getElementById('sorteio-especial-datahora');
    const especialPrecoCartelaInput = document.getElementById('sorteio-especial-preco-cartela');
    
    // Campo de Comissão
    const comissaoAfiliadoInput = document.getElementById('comissao_afiliado_percentual');

    const btnSalvarConfig = document.getElementById('btn-salvar-config');
    const configStatus = document.getElementById('config-status');

    async function carregarConfiguracoesAtuais() {
        const inputs = [premioLinhaInput, premioCheiaInput, precoCartelaInput, duracaoEsperaInput, 
                        minBotsInput, maxBotsInput, especialAtivoInput, especialValorInput, 
                        especialDataHoraInput, especialPrecoCartelaInput, comissaoAfiliadoInput, configStatus];
        
        if (inputs.some(el => !el)) {
            console.error("Um ou mais elementos de configuração não foram encontrados no DOM.");
            if(configStatus) { 
                configStatus.textContent = `Erro: Elementos do formulário não encontrados. Verifique o HTML.`; 
                configStatus.className = 'status-message status-error'; 
                configStatus.style.display = 'block'; 
            }
            return;
        }

        try {
            console.log("Buscando configurações atuais...");
            const response = await fetch('/admin/premios-e-preco', { headers: {'Accept': 'application/json'} });
             if (!response.ok) { let errorMsg = `Erro ${response.status}`; try { const errorData = await response.json(); errorMsg = errorData.message || errorMsg; } catch(e){} if(response.status === 403) { window.location.href = '/admin/login.html'; return; } throw new Error(errorMsg); }
            const data = await response.json();
            console.log("Configurações recebidas:", data);

            premioLinhaInput.value = parseFloat(data.premio_linha || '0').toFixed(2);
            premioCheiaInput.value = parseFloat(data.premio_cheia || '0').toFixed(2);
            precoCartelaInput.value = parseFloat(data.preco_cartela || '0').toFixed(2);
            duracaoEsperaInput.value = parseInt(data.duracao_espera || '20', 10); 
            minBotsInput.value = parseInt(data.min_bots || '80', 10);
            maxBotsInput.value = parseInt(data.max_bots || '150', 10);
            especialAtivoInput.value = data.sorteio_especial_ativo || 'false';
            especialValorInput.value = parseFloat(data.sorteio_especial_valor || '0').toFixed(2);
            especialDataHoraInput.value = data.sorteio_especial_datahora || ''; 
            especialPrecoCartelaInput.value = parseFloat(data.sorteio_especial_preco_cartela || '10.00').toFixed(2);
            
            // Carrega o valor da comissão
            comissaoAfiliadoInput.value = parseFloat(data.comissao_afiliado_percentual || '0.30').toFixed(2);

        } catch (error) {
            console.error("Erro ao carregar configurações:", error);
            if (configStatus) {
                configStatus.textContent = `Erro ao carregar: ${error.message}`;
                configStatus.className = 'status-message status-error';
                configStatus.style.display = 'block';
            }
        }
    }

    if (formConfig) { 
        formConfig.addEventListener('submit', async (event) => {
            event.preventDefault();
            
             // Validação para garantir que os elementos existem antes de tentar salvar
            if (!premioLinhaInput || !premioCheiaInput || !precoCartelaInput || !duracaoEsperaInput ||
                 !minBotsInput || !maxBotsInput || !especialAtivoInput || !especialValorInput || 
                 !especialDataHoraInput || !especialPrecoCartelaInput || !comissaoAfiliadoInput || 
                 !configStatus || !btnSalvarConfig) {
                  console.error("Erro no submit: Elementos de configuração não encontrados.");
                  alert("Erro: Elementos do formulário não encontrados. Recarregue a página.");
                  return;
             }
            
            configStatus.style.display = 'none';
            btnSalvarConfig.disabled = true; btnSalvarConfig.textContent = 'Salvando...';

            const dadosParaSalvar = {
                premio_linha: parseFloat(premioLinhaInput.value),
                premio_cheia: parseFloat(premioCheiaInput.value),
                preco_cartela: parseFloat(precoCartelaInput.value),
                duracao_espera: parseInt(duracaoEsperaInput.value, 10), 
                min_bots: parseInt(minBotsInput.value, 10), 
                max_bots: parseInt(maxBotsInput.value, 10), 
                sorteio_especial_ativo: especialAtivoInput.value,
                sorteio_especial_valor: parseFloat(especialValorInput.value),
                sorteio_especial_datahora: especialDataHoraInput.value, 
                sorteio_especial_preco_cartela: parseFloat(especialPrecoCartelaInput.value),
                comissao_afiliado_percentual: parseFloat(comissaoAfiliadoInput.value) // Envia o valor
            };
            console.log("Salvando configurações:", dadosParaSalvar);

            try {
                const response = await fetch('/admin/premios-e-preco', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(dadosParaSalvar),
                });
                if (!response.ok) { let errorMsg = `Erro ${response.status}`; try { const errorData = await response.json(); errorMsg = errorData.message || errorMsg; } catch(e){} if(response.status === 403) { window.location.href = '/admin/login.html'; return; } throw new Error(errorMsg); }
                const result = await response.json();
                console.log("Resposta do servidor:", result);
                configStatus.textContent = result.message || 'Configurações salvas com sucesso!';
                configStatus.className = 'status-message status-success';
                configStatus.style.display = 'block';
            } catch (error) {
                console.error("Erro ao salvar configurações:", error);
                configStatus.textContent = `Erro ao salvar: ${error.message}`;
                configStatus.className = 'status-message status-error';
                configStatus.style.display = 'block';
            } finally {
                btnSalvarConfig.disabled = false;
                btnSalvarConfig.textContent = 'Salvar Configurações';
            }
        });
    } else {
         console.error("Formulário 'form-config' não encontrado.");
    }

    carregarConfiguracoesAtuais(); // Carrega tudo ao iniciar
});
