// Amplia quadros escolhidos das folhas sobre fundo escuro: node video/capi/zoom.js capi3:10,capi3:28,capi1:72
const fs = require('fs'); const path = require('path'); const http = require('http');
const { abrirNavegador } = require('../cdp'); const PUB = path.join(__dirname, '..', '..', 'public');
const pedidos = (process.argv[2] || '').split(',').map(x => x.split(':'));
(async () => {
  const srv = http.createServer((req, res) => { if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<body style="margin:0"></body>'); }
    const p = path.join(PUB, decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': p.endsWith('.webp') ? 'image/webp' : 'application/json' }); fs.createReadStream(p).pipe(res); }).listen(0);
  const L = 400; const b = await abrirNavegador({ largura: L * pedidos.length, altura: L, porta: 9343 });
  try {
    await b.ir(`http://127.0.0.1:${srv.address().port}/`, 200);
    await b.js(`(async () => { const meta = await (await fetch('/images/capi-anim/animacoes.json')).json(); const ped = ${JSON.stringify(pedidos)};
      const c = document.createElement('canvas'); c.width = ${L} * ped.length; c.height = ${L}; document.body.appendChild(c); const g = c.getContext('2d');
      g.fillStyle = '#16301f'; g.fillRect(0, 0, c.width, c.height);
      for (let j = 0; j < ped.length; j++) { const [nome, k] = [ped[j][0], Number(ped[j][1])]; const m = meta[nome]; const im = new Image(); im.src = '/images/capi-anim/' + m.arquivo; await im.decode();
        g.drawImage(im, (k % m.colunas) * m.lado, Math.floor(k / m.colunas) * m.lado, m.lado, m.lado, j * ${L}, 0, ${L}, ${L}); } })()`);
    await b.print(path.join(__dirname, 'quadros', 'zoom.png')); console.log('ok');
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
