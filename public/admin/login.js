document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const usuarioInput = document.getElementById('usuario');
    const senhaInput = document.getElementById('senha');
    const errorElement = document.getElementById('login-error');

    // Tenta focar no campo de usuário ao carregar
    usuarioInput.focus();

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Impede o envio padrão do formulário
        errorElement.style.display = 'none'; // Esconde erro anterior
        loginForm.querySelector('button').disabled = true; // Desabilita botão
        loginForm.querySelector('button').textContent = 'Entrando...';


        const usuario = usuarioInput.value.trim(); // Remove espaços extras
        const senha = senhaInput.value;

        if (!usuario || !senha) {
            errorElement.textContent = "Usuário e senha são obrigatórios.";
            errorElement.style.display = 'block';
             loginForm.querySelector('button').disabled = false;
             loginForm.querySelector('button').textContent = 'Entrar';
            return;
        }

        console.log(`Tentando login com usuário: ${usuario}`);

        try {
            const response = await fetch('/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json' // Indica que esperamos JSON
                },
                body: JSON.stringify({ usuario, senha }),
            });

            const result = await response.json();

            if (response.ok && result.success) { // Verifica status HTTP e success
                console.log("Login bem-sucedido!");
                // Redireciona para o painel principal do admin
                window.location.href = '/admin/painel.html'; // Garante que vai para a página correta
            } else {
                console.log("Falha no login:", result.message || `Status: ${response.status}`);
                errorElement.textContent = result.message || "Usuário ou senha inválidos.";
                errorElement.style.display = 'block';
                 loginForm.querySelector('button').disabled = false;
                 loginForm.querySelector('button').textContent = 'Entrar';
            }
        } catch (error) {
            console.error("Erro de rede ou JSON ao tentar fazer login:", error);
            errorElement.textContent = "Erro de conexão com o servidor. Tente novamente.";
            errorElement.style.display = 'block';
             loginForm.querySelector('button').disabled = false;
             loginForm.querySelector('button').textContent = 'Entrar';
        }
    });
});