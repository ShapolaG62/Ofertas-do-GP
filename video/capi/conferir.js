// Mostra quadros das folhas recortadas sobre fundo escuro e claro (video/capi/quadros/conferir.png)
const fs = require('fs'); const path = require('path'); const http = require('http');
const { abrirNavegador } = require('../cdp');
const PUB = path.join(__dirname, '..', '..', 'public');
(async () => {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(PUB, decodeURIComponent(req.url.split('?')[0])));
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<body style="margin:0"></body>'); }
    if (!p.startsWith(PUB) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': p.endsWith('.webp') ? 'image/webp' : 'application/json' }); fs.createReadStream(p).pipe(res);
  }).listen(0);
  const b = await abrirNavegador({ largura: 1600, altura: 800, porta: 9340 });
  try {
    await b.ir(`http://127.0.0.1:${srv.address().port}/`, 200);
    await b.js(`(async () => {
      const meta = await (await fetch('/images/capi-anim/animacoes.json')).json();
      const c = document.createElement('canvas'); c.width = 1600; c.height = 800; document.body.appendChild(c); const g = c.getContext('2d');
      let lin = 0;
      for (const [nome, m] of Object.entries(meta)) {
        const im = new Image(); im.src = '/images/capi-anim/' + m.arquivo; await im.decode();
        for (let j = 0; j < 8; j++) {
          const k = Math.floor(j * (m.quadros - 1) / 7);
          g.fillStyle = j % 2 ? '#e9ece8' : '#0e1210'; g.fillRect(j * 200, lin * 200, 200, 200);
          g.drawImage(im, (k % m.colunas) * m.lado, Math.floor(k / m.colunas) * m.lado, m.lado, m.lado, j * 200, lin * 200, 200, 200);
        }
        lin++;
      }
    })()`);
    await b.print(path.join(__dirname, 'quadros', 'conferir.png'));
    console.log('ok');
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
