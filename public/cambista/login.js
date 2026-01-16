document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form');
    const usuarioInput = document.getElementById('usuario');
    const senhaInput = document.getElementById('senha');
    const btnEntrar = document.querySelector('button');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const usuario = usuarioInput.value.trim();
            const senha = senhaInput.value.trim();

            if (!usuario || !senha) {
                alert('Preencha todos os campos!');
                return;
            }

            btnEntrar.disabled = true;
            btnEntrar.textContent = 'Entrando...';

            try {
                const response = await fetch('/cambista/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json' // <--- ESSENCIAL PARA O SERVER LER
                    },
                    body: JSON.stringify({ usuario, senha })
                });

                const data = await response.json();

                if (data.success) {
                    window.location.href = 'painel.html';
                } else {
                    alert('Login falhou: Usuário ou senha incorretos (ou inativo).');
                    btnEntrar.disabled = false;
                    btnEntrar.textContent = 'Entrar';
                }
            } catch (err) {
                console.error(err);
                alert('Erro de conexão com o servidor.');
                btnEntrar.disabled = false;
                btnEntrar.textContent = 'Entrar';
            }
        });
    }
});
