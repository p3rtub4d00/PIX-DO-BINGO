document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('anuncios-json');
    const btnValidar = document.getElementById('btn-validar');
    const btnSalvar = document.getElementById('btn-salvar-anuncios');
    const statusEl = document.getElementById('anuncios-status');

    const setStatus = (msg, ok = true) => {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = `status-message ${ok ? 'status-success' : 'status-error'}`;
        statusEl.style.display = 'block';
    };

    const parseText = () => {
        if (!textarea) throw new Error('Campo de JSON não encontrado.');
        const parsed = JSON.parse(textarea.value);

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('JSON deve ser um objeto.');
        }
        if (!Number.isFinite(Number(parsed.rotacaoSegundos))) {
            throw new Error('rotacaoSegundos deve ser número.');
        }
        if (!Array.isArray(parsed.mensagens)) {
            throw new Error('mensagens deve ser array.');
        }
        if (!Array.isArray(parsed.slides)) {
            throw new Error('slides deve ser array.');
        }
        return parsed;
    };

    const carregar = async () => {
        try {
            const response = await fetch('/admin/dashboard-ads', { headers: { 'Accept': 'application/json' } });
            if (!response.ok) {
                if (response.status === 403) {
                    window.location.href = '/admin/login.html';
                    return;
                }
                throw new Error(`Erro ${response.status}`);
            }
            const data = await response.json();
            textarea.value = JSON.stringify(data, null, 2);
            setStatus('Configuração carregada.', true);
        } catch (error) {
            setStatus(`Erro ao carregar: ${error.message}`, false);
        }
    };

    btnValidar?.addEventListener('click', () => {
        try {
            parseText();
            setStatus('JSON válido! Pronto para salvar.', true);
        } catch (error) {
            setStatus(`JSON inválido: ${error.message}`, false);
        }
    });

    btnSalvar?.addEventListener('click', async () => {
        try {
            const payload = parseText();
            btnSalvar.disabled = true;
            btnSalvar.textContent = 'Salvando...';

            const response = await fetch('/admin/dashboard-ads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                if (response.status === 403) {
                    window.location.href = '/admin/login.html';
                    return;
                }
                throw new Error(result.message || `Erro ${response.status}`);
            }

            setStatus(result.message || 'Anúncios salvos com sucesso.', true);
        } catch (error) {
            setStatus(`Erro ao salvar: ${error.message}`, false);
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.textContent = 'Salvar anúncios';
        }
    });

    carregar();
});
