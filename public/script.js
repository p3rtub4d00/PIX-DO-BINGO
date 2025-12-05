document.addEventListener('DOMContentLoaded', async () => {
    let socket = io();
    let playerLogado = null;

    // Checar se o usuário está logado
    try {
        const res = await fetch('/api/player/me');
        if(res.ok) {
            const data = await res.json();
            if(data.success) {
                playerLogado = data.jogador;
                atualizarHeaderLogado(playerLogado);
            }
        }
    } catch(e) {}

    function atualizarHeaderLogado(player) {
        const header = document.querySelector('header');
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info-header';
        // Mostra o saldo no cabeçalho
        userInfo.innerHTML = `
            <span style="font-weight:bold; color:var(--color-text-heading);">Olá, ${player.nome.split(' ')[0]}</span>
            <span class="badge-saldo" style="background:#e0f7fa; color:var(--color-pix-green); padding:5px 10px; border-radius:15px; font-weight:900; border:1px solid var(--color-pix-green); margin: 0 10px;">${parseFloat(player.saldo).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span>
            <a href="minha-conta.html" class="btn-comprar btn-comprar-azul" style="padding: 5px 10px; font-size: 0.8em; width:auto; display:inline-block;">Minha Conta</a>
        `;
        header.insertBefore(userInfo, header.firstChild);
        const loginBtns = document.getElementById('auth-buttons');
        if(loginBtns) loginBtns.style.display = 'none';
    }

    // Variáveis
    let PRECO_CARTELA_ATUAL = 5.00;
    let PRECO_CARTELA_ESPECIAL_ATUAL = 10.00;
    let TIPO_COMPRA_ATUAL = 'regular';

    // Seletores e Elementos
    const modal = document.getElementById('modal-checkout');
    const btnCloseModal = document.querySelector('.modal-close');
    const btnJogueAgora = document.getElementById('btn-jogue-agora');
    const btnJogueEspecial = document.getElementById('btn-jogue-especial');
    const modalTitulo = document.getElementById('modal-titulo');
    const etapaDados = document.getElementById('etapa-dados');
    const etapaPix = document.getElementById('etapa-pix');
    const modalNome = document.getElementById('modal-nome');
    const modalTelefone = document.getElementById('modal-telefone');
    const modalQuantidadeInput = document.getElementById('modal-quantidade');
    const modalPrecoEl = document.getElementById('modal-preco');
    const btnGerarPix = document.getElementById('btn-gerar-pix');
    const indexPrecoCartelaEl = document.getElementById('index-preco-cartela');
    const especialPrecoCartelaEl = document.getElementById('especial-preco-cartela');

    // Botão de Pagar com Saldo (Injetado dinamicamente)
    const btnPagarSaldo = document.createElement('button');
    btnPagarSaldo.id = 'btn-pagar-saldo';
    btnPagarSaldo.className = 'btn-comprar btn-comprar-azul';
    btnPagarSaldo.style.marginTop = '10px';
    btnPagarSaldo.style.display = 'none'; 
    btnPagarSaldo.textContent = 'Pagar com Saldo';
    if(etapaDados) etapaDados.appendChild(btnPagarSaldo);
    
    function formatarBRL(v) { return parseFloat(v).toLocaleString('pt-BR', {style:'currency',currency:'BRL'}); }

    // Atualizações do Socket
    socket.on('configAtualizada', (data) => atualizarValoresExibidos(data));
    socket.on('estadoInicial', (data) => {
        if(data.configuracoes) atualizarValoresExibidos(data.configuracoes);
        if(data.estado) atualizarStatusBox(data.estado, data.tempoRestante);
    });
    
    function atualizarValoresExibidos(data) {
        if(!data) return;
        const pReg = parseFloat(data.preco_cartela);
        if(pReg) { PRECO_CARTELA_ATUAL = pReg; if(indexPrecoCartelaEl) indexPrecoCartelaEl.textContent = formatarBRL(pReg); }
        const pEsp = parseFloat(data.sorteio_especial_preco_cartela);
        if(pEsp) { PRECO_CARTELA_ESPECIAL_ATUAL = pEsp; if(especialPrecoCartelaEl) especialPrecoCartelaEl.textContent = formatarBRL(pEsp); }
        const boxEsp = document.getElementById('premio-especial');
        if(data.sorteio_especial_ativo === 'true' && boxEsp) {
            boxEsp.style.display = 'block';
            document.getElementById('especial-valor').textContent = formatarBRL(data.sorteio_especial_valor);
            document.getElementById('especial-data').textContent = `🗓️ ${data.sorteio_especial_datahora ? new Date(data.sorteio_especial_datahora).toLocaleString('pt-BR') : 'Breve'}`;
        } else if(boxEsp) boxEsp.style.display = 'none';
    }

    function atualizarStatusBox(estado, tempo) {
        const box = document.getElementById('status-sorteio-box');
        if(!box) return;
        const titulo = document.getElementById('status-titulo');
        const timer = document.getElementById('status-cronometro');
        if(estado === 'ESPERANDO') {
            box.className = 'card status-esperando';
            titulo.textContent = 'PRÓXIMO SORTEIO EM:';
            const m = Math.floor(tempo/60); const s = tempo%60;
            timer.textContent = `${m}:${s<10?'0':''}${s}`;
            timer.style.display = 'block';
        } else {
            box.className = 'card status-jogando';
            titulo.textContent = 'SORTEIO EM ANDAMENTO!';
            timer.style.display = 'none';
        }
    }
    socket.on('cronometroUpdate', (d) => { if(d.estado==='ESPERANDO') atualizarStatusBox(d.estado, d.tempo); });
    socket.on('estadoJogoUpdate', (d) => atualizarStatusBox(d.estado, 0));

    // Modal
    function abrirModal(tipo) {
        TIPO_COMPRA_ATUAL = tipo;
        modalTitulo.textContent = tipo === 'especial' ? 'Sorteio Especial' : 'Complete seu Pedido';
        modal.style.display = 'flex';
        // Lógica Híbrida: Preenche dados se logado
        if(playerLogado) {
            modalNome.value = playerLogado.nome;
            modalTelefone.value = playerLogado.telefone;
            modalNome.readOnly = true; 
            modalTelefone.readOnly = true;
            btnPagarSaldo.style.display = 'block';
        } else {
            modalNome.value = '';
            modalTelefone.value = '';
            modalNome.readOnly = false;
            modalTelefone.readOnly = false;
            btnPagarSaldo.style.display = 'none';
        }
        atualizarTotal();
    }

    if(btnJogueAgora) btnJogueAgora.addEventListener('click', () => abrirModal('regular'));
    if(btnJogueEspecial) btnJogueEspecial.addEventListener('click', () => abrirModal('especial'));
    if(btnCloseModal) btnCloseModal.addEventListener('click', () => modal.style.display = 'none');

    function atualizarTotal() {
        const qtd = parseInt(modalQuantidadeInput.value) || 1;
        const preco = TIPO_COMPRA_ATUAL === 'especial' ? PRECO_CARTELA_ESPECIAL_ATUAL : PRECO_CARTELA_ATUAL;
        document.getElementById('modal-label-preco').textContent = formatarBRL(preco);
        document.getElementById('modal-preco').textContent = formatarBRL(qtd * preco);
    }
    modalQuantidadeInput.addEventListener('input', atualizarTotal);

    // Compra PIX (Igual antes)
    btnGerarPix.addEventListener('click', (e) => {
        e.preventDefault();
        const dados = { nome: modalNome.value, telefone: modalTelefone.value, quantidade: parseInt(modalQuantidadeInput.value), refCode: sessionStorage.getItem('bingo_ref_code') };
        if(!dados.nome || !dados.telefone) return alert('Preencha tudo');
        const evento = TIPO_COMPRA_ATUAL === 'especial' ? 'criarPagamentoEspecial' : 'criarPagamento';
        btnGerarPix.disabled = true; btnGerarPix.textContent = 'Gerando...';
        socket.emit(evento, dados, (resp) => {
            if(resp.success) {
                etapaDados.style.display = 'none'; etapaPix.style.display = 'block';
                document.getElementById('pix-qrcode-img').src = `data:image/png;base64,${resp.qrCodeBase64}`;
                document.getElementById('pix-copia-cola').value = resp.qrCodeCopiaCola;
                sessionStorage.setItem('bingo_payment_id', resp.paymentId);
                iniciarPolling(resp.paymentId);
            } else {
                alert('Erro ao gerar PIX'); btnGerarPix.disabled = false; btnGerarPix.textContent = 'Gerar PIX';
            }
        });
    });

    // Compra com Saldo (Novo)
    btnPagarSaldo.addEventListener('click', (e) => {
        e.preventDefault();
        const qtd = parseInt(modalQuantidadeInput.value);
        if(!confirm(`Comprar ${qtd} cartelas usando seu saldo?`)) return;
        btnPagarSaldo.disabled = true; btnPagarSaldo.textContent = 'Processando...';
        socket.emit('comprarComSaldo', { jogadorId: playerLogado._id, quantidade: qtd, tipo: TIPO_COMPRA_ATUAL }, (resp) => {
            if(resp.success) {
                alert('Compra realizada com sucesso!');
                window.location.href = `espera.html?venda=${resp.vendaId}`;
            } else {
                alert(resp.message || 'Erro na compra');
                btnPagarSaldo.disabled = false; btnPagarSaldo.textContent = 'Pagar com Saldo';
            }
        });
    });

    let pollInterval;
    function iniciarPolling(pid) {
        if(pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(() => { socket.emit('checarMeuPagamento', {paymentId: pid}); }, 3000);
    }
    socket.on('pagamentoAprovado', (d) => {
        clearInterval(pollInterval);
        alert('Pagamento Aprovado!');
        window.location.href = `espera.html?venda=${d.vendaId}`;
    });
    
    const btnCopy = document.getElementById('btn-copiar-pix');
    if(btnCopy) btnCopy.addEventListener('click', () => {
        const input = document.getElementById('pix-copia-cola'); input.select(); navigator.clipboard.writeText(input.value);
        btnCopy.textContent = 'Copiado!'; setTimeout(()=>btnCopy.textContent='Copiar',2000);
    });
    
    const formRec = document.getElementById('form-recuperar-cartelas');
    if(formRec) formRec.addEventListener('submit', (e) => {
        e.preventDefault();
        const tel = document.getElementById('modal-telefone-recuperar').value;
        socket.emit('buscarCartelasPorTelefone', {telefone: tel}, (d) => {
            if(d.success) {
                // Simples redirect para a última compra, para simplificar
                if(d.vendas.length > 0) window.location.href = `espera.html?venda=${d.vendas[0].id}`;
                else alert('Nenhuma compra recente encontrada.');
            }
            else alert('Nenhuma compra encontrada');
        });
    });
});
