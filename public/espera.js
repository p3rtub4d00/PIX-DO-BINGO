document.addEventListener('DOMContentLoaded', () => {

    // --- INÍCIO DA ATUALIZAÇÃO (Pega Venda ID da URL) ---
    const urlParams = new URLSearchParams(window.location.search);
    const vendaId = urlParams.get('venda');
    const nomeJogador = sessionStorage.getItem('bingo_usuario_nome');
    
    if (!vendaId || !nomeJogador) {
        alert("Erro: ID da sua compra ou nome de usuário não encontrado.\n\nRedirecionando para a página inicial.");
        window.location.href = 'index.html';
        return;
    }
    console.log(`Sala de espera para Venda ID: ${vendaId} | Jogador: ${nomeJogador}`);
    // --- FIM DA ATUALIZAÇÃO ---

    const cronometroElemento = document.getElementById('cronometro');
    const sorteioIdElemento = document.getElementById('sorteio-id-display');
    
    const cartelasContainer = document.getElementById('cartelas-container');
    const btnCartelaAnterior = document.getElementById('btn-cartela-anterior');
    const btnCartelaProxima = document.getElementById('btn-cartela-proxima');
    const tituloCartelaAtualEl = document.getElementById('cartela-titulo-atual');
    const cartelaIdDisplay = document.getElementById('cartela-id-display');

    let cartelasGeradasEl = []; 
    let cartelaAtualIndex = 0;
    let totalDeCartelas = 0;
    // let cartelasSalvas = []; // Não precisamos mais disso globalmente aqui

    const socket = io();
    console.log("Conectando ao servidor...");

    socket.on('cronometroUpdate', (data) => {
        const { tempo, sorteioId } = data; 
        const minutos = Math.floor(tempo / 60);
        let segundos = tempo % 60;
        segundos = segundos < 10 ? '0' + segundos : segundos;
        cronometroElemento.textContent = `${minutos}:${segundos}`;
        if (totalDeCartelas === 0) {
            sorteioIdElemento.textContent = `Sorteio #${sorteioId}`;
        }
        console.log(`Servidor atualizou: Sorteio #${sorteioId} | Tempo: ${minutos}:${segundos}`);
    });

    // --- INÍCIO DA ATUALIZAÇÃO (Redireciona com Venda ID) ---
    socket.on('iniciarJogo', () => {
        console.log("Servidor mandou iniciar o jogo! Redirecionando...");
        // Passa o ID da Venda para a página do jogo
        window.location.href = `jogo.html?venda=${vendaId}`; 
    });
    // --- FIM DA ATUALIZAÇÃO ---

    socket.on('connect', () => {
        console.log(`Conectado ao servidor com o ID: ${socket.id}`);
        // *** INÍCIO DA ATUALIZAÇÃO (Pede as cartelas) ***
        // Assim que conectar, pede as cartelas ao servidor
        console.log(`Pedindo cartelas para Venda ID: ${vendaId}`);
        socket.emit('buscarMinhasCartelas', { vendaId: vendaId, nome: nomeJogador });
        // *** FIM DA ATUALIZAÇÃO ***
    });
    
    // *** INÍCIO DA ATUALIZAÇÃO (Ouvintes para buscar cartelas) ***
    socket.on('cartelasEncontradas', (data) => {
        const { cartelas } = data; // cartelas é um array
        console.log(`Recebidas ${cartelas.length} cartelas do servidor.`);
        // Agora que temos as cartelas, podemos renderizar
        inicializarVisualizacaoCartelas(cartelas, nomeJogador);
    });

    socket.on('cartelasNaoEncontradas', () => {
        alert("Erro: Suas cartelas não foram encontradas no servidor.\n\nIsso pode acontecer se o nome salvo não bater com o da compra. Redirecionando.");
        window.location.href = 'index.html';
    });
    // *** FIM DA ATUALIZAÇÃO ***


    // --- 1. Gerar a Cartela VISUAL ---
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
    
    // --- 2. Lógica do Carrossel ---
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

    // --- 3. INICIALIZAÇÃO das Cartelas (AGORA É UMA FUNÇÃO) ---
    // Esta função é chamada pelo ouvinte 'cartelasEncontradas'
    function inicializarVisualizacaoCartelas(cartelasSalvas, nomeJogador) {
        if (!cartelasSalvas || !nomeJogador || cartelasSalvas.length === 0) {
            console.warn("Nenhuma cartela ou nome de jogador no sessionStorage.");
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
    }
});
