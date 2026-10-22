@echo off
rem Ofertou! - atualiza o site na VPS Windows com a versao nova do GitHub (sem mexer nos dados).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\atualizar-vps.ps1" %*
echo.
pause
