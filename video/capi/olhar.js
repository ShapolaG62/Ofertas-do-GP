// Tira alguns quadros dos vídeos da Capi (video/capi/fontes/*.mp4) para conferir: node video/capi/olhar.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const { abrirNavegador } = require('../cdp');
const DIR = __dirname;
(async () => {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(DIR, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': p.endsWith('.mp4') ? 'video/mp4' : 'text/html; charset=utf-8' });
    fs.createReadStream(p).pipe(res);
  }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  fs.writeFileSync(path.join(DIR, 'olhar.html'), '<!doctype html><body></body>');
  const out = path.join(DIR, 'quadros'); fs.mkdirSync(out, { recursive: true });
  const b = await abrirNavegador({ largura: 800, altura: 600, porta: 9337 });
  try {
    await b.ir(`${base}/olhar.html`, 200);
    for (const n of [1, 2, 3, 4]) {
      const r = await b.js(`(async () => {
        const v = document.createElement('video'); v.muted = true; v.src = '/fontes/capi${n}.mp4'; v.preload = 'auto';
        await new Promise((ok, e) => { v.onloadeddata = ok; v.onerror = () => e(new Error('vídeo')); });
        const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const g = c.getContext('2d');
        const quadros = [];
        for (const f of [0, .25, .5, .75, .98]) {
          v.currentTime = v.duration * f; await new Promise(ok => { v.onseeked = ok; });
          g.drawImage(v, 0, 0); quadros.push(c.toDataURL('image/png'));
        }
        const px = g.getImageData(0, 0, c.width, c.height).data;
        const amostra = [[0,0],[c.width-1,0],[0,c.height-1],[c.width-1,c.height-1],[c.width>>1,2]].map(([x,y]) => Array.from(px.slice((y*c.width+x)*4, (y*c.width+x)*4+4)));
        return { w: v.videoWidth, h: v.videoHeight, dur: v.duration, quadros, amostra };
      })()`);
      r.quadros.forEach((d, i) => fs.writeFileSync(path.join(out, `capi${n}_${i}.png`), Buffer.from(d.split(',')[1], 'base64')));
      console.log(`capi${n}`, r.w, 'x', r.h, r.dur.toFixed(2), 's', JSON.stringify(r.amostra));
    }
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
