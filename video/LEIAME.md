# Vídeo de apresentação do Ofertou!

Motion graphics de 52 s (1920×1080, 30 fps, com música gerada no código, sem direitos autorais), feitos com o Microsoft Edge do próprio computador. Não é preciso instalar nada.

1. **Prints do site:** `node video/capturar.js http://localhost:3000 <token de sessão de um usuário consumidor>` gera `video/telas/*.png`.
2. **Assistir antes de gravar:** abra `video/apresentacao.html` no navegador.
3. **Gravar:** `node video/gravar.js` gera `video/Ofertou-apresentacao.mp4` (H.264 + AAC).
4. **Conferir instantes:** `node video/quadros.js 2.5,15,45` gera `video/quadros/*.png`.

**Para mudar o vídeo:**
- Textos, tempos e cenas ficam em `video/apresentacao.html`. Cada cena é uma função com o início e o fim em segundos.
- A música fica na função `musica()`.

## Narração (voz feminina)
1. **Gerar as falas:** `powershell -ExecutionPolicy Bypass -File video\narrar.ps1` gera `video/narracao/fala01.wav … fala09.wav`, com a voz Microsoft Maria (pt-BR) do Windows. O texto, a velocidade e o tom de cada fala ficam no topo do arquivo.
2. **Medir:** `node video/medir-falas.js` grava `video/narracao/tempos.json`.
3. **Gravar:** `node video/gravar.js`.

Com a narração presente:
- cada cena se estica para caber a fala dela (o vídeo passa de 52 s para ≈62 s);
- a música fica mais baixa por baixo da voz.

Sem a pasta `narracao`, o vídeo sai sem voz, com 52 s.

## Motion graphics 9:16 e 16:9 (33 s, sem narração)
1. **Prints:** `node video/capturar-motion.js <endereço> <token de sessão de consumidor>` gera `video/telas-motion/*.png` (tema claro e escuro, computador e celular). Use um banco de **teste**, com chaves apagadas, nunca o do site no ar.
2. **Assistir:** abra `video/motion.html` (16:9) ou `video/motion.html?formato=vertical` (9:16).
3. **Conferir instantes:** `node video/gravar-motion.js quadros 2,9.5,14` gera `video/quadros-motion/*.png`.
4. **Gravar:** `node video/gravar-motion.js` gera `video/Ofertou-motion-16x9.mp4` e `video/Ofertou-motion-9x16.mp4` (ou só um: `vertical` / `horizontal`).

## Tutorial narrado "Como o Ofertou! funciona" (16:9, ≈2min55s)
No estilo dos tutoriais do canal Buboflow: fundo escuro, título grande à esquerda, tela do site numa janela de navegador à direita, barra de etapas e encerramento com a Capi. Fala de como acessar (Google ou tanoofertou.com.br), criar conta, achar ofertas e dos três planos.
1. **Narração:** `powershell -ExecutionPolicy Bypass -File video
arrar-tutorial.ps1` (voz Microsoft Maria; o texto de cada fala fica no topo do arquivo) e `node video/medir-falas.js narracao-tutorial`.
2. **Prints:** `node video/capturar-tutorial.js <endereço> <token de consumidor> <token de cliente da ferramenta>` gera `video/telas-tutorial/*.png`. Use um banco de **teste**; o rodapé legal é retirado dos prints.
3. **Conferir:** `node video/gravar-tutorial.js cenas` (um print por cena em `video/quadros-tutorial`) ou abra `video/tutorial.html` e clique para assistir com som.
4. **Gravar:** `node video/gravar-tutorial.js` gera `video/Ofertou-tutorial.mp4` (em tempo real).

Cada cena dura a fala dela; mudou o texto, gere a narração e meça de novo. Preços dos planos estão nas falas e nas cenas 9 a 12 de `video/tutorial.html`.
