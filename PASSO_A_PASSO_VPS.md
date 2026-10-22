# 🚀 Guia de Hospedagem na VPS - Ofertou!

Este guia ensina como colocar o projeto **Ofertou!** para rodar em qualquer servidor VPS Linux (Ubuntu / Debian / Hostinger / Hetzner / DigitalOcean / AWS / Contabo / Vultr).

---

## 🛠️ Método 1: Instalação Automática via PM2 (Recomendado)

O script `start-vps.sh` instala automaticamente o Node.js v22, PM2, ajusta o firewall e coloca a aplicação para rodar em segundo plano de forma contínua (mesmo se o servidor reiniciar).

### Passo 1: Conectar na sua VPS via SSH
No seu terminal (Windows PowerShell ou Git Bash):
```bash
ssh root@SEU_IP_DA_VPS
```

### Passo 2: Enviar ou Clonar o Projeto na VPS
Caso vá enviar a pasta do projeto via `scp` ou FileZilla:
```bash
# Na sua máquina local:
scp -r "c:\Users\tiosh\Downloads\Ofertou!" root@SEU_IP_DA_VPS:/var/www/ofertas-do-gp
```
Ou se você subiu para o GitHub/GitLab:
```bash
cd /var/www
git clone https://github.com/ShapolaG62/ofertas-do-gp.git
cd ofertas-do-gp
```

### Passo 3: Executar o Script de Start
Dentro da pasta do projeto na VPS, execute:
```bash
chmod +x start-vps.sh
./start-vps.sh
```

Na primeira vez o script pede a **senha do painel**.

Pronto! Site em `http://SEU_IP_DA_VPS:3000` e painel em `http://SEU_IP_DA_VPS:3000/admin`.

Para atualizar depois: `git pull` e rode `./start-vps.sh` de novo.

---

## 🐳 Método 2: Instalação via Docker & Docker Compose

Se preferir usar Docker na sua VPS:

```bash
# 1. Subir o container (defina a senha do painel na primeira vez)
ADMIN_PASSWORD="sua-senha-forte" docker compose up -d --build

# 2. Ver status do container
docker compose ps

# 3. Ver logs em tempo real
docker compose logs -f
```

---

## 🔒 Passo Adicional: Configurar Domínio Próprio e SSL Grátis (HTTPS)

Para acessar `https://tanoofertou.com.br` sem precisar digitar `:3000`:

### 1. Instalar Nginx e Certbot
```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Configurar o Nginx
Crie o arquivo de configuração do seu site:
```bash
sudo nano /etc/nginx/sites-available/ofertas
```

Cole o conteúdo abaixo (substituindo `tanoofertou.com.br` pelo seu domínio):
```nginx
server {
    listen 80;
    server_name tanoofertou.com.br www.tanoofertou.com.br;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Ative o site e reinicie o Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/ofertas /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 3. Gerar Certificado SSL Grátis (HTTPS)
```bash
sudo certbot --nginx -d tanoofertou.com.br -d www.tanoofertou.com.br
```

---

## 🔄 Atualizar o site depois de mudanças

```bash
cd ~/ofertas-do-gp && git pull && npm ci --omit=dev && npm run ia && pm2 restart all
```

`npm run ia` instala o motor de IA que recorta o fundo das fotos da vitrine (opcional). O modelo (~176 MB) é baixado sozinho na primeira vez para `data/modelos/`.

## 📋 Comandos Úteis do PM2

| Ação | Comando |
| --- | --- |
| **Status da Aplicação** | `pm2 status` |
| **Ver Logs ao Vivo** | `pm2 logs ofertas-do-gp` |
| **Reiniciar Aplicação** | `pm2 restart ofertas-do-gp` |
| **Parar Aplicação** | `pm2 stop ofertas-do-gp` |
| **Monitorar CPU/Memória** | `pm2 monit` |

---

## 💾 Backup

Todo o conteúdo (ofertas, configurações, senha) fica na pasta `data/`. Copie essa pasta para fazer backup. Ela **não** vai para o GitHub.

---

## 🔑 Não consigo entrar no painel (/admin)

Na pasta do site, na VPS:

```bash
node scripts/senha-admin.js --ver
```

Mostra qual banco o site está usando, se a senha do painel existe e quantas contas há. **"Contas de usuários: 0"** quer dizer que o site não está usando o banco que veio do computador: confira se `data/ofertas.db` está na pasta onde o PM2 roda o site (`pm2 describe ofertas-do-gp` → "exec cwd").

Para definir uma senha nova (ela não aparece enquanto você digita):

```bash
node scripts/senha-admin.js
pm2 restart ofertas-do-gp
```

Errou a senha 5 vezes? O IP fica bloqueado por 15 minutos; `pm2 restart ofertas-do-gp` libera na hora.
