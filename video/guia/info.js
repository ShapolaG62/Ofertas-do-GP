// Mostra duração/resolução do vídeo do guia e tira 6 quadros (video/guia/quadros.png)
const fs = require('fs'); const path = require('path'); const http = require('http');
const { abrirNavegador } = require('../cdp'); const DIR = __dirname;
(async () => {
  const srv = http.createServer((req, res) => { if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<body style="margin:0"></body>'); }
    const p = path.join(DIR, req.url.split('?')[0]); if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'video/mp4' }); fs.createReadStream(p).pipe(res); }).listen(0);
  const b = await abrirNavegador({ largura: 1440, altura: 540, porta: 9344 });
  try {
    await b.ir(`http://127.0.0.1:${srv.address().port}/`, 200);
    console.log(await b.js(`(async () => {
      const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(await (await fetch('/original.mp4')).blob());
      await new Promise(ok => { v.onloadeddata = ok; });
      const c = document.createElement('canvas'); c.width = 1440; c.height = 540; document.body.appendChild(c); const g = c.getContext('2d');
      const L = 480, A = Math.round(L * v.videoHeight / v.videoWidth);
      for (let i = 0; i < 6; i++) { v.currentTime = v.duration * (i + .5) / 6; await new Promise(ok => { v.onseeked = ok; }); g.drawImage(v, (i % 3) * L, Math.floor(i / 3) * A, L, A); }
      return JSON.stringify({ duracao: v.duration, w: v.videoWidth, h: v.videoHeight });
    })()`));
    await b.print(path.join(DIR, 'quadros.png'));
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
