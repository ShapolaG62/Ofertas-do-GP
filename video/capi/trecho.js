// Folha de um trecho de um vídeo, quadro a quadro: node video/capi/trecho.js <n> <ini> <fim> [fps]
const fs = require('fs'); const path = require('path'); const http = require('http');
const { abrirNavegador } = require('../cdp'); const DIR = __dirname;
const [n, ini, fim, fps = 15] = process.argv.slice(2).map(Number);
(async () => {
  const srv = http.createServer((req, res) => { const p = path.join(DIR, req.url.split('?')[0]); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } fs.createReadStream(p).pipe(res); }).listen(0);
  fs.writeFileSync(path.join(DIR, 'olhar.html'), '<!doctype html><body style="margin:0"></body>');
  const total = Math.round((fim - ini) * fps) + 1, COLS = 8, L = 160, lin = Math.ceil(total / COLS);
  const b = await abrirNavegador({ largura: COLS * L, altura: lin * L, porta: 9342 });
  try {
    await b.ir(`http://127.0.0.1:${srv.address().port}/olhar.html`, 200);
    await b.js(`(async () => {
      const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(await (await fetch('/fontes/capi${n}.mp4')).blob());
      await new Promise(ok => { v.onloadeddata = ok; });
      const c = document.createElement('canvas'); c.width = ${COLS * L}; c.height = ${lin * L}; document.body.appendChild(c); const g = c.getContext('2d');
      for (let k = 0; k < ${total}; k++) { v.currentTime = ${ini} + k / ${fps}; await new Promise(ok => { v.onseeked = ok; });
        g.drawImage(v, (k % ${COLS}) * ${L}, Math.floor(k / ${COLS}) * ${L}, ${L}, ${L});
        g.fillStyle = '#c00'; g.font = 'bold 14px sans-serif'; g.fillText(v.currentTime.toFixed(3), (k % ${COLS}) * ${L} + 4, Math.floor(k / ${COLS}) * ${L} + 15); }
    })()`);
    await b.print(path.join(DIR, 'quadros', 'trecho.png')); console.log('ok', total);
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
