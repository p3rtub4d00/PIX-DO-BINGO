document.addEventListener('DOMContentLoaded', () => {
    const contadorElemento = document.getElementById('contador-tempo');
    const listaGanhadoresEl = document.getElementById('lista-ganhadores');
    let tempoRestante = 10;

    if (!contadorElemento) {
        window.location.href = '/dashboard-real';
        return;
    }

    function atualizarContador() {
        contadorElemento.textContent = tempoRestante;
        if (tempoRestante <= 0) {
            clearInterval(intervalo);
            window.location.href = '/dashboard-real';
        }
        tempoRestante--;
    }

    atualizarContador();
    const intervalo = setInterval(atualizarContador, 1000);

    if (typeof io === 'undefined' || !listaGanhadoresEl) return;
    const socket = io();

    function renderizarVencedores(vencedores) {
        listaGanhadoresEl.innerHTML = '';

        if (!Array.isArray(vencedores) || vencedores.length === 0) {
            listaGanhadoresEl.innerHTML = '<p>Nenhum ganhador ainda.</p>';
            return;
        }

        vencedores.slice(0, 8).forEach(v => {
            const item = document.createElement('div');
            item.className = 'vencedor-item';
            item.textContent = `Sorteio #${v.sorteioId}: ${v.premio} — ${v.nome}`;
            listaGanhadoresEl.appendChild(item);
        });
    }

    socket.on('estadoInicial', (data) => {
        if (!data) return;
        renderizarVencedores(data.ultimosVencedores);
    });

    socket.on('atualizarVencedores', (vencedores) => {
        renderizarVencedores(vencedores);
    });
});
