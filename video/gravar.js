// Grava video/apresentacao.html em MP4 usando o Microsoft Edge sem janela (nada para instalar).
// Uso: node video/gravar.js   →   video/Ofertou-apresentacao.mp4
const fs = require('fs');
const path = require('path');
const http = require('http');
const { abrirNavegador } = require('./cdp');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript' };

(async () => {
  // Servidor local só para a página do vídeo e as imagens
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(RAIZ, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  }).listen(0);
  const porta = srv.address().port;
  const b = await abrirNavegador({ largura: 1920, altura: 1080, porta: 9335 });
  try {
    await b.ir(`http://127.0.0.1:${porta}/video/apresentacao.html?gravar`, 1500);
    console.log('Gravando (≈52 s em tempo real)…');
    const info = await b.js('window.gravar()');
    console.log(info);
    // Copia o vídeo do navegador em pedaços
    const partes = [];
    for (let i = 0; i < info.tamanho; i += 3_000_000) partes.push(Buffer.from(await b.js(`window.pedaco(${i}, ${i + 3_000_000})`), 'base64'));
    const ext = info.tipo.includes('mp4') ? 'mp4' : 'webm';
    const saida = path.join(__dirname, `Ofertou-apresentacao.${ext}`);
    fs.writeFileSync(saida, Buffer.concat(partes));
    console.log('Pronto:', saida, `${(fs.statSync(saida).size / 1048576).toFixed(1)} MB`);
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
