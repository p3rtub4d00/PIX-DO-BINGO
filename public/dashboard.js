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
    
    // Overlays e Anúncios
    const anuncioVencedorOverlay = document.getElementById('anuncio-vencedor-overlay');
    const anuncioPremioEl = document.getElementById('anuncio-vencedor-premio');
    const anuncioNomeEl = document.getElementById('anuncio-vencedor-nome');
    const anuncioEsperaOverlay = document.getElementById('anuncio-espera-overlay');
    const esperaCronometroDisplay = document.getElementById('espera-cronometro-display');

    let ultimoEstadoConhecido = null;
    let contadorPingFalhas = 0;

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

    function atualizarListaVencedores(vencedores, anunciar = false) {
        if (!listaVencedoresContainer) return;
        listaVencedoresContainer.innerHTML = '';
        
        if (!vencedores || vencedores.length === 0) {
            listaVencedoresContainer.innerHTML = '<p>Nenhum ganhador ainda.</p>';
            return;
        }

        vencedores.forEach((v, index) => {
            const div = document.createElement('div');
            // Estilo compatível com o CSS atual
            div.innerHTML = `Sorteio #${v.sorteioId}: <span class="premio-tag">[${v.premio}]</span> <span>${v.nome}</span>`;
            
            if (index === 0 && anunciar) {
                div.classList.add('novo-vencedor');
                setTimeout(() => div.classList.remove('novo-vencedor'), 3000);
                const textoPremio = v.premio.includes('Linha') ? 'Linha' : 'Bingo';
                falar(`Vencedor da ${textoPremio}: ${v.nome}`);
                mostrarAnuncioVencedor(v.nome, v.premio);
            }
            listaVencedoresContainer.appendChild(div);
        });
    }

    function atualizarGloboSorteados(nums) {
        if (!globoContainer) return;
        // Limpa anteriores
        document.querySelectorAll('.dash-globo-numero').forEach(el => el.classList.remove('sorteado'));
        
        if (nums && nums.length > 0) {
            nums.forEach(n => {
                const el = document.getElementById(`dash-globo-${n}`);
                if (el) el.classList.add('sorteado');
            });
            if(ultimoNumeroEl) ultimoNumeroEl.textContent = nums[nums.length - 1];
        } else {
            if(ultimoNumeroEl) ultimoNumeroEl.textContent = '--';
        }
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
            if(!anuncioVencedorOverlay.classList.contains('ativo')) {
                anuncioEsperaOverlay.classList.remove('oculto');
            }
        } 
        else if (estadoStr === 'JOGANDO_LINHA') {
            estadoHeaderEl.textContent = "VALENDO LINHA";
            estadoHeaderEl.classList.add('estado-jogando-linha');
            anuncioEsperaOverlay.classList.add('oculto');
        } 
        else if (estadoStr === 'JOGANDO_CHEIA') {
            estadoHeaderEl.textContent = "VALENDO BINGO";
            estadoHeaderEl.classList.add('estado-jogando-cheia');
            anuncioEsperaOverlay.classList.add('oculto');
        }
        else {
            estadoHeaderEl.textContent = estadoStr || "...";
            estadoHeaderEl.classList.add('estado-esperando');
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
        filtrados.slice(0, 5).forEach(item => {
            const p = document.createElement('p');
            
            // Define cor baseada na urgência
            let estiloContador = 'background-color: var(--color-accent-blue);'; // Padrão
            if (item.faltam === 1) estiloContador = 'background-color: #ff0040; animation: pulse 1s infinite;'; // Vermelho piscando
            else if (item.faltam === 2) estiloContador = 'background-color: #ffaa00;'; // Laranja

            const nomeSeguro = item.nome ? item.nome.substring(0, 15) : 'Jogador';

            p.innerHTML = `
                <span class="nome-jogador">${nomeSeguro}</span> 
                <span class="faltam-contador" style="${estiloContador}">${item.faltam}</span>
            `;
            listaQuaseLaContainer.appendChild(p);
        });
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
    socket.on('estadoInicial', (data) => {
        if (!data) return;
        console.log("Estado Inicial:", data);
        gerarGlobo();
        if(sorteioIdHeaderEl) sorteioIdHeaderEl.textContent = `BINGO DO PIX - SORTEIO #${data.sorteioId || '...'}`;
        if(jogadoresTotalEl) jogadoresTotalEl.textContent = data.jogadoresOnline || '--';
        
        atualizarEstadoVisual(data.estado);
        atualizarListaVencedores(data.ultimosVencedores, false);
        atualizarGloboSorteados(data.numerosSorteados);
        atualizarPremios(data.configuracoes, data.sorteioId);
        
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
        if(data.sorteioId && sorteioIdHeaderEl) sorteioIdHeaderEl.textContent = `BINGO DO PIX - SORTEIO #${data.sorteioId}`;
        atualizarEstadoVisual(data.estado);
    });

    socket.on('novoNumeroSorteado', (n) => {
        if(ultimoNumeroEl) ultimoNumeroEl.textContent = n;
        const el = document.getElementById(`dash-globo-${n}`);
        if(el) el.classList.add('sorteado');
        falar(`${n}`);
    });

    socket.on('contagemJogadores', (d) => { if(jogadoresTotalEl) jogadoresTotalEl.textContent = d.total; });
    socket.on('atualizarVencedores', (v) => atualizarListaVencedores(v, true));
    
    // --- CORREÇÃO: Escuta ambos os nomes de evento para Quase Lá ---
    socket.on('listaQuaseLa', (data) => processarQuaseLa(data));
    socket.on('atualizarQuaseLa', (data) => processarQuaseLa(data));

    socket.on('iniciarJogo', () => {
        gerarGlobo();
        if(ultimoNumeroEl) ultimoNumeroEl.textContent = '--';
        anuncioEsperaOverlay.classList.add('oculto');
        atualizarEstadoVisual('JOGANDO_LINHA');
        if(listaQuaseLaContainer) listaQuaseLaContainer.innerHTML = '<p>Iniciando...</p>';
    });

    socket.on('configAtualizada', (data) => {
        const idAtual = sorteioIdHeaderEl ? sorteioIdHeaderEl.textContent : '';
        atualizarPremios(data, idAtual);
    });

    iniciarSlider();
});
