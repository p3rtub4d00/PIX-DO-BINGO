(function () {
    async function carregarBranding() {
        try {
            const response = await fetch('/api/site-branding');
            if (!response.ok) return;
            const data = await response.json();
            if (!data || !data.success) return;

            const nome = data.nome_bingo || 'Bingo do Pix';
            const telefone = String(data.telefone_contato || '').replace(/\D/g, '');
            const whatsappLink = data.whatsapp_link || (telefone ? `https://wa.me/55${telefone}` : '#');
            const telefoneFormatado = telefone.length === 11
                ? telefone.replace(/(\d{2})(\d{5})(\d{4})/, '$1 $2-$3')
                : telefone.length === 10
                    ? telefone.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2-$3')
                    : telefone;

            document.querySelectorAll('[data-branding-nome]').forEach(el => {
                el.textContent = nome;
            });

            document.querySelectorAll('[data-branding-telefone]').forEach(el => {
                el.textContent = telefoneFormatado || telefone;
            });

            document.querySelectorAll('[data-branding-whatsapp]').forEach(el => {
                if (el.tagName === 'A') {
                    el.href = whatsappLink;
                }
            });
        } catch (e) {
            console.warn('Não foi possível carregar branding do site.');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', carregarBranding);
    } else {
        carregarBranding();
    }
})();
