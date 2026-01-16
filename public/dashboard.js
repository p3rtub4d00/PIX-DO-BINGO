document.addEventListener('DOMContentLoaded', () => {
    console.log("Dashboard DOM carregado (Versão TV Full).");

    if (typeof io === 'undefined') {
        console.error("Socket.IO não encontrado.");
        setTimeout(() => window.location.reload(), 5000);
        return;
    }
    const socket = io();

    // --- SELETORES ---
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
    
    const anuncioVencedorOverlay = document.getElementById('anuncio-vencedor-overlay');
    const anuncioPremioEl = document.getElementById('anuncio-vencedor-premio');
    const anuncioNomeEl = document.getElementById('anuncio-vencedor-nome');
    const anuncioEsperaOverlay = document.getElementById('anuncio-espera-overlay');
    const esperaCronometroDisplay = document.getElementById('espera-cronometro-display');

    let ultimoEstadoConhecido = null;
    let contadorPingFalhas = 0;

    // --- VOZ ---
    let somAtivo = false;
    let synth = window.speechSynthesis || null;
    let voces = [];
    if (synth) {
        function carregarVozes() { try { voces = synth.getVoices().filter(v => v.lang.startsWith('pt')); } catch(e){} }
        carregarVozes();
        if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = carregarVozes;
        function falar(texto) {
            if (!somAtivo || !synth) return;
            try { synth.cancel(); const u = new SpeechSynthesisUtterance(texto); if(voces.length) u.voice = voces[0]; synth.speak(u); } catch(e){}
        }
        if (btnToggleSom) btnToggleSom.addEventListener('click', () => { somAtivo = !somAtivo; const i = btnToggleSom.querySelector('i'); if(i) i.className = somAtivo ? 'fas fa-volume-high' : 'fas fa-volume-xmark'; });
    }

    // --- AUXILIARES ---
    function formatarBRL(v) { return parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    function formatarTempo(s) { if(s<0) return "00:00"; const m = Math.floor(s/60); const sec = s%60; return `${m}:${sec<10?'0'+sec:sec}`; }

    // --- PING SERVIDOR ---
    setInterval(() => {
        if(socket.connected) contadorPingFalhas = 0;
        else { contadorPingFalhas++; if(contadorPingFalhas>5) window.location.reload(); }
    }, 30000);

    // --- FUNÇÕES DE UI ---
    function gerarGlobo() {
        if (!globoContainer) return; globoContainer.innerHTML = '';
        for (let i = 1; i <= 75; i++) {
            const d = document.createElement('div'); d.className = 'dash-globo-numero'; d.textContent = i; d.id = `dash-globo-${i}`; globoContainer.appendChild(d);
        }
    }

    function atualizarListaVencedores(vencedores, anunciar) {
        if (!listaVencedoresContainer) return;
        listaVencedoresContainer.innerHTML = '';
        if (!vencedores || !vencedores.length) { listaVencedoresContainer.innerHTML = '<p style="opacity:0.6; font-size:1.8vh; padding:5px;">Nenhum ganhador.</p>'; return; }
        
        vencedores.forEach((v, i) => {
            const div = document.createElement('div');
            div.innerHTML = `<div style="display:flex; justify-content:space-between;"><span style="font-weight:bold;">${v.nome}</span><span style="color:gold;">[${v.premio}]</span></div>`;
            if (i === 0 && anunciar) { 
                div.classList.add('novo-vencedor'); 
                falar(`Vencedor: ${v.nome}`); 
                mostrarAnuncioVencedor(v.nome, v.premio); 
            }
            listaVencedoresContainer.appendChild(div);
        });
    }

    function atualizarGloboSorteados(nums) {
        if (!globoContainer) return;
        document.querySelectorAll('.dash-globo-numero').forEach(e => e.classList.remove('sorteado'));
        if (nums && nums.length) {
            nums.forEach(n => { const el = document.getElementById(`dash-globo-${n}`); if(el) el.classList.add('sorteado'); });
            if(ultimoNumeroEl) ultimoNumeroEl.textContent = nums[nums.length-1];
        } else if (ultimoNumeroEl) ultimoNumeroEl.textContent = '--';
    }

    function atualizarEstadoVisual(st) {
        ultimoEstadoConhecido = st;
        if (!estadoHeaderEl) return;
        estadoHeaderEl.className = 'estado-texto';
        if (st === 'ESPERANDO') {
            estadoHeaderEl.textContent = "AGUARDANDO"; 
            estadoHeaderEl.classList.add('estado-esperando');
            if(!anuncioVencedorOverlay.classList.contains('ativo')) anuncioEsperaOverlay.classList.remove('oculto');
        } else if (st === 'JOGANDO_LINHA') {
            estadoHeaderEl.textContent = "VALENDO LINHA"; 
            estadoHeaderEl.classList.add('estado-jogando-linha');
            anuncioEsperaOverlay.classList.add('oculto');
        } else if (st === 'JOGANDO_CHEIA') {
            estadoHeaderEl.textContent = "VALENDO BINGO"; 
            estadoHeaderEl.classList.add('estado-jogando-cheia');
            anuncioEsperaOverlay.classList.add('oculto');
        }
    }

    function mostrarAnuncioVencedor(nome, premio) {
        if (!anuncioVencedorOverlay) return;
        if (anuncioPremioEl) anuncioPremioEl.textContent = premio.includes('Linha') ? "LINHA BATIDA!" : "BINGO!";
        if (anuncioNomeEl) anuncioNomeEl.textContent = nome;
        anuncioEsperaOverlay.classList.add('oculto');
        anuncioVencedorOverlay.classList.add('ativo');
        setTimeout(() => {
            anuncioVencedorOverlay.classList.remove('ativo');
            if (ultimoEstadoConhecido === 'ESPERANDO') anuncioEsperaOverlay.classList.remove('oculto');
        }, 8000);
    }

    function iniciarSlider() {
        const slides = document.querySelectorAll('.slide');
        if (slides.length <= 1) return;
        let idx = 0; slides[0].classList.add('ativo');
        setInterval(() => { slides[idx].classList.remove('ativo'); idx = (idx+1)%slides.length; slides[idx].classList.add('ativo'); }, 5000);
    }

    // --- SOCKET ---
    socket.on('estadoInicial', (data) => {
        if (!data) return;
        gerarGlobo();
        if (sorteioIdHeaderEl) sorteioIdHeaderEl.textContent = `SORTEIO #${data.sorteioId||'...'}`;
        if (jogadoresTotalEl) jogadoresTotalEl.textContent = data.jogadoresOnline||'--';
        atualizarEstadoVisual(data.estado);
        atualizarListaVencedores(data.ultimosVencedores, false);
        atualizarGloboSorteados(data.numerosSorteados);
        if (data.configuracoes) {
            if(dashPremioLinhaEl) dashPremioLinhaEl.textContent = formatarBRL(data.configuracoes.premio_linha);
            if(dashPremioCheiaEl) dashPremioCheiaEl.textContent = formatarBRL(data.configuracoes.premio_cheia);
        }
        if (data.estado === 'ESPERANDO' && esperaCronometroDisplay) esperaCronometroDisplay.textContent = formatarTempo(data.tempoRestante);
    });

    socket.on('cronometroUpdate', (d) => {
        if (d.estado==='ESPERANDO' && esperaCronometroDisplay) esperaCronometroDisplay.textContent = formatarTempo(d.tempo);
        if (d.estado !== ultimoEstadoConhecido) atualizarEstadoVisual(d.estado);
    });

    socket.on('novoNumeroSorteado', (n) => { if(ultimoNumeroEl) ultimoNumeroEl.textContent = n; const el = document.getElementById(`dash-globo-${n}`); if(el) el.classList.add('sorteado'); falar(n); });
    socket.on('contagemJogadores', (d) => { if(jogadoresTotalEl) jogadoresTotalEl.textContent = d.total; });
    socket.on('atualizarVencedores', (v) => atualizarListaVencedores(v, true));
    socket.on('iniciarJogo', () => { gerarGlobo(); if(ultimoNumeroEl) ultimoNumeroEl.textContent='--'; anuncioEsperaOverlay.classList.add('oculto'); atualizarEstadoVisual('JOGANDO_LINHA'); });
    socket.on('configAtualizada', (data) => { if (data && dashPremioLinhaEl) dashPremioLinhaEl.textContent = formatarBRL(data.premio_linha); if (data && dashPremioCheiaEl) dashPremioCheiaEl.textContent = formatarBRL(data.premio_cheia); });
    
    // --- QUASE LÁ (FILTRADO) ---
    socket.on('listaQuaseLa', (data) => {
        if (!listaQuaseLaContainer) return;
        listaQuaseLaContainer.innerHTML = '';
        if (!data || data.length === 0) { listaQuaseLaContainer.innerHTML = '<p style="opacity:0.5; padding:5px;">...</p>'; return; }
        
        const filtrados = data.filter(i => i.faltam <= 5).sort((a,b) => a.faltam - b.faltam);
        
        if (filtrados.length === 0) { listaQuaseLaContainer.innerHTML = '<p style="opacity:0.5; padding:5px;">Aguardando...</p>'; return; }
        
        filtrados.slice(0, 4).forEach(item => {
            const div = document.createElement('div');
            div.className = 'info-item';
            div.style.animation = 'slideLeft 0.5s';
            let color = '#fff'; let icon = '';
            if(item.faltam === 1) { color = '#ff0040'; icon='🔥'; }
            else if(item.faltam === 2) { color = '#ffaa00'; }
            div.innerHTML = `<span>Cartela ${item.cartelaId}</span><strong style="color:${color}; font-size:2.2vh;">${icon} Falta ${item.faltam}</strong>`;
            listaQuaseLaContainer.appendChild(div);
        });
    });

    iniciarSlider();
});
