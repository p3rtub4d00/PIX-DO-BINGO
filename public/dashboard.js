document.addEventListener('DOMContentLoaded', () => {
    console.log("Dashboard DOM carregado (Versão TV Completa).");

    if (typeof io === 'undefined') {
        console.error("ERRO CRÍTICO: Socket.IO (io) não encontrada.");
        // Tenta recarregar a página se o socket falhar (comum em TVs)
        setTimeout(() => window.location.reload(), 5000);
        return;
    }

    const socket = io();

    // --- SELETORES DO DOM (Mantendo compatibilidade total) ---
    const sorteioIdHeaderEl = document.getElementById('dash-sorteio-id-header');
    const estadoHeaderEl = document.getElementById('dash-estado-header');
    const jogadoresTotalEl = document.getElementById('dash-jogadores-total');
    const ultimoNumeroEl = document.getElementById('dash-ultimo-numero');
    const globoContainer = document.getElementById('dash-globo-numeros');
    const listaVencedoresContainer = document.getElementById('lista-ganhadores');
    const dashPremioLinhaEl = document.getElementById('dash-premio-linha');
    const dashPremioCheiaEl = document.getElementById('dash-premio-cheia');
    const btnToggleSom = document.getElementById('btn-toggle-som');
    const listaQuaseLaContainer = document.getElementById('lista-quase-la');
    
    // Novos Seletores (Visuais TV)
    const anuncioVencedorOverlay = document.getElementById('anuncio-vencedor-overlay');
    const anuncioPremioEl = document.getElementById('anuncio-vencedor-premio');
    const anuncioNomeEl = document.getElementById('anuncio-vencedor-nome');
    const anuncioEsperaOverlay = document.getElementById('anuncio-espera-overlay');
    const esperaCronometroDisplay = document.getElementById('espera-cronometro-display');

    // Variáveis de Estado
    let ultimoEstadoConhecido = null;
    let intervaloPing = null;
    let contadorPingFalhas = 0;

    // --- SISTEMA DE VOZ (Original) ---
    let somAtivo = false;
    let synth = null;
    let voces = [];

    if ('speechSynthesis' in window) {
        synth = window.speechSynthesis;
        
        function carregarVozes() {
            try {
                voces = synth.getVoices().filter(v => v.lang.startsWith('pt'));
            } catch (e) { console.warn("Erro ao carregar vozes:", e); }
        }
        carregarVozes();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = carregarVozes;
        }

        function falar(texto) {
            if (!somAtivo || !synth) return;
            try {
                synth.cancel(); // Para fala anterior
                const utterThis = new SpeechSynthesisUtterance(texto);
                if (voces.length > 0) utterThis.voice = voces[0]; // Tenta pegar voz PT-BR
                synth.speak(utterThis);
            } catch (e) { console.error("Erro na fala:", e); }
        }

        if (btnToggleSom) {
            btnToggleSom.addEventListener('click', () => {
                somAtivo = !somAtivo;
                const icon = btnToggleSom.querySelector('i');
                if (icon) icon.className = somAtivo ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
                // Feedback visual ou sonoro opcional
            });
        }
    }

    // --- FUNÇÕES AUXILIARES ---

    function formatarBRL(valor) {
        return parseFloat(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatarTempo(segundos) {
        if (segundos < 0) return "00:00";
        const m = Math.floor(segundos / 60);
        const s = segundos % 60;
        return `${m}:${s < 10 ? '0' + s : s}`;
    }

    // --- SISTEMA ANTI-QUEDA (PING) - DO SEU ARQUIVO ORIGINAL ---
    async function pingServidor() {
        try {
            // Se tiver uma rota de ping, usa ela. Se não, apenas checa conexão do socket.
            if(socket.connected) {
                contadorPingFalhas = 0;
            } else {
                throw new Error("Socket desconectado");
            }
        } catch (error) {
            console.warn("Falha no Ping:", error);
            contadorPingFalhas++;
            if (contadorPingFalhas > 3) {
                console.error("Muitas falhas de conexão. Tentando reconectar...");
                window.location.reload(); // Recarrega a página da TV para forçar conexão
            }
        }
    }
    // Inicia o Ping a cada 30 segundos
    intervaloPing = setInterval(pingServidor, 30000);


    // --- FUNÇÕES DE INTERFACE ---

    function gerarGlobo() {
        if (!globoContainer) return;
        globoContainer.innerHTML = '';
        for (let i = 1; i <= 75; i++) {
            const numeroEl = document.createElement('div');
            numeroEl.classList.add('dash-globo-numero');
            numeroEl.textContent = i;
            numeroEl.id = `dash-globo-${i}`;
            globoContainer.appendChild(numeroEl);
        }
    }

    function atualizarListaVencedores(vencedores, deveAnunciar) {
        if (!listaVencedoresContainer) return;
        listaVencedoresContainer.innerHTML = '';
        
        if (!vencedores || vencedores.length === 0) {
            listaVencedoresContainer.innerHTML = '<p>Nenhum ganhador ainda.</p>';
            return;
        }

        vencedores.forEach((v, index) => {
            const div = document.createElement('div');
            // Estrutura adaptada para o CSS novo
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <span style="font-weight:bold;">${v.nome}</span>
                    <span class="premio-tag" style="color: gold;">[${v.premio}]</span>
                </div>
                <div style="font-size: 0.8em; opacity: 0.7;">Sorteio #${v.sorteioId} - Cartela ${v.cartelaId}</div>
            `;
            
            // Se for o primeiro da lista e a flag de anunciar estiver ativa
            if (index === 0 && deveAnunciar) {
                div.classList.add('novo-vencedor'); // Animação CSS
                falar(`Temos um vencedor! ${v.nome} ganhou ${v.premio}`);
                mostrarAnuncioVencedor(v.nome, v.premio);
            }
            listaVencedoresContainer.appendChild(div);
        });
    }

    function atualizarGloboSorteados(numeros) {
        if (!globoContainer) return;
        
        // Limpa tudo primeiro
        const todos = document.querySelectorAll('.dash-globo-numero');
        todos.forEach(el => el.classList.remove('sorteado'));

        if (numeros && numeros.length > 0) {
            numeros.forEach(num => {
                const el = document.getElementById(`dash-globo-${num}`);
                if (el) el.classList.add('sorteado');
            });
            // Atualiza a bola da vez
            if (ultimoNumeroEl) {
                const ultimo = numeros[numeros.length - 1];
                ultimoNumeroEl.textContent = ultimo;
                
                // Pequeno efeito visual na bola
                ultimoNumeroEl.classList.remove('pop-anim');
                void ultimoNumeroEl.offsetWidth; // Trigger reflow
                ultimoNumeroEl.classList.add('pop-anim');
            }
        } else {
            if (ultimoNumeroEl) ultimoNumeroEl.textContent = '--';
        }
    }

    function atualizarEstadoVisual(estado) {
        ultimoEstadoConhecido = estado;
        if (!estadoHeaderEl) return;

        // Limpa classes antigas
        estadoHeaderEl.className = 'estado-texto';
        
        if (estado === 'ESPERANDO') {
            estadoHeaderEl.textContent = "AGUARDANDO";
            estadoHeaderEl.classList.add('estado-esperando');
            // Mostra overlay de espera se não estivermos mostrando um vencedor agora
            if (!anuncioVencedorOverlay.classList.contains('ativo')) {
                anuncioEsperaOverlay.classList.remove('oculto');
            }
        } 
        else if (estado === 'JOGANDO_LINHA') {
            estadoHeaderEl.textContent = "VALENDO LINHA";
            estadoHeaderEl.classList.add('estado-jogando-linha');
            anuncioEsperaOverlay.classList.add('oculto');
        } 
        else if (estado === 'JOGANDO_CHEIA') {
            estadoHeaderEl.textContent = "VALENDO BINGO";
            estadoHeaderEl.classList.add('estado-jogando-cheia');
            anuncioEsperaOverlay.classList.add('oculto');
        } 
        else {
            estadoHeaderEl.textContent = estado;
        }
    }

    function mostrarAnuncioVencedor(nome, premio) {
        if (!anuncioVencedorOverlay) return;

        // Preenche dados
        if (anuncioPremioEl) anuncioPremioEl.textContent = premio.includes('Linha') ? "LINHA BATIDA!" : "BINGO!";
        if (anuncioNomeEl) anuncioNomeEl.textContent = nome;

        // Esconde a espera temporariamente
        if (anuncioEsperaOverlay) anuncioEsperaOverlay.classList.add('oculto');

        // Mostra o vencedor
        anuncioVencedorOverlay.classList.add('ativo');

        // Esconde depois de 8 segundos e volta ao normal
        setTimeout(() => {
            anuncioVencedorOverlay.classList.remove('ativo');
            // Se o jogo acabou e voltamos para espera, reexibe o overlay de espera
            if (ultimoEstadoConhecido === 'ESPERANDO') {
                anuncioEsperaOverlay.classList.remove('oculto');
            }
        }, 8000);
    }

    // --- LÓGICA DO SLIDER (ANÚNCIOS) - ADICIONADA ---
    function iniciarSliderAnuncios() {
        const slides = document.querySelectorAll('.slide');
        if (slides.length <= 1) return; 

        let indexAtual = 0;
        
        // Garante que o primeiro está visível
        slides.forEach(s => s.classList.remove('ativo'));
        slides[0].classList.add('ativo');

        setInterval(() => {
            // Remove ativo do atual
            slides[indexAtual].classList.remove('ativo');
            
            // Passa para o próximo
            indexAtual++;
            if (indexAtual >= slides.length) {
                indexAtual = 0;
            }

            // Adiciona ativo no próximo
            slides[indexAtual].classList.add('ativo');
        }, 5000); // 5 segundos por slide
    }

    // --- EVENTOS DO SOCKET.IO ---

    socket.on('connect', () => {
        console.log(`Dashboard conectado: ${socket.id}`);
        // Força atualização imediata
        // socket.emit('solicitarEstadoAtual'); // Caso seu back-end precise disso
    });

    socket.on('disconnect', (reason) => {
        console.warn(`Desconectado: ${reason}`);
        if(estadoHeaderEl) {
            estadoHeaderEl.textContent = "OFFLINE";
            estadoHeaderEl.className = 'estado-texto estado-esperando';
        }
        if (anuncioEsperaOverlay) anuncioEsperaOverlay.classList.remove('oculto');
        ultimoEstadoConhecido = 'DESCONECTADO';
    });

    socket.on('estadoInicial', (data) => {
        console.log("Estado Inicial Recebido", data);
        if (!data) return;

        gerarGlobo();

        if (sorteioIdHeaderEl) sorteioIdHeaderEl.textContent = `SORTEIO #${data.sorteioId || '...'}`;
        if (jogadoresTotalEl) jogadoresTotalEl.textContent = data.jogadoresOnline || '--';

        atualizarEstadoVisual(data.estado);
        atualizarListaVencedores(data.ultimosVencedores, false);
        atualizarGloboSorteados(data.numerosSorteados);
        
        // Atualiza prêmios
        if (data.configuracoes) {
            if (dashPremioLinhaEl) dashPremioLinhaEl.textContent = formatarBRL(data.configuracoes.premio_linha);
            if (dashPremioCheiaEl) dashPremioCheiaEl.textContent = formatarBRL(data.configuracoes.premio_cheia);
        }

        // Se estiver esperando, atualiza cronômetro e mostra anúncios
        if (data.estado === 'ESPERANDO') {
            if (esperaCronometroDisplay) esperaCronometroDisplay.textContent = formatarTempo(data.tempoRestante);
            anuncioEsperaOverlay.classList.remove('oculto');
        } else {
            anuncioEsperaOverlay.classList.add('oculto');
        }
    });

    socket.on('cronometroUpdate', (data) => {
        if (data.estado === 'ESPERANDO' && esperaCronometroDisplay) {
            esperaCronometroDisplay.textContent = formatarTempo(data.tempo);
        }
        // Aproveita para garantir que o estado visual está correto
        if (data.estado !== ultimoEstadoConhecido) {
            atualizarEstadoVisual(data.estado);
        }
    });

    socket.on('novoNumeroSorteado', (numero) => {
        if (ultimoNumeroEl) ultimoNumeroEl.textContent = numero;
        
        const el = document.getElementById(`dash-globo-${numero}`);
        if (el) el.classList.add('sorteado');
        
        falar(`Número ${numero}`);
    });

    socket.on('contagemJogadores', (data) => {
        if (jogadoresTotalEl) jogadoresTotalEl.textContent = data.total;
    });

    socket.on('atualizarVencedores', (vencedores) => {
        atualizarListaVencedores(vencedores, true); // true = anunciar voz/popup
    });
    
    socket.on('iniciarJogo', () => {
        console.log("Jogo Iniciado!");
        gerarGlobo(); // Limpa o globo visual
        if (ultimoNumeroEl) ultimoNumeroEl.textContent = '--';
        if (anuncioEsperaOverlay) anuncioEsperaOverlay.classList.add('oculto');
        atualizarEstadoVisual('JOGANDO_LINHA'); // Assume linha primeiro
    });

    socket.on('configAtualizada', (data) => {
        console.log("Configuração Atualizada", data);
        if (!data) return;
        // Lógica para manter o ID na tela se for sorteio especial
        const idNaTela = sorteioIdHeaderEl ? sorteioIdHeaderEl.textContent : '';
        
        if (idNaTela.includes('T') || (data.isEspecial)) { // Exemplo de lógica para especial
             if (dashPremioCheiaEl) dashPremioCheiaEl.textContent = formatarBRL(data.sorteio_especial_valor || data.premio_cheia);
        } else {
             if (dashPremioLinhaEl) dashPremioLinhaEl.textContent = formatarBRL(data.premio_linha);
             if (dashPremioCheiaEl) dashPremioCheiaEl.textContent = formatarBRL(data.premio_cheia);
        }
    });

    socket.on('listaQuaseLa', (data) => {
         if(!listaQuaseLaContainer) return;
         listaQuaseLaContainer.innerHTML = '';
         if(!data || data.length === 0) {
             listaQuaseLaContainer.innerHTML = '<p>...</p>';
             return;
         }
         // Pega os top 3
         data.slice(0, 3).forEach(item => {
             const p = document.createElement('p');
             p.innerHTML = `<span>Cartela ${item.cartelaId}</span> <span class="faltam-contador">Faltam ${item.faltam}</span>`;
             listaQuaseLaContainer.appendChild(p);
         });
    });

    // Inicia os anúncios
    iniciarSliderAnuncios();
});
