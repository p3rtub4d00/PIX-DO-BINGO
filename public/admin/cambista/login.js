document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const usuarioInput = document.getElementById('usuario');
    const senhaInput = document.getElementById('senha');
    const errorElement = document.getElementById('login-error');

    usuarioInput.focus();

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); 
        errorElement.style.display = 'none'; 
        const btn = loginForm.querySelector('button');
        btn.disabled = true; 
        btn.textContent = 'Entrando...';

        const usuario = usuarioInput.value.trim();
        const senha = senhaInput.value;

        if (!usuario || !senha) {
            errorElement.textContent = "Usuário e senha são obrigatórios.";
            errorElement.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Entrar';
            return;
        }

        try {
            const response = await fetch('/cambista/login', { // Rota de login do cambista
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json' 
                },
                body: JSON.stringify({ usuario, senha }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                console.log("Login de cambista bem-sucedido!");
                // Redireciona para o painel do cambista
                window.location.href = '/cambista/painel.html'; 
            } else {
                errorElement.textContent = result.message || "Usuário ou senha inválidos.";
                errorElement.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Entrar';
            }
        } catch (error) {
            console.error("Erro de rede ou JSON ao tentar fazer login:", error);
            errorElement.textContent = "Erro de conexão com o servidor. Tente novamente.";
            errorElement.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Entrar';
        }
    });
});
