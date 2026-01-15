# 🎱 Bingo do Pix - Sistema Híbrido (Online + Presencial)

> O sistema de Bingo mais completo do mercado, desenvolvido em Node.js. Opere online com pagamentos automáticos via Pix e presencialmente em bares e eventos com modo TV e Cambistas.

![Status](https://img.shields.io/badge/Status-Pronto_para_Produção-green)
![Node](https://img.shields.io/badge/Node.js-v18+-blue)
![MongoDB](https://img.shields.io/badge/Database-MongoDB-green)
![Payment](https://img.shields.io/badge/Pagamento-Mercado_Pago_Pix-blue)

## 🚀 Sobre o Projeto

Este é um sistema robusto de gerenciamento de Bingo em tempo real. Ele foi projetado para alta performance usando **Socket.io**, permitindo milhares de conexões simultâneas sem atrasos.

O grande diferencial é o **Modelo Híbrido**:
1.  **Online:** O jogador compra pelo site, paga via Pix (QR Code/Copia e Cola) e recebe as cartelas automaticamente.
2.  **Presencial (PDV):** Ideal para bares e eventos. Use uma TV para transmitir o sorteio e cadastre cambistas para vender cartelas impressas na hora.

## 🔥 Funcionalidades Principais

### 🌐 Para o Jogador (Online)
* **Compra Automática:** Integração nativa com Mercado Pago. Pagou, liberou.
* **Cartela Digital:** Marcação automática dos números (o jogador não precisa fazer nada).
* **Narração de Voz:** O sistema "canta" os números sorteados (Sintetizador de voz).
* **Comprovante:** Geração automática de comprovante de vitória em PDF.
* **Responsivo:** Funciona perfeitamente em celulares e computadores.

### 🏢 Para o Estabelecimento (Físico / TV)
* **Modo TV:** Interface limpa e otimizada para projetores e Smart TVs.
* **Cambistas:** Painel exclusivo para vendedores manuais.
* **Impressão:** Geração de cartelas em formato pronto para impressoras térmicas ou A4.
* **Créditos:** Sistema de pré-pago para controle financeiro dos cambistas.

### ⚙️ Painel Administrativo
* **Dashboard Financeiro:** Acompanhe o lucro do dia e vendas em tempo real.
* **Controle Total:** Altere o valor da cartela e dos prêmios (Linha e Cheia) a qualquer momento.
* **Bots Inteligentes:** Sistema de jogadores virtuais com nomes brasileiros para engajamento social.
* **Sorteios Especiais:** Agendamento de sorteios com data/hora marcada.
* **Segurança:** Login criptografado e validação de webhook.

---

## 🛠️ Instalação e Configuração

### Pré-requisitos
* [Node.js](https://nodejs.org/) (Versão 16 ou superior)
* [MongoDB](https://www.mongodb.com/) (Local ou Atlas/Cloud)
* Conta no **Mercado Pago** (Para obter as credenciais de API)

### Passo a Passo

1.  **Clone o repositório ou extraia os arquivos:**
    ```bash
    git clone [https://seu-repositorio.com/bingo-pix.git](https://seu-repositorio.com/bingo-pix.git)
    cd bingo-pix
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    Crie um arquivo `.env` na raiz do projeto e configure conforme abaixo:

    ```env
    # Configuração do Servidor
    PORT=3000
    BASE_URL=[https://seu-dominio.com](https://seu-dominio.com)  # URL onde o site estará hospedado (necessário para o Webhook)
    SESSION_SECRET=sua_chave_secreta_super_segura

    # Banco de Dados (MongoDB)
    MONGO_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/bingo_db

    # Mercado Pago (Credenciais de Produção)
    MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxx-xxxx-xxxx-xxxx
    MERCADOPAGO_WEBHOOK_SECRET=sua_chave_webhook_secret
    ```

4.  **Inicie o Servidor:**
    ```bash
    npm start
    ```

---

## 🖥️ Acesso ao Sistema

Após iniciar o servidor:

* **Página Inicial (Jogadores):** `http://localhost:3000`
* **Painel Admin:** `http://localhost:3000/admin/login.html`
    * *Usuário Padrão:* `admin`
    * *Senha Padrão:* `admin123` *(Altere imediatamente após o primeiro login)*
* **Painel Cambista:** `http://localhost:3000/cambista/login.html`
* **Dashboard TV:** `http://localhost:3000/dashboard-real` (Para exibir em TVs)

---

## 📂 Estrutura do Projeto

* `server.js`: Núcleo do sistema (Backend, Socket.io, Rotas, Webhook MP).
* `public/`: Arquivos do Frontend (HTML, CSS, JS).
    * `admin/`: Painéis de controle do administrador.
    * `cambista/`: Área restrita para vendedores físicos.
    * `imagens/`: Assets gráficos.
* `models/`: (Interno no server.js) Schemas do MongoDB (Vendas, Usuários, Configs).

---

## 💡 Dicas de Operação (Estratégia Híbrida)

1.  **Instalação em Bares:** Conecte um computador/notebook à TV do estabelecimento e acesse a rota `/dashboard-real`. O som do sorteio sairá nas caixas de som do local.
2.  **Venda Manual:** Cadastre o dono do bar como "Cambista". Venda créditos para ele (ex: R$ 500,00). Ele imprime as cartelas na hora e vende aos clientes, ficando com o lucro imediato da revenda.
3.  **Bots:** Use a configuração `min_bots` e `max_bots` no painel Admin para garantir que a sala sempre pareça movimentada, aumentando a confiança dos novos jogadores.

---

## ⚠️ Aviso Legal

Este software é fornecido "como está". O comprador/operador é inteiramente responsável por garantir que o uso deste sistema esteja em conformidade com as leis e regulamentações locais sobre jogos, sorteios e bingos. O desenvolvedor não se responsabiliza pelo uso indevido da plataforma.

---

**Suporte:**
Para dúvidas sobre instalação ou customizações, entre em contato.
