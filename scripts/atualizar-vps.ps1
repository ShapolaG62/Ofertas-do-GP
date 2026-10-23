# Ofertou! — atualiza o site na VPS Windows com a versão mais nova do GitHub, sem mexer nos dados.
# Uso: dois cliques em "atualizar-vps.bat" (na pasta do site) ou, no PowerShell:  .\scripts\atualizar-vps.ps1
# O que faz:
#   1. baixa o código do GitHub para uma pasta temporária (repositório privado: chave GITHUB_TOKEN no .env);
#   2. para o site, faz backup do banco (data\backups\antes-de-atualizar-<data>);
#   3. copia o código novo por cima, SEM tocar em data\, node_modules\, .env e senha.txt;
#   4. reinstala as bibliotecas só se package-lock.json mudou;
#   5. liga o site de novo (PM2, se você usa, ou a janela do start.bat).
param(
  [string]$Pasta = (Split-Path -Parent $PSScriptRoot),
  [int]$Porta = 3000,
  [string]$Repositorio = 'ShapolaG62/Ofertas-do-GP',
  [switch]$SemReiniciar
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Passo($t) { Write-Host "`n>> $t" -ForegroundColor Green }

Set-Location $Pasta
if (-not (Test-Path (Join-Path $Pasta 'server.js'))) { throw "Pasta do site não encontrada: $Pasta" }
# Porta do site: a do arquivo .env (PORT=...), quando existe
if (-not $PSBoundParameters.ContainsKey('Porta') -and (Test-Path '.env')) {
  $linha = Select-String -Path '.env' -Pattern '^\s*PORT\s*=\s*"?(\d+)' | Select-Object -First 1
  if ($linha) { $Porta = [int]$linha.Matches[0].Groups[1].Value }
}
Write-Host "Porta do site: $Porta"
Write-Host "Atualizando o Ofertou! em: $Pasta" -ForegroundColor Cyan

# 1. Baixar
Passo 'Baixando a versão nova do GitHub...'
$tmp = Join-Path $env:TEMP ("ofertou-atualizacao-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $tmp | Out-Null
$zip = Join-Path $tmp 'codigo.zip'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# Repositório privado: precisa da chave de leitura do GitHub na linha GITHUB_TOKEN=... do arquivo .env
$token = ''
if (Test-Path '.env') {
  $linhaToken = Select-String -Path '.env' -Pattern '^\s*GITHUB_TOKEN\s*=\s*"?([^"\s]+)' | Select-Object -First 1
  if ($linhaToken) { $token = $linhaToken.Matches[0].Groups[1].Value }
}
try {
  if ($token) {
    Invoke-WebRequest "https://api.github.com/repos/$Repositorio/zipball/main" -OutFile $zip -UseBasicParsing `
      -Headers @{ Authorization = "Bearer $token"; 'User-Agent' = 'ofertou-atualizador'; Accept = 'application/vnd.github+json' }
  } else {
    Invoke-WebRequest "https://github.com/$Repositorio/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
  }
} catch {
  $cod = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  if ($cod -eq 404 -or $cod -eq 401 -or $cod -eq 403) {
    Write-Host "`nO GitHub recusou o download (erro $cod). Nada foi alterado no site." -ForegroundColor Yellow
    if ($token) { Write-Host 'A chave GITHUB_TOKEN do arquivo .env está errada, vencida ou sem permissão de leitura (Contents: Read-only) neste repositório.' -ForegroundColor Yellow }
    else { Write-Host 'O repositório está privado. Crie uma chave de leitura no GitHub e coloque no .env a linha:  GITHUB_TOKEN=sua_chave' -ForegroundColor Yellow }
    exit 1
  }
  throw
}
Expand-Archive $zip -DestinationPath $tmp -Force
$novo = Get-ChildItem $tmp -Directory | Select-Object -First 1
if (-not $novo -or -not (Test-Path (Join-Path $novo.FullName 'server.js'))) { throw 'O arquivo baixado não tem o site. Nada foi alterado.' }
$lockAntes = if (Test-Path 'package-lock.json') { (Get-FileHash 'package-lock.json').Hash } else { '' }
$lockDepois = (Get-FileHash (Join-Path $novo.FullName 'package-lock.json')).Hash

# 2. Parar o site e fazer backup do banco
Passo 'Parando o site...'
$usaPm2 = $false
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
  $lista = (pm2 jlist 2>$null) -join ''
  if ($lista -match '"name":"ofertas-do-gp"') { $usaPm2 = $true; pm2 stop ofertas-do-gp | Out-Null }
}
if (-not $usaPm2) {
  Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 2

Passo 'Fazendo backup do banco de dados...'
$backup = Join-Path $Pasta ("data\backups\antes-de-atualizar-" + (Get-Date -Format 'yyyy-MM-dd_HH-mm'))
New-Item -ItemType Directory -Force $backup | Out-Null
Get-ChildItem (Join-Path $Pasta 'data') -Filter 'ofertas.db*' -File | Copy-Item -Destination $backup
Write-Host "   Backup em: $backup"

# 3. Copiar o código novo (sem tocar nos dados)
Passo 'Copiando os arquivos novos...'
robocopy $novo.FullName $Pasta /E /NFL /NDL /NJH /NJS /NP /XD data node_modules .git .claude /XF .env senha.txt | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Falha ao copiar os arquivos (robocopy $LASTEXITCODE). O backup do banco está em $backup." }

# 4. Bibliotecas
if ($lockAntes -ne $lockDepois -or -not (Test-Path 'node_modules')) {
  Passo 'Instalando as bibliotecas (mudaram nesta versão)...'
  npm ci --omit=dev
  if ($LASTEXITCODE -ne 0) { throw 'npm ci falhou. Rode "npm ci --omit=dev" na pasta do site e veja o erro.' }
} else { Passo 'Bibliotecas sem mudança.' }

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

# 5. Ligar de novo
if ($SemReiniciar) { Passo 'Pronto (sem reiniciar, como pedido).'; exit 0 }
Passo 'Ligando o site...'
if ($usaPm2) { pm2 restart ofertas-do-gp --update-env | Out-Null; pm2 save | Out-Null }
else { Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'start.bat' -WorkingDirectory $Pasta }
Start-Sleep -Seconds 6
try {
  $r = Invoke-WebRequest "http://localhost:$Porta/" -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0 -ErrorAction SilentlyContinue
  Write-Host "`nSite atualizado e no ar (http://localhost:$Porta)." -ForegroundColor Cyan
} catch {
  if ($_.Exception.Response) { Write-Host "`nSite atualizado e no ar (http://localhost:$Porta)." -ForegroundColor Cyan }
  else { Write-Host "`nO site ainda não respondeu. Confira a janela do site (ou: pm2 logs ofertas-do-gp)." -ForegroundColor Yellow }
}
