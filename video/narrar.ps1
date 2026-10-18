# Gera a narração do vídeo com a voz feminina do Windows (Microsoft Maria, pt-BR), uma fala por cena.
# Uso: powershell -ExecutionPolicy Bypass -File video\narrar.ps1   →   video\narracao\fala01.wav … fala09.wav
$ErrorActionPreference = 'Stop'
$dir = Join-Path $PSScriptRoot 'narracao'
New-Item -ItemType Directory -Force $dir | Out-Null

$falas = @(
  @{ txt = 'Ofertou! <break time="250ms"/> Ofertas reais, conferidas, num só lugar.'; rate = '+38%'; pitch = '+4%' },
  @{ txt = 'Cansou de desconto falso? <break time="200ms"/> Daquele preço que sobe antes da promoção? <break time="300ms"/> Aqui, só entra desconto de verdade.'; rate = '+48%'; pitch = '+3%' },
  @{ txt = 'A gente garimpa as maiores lojas do Brasil: <break time="200ms"/> são mais de cinquenta mil ofertas no ar agora.'; rate = '+48%'; pitch = '+3%' },
  @{ txt = 'Tudo num lugar só. <break time="200ms"/> Os preços são conferidos várias vezes por dia, e a oferta sai do ar quando acaba.'; rate = '+48%'; pitch = '+2%' },
  @{ txt = 'Filtre por loja, categoria, preço e desconto, <break time="200ms"/> e descubra o menor preço dos últimos trinta dias.'; rate = '+48%'; pitch = '+2%' },
  @{ txt = 'Procurando algo específico? <break time="200ms"/> É só buscar: o resultado aparece na hora.'; rate = '+48%'; pitch = '+3%' },
  @{ txt = 'No celular também: <break time="150ms"/> no site e no aplicativo, com as mesmas ofertas.'; rate = '+48%'; pitch = '+3%' },
  @{ txt = 'E tem muito mais: <break time="150ms"/> comunidade, lojas parceiras, pagamento com Pix e cartão, suporte humano, e seus dados protegidos.'; rate = '+48%'; pitch = '+2%' },
  @{ txt = 'Ofertou! <break time="250ms"/> Crie sua conta grátis.'; rate = '+30%'; pitch = '+5%' }
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Esperar($op, [Type]$tipo) { $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }

$sint = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$sint.Voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq 'Microsoft Maria' } | Select-Object -First 1
$i = 0
foreach ($f in $falas) {
  $i++
  $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'><voice name='Microsoft Maria'><prosody rate='$($f.rate)' pitch='$($f.pitch)'>$($f.txt)</prosody></voice></speak>"
  $stream = Esperar ($sint.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $leitor = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $n = [uint32]$stream.Size
  Esperar ($leitor.LoadAsync($n)) ([uint32]) | Out-Null
  $bytes = New-Object byte[] $n
  $leitor.ReadBytes($bytes)
  $arq = Join-Path $dir ('fala{0:D2}.wav' -f $i)
  [IO.File]::WriteAllBytes($arq, $bytes)
  "{0} {1:N0} KB" -f (Split-Path $arq -Leaf), ($n / 1KB)
}
