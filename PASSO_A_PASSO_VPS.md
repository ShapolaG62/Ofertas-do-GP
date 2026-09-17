# 🚀 Guia de Hospedagem na VPS - Ofertas do GP

Este guia ensina como colocar o projeto **Ofertas do GP** para rodar em qualquer servidor VPS Linux (Ubuntu / Debian / Hostinger / Hetzner / DigitalOcean / AWS / Contabo / Vultr).

---

## 🛠️ Método 1: Instalação Automática via PM2 (Recomendado)

O script [`start-vps.sh`](file:///c:/Users/tiosh/Downloads/Ofertas%20do%20GP/start-vps.sh) instala automaticamente o Node.js v20, PM2, ajusta o firewall e coloca a aplicação para rodar em segundo plano de forma contínua (mesmo se o servidor reiniciar).

### Passo 1: Conectar na sua VPS via SSH
No seu terminal (Windows PowerShell ou Git Bash):
```bash
ssh root@SEU_IP_DA_VPS
```

### Passo 2: Enviar ou Clonar o Projeto na VPS
Caso vá enviar a pasta do projeto via `scp` ou FileZilla:
```bash
# Na sua máquina local:
scp -r "c:\Users\tiosh\Downloads\Ofertas do GP" root@SEU_IP_DA_VPS:/var/www/ofertas-do-gp
```
Ou se você subiu para o GitHub/GitLab:
```bash
cd /var/www
git clone https://github.com/seu-usuario/ofertas-do-gp.git
cd ofertas-do-gp
```

### Passo 3: Executar o Script de Start
Dentro da pasta do projeto na VPS, execute:
```bash
chmod +x start-vps.sh
./start-vps.sh
```

Pronto! A aplicação estará rodando em: `http://SEU_IP_DA_VPS:3000`

---

## 🐳 Método 2: Instalação via Docker & Docker Compose

Se preferir usar Docker na sua VPS:

```bash
# 1. Subir o container
docker-compose up -d --build

# 2. Ver status do container
docker-compose ps

# 3. Ver logs em tempo real
docker-compose logs -f
```

---

## 🔒 Passo Adicional: Configurar Domínio Próprio e SSL Grátis (HTTPS)

Para acessar `https://seusite.com.br` sem precisar digitar `:3000`:

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

Cole o conteúdo abaixo (substituindo `seusite.com.br` pelo seu domínio):
```nginx
server {
    listen 80;
    server_name seusite.com.br www.seusite.com.br;

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
sudo certbot --nginx -d seusite.com.br -d www.seusite.com.br
```

---

## 📋 Comandos Úteis do PM2

| Ação | Comando |
| --- | --- |
| **Status da Aplicação** | `pm2 status` |
| **Ver Logs ao Vivo** | `pm2 logs ofertas-do-gp` |
| **Reiniciar Aplicação** | `pm2 restart ofertas-do-gp` |
| **Parar Aplicação** | `pm2 stop ofertas-do-gp` |
| **Monitorar CPU/Memória** | `pm2 monit` |

---
