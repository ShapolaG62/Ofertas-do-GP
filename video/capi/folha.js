// Folha de contato: 10 momentos de cada vídeo da Capi lado a lado (video/capi/quadros/folha.png)
const fs = require('fs');
const path = require('path');
const http = require('http');
const { abrirNavegador } = require('../cdp');
const DIR = __dirname;
const N = Number(process.argv[2] || 10);
(async () => {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(DIR, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': p.endsWith('.mp4') ? 'video/mp4' : 'text/html; charset=utf-8' });
    fs.createReadStream(p).pipe(res);
  }).listen(0);
  fs.writeFileSync(path.join(DIR, 'olhar.html'), '<!doctype html><body style="margin:0"></body>');
  const L = 160;
  const b = await abrirNavegador({ largura: L * N, altura: L * 4, porta: 9338 });
  try {
    await b.ir(`http://127.0.0.1:${srv.address().port}/olhar.html`, 200);
    await b.js(`(async () => {
      const c = document.createElement('canvas'); c.width = ${L * N}; c.height = ${L * 4}; document.body.appendChild(c);
      const g = c.getContext('2d'); g.fillStyle = '#7a7'; g.fillRect(0, 0, c.width, c.height);
      for (let n = 1; n <= 4; n++) {
        const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(await (await fetch('/fontes/capi' + n + '.mp4')).blob());
        await new Promise(ok => { v.onloadeddata = ok; });
        for (let i = 0; i < ${N}; i++) {
          v.currentTime = v.duration * i / ${N}; await new Promise(ok => { v.onseeked = ok; });
          g.drawImage(v, i * ${L}, (n - 1) * ${L}, ${L}, ${L});
          g.fillStyle = '#c00'; g.font = 'bold 13px sans-serif'; g.fillText('v' + n + ' ' + (v.currentTime).toFixed(1) + 's', i * ${L} + 4, (n - 1) * ${L} + 14);
        }
      }
    })()`);
    await b.print(path.join(DIR, 'quadros', 'folha.png'));
    console.log('ok');
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
