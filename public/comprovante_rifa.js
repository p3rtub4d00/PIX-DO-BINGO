document.addEventListener('DOMContentLoaded', () => {

    // --- Seletores do DOM ---
    const loadingState = document.getElementById('loading-state');
    const comprovanteState = document.getElementById('comprovante-state');
    
    // Campos do comprovante
    const compNomeJogador = document.getElementById('comp-nome-jogador');
    const compNomePremio = document.getElementById('comp-nome-premio');
    const rifaNumerosContainer = document.getElementById('rifa-numeros-container');
    const compTelefone = document.getElementById('comp-telefone');
    const compData = document.getElementById('comp-data');
    const compValor = document.getElementById('comp-valor');

    // --- Função para formatar BRL ---
    function formatarBRL(valor) {
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ --,--';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // --- Lógica Principal ---
    
    // 1. Pegar o ID da Venda da URL
    const urlParams = new URLSearchParams(window.location.search);
    const rifaVendaId = urlParams.get('vendaId');

    if (!rifaVendaId) {
        loadingState.innerHTML = '<h2 style="color: red;">Erro!</h2><p>ID da Venda não encontrado. Volte e tente novamente.</p>';
        return;
    }

    // 2. Conectar ao Socket
    let socket;
    try { 
        socket = io(); 
        console.log("Conectado ao Socket.IO para buscar comprovante."); 
    }
    catch (err) { 
        console.error("Erro ao conectar ao Socket.IO:", err); 
        loadingState.innerHTML = '<h2 style="color: red;">Erro de Conexão</h2><p>Não foi possível conectar ao servidor.</p>';
        return;
    }

    // 3. Pedir os números ao servidor
    if (socket) {
        console.log(`Pedindo números para a Venda de Rifa ID: ${rifaVendaId}`);
        // (Esta rota 'buscarNumerosRifa' foi criada no server.js)
        socket.emit('buscarNumerosRifa', { rifaVendaId: rifaVendaId }, (data) => {
            
            if (data.success && data.comprovante) {
                const comp = data.comprovante;
                
                // Preenche os dados do comprovante
                compNomeJogador.textContent = comp.nome_jogador;
                compNomePremio.textContent = comp.nome_premio;
                compTelefone.textContent = comp.telefone;
                compData.textContent = comp.data_formatada;
                compValor.textContent = formatarBRL(comp.valor_total);

                // Limpa o container e adiciona os números
                rifaNumerosContainer.innerHTML = '';
                if (comp.numeros && comp.numeros.length > 0) {
                    comp.numeros.forEach(num => {
                        const chip = document.createElement('span');
                        chip.classList.add('rifa-numero-chip');
                        chip.textContent = num; // ex: "0001", "9876"
                        rifaNumerosContainer.appendChild(chip);
                    });
                } else {
                    rifaNumerosContainer.innerHTML = '<p>Erro: Nenhum número foi gerado para esta venda.</p>';
                }

                // Exibe o comprovante e esconde o loading
                loadingState.style.display = 'none';
                comprovanteState.style.display = 'block';

            } else {
                // Erro (venda não encontrada, pagamento pendente, etc)
                loadingState.innerHTML = `<h2 style="color: red;">Erro ao Buscar</h2><p>${data.message || 'Não foi possível encontrar seu comprovante.'}</p>`;
            }
        });
    }

});
