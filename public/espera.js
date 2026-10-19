document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const vendaId = urlParams.get('venda');

    let nomeJogador = sessionStorage.getItem('bingo_usuario_nome') || '';
    let telefoneJogador = sessionStorage.getItem('bingo_usuario_telefone') || '';

    if (!vendaId) {
        alert('Erro: ID da compra não encontrado. Redirecionando para a página inicial.');
        window.location.href = 'index.html';
        return;
    }

    const cronometroElemento = document.getElementById('cronometro');
    const sorteioIdElemento = document.getElementById('sorteio-id-display');
    const cartelasContainer = document.getElementById('cartelas-container');
    const btnCartelaAnterior = document.getElementById('btn-cartela-anterior');
    const btnCartelaProxima = document.getElementById('btn-cartela-proxima');
    const tituloCartelaAtualEl = document.getElementById('cartela-titulo-atual');
    const cartelaIdDisplay = document.getElementById('cartela-id-display');
    const cartelaSwitcher = document.getElementById('cartela-switcher');

    let cartelasSalvas = [];
    let cartelaAtualIndex = 0;
    let totalDeCartelas = 0;
    let cartelasCarregadas = false;
    let carregamentoHttpFinalizado = false;
    let jogoJaIniciado = false;

    const socket = io();

    function normalizarDadosJogador(meta = {}) {
        if (meta.nome) {
            nomeJogador = String(meta.nome);
            sessionStorage.setItem('bingo_usuario_nome', nomeJogador);
        }
        if (meta.telefone) {
            telefoneJogador = String(meta.telefone);
            sessionStorage.setItem('bingo_usuario_telefone', telefoneJogador);
        }
    }

    function criarElementoCartela(cartelaData) {
        const cartelaEl = document.createElement('div');
        cartelaEl.className = 'cartela-jogador ativa';
        cartelaEl.dataset.cartelaId = cartelaData?.c_id || '';
        cartelaEl.dataset.sorteioId = cartelaData?.s_id || '';

        ['B', 'I', 'N', 'G', 'O'].forEach(letra => {
            const headerEl = document.createElement('div');
            headerEl.classList.add('cartela-numero', 'cartela-header');
            headerEl.textContent = letra;
            cartelaEl.appendChild(headerEl);
        });

        const matriz = Array.isArray(cartelaData?.data) ? cartelaData.data : [];

        for (let linha = 0; linha < 5; linha++) {
            for (let coluna = 0; coluna < 5; coluna++) {
                const numero = matriz?.[linha]?.[coluna] ?? '?';
                const numeroEl = document.createElement('div');
                numeroEl.classList.add('cartela-numero');

                if (numero === 'FREE') {
                    numeroEl.textContent = 'FREE';
                    numeroEl.classList.add('free');
                } else {
                    numeroEl.textContent = numero;
                    numeroEl.dataset.valor = numero;
                }
                cartelaEl.appendChild(numeroEl);
            }
        }

        return cartelaEl;
    }

    function renderizarCartelaAtual() {
        if (!cartelasCarregadas || totalDeCartelas === 0) return;

        const dados = cartelasSalvas[cartelaAtualIndex];
        const elemento = criarElementoCartela(dados);

        cartelasContainer.replaceChildren(elemento);

        tituloCartelaAtualEl.textContent = `Cartela ${cartelaAtualIndex + 1} de ${totalDeCartelas}`;
        cartelaIdDisplay.textContent = `ID: ${dados?.c_id || '---'}`;

        if (dados?.s_id != null) {
            sorteioIdElemento.textContent = `Sorteio #${dados.s_id}`;
        }

        btnCartelaAnterior.disabled = cartelaAtualIndex <= 0;
        btnCartelaProxima.disabled = cartelaAtualIndex >= totalDeCartelas - 1;
    }

    function aplicarCartelas(cartelas, meta = {}) {
        if (cartelasCarregadas) return true;
        if (!Array.isArray(cartelas) || cartelas.length === 0) return false;

        normalizarDadosJogador(meta);

        cartelasSalvas = cartelas;
        totalDeCartelas = cartelas.length;
        cartelaAtualIndex = 0;
        cartelasCarregadas = true;

        if (cartelaSwitcher) cartelaSwitcher.style.display = 'flex';

        renderizarCartelaAtual();

        console.log(`Sala de espera carregou ${totalDeCartelas} cartela(s) da venda ${vendaId}.`);
        return true;
    }

    async function carregarCartelasViaHttp() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(`/api/minhas-cartelas/${encodeURIComponent(vendaId)}?t=${Date.now()}`, {
                method: 'GET',
                cache: 'no-store',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });

            clearTimeout(timeout);

            const data = await response.json().catch(() => ({}));
            carregamentoHttpFinalizado = true;

            if (!response.ok || !data.success) {
                throw new Error(data.message || `Erro ${response.status}`);
            }

            aplicarCartelas(data.cartelas, {
                nome: data.nome,
                telefone: data.telefone
            });
        } catch (error) {
            carregamentoHttpFinalizado = true;
            console.error('Falha no carregamento HTTP das cartelas:', error);

            // O Socket.IO continua como segundo caminho. Só mostra erro se ambos falharem.
            setTimeout(() => {
                if (!cartelasCarregadas) {
                    tituloCartelaAtualEl.textContent = 'Não foi possível carregar';
                    cartelasContainer.innerHTML =
                        '<p class="aviso">Não conseguimos carregar suas cartelas. Atualize a página ou volte para “Meus jogos”.</p>';
                }
            }, 1800);
        }
    }

    btnCartelaProxima.addEventListener('click', () => {
        if (cartelaAtualIndex < totalDeCartelas - 1) {
            cartelaAtualIndex += 1;
            renderizarCartelaAtual();
        }
    });

    btnCartelaAnterior.addEventListener('click', () => {
        if (cartelaAtualIndex > 0) {
            cartelaAtualIndex -= 1;
            renderizarCartelaAtual();
        }
    });

    socket.on('cronometroUpdate', data => {
        const tempo = Number(data?.tempo) || 0;
        const minutos = Math.floor(tempo / 60);
        const segundos = String(tempo % 60).padStart(2, '0');

        if (cronometroElemento) cronometroElemento.textContent = `${minutos}:${segundos}`;

        if (!cartelasCarregadas && data?.sorteioId != null && sorteioIdElemento) {
            sorteioIdElemento.textContent = `Sorteio #${data.sorteioId}`;
        }
    });

    socket.on('estadoInicial', data => {
        if (!data) return;

        if (!cartelasCarregadas && data.sorteioId != null && sorteioIdElemento) {
            sorteioIdElemento.textContent = `Sorteio #${data.sorteioId}`;
        }

        const estado = String(data.estado || '');
        jogoJaIniciado = estado.startsWith('JOGANDO') || estado === 'ANUNCIANDO_VENCEDOR';

        if (jogoJaIniciado && cartelasCarregadas) {
            window.location.href = `jogo.html?venda=${encodeURIComponent(vendaId)}`;
        }
    });

    socket.on('iniciarJogo', () => {
        window.location.href = `jogo.html?venda=${encodeURIComponent(vendaId)}`;
    });

    socket.on('connect', () => {
        console.log(`Conectado ao servidor. Buscando cartelas da venda ${vendaId}.`);

        socket.emit('buscarMinhasCartelas', {
            vendaId,
            nome: nomeJogador,
            telefone: telefoneJogador
        });
    });

    socket.on('cartelasEncontradas', data => {
        const carregou = aplicarCartelas(data?.cartelas, {
            nome: data?.nome,
            telefone: data?.telefone
        });

        if (carregou && jogoJaIniciado) {
            window.location.href = `jogo.html?venda=${encodeURIComponent(vendaId)}`;
        }
    });

    socket.on('cartelasNaoEncontradas', () => {
        // Não redireciona imediatamente porque o fallback HTTP pode funcionar.
        if (carregamentoHttpFinalizado && !cartelasCarregadas) {
            console.warn('Servidor não encontrou cartelas para esta venda.');
        }
    });

    // O HTTP começa imediatamente e o Socket.IO trabalha em paralelo.
    // O primeiro caminho que responder com sucesso alimenta a tela.
    carregarCartelasViaHttp();
});
