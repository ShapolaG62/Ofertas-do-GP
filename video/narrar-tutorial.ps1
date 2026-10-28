# Narração do vídeo tutorial "Como o Ofertou! funciona" (video/tutorial.html), com a voz feminina do Windows
# (Microsoft Maria, pt-BR), uma fala por cena.
# Uso: powershell -ExecutionPolicy Bypass -File video\narrar-tutorial.ps1   →   video\narracao-tutorial\fala01.wav …
# Depois: node video/medir-falas.js narracao-tutorial
$ErrorActionPreference = 'Stop'
$dir = Join-Path $PSScriptRoot 'narracao-tutorial'
New-Item -ItemType Directory -Force $dir | Out-Null

# Ritmo de tutorial: um pouco mais rápido que o padrão da voz, com pausas curtas entre as ideias
$r = '+18%'
$falas = @(
  # 1 Abertura
  @{ txt = 'Neste vídeo, você vai ver como o Ofertou funciona: <break time="200ms"/> como entrar no site, <break time="120ms"/> como encontrar as melhores ofertas, <break time="120ms"/> e o que cada plano libera para você.'; rate = $r; pitch = '+2%' },
  # 2 O que é
  @{ txt = 'O Ofertou garimpa as maiores lojas do Brasil: <break time="150ms"/> Mercado Livre, Amazon, Shopee, Magalu, KaBum e AliExpress. <break time="250ms"/> E só entra desconto de verdade.'; rate = $r; pitch = '+2%' },
  # 3 Acessar pelo Google
  @{ txt = 'Primeiro passo: entrar no site. <break time="250ms"/> Abra o Google e pesquise: <break time="150ms"/> Ofertou. <break time="250ms"/> O site aparece logo nos resultados. É só tocar.'; rate = $r; pitch = '+2%' },
  # 4 Acessar pelo endereço
  @{ txt = 'Se preferir, digite o endereço direto na barra do navegador: <break time="200ms"/> tá no ofertou, <break time="100ms"/> ponto com, <break time="100ms"/> ponto bê erre. <break time="250ms"/> Tudo junto, sem espaço.'; rate = '+12%'; pitch = '+2%' },
  # 5 App
  @{ txt = 'Dica: no celular, você pode instalar o Ofertou na tela inicial, <break time="120ms"/> e abrir como um aplicativo, com um toque.'; rate = $r; pitch = '+2%' },
  # 6 Conta
  @{ txt = 'Segundo passo: criar a sua conta. <break time="200ms"/> Pode ser com e-mail, <break time="100ms"/> com o Google, <break time="100ms"/> ou pelo cadastro rápido, <break time="100ms"/> só com nome, celular e senha.'; rate = $r; pitch = '+2%' },
  # 7 Ofertas
  @{ txt = 'Terceiro passo: encontrar as ofertas. <break time="200ms"/> Use a busca, <break time="100ms"/> filtre por loja, categoria, preço e desconto, <break time="150ms"/> e veja quando um produto está no menor preço dos últimos trinta dias. <break time="200ms"/> Os preços são conferidos várias vezes por dia.'; rate = $r; pitch = '+2%' },
  # 8 Planos (visão geral)
  @{ txt = 'Quarto passo: escolher o seu plano. <break time="200ms"/> São três, <break time="120ms"/> e cada um libera um tipo de acesso.'; rate = $r; pitch = '+2%' },
  # 9 Caçador de Ofertas
  @{ txt = 'O Caçador de Ofertas é grátis. <break time="200ms"/> Você vê todas as ofertas na hora, sem esperar aprovação, <break time="120ms"/> com busca, filtros, e histórico de preço para não cair em desconto falso.'; rate = $r; pitch = '+2%' },
  # 10 Loja Parceira
  @{ txt = 'A Loja Parceira é para quem tem loja. <break time="200ms"/> Por cinquenta e nove e noventa por mês, a sua loja ganha uma página própria no site, <break time="120ms"/> anúncios com fotos, cupom e frete, <break time="120ms"/> e o seu catálogo pode ser importado automaticamente.'; rate = $r; pitch = '+2%' },
  # 11 Afiliado Pro
  @{ txt = 'E o Afiliado Pro é o mais completo, <break time="120ms"/> para quem divulga ofertas e ganha comissão. <break time="200ms"/> Por oitenta e nove e noventa por mês, você tem um painel com os seus links de afiliado, <break time="120ms"/> milhares de ofertas para postar, <break time="120ms"/> e postagem automática nos seus grupos de WhatsApp e Telegram, no Facebook, no Instagram e no X, <break time="120ms"/> com horários agendados.'; rate = $r; pitch = '+2%' },
  # 12 Resumo
  @{ txt = 'Resumindo: <break time="150ms"/> quer economizar? Caçador de Ofertas. <break time="200ms"/> Tem uma loja? Loja Parceira. <break time="200ms"/> Divulga ofertas e quer ganhar comissão? Afiliado Pro.'; rate = $r; pitch = '+3%' },
  # 13 Ajuda
  @{ txt = 'Ficou alguma dúvida? <break time="200ms"/> No site tem o guia do usuário, passo a passo, <break time="120ms"/> e o suporte, com a Capi para te ajudar.'; rate = $r; pitch = '+2%' },
  # 14 Final
  @{ txt = 'Ofertou! <break time="250ms"/> Pesquise Ofertou no Google, <break time="120ms"/> ou acesse tá no ofertou ponto com ponto bê erre. <break time="250ms"/> Te vejo lá!'; rate = '+12%'; pitch = '+4%' }
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
