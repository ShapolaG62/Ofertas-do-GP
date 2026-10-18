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
