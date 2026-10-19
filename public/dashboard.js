document.addEventListener('DOMContentLoaded', () => {
    console.log("Dashboard DOM carregado (Versão Final Corrigida).");

    if (typeof io === 'undefined') { 
        console.error("ERRO CRÍTICO: Socket.IO (io) não encontrada."); 
        // Tenta recarregar se falhar (comum em Smart TVs)
        setTimeout(() => window.location.reload(), 5000);
        return; 
    }

    const socket = io();

    // --- Seletores do DOM ---
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
    const vencedorLinhaEl = document.getElementById('dash-vencedor-linha');
    const vencedorCheiaEl = document.getElementById('dash-vencedor-cheia');
    const recentBallEls = [1,2,3,4,5].map(i => document.getElementById(`dash-recente-${i}`));
    const headlineAlertEl = document.getElementById('dash-headline-alert');
    const headlineSubEl = document.getElementById('dash-headline-sub');
    const tickerTextoEl = document.getElementById('dash-ticker-texto');
    const dashboardQrImg = document.getElementById('dashboard-qr-img');
    const dashboardQrLink = document.getElementById('dashboard-qr-link');
    const dashboardQrUrl = document.getElementById('dashboard-qr-url');
    const esperaEspecialCardEl = document.getElementById('espera-especial-card');
    const esperaEspecialDataEl = document.getElementById('espera-especial-data');
    const esperaEspecialValorEl = document.getElementById('espera-especial-valor');
    const esperaVencedorAtualEl = document.getElementById('espera-vencedor-atual');
    const esperaQrImg = document.getElementById('espera-qr-img');
    const esperaQrLink = document.getElementById('espera-qr-link');
    const esperaQrUrl = document.getElementById('espera-qr-url');
    const faixaPromocionalEl = document.getElementById('dash-faixa-promocional');
    const faixaPromocionalTextoEl = document.getElementById('dash-faixa-promocional-texto');
    
    // Overlays e Anúncios
    const anuncioVencedorOverlay = document.getElementById('anuncio-vencedor-overlay');
    const anuncioPremioEl = document.getElementById('anuncio-vencedor-premio');
    const anuncioNomeEl = document.getElementById('anuncio-vencedor-nome');
    const anuncioEsperaOverlay = document.getElementById('anuncio-espera-overlay');
    const esperaCronometroDisplay = document.getElementById('espera-cronometro-display');
    const esperaVencedoresListaEl = document.getElementById('espera-vencedores-lista');

    // Tela final profissional da rodada
    const resultadoFinalOverlay = document.getElementById('resultado-final-overlay');
    const finaleWinnerName = document.getElementById('finale-winner-name');
    const finalePrizeValue = document.getElementById('finale-prize-value');
    const finaleRoundId = document.getElementById('finale-round-id');
    const finaleCardId = document.getElementById('finale-card-id');
    const finaleParticipants = document.getElementById('finale-participants');
    const finaleLineWinner = document.getElementById('finale-line-winner');
    const finaleLineValue = document.getElementById('finale-line-value');
    const finaleLastNumbers = document.getElementById('finale-last-numbers');
    const finaleCountdown = document.getElementById('finale-countdown');
    const finaleFinishedAt = document.getElementById('finale-finished-at');

    let ultimoEstadoConhecido = null;
    let contadorPingFalhas = 0;
    let vencedoresCarousel = [];
    let indiceVencedorCarousel = 0;
    let timerVencedorCarousel = null;
    let timerResultadoFinal = null;
    let resultadoFinalVisivel = false;

    // --- Lógica de Voz ---
    let somAtivo = false; 
    let synth = window.speechSynthesis || null; 
    let voces = [];
    
    if (synth) {
        function carregarVozes() { try { voces = synth.getVoices().filter(v => v.lang.startsWith('pt')); } catch (e){} }
        carregarVozes();
        if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = carregarVozes;

        function falar(texto) {
            if (!somAtivo || !synth) return;
            try { 
                synth.cancel(); 
                const utterThis = new SpeechSynthesisUtterance(texto); 
                if (voces.length > 0) utterThis.voice = voces[0];
                synth.speak(utterThis); 
            } catch (e) { console.error("Erro voz:", e); }
        }

        if (btnToggleSom) {
            btnToggleSom.addEventListener('click', () => {
                somAtivo = !somAtivo;
                btnToggleSom.classList.toggle('som-ativo', somAtivo);
                const icon = btnToggleSom.querySelector('i');
                if (icon) {
                    if (somAtivo) { icon.className = 'fas fa-volume-high'; falar("Som ativado"); } 
                    else { icon.className = 'fas fa-volume-xmark'; }
                }
            });
        }
    }

    // --- Funções Auxiliares ---
    function formatarBRL(valor) { 
        const v = parseFloat(valor); 
        if (isNaN(v)) return 'R$ --,--'; 
        return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); 
    }
    
    function formatarTempo(tempo) {
        if(tempo < 0) return "00:00";
        const m = Math.floor(tempo / 60);
        const s = tempo % 60;
        return `${m}:${s < 10 ? '0' + s : s}`;
    }

    function ocultarResultadoFinal() {
        if (timerResultadoFinal) {
            clearInterval(timerResultadoFinal);
            timerResultadoFinal = null;
        }
        resultadoFinalVisivel = false;
        if (resultadoFinalOverlay) {
            resultadoFinalOverlay.classList.remove('is-visible');
            resultadoFinalOverlay.setAttribute('aria-hidden', 'true');
        }
    }

    function renderizarNumerosFinais(numeros) {
        if (!finaleLastNumbers) return;
        finaleLastNumbers.innerHTML = '';

        const lista = Array.isArray(numeros)
            ? numeros.map(n => Number(n)).filter(Number.isFinite).slice(-10)
            : [];

        if (lista.length === 0) {
            const vazio = document.createElement('span');
            vazio.textContent = 'Sem números disponíveis';
            vazio.style.color = '#8aa1b3';
            vazio.style.gridColumn = '1 / -1';
            vazio.style.textAlign = 'center';
            finaleLastNumbers.appendChild(vazio);
            return;
        }

        lista.forEach(numero => {
            const bolinha = document.createElement('b');
            bolinha.className = 'finale-number';
            bolinha.textContent = String(numero);
            finaleLastNumbers.appendChild(bolinha);
        });
    }

    function mostrarResultadoFinal(data, { anunciar = true } = {}) {
        if (!data || !resultadoFinalOverlay) return;

        const vencedor = data.vencedor || {};
        const linha = data.vencedorLinha || {};

        if (finaleWinnerName) finaleWinnerName.textContent = vencedor.nome || 'Ganhador';
        if (finalePrizeValue) finalePrizeValue.textContent = formatarBRL(vencedor.valor);
        if (finaleRoundId) finaleRoundId.textContent = `#${data.sorteioId ?? '---'}`;
        if (finaleCardId) finaleCardId.textContent = vencedor.cartelaId || '---';
        if (finaleParticipants) finaleParticipants.textContent = String(data.participantes ?? '--');
        if (finaleLineWinner) finaleLineWinner.textContent = linha.nome || 'Não informado';
        if (finaleLineValue) finaleLineValue.textContent = formatarBRL(linha.valor);
        if (finaleFinishedAt) {
            const d = data.encerradoEm ? new Date(data.encerradoEm) : new Date();
            finaleFinishedAt.textContent = `Encerrado às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        }

        renderizarNumerosFinais(data.numerosSorteados);

        if (anuncioEsperaOverlay) anuncioEsperaOverlay.classList.add('oculto');
        if (anuncioVencedorOverlay) anuncioVencedorOverlay.style.display = 'none';

        resultadoFinalVisivel = true;
        resultadoFinalOverlay.classList.add('is-visible');
        resultadoFinalOverlay.setAttribute('aria-hidden', 'false');

        if (timerResultadoFinal) clearInterval(timerResultadoFinal);

        const fallbackMs = Math.max(1, Number(data.duracaoSegundos) || 25) * 1000;
        const alvo = Number(data.exibirAte) || (Date.now() + fallbackMs);

        const atualizarContador = () => {
            const restante = Math.max(0, Math.ceil((alvo - Date.now()) / 1000));
            if (finaleCountdown) finaleCountdown.textContent = String(restante);
            if (restante <= 0) {
                clearInterval(timerResultadoFinal);
                timerResultadoFinal = null;
                ocultarResultadoFinal();
            }
        };

        atualizarContador();
        timerResultadoFinal = setInterval(atualizarContador, 250);

        if (anunciar && typeof falar === 'function') {
            falar(`Bingo encerrado! Parabéns ${vencedor.nome || 'ao ganhador'}. Você ganhou a cartela cheia no valor de ${formatarBRL(vencedor.valor)}.`);
        }
    }

    function configurarQrCompra() {
        if (!dashboardQrImg || !dashboardQrLink || !dashboardQrUrl) return;

        const destinoCompra = 'https://pix-do-bingo.onrender.com/';
        const qrEndpoint = 'https://api.qrserver.com/v1/create-qr-code/';
        const qrSrc = `${qrEndpoint}?size=280x280&margin=8&data=${encodeURIComponent(destinoCompra)}`;

        dashboardQrImg.src = qrSrc;
        if (esperaQrImg) esperaQrImg.src = qrSrc;
        dashboardQrLink.href = destinoCompra;
        if (esperaQrLink) esperaQrLink.href = destinoCompra;
        dashboardQrUrl.textContent = destinoCompra.replace(/^https?:\/\//, '');
        if (esperaQrUrl) esperaQrUrl.textContent = destinoCompra.replace(/^https?:\/\//, '');
    }

    // --- PING (Anti-Queda) ---
    setInterval(() => {
        if(socket.connected) contadorPingFalhas = 0;
        else { contadorPingFalhas++; if(contadorPingFalhas > 5) window.location.reload(); }
    }, 30000);

    // --- UI FUNCTIONS ---
    function gerarGlobo() {
        if (!globoContainer) return;
        globoContainer.innerHTML = '';
        for (let i = 1; i <= 75; i++) {
            const el = document.createElement('div');
            el.className = 'dash-globo-numero';
            el.textContent = i;
            el.id = `dash-globo-${i}`;
            globoContainer.appendChild(el);
        }
    }

    function atualizarVencedoresDaRodada(vencedores) {
        const lista = Array.isArray(vencedores) ? vencedores : [];
        const rodada = sorteioAtualId == null ? null : String(sorteioAtualId);
        const candidatos = rodada
            ? lista.filter(v => v?.sorteioId == null || String(v.sorteioId) === rodada)
            : lista;

        const linha = candidatos.find(v => String(v?.premio || '').toLowerCase().includes('linha'));
        const cheia = candidatos.find(v => {
            const premio = String(v?.premio || '').toLowerCase();
            return premio.includes('cheia') || premio.includes('bingo');
        });

        if (vencedorLinhaEl) vencedorLinhaEl.textContent = linha?.nome || 'Aguardando...';
        if (vencedorCheiaEl) vencedorCheiaEl.textContent = cheia?.nome || 'Aguardando...';
    }

    function atualizarListaVencedores(vencedores, anunciar = false) {
        if (listaVencedoresContainer) {
            listaVencedoresContainer.innerHTML = '';

            if (!vencedores || vencedores.length === 0) {
                listaVencedoresContainer.innerHTML = '<p>Nenhum ganhador ainda.</p>';
            } else {
                vencedores.forEach((v, index) => {
                    const div = document.createElement('div');
                    div.textContent = `Sorteio #${v.sorteioId}: [${v.premio}] ${v.nome}`;
                    if (index === 0 && anunciar) {
                        div.classList.add('novo-vencedor');
                        setTimeout(() => div.classList.remove('novo-vencedor'), 3000);
                    }
                    listaVencedoresContainer.appendChild(div);
                });
            }
        }

        atualizarVencedoresDaRodada(vencedores);
    }

    function atualizarBolasRecentes(nums) {
        numerosSorteadosAtuais = Array.isArray(nums)
            ? nums.map(n => Number(n)).filter(n => Number.isFinite(n))
            : [];

        const anteriores = numerosSorteadosAtuais.slice(-6, -1);
        const slots = Array(5 - anteriores.length).fill(null).concat(anteriores);

        recentBallEls.forEach((el, index) => {
            if (!el) return;
            const valor = slots[index];
            el.textContent = valor == null ? '•' : String(valor);
            el.classList.toggle('empty', valor == null);
        });
    }

    function atualizarGloboSorteados(nums) {
        if (!globoContainer) return;
        document.querySelectorAll('.dash-globo-numero').forEach(el => el.classList.remove('sorteado'));

        const lista = Array.isArray(nums) ? nums : [];
        if (lista.length > 0) {
            lista.forEach(n => {
                const el = document.getElementById(`dash-globo-${n}`);
                if (el) el.classList.add('sorteado');
            });
            if (ultimoNumeroEl) ultimoNumeroEl.textContent = lista[lista.length - 1];
        } else if (ultimoNumeroEl) {
            ultimoNumeroEl.textContent = '--';
        }

        atualizarBolasRecentes(lista);
    }

    // --- CORREÇÃO DO STATUS (LINHA -> CHEIA) ---
    function atualizarEstadoVisual(estadoStr) {
        console.log("Atualizando Estado Visual:", estadoStr);
        ultimoEstadoConhecido = estadoStr;
        if (!estadoHeaderEl) return;

        // 1. Limpa TODAS as classes de cor
        estadoHeaderEl.className = 'estado-texto'; // Reseta para o básico
        
        // 2. Define texto e nova classe
        if (estadoStr === 'ESPERANDO') {
            estadoHeaderEl.textContent = "AGUARDANDO";
            estadoHeaderEl.classList.add('estado-esperando');
            if (headlineAlertEl) headlineAlertEl.textContent = '🔥 PREPARE-SE! O BINGO VAI COMEÇAR 🔥';
            if (headlineSubEl) headlineSubEl.textContent = 'Compre suas cartelas e acompanhe ao vivo.';
            if(!anuncioVencedorOverlay.classList.contains('ativo')) {
                anuncioEsperaOverlay.classList.remove('oculto');
            }
        } 
        else if (estadoStr === 'JOGANDO_LINHA') {
            estadoHeaderEl.textContent = "VALENDO LINHA";
            estadoHeaderEl.classList.add('estado-jogando-linha');
            if (headlineAlertEl) headlineAlertEl.textContent = '⚡ VALENDO LINHA AGORA! ⚡';
            if (headlineSubEl) headlineSubEl.textContent = 'Atenção no tabuleiro: o prêmio de linha pode sair a qualquer momento.';
            anuncioEsperaOverlay.classList.add('oculto');
        } 
        else if (estadoStr === 'JOGANDO_CHEIA') {
            estadoHeaderEl.textContent = "VALENDO BINGO";
            estadoHeaderEl.classList.add('estado-jogando-cheia');
            if (headlineAlertEl) headlineAlertEl.textContent = '🚨 AGORA É CARTELA CHEIA! 🚨';
            if (headlineSubEl) headlineSubEl.textContent = 'Foco total: o BINGO pode sair na próxima pedra.';
            anuncioEsperaOverlay.classList.add('oculto');
        }
        else {
            estadoHeaderEl.textContent = estadoStr || "...";
            estadoHeaderEl.classList.add('estado-esperando');
            if (headlineAlertEl) headlineAlertEl.textContent = '🎯 BINGO DO PIX AO VIVO';
            if (headlineSubEl) headlineSubEl.textContent = 'Acompanhe os números em tempo real.';
        }
    }

    // --- CORREÇÃO DO QUASE LÁ ---
    function processarQuaseLa(data) {
        if (!listaQuaseLaContainer) return;
        listaQuaseLaContainer.innerHTML = '';

        // Se não tiver dados ou array vazio
        if (!data || data.length === 0) {
            listaQuaseLaContainer.innerHTML = '<p>Aguardando...</p>';
            return;
        }

        // 1. FILTRO: Apenas quem falta 5 ou menos
        const filtrados = data.filter(item => item.faltam <= 5);

        // 2. ORDENAÇÃO: Quem falta menos primeiro
        filtrados.sort((a, b) => a.faltam - b.faltam);

        if (filtrados.length === 0) {
            listaQuaseLaContainer.innerHTML = '<p>Ninguém perto ainda...</p>';
            return;
        }

        // 3. EXIBIÇÃO
        filtrados.slice(0, 4).forEach(item => {
            const row = document.createElement('div');
            row.className = 'quase-item';

            let classeCor = 'azul';
            if (item.faltam === 1) classeCor = 'vermelho';
            else if (item.faltam === 2) classeCor = 'laranja';

            const nomeSeguro = item.nome ? item.nome.substring(0, 36) : 'Jogador';
            const textoBolas = item.faltam === 1 ? 'BOLA' : 'BOLAS';

            row.innerHTML = `
                <span class="quase-nome">${nomeSeguro}</span>
                <span class="quase-faltam ${classeCor}">FALTAM ${item.faltam} ${textoBolas}</span>
            `;

            listaQuaseLaContainer.appendChild(row);
        });

        if (tickerTextoEl && filtrados[0]) {
            tickerTextoEl.textContent = `🔥 Quase lá: ${filtrados[0].nome} (faltam ${filtrados[0].faltam})`;
        }
    }

    function atualizarListaVencedoresEspera(vencedores) {
        if (!esperaVencedoresListaEl) return;
        esperaVencedoresListaEl.innerHTML = '';

        if (!vencedores || vencedores.length === 0) {
            esperaVencedoresListaEl.innerHTML = '<p>Nenhum ganhador ainda.</p>';
            return;
        }

        vencedores.slice(0, 5).forEach(v => {
            const div = document.createElement('div');
            div.className = 'item-vencedor';
            div.textContent = `Sorteio #${v.sorteioId}: [${v.premio}] ${v.nome}`;
            esperaVencedoresListaEl.appendChild(div);
        });
    }

    function atualizarFaixaPromocional(configs) {
        if (!faixaPromocionalEl || !faixaPromocionalTextoEl) return;

        const texto = configs?.mensagem_promocional_dashboard || '';
        const ativoRaw = (configs?.mostrar_promocao_dashboard ?? 'true').toString().toLowerCase();
        const ativo = ativoRaw === 'true' || ativoRaw === '1';

        if (!ativo || !texto.trim()) {
            faixaPromocionalEl.classList.add('oculto');
            return;
        }

        faixaPromocionalTextoEl.textContent = texto.trim();
        faixaPromocionalEl.classList.remove('oculto');
    }

    function atualizarCardSorteioEspecial(configs) {
        if (!esperaEspecialCardEl || !esperaEspecialDataEl || !esperaEspecialValorEl) return;
        const ativo = String(configs?.sorteio_especial_ativo || 'false').toLowerCase() === 'true';
        const dataHoraRaw = (configs?.sorteio_especial_datahora || '').trim();
        const valorRaw = configs?.sorteio_especial_valor || '0';

        if (!ativo || !dataHoraRaw) {
            esperaEspecialCardEl.classList.add('oculto');
            return;
        }

        let dataFormatada = dataHoraRaw;
        try {
            const dt = new Date(dataHoraRaw);
            if (!Number.isNaN(dt.getTime())) dataFormatada = dt.toLocaleString('pt-BR');
        } catch (e) {}

        const valorNum = parseFloat(valorRaw);
        const valorFmt = Number.isFinite(valorNum)
            ? valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : 'R$ --';

        esperaEspecialDataEl.textContent = `Data: ${dataFormatada}`;
        esperaEspecialValorEl.textContent = `Prêmio: ${valorFmt}`;
        esperaEspecialCardEl.classList.remove('oculto');
    }

    function atualizarVencedoresCarousel(vencedores) {
        if (!esperaVencedorAtualEl) return;
        vencedoresCarousel = Array.isArray(vencedores) ? vencedores.slice(0, 10) : [];
        indiceVencedorCarousel = 0;

        if (vencedoresCarousel.length === 0) {
            esperaVencedorAtualEl.textContent = 'Aguardando vencedor...';
            return;
        }

        const v = vencedoresCarousel[0];
        esperaVencedorAtualEl.textContent = `Sorteio #${v.sorteioId} [${v.premio}] ${v.nome}`;
    }

    function iniciarVencedoresCarousel() {
        if (timerVencedorCarousel || !esperaVencedorAtualEl) return;
        timerVencedorCarousel = setInterval(() => {
            if (!vencedoresCarousel.length) return;
            indiceVencedorCarousel = (indiceVencedorCarousel + 1) % vencedoresCarousel.length;
            const v = vencedoresCarousel[indiceVencedorCarousel];
            esperaVencedorAtualEl.textContent = `Sorteio #${v.sorteioId} [${v.premio}] ${v.nome}`;
        }, 3000);
    }

    function atualizarPremios(configs, sorteioId) {
        if (!configs || !dashPremioLinhaEl || !dashPremioCheiaEl) return;
        
        const isSpecial = sorteioId && sorteioId.toString().includes('T');
        const parentLinha = dashPremioLinhaEl.closest('.info-item');

        if (isSpecial) {
            if(parentLinha) parentLinha.style.display = 'none';
            dashPremioCheiaEl.textContent = formatarBRL(configs.sorteio_especial_valor);
        } else {
            if(parentLinha) parentLinha.style.display = 'flex';
            dashPremioLinhaEl.textContent = formatarBRL(configs.premio_linha);
            dashPremioCheiaEl.textContent = formatarBRL(configs.premio_cheia);
        }
    }

    function mostrarAnuncioVencedor(nome, premio) {
        if (!anuncioVencedorOverlay) return;
        
        const tipo = premio.includes('Linha') ? "LINHA BATIDA!" : "BINGO!";
        if(anuncioPremioEl) anuncioPremioEl.textContent = tipo;
        if(anuncioNomeEl) anuncioNomeEl.textContent = nome;
        if (tickerTextoEl) tickerTextoEl.textContent = `🏆 ${tipo} - ${nome}`;

        anuncioEsperaOverlay.classList.add('oculto');
        anuncioVencedorOverlay.classList.add('ativo');

        setTimeout(() => {
            anuncioVencedorOverlay.classList.remove('ativo');
            if (ultimoEstadoConhecido === 'ESPERANDO') {
                anuncioEsperaOverlay.classList.remove('oculto');
            }
        }, 8000);
    }

    function iniciarSlider() {
        const slides = document.querySelectorAll('.slide');
        if (slides.length <= 1) return;
        let idx = 0;
        slides[0].classList.add('ativo');
        setInterval(() => {
            slides[idx].classList.remove('ativo');
            idx = (idx + 1) % slides.length;
            slides[idx].classList.add('ativo');
        }, 5000);
    }

    // --- SOCKET EVENTS ---
    configurarQrCompra();

    socket.on('estadoInicial', (data) => {
        if (!data) return;
        console.log("Estado Inicial:", data);
        gerarGlobo();
        sorteioAtualId = data.sorteioId ?? sorteioAtualId;
        if(sorteioIdHeaderEl) sorteioIdHeaderEl.textContent = `BINGO DO PIX - SORTEIO #${data.sorteioId || '...'}`;
        if(jogadoresTotalEl) jogadoresTotalEl.textContent = data.jogadoresOnline || '--';
        
        atualizarEstadoVisual(data.estado);
        atualizarListaVencedores(data.ultimosVencedores, false);
        atualizarListaVencedoresEspera(data.ultimosVencedores);
        atualizarGloboSorteados(data.numerosSorteados);
        atualizarPremios(data.configuracoes, data.sorteioId);
        atualizarCardSorteioEspecial(data.configuracoes);
        atualizarVencedoresCarousel(data.ultimosVencedores);
        atualizarFaixaPromocional(data.configuracoes);
        if (data.resultadoFinal) {
            mostrarResultadoFinal(data.resultadoFinal, { anunciar: false });
        } else {
            ocultarResultadoFinal();
        }
        
        // Se já tiver lista de quase lá no estado inicial
        if(data.quaseLa) processarQuaseLa(data.quaseLa);

        if (data.estado === 'ESPERANDO') {
            anuncioEsperaOverlay.classList.remove('oculto');
            if(esperaCronometroDisplay) esperaCronometroDisplay.textContent = formatarTempo(data.tempoRestante);
        } else {
            anuncioEsperaOverlay.classList.add('oculto');
        }
    });

    socket.on('cronometroUpdate', (d) => {
        if(d.estado === 'ESPERANDO' && esperaCronometroDisplay) esperaCronometroDisplay.textContent = formatarTempo(d.tempo);
        // Garante que o estado visual esteja sincronizado
        if(d.estado !== ultimoEstadoConhecido) atualizarEstadoVisual(d.estado);
    });

    // --- CORREÇÃO: Múltiplos listeners para garantir atualização de estado ---
    socket.on('estadoJogoUpdate', (data) => {
        console.log("Update de Estado:", data);
        if (data.sorteioId) sorteioAtualId = data.sorteioId;
        if(data.sorteioId && sorteioIdHeaderEl) sorteioIdHeaderEl.textContent = `BINGO DO PIX - SORTEIO #${data.sorteioId}`;
        atualizarEstadoVisual(data.estado);
        if (data.estado === 'ESPERANDO') ocultarResultadoFinal();
    });

    socket.on('resultadoFinalRodada', (data) => {
        console.log('Resultado final da rodada:', data);
        mostrarResultadoFinal(data, { anunciar: true });
    });

    socket.on('novoNumeroSorteado', (n) => {
        const numero = Number(n);

        if (ultimoNumeroEl) {
            ultimoNumeroEl.textContent = Number.isFinite(numero) ? numero : n;
            ultimoNumeroEl.classList.remove('novo-numero');
            void ultimoNumeroEl.offsetWidth;
            ultimoNumeroEl.classList.add('novo-numero');
        }

        const el = document.getElementById(`dash-globo-${n}`);
        if (el) el.classList.add('sorteado');

        if (Number.isFinite(numero)) {
            // O servidor envia cada pedra uma vez. Mantemos o histórico local
            // para que as cinco bolas menores sejam sempre os chamados anteriores.
            if (!numerosSorteadosAtuais.includes(numero)) {
                numerosSorteadosAtuais.push(numero);
            }
            atualizarBolasRecentes(numerosSorteadosAtuais);
        }

        falar(`${n}`);
        if (tickerTextoEl) tickerTextoEl.textContent = `🎱 Saiu a pedra ${n}`;
    });

    socket.on('contagemJogadores', (d) => { if(jogadoresTotalEl) jogadoresTotalEl.textContent = d.total; });
    socket.on('atualizarVencedores', (vencedores) => {
        atualizarListaVencedores(vencedores, false);
        atualizarListaVencedoresEspera(vencedores);
        atualizarVencedoresCarousel(vencedores);

        if (!Array.isArray(vencedores) || vencedores.length === 0) return;
        const v = vencedores[0];
        const textoPremio = (v.premio || '').includes('Linha') ? 'Linha' : 'Bingo';
        falar(`Vencedor da ${textoPremio}: ${v.nome}`);
        mostrarAnuncioVencedor(v.nome, v.premio || 'Cartela Cheia');
    });

// --- CORREÇÃO: Escuta ambos os nomes de evento para Quase Lá ---
    socket.on('listaQuaseLa', (data) => processarQuaseLa(data));
    socket.on('atualizarQuaseLa', (data) => processarQuaseLa(data));

    socket.on('iniciarJogo', () => {
        ocultarResultadoFinal();
        gerarGlobo();
        numerosSorteadosAtuais = [];
        atualizarBolasRecentes([]);

        if (ultimoNumeroEl) ultimoNumeroEl.textContent = '--';
        if (vencedorLinhaEl) vencedorLinhaEl.textContent = 'Aguardando...';
        if (vencedorCheiaEl) vencedorCheiaEl.textContent = 'Aguardando...';

        anuncioEsperaOverlay.classList.add('oculto');
        atualizarEstadoVisual('JOGANDO_LINHA');

        if (listaQuaseLaContainer) listaQuaseLaContainer.innerHTML = '<p>Iniciando...</p>';
        if (tickerTextoEl) tickerTextoEl.textContent = '🚀 Jogo iniciado! Boa sorte a todos!';
    });

    socket.on('configAtualizada', (data) => {
        const idAtual = sorteioIdHeaderEl ? sorteioIdHeaderEl.textContent : '';
        atualizarPremios(data, idAtual);
        atualizarCardSorteioEspecial(data);
    });

    iniciarSlider();
    iniciarVencedoresCarousel();
});
