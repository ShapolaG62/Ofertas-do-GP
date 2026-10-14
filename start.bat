@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
echo Abrindo o site em http://localhost:3000  (painel: http://localhost:3000/admin)
call npm start
pause
