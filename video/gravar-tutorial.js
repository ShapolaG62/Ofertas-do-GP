// Grava video/tutorial.html em MP4 (1920×1080, com narração e música) usando o Microsoft Edge sem janela.
// Uso:
//   node video/gravar-tutorial.js                 → video/Ofertou-tutorial.mp4 (em tempo real, ≈3 min)
//   node video/gravar-tutorial.js quadros 2,30,95 → prints desses instantes em video/quadros-tutorial
//   node video/gravar-tutorial.js cenas           → um print no meio de cada cena
const fs = require('fs');
const path = require('path');
const http = require('http');
const { abrirNavegador } = require('./cdp');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.wav': 'audio/wav', '.json': 'application/json' };

(async () => {
  const modo = process.argv[2] || 'gravar';
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(RAIZ, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/video/tutorial.html`;
  const b = await abrirNavegador({ largura: 1920, altura: 1080, porta: 9343 });
  try {
    if (modo === 'quadros' || modo === 'cenas') {
      let tempos;
      if (modo === 'cenas') {
        await b.ir(`${base}?t=0`, 800);
        const { INICIOS, DUR } = await b.js('window.inicios()');
        tempos = INICIOS.map((ini, i) => +(((INICIOS[i + 1] ?? DUR) + ini) / 2).toFixed(1));
        console.log('cenas:', INICIOS.join(', '), '| duração', DUR);
      } else tempos = (process.argv[3] || '2').split(',').map(Number);
      const dir = path.join(__dirname, 'quadros-tutorial'); fs.mkdirSync(dir, { recursive: true });
      for (const t of tempos) {
        await b.ir(`${base}?t=${t}`, 300);
        await b.js(`new Promise(r => { const f = () => document.title === 'pronto' ? r(1) : setTimeout(f, 100); f(); })`);
        await b.print(path.join(dir, `t${String(t).replace('.', '_')}.png`));
      }
      console.log('ok', dir, tempos.join(', '));
      return;
    }
    await b.ir(`${base}?gravar`, 1500);
    console.log('Gravando em tempo real…');
    const info = await b.js('window.gravar()');
    console.log(info);
    const partes = [];
    for (let i = 0; i < info.tamanho; i += 3_000_000) partes.push(Buffer.from(await b.js(`window.pedaco(${i}, ${i + 3_000_000})`), 'base64'));
    const saida = path.join(__dirname, `Ofertou-tutorial.${info.tipo.includes('mp4') ? 'mp4' : 'webm'}`);
    fs.writeFileSync(saida, Buffer.concat(partes));
    console.log('Pronto:', saida, `${(fs.statSync(saida).size / 1048576).toFixed(1)} MB`);
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
