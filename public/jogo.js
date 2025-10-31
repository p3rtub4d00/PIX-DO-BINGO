document.addEventListener('DOMContentLoaded', () => {

    if (typeof window.html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
        alert("Erro ao carregar recursos do jogo (Cod: PDF_LIB).\n\nPor favor, verifique sua conexão com a internet ou desative seu bloqueador de anúncios e recarregue a página.");
        return; 
    }
    const { jsPDF } = window.jspdf;

    const socket = io();

    // --- Seletores do DOM ---
    const globoContainer = document.getElementById('globo-numeros');
    const ultimoNumeroEl = document.getElementById('ultimo-numero-sorteado');
    const btnBingo = document.getElementById('btn-bingo');
    const cartelasContainer = document.getElementById('cartelas-container');
    const btnCartelaAnterior = document.getElementById('btn-cartela-anterior');
    const btnCartelaProxima = document.getElementById('btn-cartela-proxima');
    const tituloCartelaAtualEl = document.getElementById('cartela-titulo-atual');
    const sorteioIdDisplay = document.getElementById('sorteio-id-display'); 
    const cartelaIdDisplay = document.getElementById('cartela-id-display'); 
    const btnToggleSom = document.getElementById('btn-toggle-som'); // <-- ADICIONADO
    
    // --- Seletores do Modal de Resultado ---
    const modalResultado = document.getElementById('modal-resultado');
    const resultadoTitulo = document.getElementById('resultado-titulo');
    const resultadoMensagem = document.getElementById('resultado-mensagem');
    const resultadoProvaCartela = document.getElementById('resultado-prova-cartela');
    const cartelaVencedoraDisplay = document.getElementById('cartela-vencedora-display');
    const btnResultadoFechar = document.getElementById('btn-resultado-fechar');
    const btnBaixarComprovante = document.getElementById('btn-baixar-comprovante');
    const areaComprovante = document.getElementById('area-comprovante');
    const comprovanteSorteioId = document.getElementById('comprovante-sorteio-id'); 
    const comprovanteCartelaId = document.getElementById('comprovante-cartela-id'); 
    const comprovanteNome = document.getElementById('comprovante-nome');
    const comprovantePremio = document.getElementById('comprovante-premio');
    const comprovanteData = document.getElementById('comprovante-data'); 

    let cartelasGeradas = []; 
    let cartelaAtualIndex = 0;
    let totalDeCartelas = 0;
    let jogoEstaAtivo = true; 
    let nomeJogador = ""; 
    let cartelasSalvas = []; 

    // --- *** INÍCIO: LÓGICA DE VOZ (Copiada de dashboard.js) *** ---
    let somAtivo = false; 
    let synth = null; 
    let voces = []; 
    const suporteVoz = 'speechSynthesis' in window;

    if (suporteVoz) {
        synth = window.speechSynthesis; 
        function carregarVozes() { 
            try { 
                voces = synth.getVoices().filter(voice => voice.lang.startsWith('pt')); 
                console.log("Vozes PT:", voces.map(v => v.name)); 
            } catch (error) { 
                console.error("Erro vozes:", error); 
            } 
        }
        carregarVozes(); 
        if (speechSynthesis.onvoiceschanged !== undefined) { 
            speechSynthesis.onvoiceschanged = carregarVozes; 
        }
        
        function falar(texto) { 
            if (!somAtivo || !synth || !texto) { 
                console.log(`Falar ignorado: som=${somAtivo}`); 
                return; 
            } 
            try { 
                synth.cancel(); 
                const utterThis = new SpeechSynthesisUtterance(texto); 
                const vozPtBr = voces.find(voice => voice.lang === 'pt-BR'); 
                if (vozPtBr) { 
                    utterThis.voice = vozPtBr; 
                } else if (voces.length > 0) { 
                    utterThis.voice = voces[0]; 
                } 
                utterThis.pitch = 1; 
                utterThis.rate = 1; 
                utterThis.onstart = () => console.log(`Falando: "${texto}"`); 
                utterThis.onerror = (event) => console.error('Erro voz:', event.error); 
                utterThis.onend = () => console.log(`Fim fala: "${texto}"`); 
                synth.speak(utterThis); 
            } catch (error) { 
                console.error("Erro falar:", error); 
            } 
        }

        if (btnToggleSom) {
            btnToggleSom.addEventListener('click', () => { 
                somAtivo = !somAtivo; 
                btnToggleSom.classList.toggle('som-ativo', somAtivo); 
                const icon = btnToggleSom.querySelector('i'); 
                if (icon) { 
                    if (somAtivo) { 
                        icon.className = 'fas fa-volume-high'; 
                        falar("Som ativado"); 
                    } else { 
                        icon.className = 'fas fa-volume-xmark'; 
                        if (synth) synth.cancel(); 
                    } 
                } 
            });
            const initialIcon = btnToggleSom.querySelector('i'); 
            if(initialIcon) { 
                initialIcon.className = 'fas fa-volume-xmark'; 
            }
        }
    } else { 
        if (btnToggleSom) { 
            btnToggleSom.disabled = true; 
            btnToggleSom.title = "Síntese de voz não suportada"; 
            const icon = btnToggleSom.querySelector('i'); 
            if(icon) { icon.className = 'fas fa-volume-xmark'; } 
        } 
    }

    // Função auxiliar para pegar a letra
    function getLetraDoNumero(numero) { 
        if (numero >= 1 && numero <= 15) return "B"; 
        if (numero >= 16 && numero <= 30) return "I"; 
        if (numero >= 31 && numero <= 45) return "N"; 
        if (numero >= 46 && numero <= 60) return "G"; 
        if (numero >= 61 && numero <= 75) return "O"; 
        return ""; 
    }
    // --- *** FIM: LÓGICA DE VOZ *** ---

    // --- 1. Gerar o Painel do Globo (Visual) ---
    function gerarGlobo() {
        globoContainer.innerHTML = ''; 
        for (let i = 1; i <= 75; i++) {
            const numeroEl = document.createElement('div');
            numeroEl.classList.add('globo-numero');
            numeroEl.textContent = i;
            numeroEl.id = `globo-${i}`; 
            globoContainer.appendChild(numeroEl);
        }
    }

    // --- 2. Gerar a Cartela VISUAL ---
    function criarElementoCartela(cartelaData) { 
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

        const matrizCartela = cartelaData.data; 
        for (let linha = 0; linha < 5; linha++) {
            for (let coluna = 0; coluna < 5; coluna++) {
                const numeroBingo = matrizCartela[linha][coluna];
                const numeroEl = document.createElement('div');
                numeroEl.classList.add('cartela-numero');
                if (numeroBingo === "FREE") {
                    numeroEl.textContent = "FREE";
                    numeroEl.classList.add('free');
                    numeroEl.classList.add('marcado'); 
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
    
    // --- 3. Lógica do Carrossel (Atualizado) ---
    function atualizarVisibilidadeCartela() {
        cartelasGeradas.forEach(cartela => {
            cartela.classList.remove('ativa');
        });
        
        const cartelaAtiva = cartelasGeradas[cartelaAtualIndex];
        if (cartelaAtiva) {
            cartelaAtiva.classList.add('ativa');
            
            tituloCartelaAtualEl.textContent = `Cartela ${cartelaAtualIndex + 1} de ${totalDeCartelas}`;
            cartelaIdDisplay.textContent = `ID: ${cartelaAtiva.dataset.cartelaId}`;
            sorteioIdDisplay.textContent = `Sorteio #${cartelaAtiva.dataset.sorteioId}`;
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

    // --- 4. Evento do Botão BINGO! (Desabilitado) ---
    btnBingo.style.display = 'none'; 

    // --- 5. Funções do Modal de Resultado ---
    btnResultadoFechar.addEventListener('click', () => {
        modalResultado.style.display = 'none';
        if (!jogoEstaAtivo) {
            window.location.href = 'index.html';
        }
    });

    function preencherComprovante(data, indiceCartela, tipoPremio) {
        const elementoCartelaOriginal = cartelasGeradas[indiceCartela];
        if (!elementoCartelaOriginal) return;
        
        cartelaVencedoraDisplay.innerHTML = '';
        const cartelaClonada = elementoCartelaOriginal.cloneNode(true);
        cartelaClonada.style.display = 'grid'; 
        cartelaVencedoraDisplay.appendChild(cartelaClonada);

        comprovanteSorteioId.textContent = `Sorteio: #${data.cartelaGanhadora.s_id}`;
        comprovanteCartelaId.textContent = `Cartela: ${data.cartelaGanhadora.c_id}`;
        
        comprovanteNome.textContent = `Nome: ${nomeJogador}`; 
        comprovantePremio.textContent = `Prêmio: R$ ${data.premioValor} (${tipoPremio})`;
        comprovanteData.textContent = `Data: ${new Date().toLocaleString('pt-BR')}`;
        
        const detalhesContainers = document.querySelectorAll('.comprovante-detalhes');
        if (detalhesContainers) {
            detalhesContainers.forEach(container => container.style.display = 'flex');
        }

        resultadoProvaCartela.style.display = 'block';
    }

    // --- 6. FUNÇÃO DE GERAR COMPROVANTE ---
    btnBaixarComprovante.addEventListener('click', () => {
        console.log("Gerando comprovante em PDF...");
        
        btnBaixarComprovante.disabled = true;
        btnBaixarComprovante.textContent = "Gerando...";

        html2canvas(areaComprovante, { scale: 2, backgroundColor: '#ffffff' })
        .then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4'); 
            const pdfWidth = pdf.internal.pageSize.getWidth();
            
            pdf.setFontSize(20);
            pdf.text("Comprovante - Bingo do Pix", pdfWidth / 2, 20, { align: 'center' });
            
            const imgProps = pdf.getImageProperties(imgData);
            const imgHeight = (imgProps.height * (pdfWidth - 20)) / imgProps.width; 
            
            pdf.addImage(imgData, 'PNG', 10, 30, pdfWidth - 20, imgHeight);
            
            const cartelaId = cartelasSalvas[cartelaAtualIndex].c_id; 
            const nomeArquivo = `comprovante_bingo_${nomeJogador.replace(/\s/g, '_')}_${cartelaId}.pdf`;
            pdf.save(nomeArquivo);

            btnBaixarComprovante.disabled = false;
            btnBaixarComprovante.textContent = "Baixar Comprovante (PDF)";
        
        }).catch(err => {
            console.error("Erro ao gerar PDF:", err);
            alert("Houve um erro ao gerar seu comprovante.");
            btnBaixarComprovante.disabled = false;
            btnBaixarComprovante.textContent = "Baixar Comprovante (PDF)";
        });
    });

    // --- 7. OUVINTES DO SERVIDOR ---
    
    function resetarModal() {
        resultadoProvaCartela.style.display = 'none';
        btnBaixarComprovante.style.display = 'none';
        btnResultadoFechar.textContent = "OK";
        
        const detalhesContainers = document.querySelectorAll('.comprovante-detalhes');
        if (detalhesContainers) {
            detalhesContainers.forEach(container => container.style.display = 'none');
        }
    }
    
    socket.on('novoNumeroSorteado', (numeroSorteado) => {
        if (!jogoEstaAtivo) return; 
        
        ultimoNumeroEl.textContent = numeroSorteado;
        const globoNumEl = document.getElementById(`globo-${numeroSorteado}`);
        if (globoNumEl) globoNumEl.classList.add('sorteado');

        const celulasCartela = document.querySelectorAll('.cartela-jogador .cartela-numero');
        celulasCartela.forEach(celula => {
            if (parseInt(celula.dataset.valor) === numeroSorteado) {
                celula.classList.add('marcado');
            }
        });

        // *** INÍCIO DA MODIFICAÇÃO: FALAR O NÚMERO ***
        const letra = getLetraDoNumero(numeroSorteado); 
        falar(`${letra} ${numeroSorteado}`); 
        // *** FIM DA MODIFICAÇÃO ***
    });

    socket.on('voceGanhouLinha', (data) => {
        console.log("EU GANHEI A LINHA!", data);
        resetarModal();
        
        resultadoTitulo.textContent = "PARABÉNS!";
        resultadoMensagem.textContent = "Você completou uma linha e ganhou o primeiro prêmio! O jogo continua valendo Cartela Cheia.";
        
        preencherComprovante(data, data.indiceCartela, 'Linha');
        falar("Parabéns, você ganhou a linha!"); // <-- FALA
        
        btnBaixarComprovante.style.display = 'block'; 
        modalResultado.style.display = 'flex';
    });

    socket.on('alguemGanhouLinha', (data) => {
        console.log("Alguém ganhou a linha:", data.nome);
        resetarModal();
        
        resultadoTitulo.textContent = "Bingo de Linha!";
        resultadoMensagem.textContent = `O jogador ${data.nome} completou uma linha. O jogo continua valendo Cartela Cheia!`;
        falar(`Bingo de linha! O jogador ${data.nome} ganhou.`); // <-- FALA
        
        modalResultado.style.display = 'flex';
    });

    socket.on('voceGanhouCartelaCheia', (data) => {
        console.log("EU GANHEI A CARTELA CHEIA!", data);
        jogoEstaAtivo = false; 
        resetarModal();
        
        resultadoTitulo.textContent = "PARABÉNS! VOCÊ GANHOU!";
        resultadoMensagem.textContent = `Você completou a cartela e ganhou o grande prêmio! Salve seu comprovante. Entraremos em contato pelo telefone (PIX) cadastrado.`;
        
        preencherComprovante(data, data.indiceCartela, 'Cartela Cheia');
        falar("BINGO! Parabéns, você ganhou a cartela cheia!"); // <-- FALA
        
        btnBaixarComprovante.style.display = 'block'; 
        btnResultadoFechar.textContent = "Voltar ao Início";
        
        modalResultado.style.display = 'flex';
    });

    socket.on('alguemGanhouCartelaCheia', (data) => {
        console.log("Alguém ganhou a cartela cheia:", data.nome);
        jogoEstaAtivo = false; 
        resetarModal();

        resultadoTitulo.textContent = "O Jogo Acabou!";
        resultadoMensagem.textContent = `Que pena! O jogador ${data.nome} completou a cartela e ganhou o grande prêmio.`;
        falar(`Bingo! O jogador ${data.nome} ganhou a cartela cheia.`); // <-- FALA
        btnResultadoFechar.textContent = "Voltar ao Início";

        modalResultado.style.display = 'flex';
    });
    
    socket.on('jogoTerminouSemVencedor', () => {
        console.log("O JOGO TERMINOU! Ninguém ganhou.");
        jogoEstaAtivo = false; 
        resetarModal();

        resultadoTitulo.textContent = "O Jogo Acabou!";
        resultadoMensagem.textContent = "Ninguém ganhou. Acabaram os números. O jogo será reiniciado.";
        falar("O jogo terminou sem vencedores."); // <-- FALA
        btnResultadoFechar.textContent = "Voltar ao Início";

        modalResultado.style.display = 'flex';
    });
    
    socket.on('cartelaAntiga', () => {
        alert("Erro: Suas cartelas são de um sorteio anterior e não são mais válidas.\n\nVocê será redirecionado para a página inicial.");
        window.location.href = 'index.html';
    });

    // ==========================================================
    // --- INICIALIZAÇÃO ---
    // ==========================================================
    
    cartelasSalvas = JSON.parse(sessionStorage.getItem('bingo_cartelas'));
    nomeJogador = sessionStorage.getItem('bingo_usuario_nome'); 
    const telefoneJogador = sessionStorage.getItem('bingo_usuario_telefone');
    
    if (!cartelasSalvas || !nomeJogador || !telefoneJogador || cartelasSalvas.length === 0) {
        alert("Seus dados de jogo não foram encontrados! Redirecionando para a página inicial.");
        window.location.href = 'index.html';
        return;
    }

    socket.emit('registerPlayer', {
        nome: nomeJogador,
        telefone: telefoneJogador,
        cartelas: cartelasSalvas 
    });

    totalDeCartelas = cartelasSalvas.length;
    console.log(`Bem-vindo, ${nomeJogador}! Lendo ${totalDeCartelas} cartela(s).`);

    gerarGlobo();

    cartelasContainer.innerHTML = ''; 
    cartelasGeradas = []; 
    
    for (let i = 0; i < totalDeCartelas; i++) {
        const dadosCartela = cartelasSalvas[i]; 
        const elementoCartela = criarElementoCartela(dadosCartela);
        elementoCartela.id = `cartela-indice-${i}`;
        cartelasGeradas.push(elementoCartela); 
    }
    
    cartelaAtualIndex = 0; 
    atualizarVisibilidadeCartela(); 
    
});
