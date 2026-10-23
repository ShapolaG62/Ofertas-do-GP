// Grava video/motion.html em MP4 nos dois formatos, com o Microsoft Edge sem janela (nada para instalar).
// Uso:
//   node video/gravar-motion.js                 → Ofertou-motion-16x9.mp4 e Ofertou-motion-9x16.mp4
//   node video/gravar-motion.js vertical        → só o 9:16   (ou "horizontal" → só o 16:9)
//   node video/gravar-motion.js quadros 2,9,14  → prints desses instantes nos dois formatos (video/quadros-motion)
const fs = require('fs');
const path = require('path');
const http = require('http');
const { abrirNavegador } = require('./cdp');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript' };
const FORMATOS = { horizontal: { largura: 1920, altura: 1080, nome: '16x9' }, vertical: { largura: 1080, altura: 1920, nome: '9x16' } };

(async () => {
  const modo = process.argv[2] || 'ambos';
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(RAIZ, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/video/motion.html`;
  try {
    if (modo === 'quadros') {
      const tempos = (process.argv[3] || '2,5.5,9.5,14,18.5,23,27,31').split(',').map(Number);
      const dir = path.join(__dirname, 'quadros-motion'); fs.mkdirSync(dir, { recursive: true });
      for (const [f, cfg] of Object.entries(FORMATOS)) {
        const b = await abrirNavegador({ largura: cfg.largura, altura: cfg.altura, porta: 9338 });
        try {
          for (const t of tempos) {
            await b.ir(`${base}?formato=${f}&t=${t}`, 300);
            await b.js(`new Promise(r => { const f = () => document.title === 'pronto' ? r(1) : setTimeout(f, 100); f(); })`);
            await b.print(path.join(dir, `${cfg.nome}-t${String(t).replace('.', '_')}.png`));
          }
        } finally { await b.fechar(); }
      }
      console.log('ok', dir);
      return;
    }
    for (const [f, cfg] of Object.entries(FORMATOS)) {
      if (modo !== 'ambos' && modo !== f) continue;
      const b = await abrirNavegador({ largura: cfg.largura, altura: cfg.altura, porta: 9339 });
      try {
        await b.ir(`${base}?formato=${f}&gravar`, 1500);
        console.log(`Gravando ${cfg.nome} em tempo real (≈35 s)…`);
        const info = await b.js('window.gravar()');
        console.log(info);
        const partes = [];
        for (let i = 0; i < info.tamanho; i += 3_000_000) partes.push(Buffer.from(await b.js(`window.pedaco(${i}, ${i + 3_000_000})`), 'base64'));
        const saida = path.join(__dirname, `Ofertou-motion-${cfg.nome}.${info.tipo.includes('mp4') ? 'mp4' : 'webm'}`);
        fs.writeFileSync(saida, Buffer.concat(partes));
        console.log('Pronto:', saida, `${(fs.statSync(saida).size / 1048576).toFixed(1)} MB`);
      } finally { await b.fechar(); }
    }
  } finally { srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
