// Gera a capa do vídeo do guia a partir de um instante do vídeo leve: node video/guia/capa.js 5
const fs = require('fs'); const path = require('path'); const http = require('http');
const { abrirNavegador } = require('../cdp'); const PASTA = path.join(__dirname, '..', '..', 'public', 'videos');
const T = Number(process.argv[2] || 5);
(async () => {
  const srv = http.createServer((req, res) => { if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<body></body>'); }
    res.writeHead(200, { 'Content-Type': 'video/mp4' }); fs.createReadStream(path.join(PASTA, 'ofertou-apresentacao.mp4')).pipe(res); }).listen(0);
  const b = await abrirNavegador({ largura: 800, altura: 450, porta: 9347 });
  try {
    await b.ir(`http://127.0.0.1:${srv.address().port}/`, 200);
    const url = await b.js(`(async () => { const v = document.createElement('video'); v.muted = true;
      v.src = URL.createObjectURL(await (await fetch('/v.mp4')).blob()); await new Promise(ok => { v.onloadeddata = ok; });
      v.currentTime = ${T}; await new Promise(ok => { v.onseeked = ok; });
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
      return c.toDataURL('image/jpeg', .82); })()`);
    fs.writeFileSync(path.join(PASTA, 'ofertou-apresentacao.jpg'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('capa ok');
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
