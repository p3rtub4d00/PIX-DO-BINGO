document.addEventListener('DOMContentLoaded', () => {
    const contadorElemento = document.getElementById('contador-tempo');
    let tempoRestante = 10; // Defina aqui quantos segundos o anúncio dura

    if (!contadorElemento) {
        console.error("Elemento do contador não encontrado!");
        // Redireciona imediatamente se o contador falhar, para não travar
        window.location.href = '/dashboard-real'; 
        return;
    }

    // Função para atualizar o contador
    function atualizarContador() {
        contadorElemento.textContent = tempoRestante;
        if (tempoRestante <= 0) {
            clearInterval(intervalo); // Para o contador
            console.log("Tempo esgotado. Redirecionando para o dashboard...");
            window.location.href = '/dashboard-real'; // Redireciona para a URL real do dashboard
        }
        tempoRestante--;
    }

    // Inicia o contador
    atualizarContador(); // Chama uma vez imediatamente
    const intervalo = setInterval(atualizarContador, 1000); // Atualiza a cada segundo
});