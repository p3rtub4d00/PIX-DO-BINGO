document.addEventListener('DOMContentLoaded', () => {
    const contadorElemento = document.getElementById('contador-tempo');
    let tempoRestante = 10; // Defina aqui quantos segundos o anúncio dura

    if (!contadorElemento) {
        console.error("Elemento do contador não encontrado!");
        window.location.href = '/dashboard-real';
        return;
    }

    function atualizarContador() {
        contadorElemento.textContent = tempoRestante;
        if (tempoRestante <= 0) {
            clearInterval(intervalo);
            console.log("Tempo esgotado. Redirecionando para o dashboard...");
            window.location.href = '/dashboard-real';
        }
        tempoRestante--;
    }

    atualizarContador();
    const intervalo = setInterval(atualizarContador, 1000);
});