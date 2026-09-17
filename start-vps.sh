#!/bin/bash
# =========================================================
# Script de Inicialização Automática - Ofertas do GP na VPS
# =========================================================

set -e

echo "🚀 Iniciando configuração do servidor para Ofertas do GP..."

# 1. Atualizar repositórios do sistema
echo "🔄 Atualizando pacotes do sistema Linux..."
sudo apt update -y

# 2. Instalar utilitários essenciais
echo "📦 Instalando ferramentas essenciais (curl, git, build-essential)..."
sudo apt install -y curl git build-essential sqlite3

# 3. Verificar e Instalar Node.js (v20 LTS)
if ! command -v node &> /dev/null; then
    echo "📦 Instalando Node.js (v20 LTS)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "✅ Node.js já está instalado: $(node -v)"
fi

echo "✅ Versão do NPM: $(npm -v)"

# 4. Instalar PM2 globalmente
if ! command -v pm2 &> /dev/null; then
    echo "⚙️ Instalando PM2 (Gerenciador de Processos)..."
    sudo npm install -g pm2
else
    echo "✅ PM2 já está instalado: $(pm2 -v)"
fi

# 5. Instalar dependências do projeto
echo "📦 Instalando dependências do projeto Node.js..."
npm install --production

# 6. Liberar portas no Firewall UFW (se ativo)
if command -v ufw &> /dev/null; then
    echo "🛡️ Liberando portas no Firewall UFW..."
    sudo ufw allow 22/tcp 2>/dev/null || true
    sudo ufw allow 80/tcp 2>/dev/null || true
    sudo ufw allow 443/tcp 2>/dev/null || true
    sudo ufw allow 3000/tcp 2>/dev/null || true
    echo "y" | sudo ufw enable 2>/dev/null || true
fi

# 7. Iniciar ou reiniciar a aplicação com PM2
echo "🔄 Iniciando/Atualizando a aplicação Ofertas do GP no PM2..."
if [ -f "ecosystem.config.js" ]; then
    pm2 startOrReload ecosystem.config.js
else
    pm2 start server.js --name "ofertas-do-gp"
fi

# 8. Configurar PM2 para iniciar no boot da VPS
echo "📌 Configurando boot automático no sistema (Reboot)..."
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || pm2 startup 2>/dev/null || true

# Obter IP público
PUBLIC_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "IP_DA_SUA_VPS")

echo ""
echo "========================================================="
echo "🎉 OFERTAS DO GP ESTÁ RODANDO NA SUA VPS!"
echo "========================================================="
echo "🌐 Acesse no seu navegador: http://${PUBLIC_IP}:3000"
echo ""
echo "Comandos úteis para gerenciar seu servidor:"
echo "  • Status do app:   pm2 status"
echo "  • Ver logs:        pm2 logs ofertas-do-gp"
echo "  • Reiniciar app:   pm2 restart ofertas-do-gp"
echo "  • Parar app:       pm2 stop ofertas-do-gp"
echo "========================================================="
