document.addEventListener('DOMContentLoaded', () => {
    console.log("Dashboard DOM carregado.");

    if (typeof io === 'undefined') { console.error("ERRO CRÍTICO: Socket.IO (io) não encontrada."); alert("Erro crítico..."); return; }
    console.log("Socket.IO (io) encontrado.");

    const socket = io();

    // --- Seletores do DOM ---
    const sorteioIdHeaderEl = document.getElementById('dash-sorteio-id-header');
    const estadoHeaderEl = document.getElementById('dash-estado-header');
    const jogadoresTotalEl = document.getElementById('dash-jogadores-total');
    const ultimoNumeroEl = document.getElementById('dash-ultimo-numero');
    const globoContainer = document.getElementById('dash-globo-numeros');
    const listaVencedoresContainer = document.getElementById('lista-ganhadores');
    
    // ==================================================
    // --- INÍCIO DA MODIFICAÇÃO (SELETORES DE PRÊMIO) ---
    // ==================================================
    // Seleciona não apenas os valores, mas os 'info-item' (pais) e os 'labels'
    const dashPremioLinhaEl = document.getElementById('dash-premio-linha');
    const dashPremioCheiaEl = document.getElementById('dash-premio-cheia');
    
    const dashPremioLinhaContainer = dashPremioLinhaEl ? dashPremioLinhaEl.closest('.info-item') : null;
    const dashPremioCheiaContainer = dashPremioCheiaEl ? dashPremioCheiaEl.closest('.info-item') : null;
    // Pega o 'span' (label) dentro do container do prêmio "Cheia"
    const dashPremioCheiaLabel = dashPremioCheiaContainer ? dashPremioCheiaContainer.querySelector('span') : null; 
    // ==================================================
    // --- FIM DA MODIFICAÇÃO ---
    // ==================================================

    const btnToggleSom = document.getElementById('btn-toggle-som');
    const areaPrincipalEl = document.querySelector('.area-principal');
    const listaQuaseLaContainer = document.getElementById('lista-quase-la');
    const anuncioVencedorOverlay = document.getElementById('anuncio-vencedor-overlay');
    const anuncioPremioEl = document.getElementById('anuncio-vencedor-premio');
    const anuncioNomeEl = document.getElementById('anuncio-vencedor-nome');
    const anuncioEsperaOverlay = document.getElementById('anuncio-espera-overlay');
    
    const esperaCronometroDisplay = document.getElementById('espera-cronometro-display');

    // --- Variável para rastrear o último estado conhecido ---
    let ultimoEstadoConhecido = null;

    // ==================================================
    // --- INÍCIO DA MODIFICAÇÃO (CORREÇÃO DE LÓGICA) ---
    // ==================================================
    // Variável para guardar a configuração recebida
    let globalConfig = null;
    // ==================================================
    // --- FIM DA MODIFICAÇÃO ---
    // ==================================================


    // Verifica elementos
    if (!sorteioIdHeaderEl || !estadoHeaderEl || !jogadoresTotalEl || !ultimoNumeroEl || !globoContainer || !listaVencedoresContainer || !dashPremioLinhaEl || !dashPremioCheiaEl || !btnToggleSom || !areaPrincipalEl || !listaQuaseLaContainer || !anuncioVencedorOverlay || !anuncioPremioEl || !anuncioNomeEl || !anuncioEsperaOverlay || !esperaCronometroDisplay || 
        !dashPremioLinhaContainer || !dashPremioCheiaContainer || !dashPremioCheiaLabel ) { // <-- Adicionado ao check
        console.error("ERRO CRÍTICO: Um ou mais elementos essenciais do Dashboard não foram encontrados."); alert("Erro ao carregar a interface. Verifique o HTML e o Console (F12)."); return;
    }
    console.log("Elementos do DOM selecionados com sucesso.");

    // --- Lógica de Voz (inalterada) ---
    let somAtivo = false; let synth = null; let voces = []; const suporteVoz = 'speechSynthesis' in window;
    if (suporteVoz) {
        synth = window.speechSynthesis; function carregarVozes() { try { voces = synth.getVoices().filter(voice => voice.lang.startsWith('pt')); console.log("Vozes PT:", voces.map(v => v.name)); } catch (error) { console.error("Erro vozes:", error); } }
        carregarVozes(); if (speechSynthesis.onvoiceschanged !== undefined) { speechSynthesis.onvoiceschanged = carregarVozes; }
        function falar(texto) { if (!somAtivo || !synth || !texto) { console.log(`Falar ignorado: som=${somAtivo}`); return; } try { synth.cancel(); const utterThis = new SpeechSynthesisUtterance(texto); const vozPtBr = voces.find(voice => voice.lang === 'pt-BR'); if (vozPtBr) { utterThis.voice = vozPtBr; } else if (voces.length > 0) { utterThis.voice = voces[0]; } utterThis.pitch = 1; utterThis.rate = 1; utterThis.onstart = () => console.log(`Falando: "${texto}"`); utterThis.onerror = (event) => console.error('Erro voz:', event.error); utterThis.onend = () => console.log(`Fim fala: "${texto}"`); synth.speak(utterThis); } catch (error) { console.error("Erro falar:", error); } }
        btnToggleSom.addEventListener('click', () => { somAtivo = !somAtivo; btnToggleSom.classList.toggle('som-ativo', somAtivo); const icon = btnToggleSom.querySelector('i'); if (icon) { if (somAtivo) { icon.className = 'fas fa-volume-high'; falar("Som ativado"); } else { icon.className = 'fas fa-volume-xmark'; if (synth) synth.cancel(); } } });
        const initialIcon = btnToggleSom.querySelector('i'); if(initialIcon) { initialIcon.className = 'fas fa-volume-xmark'; }
    } else { if (btnToggleSom) { btnToggleSom.disabled = true; btnToggleSom.title = "Síntese de voz não suportada"; const icon = btnToggleSom.querySelector('i'); if(icon) { icon.className = 'fas fa-volume-xmark'; } } }


    // --- Funções Auxiliares Visuais ---
    function formatarBRL(valor) { const numero = parseFloat(valor); if (isNaN(numero) || valor === null || valor === undefined) return 'R$ --,--'; return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    
    function formatarTempo(tempo) {
        const minutos = Math.floor(tempo / 60);
        let segundos = tempo % 60;
        segundos = segundos < 10 ? '0' + segundos : segundos;
        return `${minutos}:${segundos}`;
    }
    
    function gerarGlobo() { if (!globoContainer) return; globoContainer.innerHTML = ''; for (let i = 1; i <= 75; i++) { try { const numeroEl = document.createElement('div'); numeroEl.classList.add('dash-globo-numero'); numeroEl.textContent = i; numeroEl.id = `dash-globo-${i}`; globoContainer.appendChild(numeroEl); } catch (error) { console.error(`Erro globo num ${i}:`, error); } } console.log("Globo gerado."); }

    // ==================================================
    // --- INÍCIO DA MODIFICAÇÃO (FUNÇÃO ATUALIZAR PRÊMIOS - CORRIGIDA) ---
    // ==================================================
    /**
     * Atualiza os prêmios exibidos no dashboard.
     * Agora usa a variável 'globalConfig' e o TÍTULO DO SORTEIO.
     */
    function atualizarPremiosDashboard() {
        if (!globalConfig) {
            console.warn("Configurações de prêmio ainda não recebidas.");
            return;
        }
    
        // Pega o ID/Texto do título do sorteio
        const idSorteioAtual = sorteioIdHeaderEl ? sorteioIdHeaderEl.textContent : '';
        
        // ==================================================
        // --- LÓGICA CORRIGIDA ---
        // ==================================================
        // Verifica se o ID do sorteio NÃO é um número (ou seja, é o texto "ESPECIAL" ou a data "2025-11-11T10:15")
        // O "T" é a parte crucial que diferencia o datetime-local de um número de sorteio como "#700"
        const isEspecial = idSorteioAtual.includes('ESPECIAL') || idSorteioAtual.includes('T');
    
        if (globalConfig.sorteio_especial_ativo === 'true' && isEspecial) {
            // MODO SORTEIO ESPECIAL (SEMPRE QUE ESTIVER ATIVO)
            console.log("Dashboard: Exibindo Prêmio Especial.");
            
            // Esconde o prêmio de Linha
            if (dashPremioLinhaContainer) dashPremioLinhaContainer.style.display = 'none';
            
            // Atualiza o prêmio Cheia para ser o Especial
            if (dashPremioCheiaLabel) dashPremioCheiaLabel.textContent = 'Prêmio Especial:';
            if (dashPremioCheiaEl) dashPremioCheiaEl.textContent = formatarBRL(globalConfig.sorteio_especial_valor);
            
        } else {
            // MODO REGULAR (ou Jogo em Andamento)
            console.log("Dashboard: Exibindo Prêmios Regulares.");
    
            // Mostra o prêmio de Linha
            if (dashPremioLinhaContainer) dashPremioLinhaContainer.style.display = 'flex';
            if (dashPremioLinhaEl) dashPremioLinhaEl.textContent = formatarBRL(globalConfig.premio_linha);
    
            // Garante que o prêmio Cheia esteja correto
            if (dashPremioCheiaLabel) dashPremioCheiaLabel.textContent = 'Prêmio Cheia:';
            if (dashPremioCheiaEl) dashPremioCheiaEl.textContent = formatarBRL(globalConfig.premio_cheia);
        }
        // ==================================================
        // --- FIM DA LÓGICA CORRIGIDA ---
        // ==================================================
    }
    // ==================================================
    // --- FIM DA MODIFICAÇÃO ---
    // ==================================================


    function atualizarListaVencedores(vencedores, anunciar = false) {
        console.log("Atualizando Vencedores. Anunciar:", anunciar, "Dados:", vencedores);
        if (!listaVencedoresContainer) return;
        listaVencedoresContainer.innerHTML = '';
        if (!vencedores || vencedores.length === 0) {
            listaVencedoresContainer.innerHTML = '<p>Nenhum ganhador ainda.</p>';
            return;
        }
        try {
            vencedores.forEach((v, index) => {
                const itemVencedor = document.createElement('div');
                const sorteioId = v.sorteioId || '???';
                const premio = v.premio || '???';
                const nome = v.nome || '???';
                itemVencedor.innerHTML = `Sorteio #${sorteioId}: <span class="premio-tag">[${premio}]</span> <span>${nome}</span>`;
                if (index === 0 && anunciar) {
                    itemVencedor.classList.add('novo-vencedor');
                    setTimeout(() => itemVencedor.classList.remove('novo-vencedor'), 2000);
                    const fraseVoz = `Vencedor ${premio.includes('Linha') ? 'da Linha' : 'da Cartela Cheia'}: ${nome}!`;
                    falar(fraseVoz);
                    mostrarAnuncioVencedor(nome, premio);
                }
                listaVencedoresContainer.appendChild(itemVencedor);
            });
            console.log("Tabela vencedores OK.");
        } catch (error) {
            console.error("Erro tabela vencedores:", error);
        }
    }

    function atualizarGloboSorteados(numerosSorteados) { if (!globoContainer || !ultimoNumeroEl) return; try { const todosNumeros = globoContainer.querySelectorAll('.dash-globo-numero'); if (!todosNumeros || todosNumeros.length === 0) { gerarGlobo(); } todosNumeros.forEach(num => num.classList.remove('sorteado')); if (numerosSorteados && numerosSorteados.length > 0) { numerosSorteados.forEach(num => { const el = document.getElementById(`dash-globo-${num}`); if (el) el.classList.add('sorteado'); }); ultimoNumeroEl.textContent = numerosSorteados[numerosSorteados.length - 1]; } else { ultimoNumeroEl.textContent = '--'; } } catch(error){ console.error("Erro globo sorteados:", error); } }

    function atualizarEstadoVisual(estadoString) {
        console.log("Atualizando Estado Visual para:", estadoString);
        ultimoEstadoConhecido = estadoString; // Salva o estado atual
        if (!estadoHeaderEl) return;
        try {
            const textoEstado = estadoString ? estadoString.replace('_', ' ') : 'DESCONHECIDO';
            estadoHeaderEl.textContent = textoEstado;
            estadoHeaderEl.className = 'estado-texto';
            
            if (estadoString === 'ESPERANDO') { 
                estadoHeaderEl.classList.add('estado-esperando'); 
            }
            else if (estadoString === 'JOGANDO_LINHA') { 
                const classe = (sorteioIdHeaderEl.textContent.includes('ESPECIAL')) ? 'estado-jogando-cheia' : 'estado-jogando-linha';
                estadoHeaderEl.classList.add(classe);
            }
            else if (estadoString === 'JOGANDO_CHEIA') { 
                estadoHeaderEl.classList.add('estado-jogando-cheia'); // Sempre verde
            }
            else { 
                estadoHeaderEl.classList.add('estado-esperando'); 
            }
            
        } catch(error) { console.error("Erro estado visual:", error); }
    }

    function getLetraDoNumero(numero) { if (numero >= 1 && numero <= 15) return "B"; if (numero >= 16 && numero <= 30) return "I"; if (numero >= 31 && numero <= 45) return "N"; if (numero >= 46 && numero <= 60) return "G"; if (numero >= 61 && numero <= 75) return "O"; return ""; }
    function atualizarListaQuaseLa(jogadoresPerto) { if (!listaQuaseLaContainer) return; listaQuaseLaContainer.innerHTML = ''; if (!jogadoresPerto || jogadoresPerto.length === 0) { listaQuaseLaContainer.innerHTML = '<p>Ninguém perto ainda...</p>'; return; } try { jogadoresPerto.forEach(j => { const item = document.createElement('p'); const nomeSeguro = j.nome.replace(/</g, "&lt;").replace(/>/g, "&gt;"); item.innerHTML = `<span class="nome-jogador">${nomeSeguro}</span> <span class="faltam-contador">${j.faltam}</span>`; listaQuaseLaContainer.appendChild(item); }); } catch (error) { console.error("Erro ao atualizar lista 'Quase Lá':", error); listaQuaseLaContainer.innerHTML = '<p>Erro ao carregar.</p>'; } }

    let anuncioVencedorTimer = null;
    const DURACAO_ANUNCIO_VENCEDOR = 6000; 
    const DELAY_EXTRA_ANTES_ESPERA = 500; 

    function mostrarAnuncioVencedor(nome, premio) {
        if (!anuncioVencedorOverlay || !anuncioPremioEl || !anuncioNomeEl || !anuncioEsperaOverlay) return;
        if (anuncioVencedorTimer) clearTimeout(anuncioVencedorTimer);

        const tipoPremio = premio.includes('Linha') ? "Vencedor da Linha!" : "BINGO! Cartela Cheia!";
        anuncioPremioEl.textContent = tipoPremio;
        anuncioNomeEl.textContent = nome;

        anuncioEsperaOverlay.classList.add('oculto');
        anuncioVencedorOverlay.classList.add('ativo');

        anuncioVencedorTimer = setTimeout(() => {
            anuncioVencedorOverlay.classList.remove('ativo'); 
            console.log("Escondendo anúncio de vencedor.");

            setTimeout(() => {
                if (ultimoEstadoConhecido === 'ESPERANDO') {
                    console.log("Jogo em espera (após delay), mostrando anúncio de espera.");
                    anuncioEsperaOverlay.classList.remove('oculto'); 
                } else {
                    console.log(`Jogo não está em espera (${ultimoEstadoConhecido}) (após delay), não mostrando anúncio de espera.`);
                }
            }, DELAY_EXTRA_ANTES_ESPERA); 

        }, DURACAO_ANUNCIO_VENCEDOR); 
    }

    // --- OUVINTES DO SOCKET.IO ---
    socket.on('estadoInicial', (data) => {
        console.log("Recebido evento 'estadoInicial':", data);
        try {
            if(!data) { console.error("'estadoInicial' sem dados."); return; }
            gerarGlobo();
            
            // ==================================================
            // --- INÍCIO DA MODIFICAÇÃO (ORDEM DAS FUNÇÕES) ---
            // ==================================================
            
            // Salva a config ANTES de tudo
            if(data.configuracoes) {
                globalConfig = data.configuracoes;
            }
            
            // Atualiza o estado (define 'ultimoEstadoConhecido')
            atualizarEstadoVisual(data.estado);
            
            let tituloSorteio = `BINGO DO PIX - SORTEIO #${data.sorteioId || '???'}`;
            // Se o ID não for um número (ou seja, for a data/hora do especial), muda o título
            if (data.sorteioId && isNaN(parseInt(data.sorteioId, 10))) {
                tituloSorteio = "SORTEIO ESPECIAL AGENDADO!";
            }
            if(sorteioIdHeaderEl) sorteioIdHeaderEl.textContent = tituloSorteio;

            // Atualiza os prêmios (AGORA ele sabe o estado, a config e o título)
            atualizarPremiosDashboard();
            
            // ==================================================
            // --- FIM DA MODIFICAÇÃO ---
            // ==================================================
            
            if(jogadoresTotalEl) jogadoresTotalEl.textContent = data.jogadoresOnline !== undefined ? data.jogadoresOnline : '--';
            
            atualizarListaVencedores(data.ultimosVencedores, false);
            atualizarGloboSorteados(data.numerosSorteados);
            
            if (listaQuaseLaContainer) listaQuaseLaContainer.innerHTML = '<p>Aguardando início...</p>';
            if(data.quaseLa) atualizarListaQuaseLa(data.quaseLa);
            
            if (data.estado === 'ESPERANDO') { 
                anuncioEsperaOverlay.classList.remove('oculto'); 
                esperaCronometroDisplay.textContent = formatarTempo(data.tempoRestante);
            }
            else { 
                anuncioEsperaOverlay.classList.add('oculto'); 
                esperaCronometroDisplay.textContent = "--:--";
            }
            
            console.log("Estado inicial aplicado.");
        } catch (error) { console.error("Erro ao processar 'estadoInicial':", error); }
    });

    socket.on('cronometroUpdate', (data) => {
        if (!data) return;
        
        if (data.estado === 'ESPERANDO' && data.sorteioId && !isNaN(parseInt(data.sorteioId, 10))) {
            if(sorteioIdHeaderEl) sorteioIdHeaderEl.textContent = `BINGO DO PIX - SORTEIO #${data.sorteioId || '???'}`;
        }
        
        atualizarEstadoVisual(data.estado);
        
        // ==================================================
        // --- INÍCIO DA MODIFICAÇÃO (CORREÇÃO DE LÓGICA) ---
        // ==================================================
        // Se o estado é 'ESPERANDO', precisamos reavaliar os prêmios
        // (Isso corrige o bug de quando um jogo especial é agendado)
        atualizarPremiosDashboard();
        // ==================================================
        // --- FIM DA MODIFICAÇÃO ---
        // ==================================================
        
        if (data.estado === 'ESPERANDO' && esperaCronometroDisplay) {
            esperaCronometroDisplay.textContent = formatarTempo(data.tempo);
        }
    });

    socket.on('estadoJogoUpdate', (data) => {
        console.log("Recebido 'estadoJogoUpdate':", data);
        if (!data) return;
        
        let tituloSorteio = `BINGO DO PIX - SORTEIO #${data.sorteioId || '???'}`;
        if (data.sorteioId && isNaN(parseInt(data.sorteioId, 10))) {
            tituloSorteio = "SORTEIO ESPECIAL AO VIVO!";
        }
        if(sorteioIdHeaderEl) sorteioIdHeaderEl.textContent = tituloSorteio;
        
        atualizarEstadoVisual(data.estado);
        
        // ==================================================
        // --- INÍCIO DA MODIFICAÇÃO (CORREÇÃO DE LÓGICA) ---
        // ==================================================
        // Se o estado mudou (ex: de JOGANDO para ESPERANDO), reavalia os prêmios
        atualizarPremiosDashboard();
        // ==================================================
        // --- FIM DA MODIFICAÇÃO ---
        // ==================================================
    });

    socket.on('novoNumeroSorteado', (numeroSorteado) => { console.log(`Dashboard: Recebido 'novoNumeroSorteado': ${numeroSorteado}`); if (numeroSorteado === undefined || numeroSorteado === null) return; try{ ultimoNumeroEl.textContent = numeroSorteado; const globoNumEl = document.getElementById(`dash-globo-${numeroSorteado}`); if (globoNumEl) { globoNumEl.classList.add('sorteado'); } const letra = getLetraDoNumero(numeroSorteado); falar(`${letra} ${numeroSorteado}`); } catch (error){ console.error(`Erro ao processar 'novoNumeroSorteado' ${numeroSorteado}:`, error); } });
    socket.on('contagemJogadores', (contagem) => { if (!contagem) return; if(jogadoresTotalEl) jogadoresTotalEl.textContent = contagem.total !== undefined ? contagem.total : '--'; });
    socket.on('atualizarVencedores', (vencedores) => { console.log("Dashboard: Recebido 'atualizarVencedores'."); atualizarListaVencedores(vencedores, true); });
    socket.on('atualizarQuaseLa', (listaTopJogadores) => { atualizarListaQuaseLa(listaTopJogadores); });

    socket.on('iniciarJogo', () => {
        console.log("Dashboard: Recebido 'iniciarJogo'. Limpando globo e escondendo anúncio de espera.");
        try{
            gerarGlobo();
            if(ultimoNumeroEl) ultimoNumeroEl.textContent = '--';
            if (listaQuaseLaContainer) listaQuaseLaContainer.innerHTML = '<p>Boa sorte!</p>';
            if (anuncioEsperaOverlay) anuncioEsperaOverlay.classList.add('oculto');
            if (esperaCronometroDisplay) esperaCronometroDisplay.textContent = "--:--";
        } catch (error){ console.error("Erro ao processar 'iniciarJogo':", error); }
    });

    socket.on('configAtualizada', (data) => { 
        console.log("Dashboard: Recebido 'configAtualizada':", data); 
        if (!data) return; 
        
        // ==================================================
        // --- INÍCIO DA MODIFICAÇÃO (CORREÇÃO DE LÓGICA) ---
        // ==================================================
        globalConfig = data; // Salva a nova config
        atualizarPremiosDashboard(); // Re-avalia os prêmios
        // ==================================================
        // --- FIM DA MODIFICAÇÃO ---
        // ==================================================
    });
    
    socket.on('connect', () => { console.log(`Dashboard conectado ao servidor com o ID: ${socket.id}`); });
    socket.on('disconnect', (reason) => { console.warn(`Dashboard desconectado do servidor: ${reason}`); if(estadoHeaderEl) estadoHeaderEl.textContent = "DESCONECTADO"; if(estadoHeaderEl) estadoHeaderEl.className = 'estado-texto estado-esperando'; if (anuncioEsperaOverlay) anuncioEsperaOverlay.classList.remove('oculto'); ultimoEstadoConhecido = 'DESCONECTADO'; });
    socket.on('connect_error', (err) => { console.error(`Dashboard falhou ao conectar: ${err.message}`); });

    // --- PING DE ATIVIDADE ---
    const PING_INTERVALO = 10 * 60 * 1000; // 10 minutos
    async function pingServidor() {
        try {
            await fetch('/ping');
            console.log("Ping enviado ao servidor (Keep-Alive).");
        } catch (err) {
            console.error("Erro ao enviar ping:", err);
        }
    }
    setInterval(pingServidor, PING_INTERVALO);
    setTimeout(pingServidor, 10000); 

});
