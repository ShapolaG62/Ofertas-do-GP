// Prévia: tira um print de alguns instantes do vídeo (video/quadros/*.png) para conferir o visual sem gravar.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { abrirNavegador } = require('./cdp');
const RAIZ = path.join(__dirname, '..');
const TEMPOS = (process.argv[2] || '2.5,8.5,15,21.5,27,32,39,45,49.5').split(',').map(Number);
(async () => {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(RAIZ, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'image/png' });
    fs.createReadStream(p).pipe(res);
  }).listen(0);
  const dir = path.join(__dirname, 'quadros'); fs.mkdirSync(dir, { recursive: true });
  const b = await abrirNavegador({ largura: 1920, altura: 1080, porta: 9336 });
  try {
    for (const t of TEMPOS) {
      await b.ir(`http://127.0.0.1:${srv.address().port}/video/apresentacao.html?t=${t}`, 300);
      await b.js(`new Promise(r => { const f = () => document.title === 'pronto' ? r(1) : setTimeout(f, 100); f(); })`);
      await b.print(path.join(dir, `t${String(t).replace('.', '_')}.png`));
    }
    console.log('ok', fs.readdirSync(dir).join(' '));
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
