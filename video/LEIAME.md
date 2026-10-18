# Vídeo de apresentação do Ofertou!

Motion graphics de 52 s (1920×1080, 30 fps, com música gerada no código, sem direitos autorais), feitos com o Microsoft Edge do próprio computador. Não é preciso instalar nada.

1. **Prints do site:** `node video/capturar.js http://localhost:3000 <token de sessão de um usuário consumidor>` gera `video/telas/*.png`.
2. **Assistir antes de gravar:** abra `video/apresentacao.html` no navegador.
3. **Gravar:** `node video/gravar.js` gera `video/Ofertou-apresentacao.mp4` (H.264 + AAC).
4. **Conferir instantes:** `node video/quadros.js 2.5,15,45` gera `video/quadros/*.png`.

**Para mudar o vídeo:**
- Textos, tempos e cenas ficam em `video/apresentacao.html`. Cada cena é uma função com o início e o fim em segundos.
- A música fica na função `musica()`.
