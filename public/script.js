document.addEventListener('DOMContentLoaded', () => {

let socket;
try { socket = io(); console.log("Conectado ao servidor Socket.IO."); }
catch (err) { console.error("Erro ao conectar ao Socket.IO:", err); alert("Erro de conexão com o servidor. Recarregue."); }

// --- Variável Global para Preço (será atualizada) ---
let PRECO_CARTELA_ATUAL = 5.00; // Valor padrão inicial

// --- Seletores do DOM ---
const modal = document.getElementById('modal-checkout');
const btnCloseModal = document.querySelector('.modal-close');
const btnJogueAgora = document.getElementById('btn-jogue-agora');

const etapaDados = document.getElementById('etapa-dados');
const etapaPix = document.getElementById('etapa-pix');
const btnGerarPix = document.getElementById('btn-gerar-pix'); 
const pixQrCodeImg = document.getElementById('pix-qrcode-img');
const pixCopiaColaInput = document.getElementById('pix-copia-cola');
const btnCopiarPix = document.getElementById('btn-copiar-pix');
const aguardandoPagamentoEl = document.getElementById('aguardando-pagamento');

const modalNome = document.getElementById('modal-nome');
const modalTelefone = document.getElementById('modal-telefone');
const modalQuantidadeInput = document.getElementById('modal-quantidade');
const modalPrecoEl = document.getElementById('modal-preco');
const indexPremioLinhaEl = document.getElementById('index-premio-linha');
const indexPremioCheiaEl = document.getElementById('index-premio-cheia');
const indexPrecoCartelaEl = document.getElementById('index-preco-cartela'); // Span no botão
const modalLabelPrecoEl = document.getElementById('modal-label-preco'); // Span no label do modal

const premioEspecialContainer = document.getElementById('premio-especial');
const especialValorEl = document.getElementById('especial-valor');
const especialDataEl = document.getElementById('especial-data');

    // --- ATUALIZAÇÃO (POLLING ROBUSTO) ---
    let pollerInterval = null; // Guarda a referência do interval
    let currentPaymentId = null; // Guarda o ID do pagamento que estamos verificando
    // --- FIM DA ATUALIZAÇÃO ---
    // *** INÍCIO DA ATUALIZAÇÃO (Seletores do Quadro de Status) ***
    const statusSorteioBox = document.getElementById('status-sorteio-box');
    const statusTitulo = document.getElementById('status-titulo');
    const statusCronometro = document.getElementById('status-cronometro');
    const statusSubtexto = document.getElementById('status-subtexto');
    const btnAssistirVivo = document.getElementById('btn-assistir-vivo');
    // *** FIM DA ATUALIZAÇÃO ***

    let pollerInterval = null; 
    let currentPaymentId = null; 

// --- Função para formatar valor BRL ---
function formatarBRL(valor) {
const numero = parseFloat(valor);
if (isNaN(numero)) return 'R$ --,--';
return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// --- Função para ATUALIZAR exibição de preços/prêmios (ATUALIZADA) ---
function atualizarValoresExibidos(data) {
if (!data) return;
console.log("Atualizando exibição de valores:", data);

// Sorteio Padrão
if(indexPremioLinhaEl) indexPremioLinhaEl.textContent = formatarBRL(data.premio_linha);
if(indexPremioCheiaEl) indexPremioCheiaEl.textContent = formatarBRL(data.premio_cheia);

// Atualiza preço da cartela e recalcula o total no modal se estiver aberto
const novoPreco = parseFloat(data.preco_cartela);
if (!isNaN(novoPreco) && novoPreco > 0) {
PRECO_CARTELA_ATUAL = novoPreco; // Atualiza variável global
const precoFormatado = formatarBRL(PRECO_CARTELA_ATUAL);
if(indexPrecoCartelaEl) indexPrecoCartelaEl.textContent = precoFormatado;
if(modalLabelPrecoEl) modalLabelPrecoEl.textContent = precoFormatado;
atualizarPrecoTotalModal(); // Recalcula total no modal
}

// --- LÓGICA DO SORTEIO ESPECIAL ---
if (data.sorteio_especial_ativo === 'true') {
if (especialValorEl) especialValorEl.textContent = formatarBRL(data.sorteio_especial_valor);
if (especialDataEl) especialDataEl.textContent = `🗓️ ${data.sorteio_especial_data} 🕖`;
if (premioEspecialContainer) premioEspecialContainer.style.display = 'block'; // Mostra
} else {
if (premioEspecialContainer) premioEspecialContainer.style.display = 'none'; // Esconde
}
}

    // --- *** ATUALIZAÇÃO (POLLING ROBUSTO) *** ---
    // Esta é a função que checa o pagamento
    // --- *** INÍCIO DA ATUALIZAÇÃO (Função do Quadro de Status) *** ---
    function atualizarStatusBox(estado, tempo) {
        if (!statusSorteioBox) return; // Se o elemento não existir, sai

        if (estado === 'ESPERANDO') {
            statusSorteioBox.className = 'card status-esperando';
            statusTitulo.textContent = 'PRÓXIMO SORTEIO EM:';
            
            // Formata o tempo
            const minutos = Math.floor(tempo / 60);
            let segundos = tempo % 60;
            segundos = segundos < 10 ? '0' + segundos : segundos;
            statusCronometro.textContent = `${minutos}:${segundos}`;
            
            statusCronometro.style.display = 'block';
            statusSubtexto.textContent = 'Garanta já sua cartela!';
            btnAssistirVivo.style.display = 'none';
            
            // Muda o botão principal
            btnJogueAgora.innerHTML = `Comprar Cartela (<span id="index-preco-cartela">${formatarBRL(PRECO_CARTELA_ATUAL)}</span>)`;

        } else { // JOGANDO_LINHA, JOGANDO_CHEIA, ANUNCIANDO_VENCEDOR
            statusSorteioBox.className = 'card status-jogando';
            
            let textoEstado = 'SORTEIO AO VIVO!';
            if (estado === 'JOGANDO_LINHA') {
                textoEstado = 'AO VIVO: VALENDO LINHA!';
            } else if (estado === 'JOGANDO_CHEIA') {
                textoEstado = 'AO VIVO: VALENDO CARTELA CHEIA!';
            } else if (estado === 'ANUNCIANDO_VENCEDOR') {
                textoEstado = 'AO VIVO: ANUNCIANDO VENCEDOR!';
            }
            
            statusTitulo.textContent = textoEstado;
            statusCronometro.style.display = 'none'; // Esconde o timer
            statusSubtexto.textContent = 'As compras agora valem para o próximo sorteio.';
            btnAssistirVivo.style.display = 'block'; // Mostra o botão de assistir

            // Muda o botão principal
            btnJogueAgora.innerHTML = `Comprar p/ Próximo Sorteio (<span id="index-preco-cartela">${formatarBRL(PRECO_CARTELA_ATUAL)}</span>)`;
        }
    }
    // --- *** FIM DA ATUALIZAÇÃO *** ---


    // --- Funções de Polling de Pagamento (Sem alteração) ---
function checarPagamento() {
if (currentPaymentId && socket.connected) {
console.log(`Polling: Checando status do pagamento ${currentPaymentId}...`);
socket.emit('checarMeuPagamento', { paymentId: currentPaymentId });
} else {
console.log("Polling: Pulado (sem ID de pagamento ou socket desconectado).");
}
}

    // Funções para controlar o verificador de pagamento
function iniciarVerificadorPagamento(paymentId) {
        // Limpa qualquer verificador antigo
pararVerificadorPagamento();

console.log(`Iniciando verificador para Payment ID: ${paymentId}`);
        currentPaymentId = paymentId; // Salva o ID que estamos verificando
        
        // Verifica imediatamente
        currentPaymentId = paymentId; 
checarPagamento();

        // E então começa a verificar a cada 3 segundos
        pollerInterval = setInterval(checarPagamento, 3000); // Pergunta a cada 3 segundos
        pollerInterval = setInterval(checarPagamento, 3000); 
}

function pararVerificadorPagamento() {
if (pollerInterval) {
console.log("Parando verificador de pagamento.");
clearInterval(pollerInterval);
pollerInterval = null;
}
currentPaymentId = null; // Limpa o ID
}
    // --- *** FIM DA ATUALIZAÇÃO *** ---


// --- Função para Fechar o Modal ---
function fecharModal() { 
if(modal) modal.style.display = 'none'; 
        // Reseta o modal para a etapa 1
if(etapaDados) etapaDados.style.display = 'block';
if(etapaPix) etapaPix.style.display = 'none';
if(btnGerarPix) { 
btnGerarPix.disabled = false; 
btnGerarPix.textContent = "Gerar PIX"; 
} 
        
        // *** ATUALIZAÇÃO (POLLING ROBUSTO) ***
        pararVerificadorPagamento(); // Para de checar se o usuário fechar o modal
        // *** FIM DA ATUALIZAÇÃO ***
        pararVerificadorPagamento(); 
}

    // --- Event Listener para ABRIR o Modal ---
    // --- Event Listeners (Sem alteração) ---
if (btnJogueAgora && modal) {
btnJogueAgora.addEventListener('click', () => {
console.log("Botão 'Jogue Agora!' clicado.");
modal.style.display = 'flex';
            atualizarPrecoTotalModal(); // Calcula o preço total inicial (para 1 cartela)
            atualizarPrecoTotalModal();
if(modalNome) modalNome.focus();
});
} else { console.error("Erro: Botão 'Jogue Agora' ou Modal não encontrado."); }

    // --- Event Listener para CALCULAR o Preço TOTAL no Modal ---
function atualizarPrecoTotalModal() {
if (!modalQuantidadeInput || !modalPrecoEl) return;
let quantidade = parseInt(modalQuantidadeInput.value);
quantidade = (!quantidade || quantidade < 1) ? 1 : quantidade;
        const precoTotal = quantidade * PRECO_CARTELA_ATUAL; // Usa preço global
        const precoTotal = quantidade * PRECO_CARTELA_ATUAL; 
modalPrecoEl.textContent = formatarBRL(precoTotal);
}
if(modalQuantidadeInput) {
modalQuantidadeInput.addEventListener('input', atualizarPrecoTotalModal);
modalQuantidadeInput.addEventListener('change', atualizarPrecoTotalModal);
}

    // --- Event Listeners para Fechar o Modal ---
if(btnCloseModal) btnCloseModal.addEventListener('click', fecharModal);
if(modal) modal.addEventListener('click', (event) => { if (event.target === modal) fecharModal(); });

    // --- Event Listener para GERAR PIX (Atualizado) ---
if (btnGerarPix && modalNome && modalTelefone && modalQuantidadeInput && socket) {
btnGerarPix.addEventListener('click', () => {
const nome = modalNome.value.trim(); const telefone = modalTelefone.value.trim(); const quantidade = parseInt(modalQuantidadeInput.value);
if (!nome || !telefone || !quantidade || quantidade < 1) { alert("Preencha todos os campos."); return; }
if (!/^\d{10,11}$/.test(telefone.replace(/\D/g,''))) { alert("Telefone inválido."); return; }

console.log("Solicitando PIX..."); 
btnGerarPix.textContent = "Gerando..."; 
btnGerarPix.disabled = true;

socket.emit('criarPagamento', { nome, telefone, quantidade }, (data) => {

if (data && data.success) {
console.log("PIX Recebido, Payment ID:", data.paymentId);
                    // Preenche os dados do PIX
pixQrCodeImg.src = `data:image/png;base64,${data.qrCodeBase64}`;
pixCopiaColaInput.value = data.qrCodeCopiaCola;

                    // Muda para a etapa 2
etapaDados.style.display = 'none';
etapaPix.style.display = 'block';
aguardandoPagamentoEl.style.display = 'block';

                    // *** ATUALIZAÇÃO (POLLING ROBUSTO) ***
                    // Salva os dados no sessionStorage para a próxima página
                    // Fazemos isso AGORA, antes do pagamento ser aprovado
sessionStorage.setItem('bingo_usuario_nome', nome); 
sessionStorage.setItem('bingo_usuario_telefone', telefone);
                    // Salva o paymentId no session storage (para o caso de reload da página)
sessionStorage.setItem('bingo_payment_id', data.paymentId); 
                    // Inicia o verificador
                    
iniciarVerificadorPagamento(data.paymentId);
                    // *** FIM DA ATUALIZAÇÃO ***

} else {
alert(`Erro: ${data.message || 'Não foi possível gerar o PIX.'}`);
btnGerarPix.textContent = "Gerar PIX"; 
btnGerarPix.disabled = false;
}
});
});
} else { console.error("Erro: Elementos do modal ou socket não encontrados para 'Gerar PIX'."); }

    // --- Botão de Copiar PIX ---
if(btnCopiarPix && pixCopiaColaInput) {
btnCopiarPix.addEventListener('click', () => {
pixCopiaColaInput.select();
try {
navigator.clipboard.writeText(pixCopiaColaInput.value); // API moderna
btnCopiarPix.textContent = "Copiado!";
setTimeout(() => { btnCopiarPix.textContent = "Copiar Código"; }, 2000);
} catch (err) {
                // Fallback para document.execCommand
try {
document.execCommand('copy');
btnCopiarPix.textContent = "Copiado!";
setTimeout(() => { btnCopiarPix.textContent = "Copiar Código"; }, 2000);
} catch (err2) {
alert('Não foi possível copiar o código. Selecione manualmente.');
}
}
});
}

    // --- Ouvinte Socket.IO para Atualização de Configs ---
    // --- Ouvintes do Socket.IO (ATUALIZADOS) ---
if (socket) {
socket.on('configAtualizada', (data) => {
console.log("Recebida atualização de configurações via Socket.IO.");
atualizarValoresExibidos(data); 
});

socket.on('estadoInicial', (data) => {
console.log("Recebido estado inicial com configurações.");
if (data.configuracoes) {
atualizarValoresExibidos(data.configuracoes);
}
             // *** INÍCIO DA ATUALIZAÇÃO (Estado Inicial) ***
             atualizarStatusBox(data.estado, data.tempoRestante); 
             // *** FIM DA ATUALIZAÇÃO ***
});

        // *** ATUALIZAÇÃO (POLLING ROBUSTO) ***
        // Este ouvinte agora é ativado pelo NOSSO poller
        // *** INÍCIO DA ATUALIZAÇÃO (Novos Ouvintes de Status) ***
        socket.on('cronometroUpdate', (data) => {
            // data = { tempo, sorteioId, estado }
            if (data.estado === 'ESPERANDO') {
                atualizarStatusBox(data.estado, data.tempo);
            }
        });

        socket.on('estadoJogoUpdate', (data) => {
            // data = { sorteioId, estado }
            atualizarStatusBox(data.estado, 0); // O tempo não importa aqui
        });
        // *** FIM DA ATUALIZAÇÃO ***

socket.on('pagamentoAprovado', (data) => {
            // data é: { vendaId, nome, telefone }
console.log(`Pagamento Aprovado! Venda ID: ${data.vendaId}`);

            pararVerificadorPagamento(); // Para de perguntar ao servidor
            sessionStorage.removeItem('bingo_payment_id'); // Limpa o ID
            pararVerificadorPagamento(); 
            sessionStorage.removeItem('bingo_payment_id'); 

            // Verificamos se o nome salvo é o mesmo (segurança extra)
const nomeSalvo = sessionStorage.getItem('bingo_usuario_nome');
if (nomeSalvo !== data.nome) {
console.warn("Pagamento aprovado, mas o nome não bate. Ignorando.");
                 // Não paramos, pois pode ser uma aba antiga.
                 // Mas a aba correta vai pegar.
return;
}

            // Só exibe o alerta se o modal estiver aberto (para não incomodar quem pagou e já foi redirecionado)
if (modal.style.display === 'flex' && etapaPix.style.display === 'block') {
alert("Pagamento confirmado!\n\nCartelas geradas.\nIndo para a sala de espera.");
fecharModal(); 
modalNome.value = ""; 
modalTelefone.value = ""; 
modalQuantidadeInput.value = "1";
}

            // Redireciona para a sala de espera, passando o ID da Venda na URL
window.location.href = `espera.html?venda=${data.vendaId}`;
});
        // *** FIM DA ATUALIZAÇÃO ***

socket.on('pagamentoErro', (data) => {
            // Este erro agora só é chamado se o *webhook* falhar
alert(`Erro no servidor de pagamento: ${data.message}`);
pararVerificadorPagamento();
            sessionStorage.removeItem('bingo_payment_id'); // Limpa o ID
            fecharModal(); // Fecha o modal para o usuário tentar de novo
            sessionStorage.removeItem('bingo_payment_id'); 
            fecharModal(); 
});

        // *** ATUALIZAÇÃO (POLLING ROBUSTO) ***
        // Ouvinte para quando o socket reconectar (ex: trocou de app e voltou)
socket.on('connect', () => {
console.log("Socket reconectado.");
            // Tenta checar o pagamento se o usuário RECARREGOU a página
const paymentIdSalvo = sessionStorage.getItem('bingo_payment_id');
            // AQUI ESTÁ A CORREÇÃO: Removemos a checagem do 'etapaPix'
if (paymentIdSalvo) {
console.log("Reconectado. Reiniciando verificador para paymentId salvo.");
iniciarVerificadorPagamento(paymentIdSalvo);
}
});

        // Ouvinte para quando a ABA do navegador ficar visível
document.addEventListener("visibilitychange", () => {
if (document.visibilityState === "visible") {
console.log("Aba do navegador ficou visível.");
                // Tenta checar o pagamento se o usuário estiver na etapa 2 do modal
const paymentIdSalvo = sessionStorage.getItem('bingo_payment_id');
                // AQUI ESTÁ A CORREÇÃO: Removemos a checagem do 'etapaPix'
if (paymentIdSalvo) {
console.log("Aba visível. Forçando uma checagem de pagamento.");
                    checarPagamento(); // Força uma checagem imediata
                    checarPagamento(); 
}
}
});
        // *** FIM DA ATUALIZAÇÃO ***
}

    // *** ATUALIZAÇÃO (POLLING ROBUSTO) ***
    // Ao carregar a página, verifica se um paymentId ficou "preso" no sessionStorage
    // Isso acontece se o usuário recarregar a página enquanto paga
    // Polling Robusto (Ao carregar a página)
const paymentIdSalvo = sessionStorage.getItem('bingo_payment_id');
if (paymentIdSalvo) {
console.log(`Encontrado paymentId ${paymentIdSalvo} no sessionStorage ao carregar. Iniciando verificador.`);
        // Mostra a tela de "Aguardando Pagamento"
modal.style.display = 'flex';
etapaDados.style.display = 'none';
etapaPix.style.display = 'block';
aguardandoPagamentoEl.style.display = 'block';
        // (Não teremos o QR Code, mas o usuário só quer a confirmação)
pixQrCodeImg.style.display = 'none';
pixCopiaColaInput.value = "Verificando seu pagamento anterior...";

iniciarVerificadorPagamento(paymentIdSalvo);
}
    // *** FIM DA ATUALIZAÇÃO ***
});
