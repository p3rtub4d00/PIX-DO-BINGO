document.addEventListener('DOMContentLoaded', () => {

    const cronometroElemento = document.getElementById('cronometro');
    const sorteioIdElemento = document.getElementById('sorteio-id-display');
    
    // --- INÍCIO: Seletores da Cartela (Copiado de jogo.js) ---
    const cartelasContainer = document.getElementById('cartelas-container');
    const btnCartelaAnterior = document.getElementById('btn-cartela-anterior');
    const btnCartelaProxima = document.getElementById('btn-cartela-proxima');
    const tituloCartelaAtualEl = document.getElementById('cartela-titulo-atual');
    const cartelaIdDisplay = document.getElementById('cartela-id-display');

    let cartelasGeradasEl = []; // Guarda os Elementos HTML
    let cartelaAtualIndex = 0;
    let totalDeCartelas = 0;
    let cartelasSalvas = []; // Guarda os Dados da cartela
    // --- FIM: Seletores da Cartela ---

    const socket = io();
    console.log("Conectando ao servidor...");

    socket.on('cronometroUpdate', (data) => {
        const { tempo, sorteioId } = data; 

        const minutos = Math.floor(tempo / 60);
        let segundos = tempo % 60;
        segundos = segundos < 10 ? '0' + segundos : segundos;
        cronometroElemento.textContent = `${minutos}:${segundos}`;

        // Atualiza o ID do Sorteio (só se ainda não tivermos o ID da cartela)
        if (totalDeCartelas === 0) {
            sorteioIdElemento.textContent = `Sorteio #${sorteioId}`;
        }
        
        console.log(`Servidor atualizou: Sorteio #${sorteioId} | Tempo: ${minutos}:${segundos}`);
    });

    socket.on('iniciarJogo', () => {
        console.log("Servidor mandou iniciar o jogo! Redirecionando...");
        window.location.href = 'jogo.html'; 
    });

    socket.on('connect', () => {
        console.log(`Conectado ao servidor com o ID: ${socket.id}`);
    });

    // --- INÍCIO: Lógica de Renderização de Cartelas (Copiado de jogo.js) ---

    // 1. Gerar a Cartela VISUAL
    function criarElementoCartela(cartelaData) { // cartelaData é {c_id, s_id, data}
        const cartelaEl = document.createElement('div');
        cartelaEl.classList.add('cartela-jogador'); 
        
        cartelaEl.dataset.cartelaId = cartelaData.c_id;
        cartelaEl.dataset.sorteioId = cartelaData.s_id;

        const letrasBingo = ['B', 'I', 'N', 'G', 'O'];
        letrasBingo.forEach(letra => {
            const headerEl = document.createElement('div');
            headerEl.classList.add('cartela-numero', 'cartela-header'); 
            headerEl.textContent = letra;
            cartelaEl.appendChild(headerEl);
        });

        const matrizCartela = cartelaData.data; // Pega a matriz
        for (let linha = 0; linha < 5; linha++) {
            for (let coluna = 0; coluna < 5; coluna++) {
                const numeroBingo = matrizCartela[linha][coluna];
                const numeroEl = document.createElement('div');
                numeroEl.classList.add('cartela-numero');
                if (numeroBingo === "FREE") {
                    numeroEl.textContent = "FREE";
                    numeroEl.classList.add('free');
                } else {
                    numeroEl.textContent = numeroBingo;
                    numeroEl.dataset.valor = numeroBingo; 
                }
                cartelaEl.appendChild(numeroEl);
            }
        }
        
        cartelasContainer.appendChild(cartelaEl); 
        return cartelaEl; 
    }
    
    // 2. Lógica do Carrossel
    function atualizarVisibilidadeCartela() {
        cartelasGeradasEl.forEach(cartela => {
            cartela.classList.remove('ativa');
        });
        
        const cartelaAtiva = cartelasGeradasEl[cartelaAtualIndex];
        if (cartelaAtiva) {
            cartelaAtiva.classList.add('ativa');
            
            // Atualiza os IDs no display
            tituloCartelaAtualEl.textContent = `Cartela ${cartelaAtualIndex + 1} de ${totalDeCartelas}`;
            cartelaIdDisplay.textContent = `ID: ${cartelaAtiva.dataset.cartelaId}`;
            
            // Atualiza o TÍTULO PRINCIPAL da página de espera
            sorteioIdElemento.textContent = `Sorteio #${cartelaAtiva.dataset.sorteioId}`;
        }

        btnCartelaAnterior.disabled = (cartelaAtualIndex === 0);
        btnCartelaProxima.disabled = (cartelaAtualIndex === totalDeCartelas - 1);
    }
    btnCartelaProxima.addEventListener('click', () => {
        if (cartelaAtualIndex < totalDeCartelas - 1) {
            cartelaAtualIndex++;
            atualizarVisibilidadeCartela();
        }
    });
    btnCartelaAnterior.addEventListener('click', () => {
        if (cartelaAtualIndex > 0) {
            cartelaAtualIndex--;
            atualizarVisibilidadeCartela();
        }
    });

    // 3. INICIALIZAÇÃO das Cartelas
    cartelasSalvas = JSON.parse(sessionStorage.getItem('bingo_cartelas'));
    const nomeJogador = sessionStorage.getItem('bingo_usuario_nome'); 
    
    if (!cartelasSalvas || !nomeJogador || cartelasSalvas.length === 0) {
        // Se não achar cartelas, apenas deixa a sala de espera normal
        console.warn("Nenhuma cartela ou nome de jogador no sessionStorage.");
        // Esconde o switcher se não houver cartelas
        document.getElementById('cartela-switcher').style.display = 'none';
        document.getElementById('cartelas-container').innerHTML = '<p class="aviso">Você será redirecionado em breve.</p>';
    } else {
        // Se achou, renderiza
        totalDeCartelas = cartelasSalvas.length;
        console.log(`Renderizando ${totalDeCartelas} cartela(s) para a sala de espera.`);

        cartelasContainer.innerHTML = ''; 
        cartelasGeradasEl = []; 
        
        for (let i = 0; i < totalDeCartelas; i++) {
            const dadosCartela = cartelasSalvas[i]; 
            const elementoCartela = criarElementoCartela(dadosCartela);
            elementoCartela.id = `cartela-indice-${i}`;
            cartelasGeradasEl.push(elementoCartela); 
        }
        
        cartelaAtualIndex = 0; 
        atualizarVisibilidadeCartela(); 
    }
    // --- FIM: Lógica de Renderização ---

});