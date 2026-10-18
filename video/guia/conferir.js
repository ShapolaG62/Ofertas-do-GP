// Confere o vídeo leve: duração, resolução, volume do áudio e 3 quadros (video/guia/conferir.png)
const fs = require('fs'); const path = require('path'); const http = require('http');
const { abrirNavegador } = require('../cdp'); const ARQ = path.join(__dirname, '..', '..', 'public', 'videos', 'ofertou-apresentacao.mp4');
(async () => {
  const srv = http.createServer((req, res) => { if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<body style="margin:0"></body>'); }
    res.writeHead(200, { 'Content-Type': 'video/mp4' }); fs.createReadStream(ARQ).pipe(res); }).listen(0);
  const b = await abrirNavegador({ largura: 1200, altura: 225, porta: 9346 });
  try {
    await b.ir(`http://127.0.0.1:${srv.address().port}/`, 200);
    console.log(await b.js(`(async () => {
      const buf = await (await fetch('/v.mp4')).arrayBuffer();
      const ac = new AudioContext(); const audio = await ac.decodeAudioData(buf.slice(0));
      const d = audio.getChannelData(0); let s = 0; for (let i = 0; i < d.length; i += 50) s += d[i] * d[i];
      const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([buf], { type: 'video/mp4' }));
      await new Promise(ok => { v.onloadeddata = ok; });
      const c = document.createElement('canvas'); c.width = 1200; c.height = 225; document.body.appendChild(c); const g = c.getContext('2d');
      for (const [i, t] of [[0, 5], [1, 26], [2, 48]]) { v.currentTime = t; await new Promise(ok => { v.onseeked = ok; }); g.drawImage(v, i * 400, 0, 400, 225); }
      return JSON.stringify({ duracao: +v.duration.toFixed(1), w: v.videoWidth, h: v.videoHeight, audio_s: +audio.duration.toFixed(1), volume_rms: +Math.sqrt(s / (d.length / 50)).toFixed(4) });
    })()`));
    await b.print(path.join(__dirname, 'conferir.png'));
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
