// Recorta a Capi dos vídeos (video/capi/fontes/capiN.mp4) e gera "folhas de quadros" WebP para o site:
//   public/images/capi-anim/capiN.webp  +  public/images/capi-anim/animacoes.json
// • Vídeos 1 e 2 (fundo branco): o fundo vira transparente (preenchimento a partir das bordas, então
//   o branco dos olhos e dos dentes continua) e a marca d'água "DeeVid AI" é apagada.
// • Vídeos 3 e 4 (cenário de caverna): ficam com o cenário, a partir do 1,5 s e sem a borda de cima (onde fica a marca d'água), para mostrar numa janelinha redonda.
// Uso: node video/capi/recortar.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const { abrirNavegador } = require('../cdp');
const DIR = __dirname;
const SAIDA = path.join(DIR, '..', '..', 'public', 'images', 'capi-anim');
const FPS = 15;
const LADO = 200; // tamanho de cada quadro na folha (px)
const COLS = 10;
// "trechos": montagem com partes do vídeo, em segundos: [de, até, velocidade (1 = normal), pausa no fim em quadros]
// (de > até toca de trás para frente)
const VIDEOS = [
  // A Capi ergue a picareta, dá 1 golpe na pedra (faísca) e comemora, do jeito natural do vídeo
  { n: 1, recorte: true, trechos: [[0, 3.033]] },
  { n: 2, recorte: true, ini: 0, fim: 5.0 },
  // Clipe separado (sai como capi3): a Capi sentada cavando o monte de terra, do fim do vídeo 1
  { n: 1, nome: 'capi3', recorte: true, trechos: [
    [3.117, 4.117, 0.8],            // ergue e golpeia o monte de terra
    [3.45, 4.117, 0.8],             // golpe 2 (volta a erguer a picareta)
    [3.45, 4.117, 0.8],             // golpe 3
    [4.183, 5.05, 0.8],             // golpe curto e descansa com a picareta no chão
  ] },
];

(async () => {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(DIR, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': p.endsWith('.mp4') ? 'video/mp4' : 'text/html; charset=utf-8' });
    fs.createReadStream(p).pipe(res);
  }).listen(0);
  fs.writeFileSync(path.join(DIR, 'olhar.html'), '<!doctype html><body style="margin:0"></body>');
  fs.mkdirSync(SAIDA, { recursive: true });
  const b = await abrirNavegador({ largura: 800, altura: 600, porta: 9339 });
  const meta = {};
  // Instantes de cada quadro
  for (const vd of VIDEOS) {
    const trechos = vd.trechos || [[vd.ini, vd.fim]];
    vd.tempos = [];
    for (const [de, ate, vel = 1, pausa = 0] of trechos) {
      const passos = Math.round(Math.abs(ate - de) * FPS / vel), dir = ate >= de ? 1 : -1;
      for (let i = 0; i <= passos; i++) vd.tempos.push(Math.round((de + dir * i * vel / FPS) * 1000) / 1000);
      for (let i = 0; i < pausa; i++) vd.tempos.push(vd.tempos[vd.tempos.length - 1]);
    }
    if (!vd.trechos) vd.tempos.pop(); // trecho único: sem repetir o último instante
  }
  try {
    await b.ir(`http://127.0.0.1:${srv.address().port}/olhar.html`, 200);
    for (const vd of VIDEOS) {
      const r = await b.js(`(async () => {
        const vd = ${JSON.stringify(vd)}, FPS = ${FPS}, LADO = ${LADO}, COLS = ${COLS};
        const v = document.createElement('video'); v.muted = true;
        v.src = URL.createObjectURL(await (await fetch('/fontes/capi' + vd.n + '.mp4')).blob());
        await new Promise(ok => { v.onloadeddata = ok; });
        const W = v.videoWidth, H = v.videoHeight;
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
        const tempos = vd.tempos.map(t => Math.min(t, v.duration - 0.05));
        const total = tempos.length;
        const prontos = new Map(); // instante → quadro já recortado (os golpes repetem quadros)
        const linhas = Math.ceil(total / COLS);
        const folha = document.createElement('canvas'); folha.width = COLS * LADO; folha.height = linhas * LADO;
        const fg = folha.getContext('2d'); fg.imageSmoothingQuality = 'high';
        const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const tg = tmp.getContext('2d');

        // Fundo: pixel claro e sem cor
        const claro = (d, i) => { const r = d[i], g2 = d[i+1], b = d[i+2]; const mn = Math.min(r, g2, b), mx = Math.max(r, g2, b); return mn > 200 && mx - mn < 28; };
        function tirarFundo(img) {
          const d = img.data, N = W * H;
          const fundo = new Uint8Array(N);
          const pilha = [];
          const tenta = p => { if (!fundo[p] && claro(d, p * 4)) { fundo[p] = 1; pilha.push(p); } };
          for (let x = 0; x < W; x++) { tenta(x); tenta((H - 1) * W + x); }
          for (let y = 0; y < H; y++) { tenta(y * W); tenta(y * W + W - 1); }
          while (pilha.length) {
            const p = pilha.pop(), x = p % W, y = (p / W) | 0;
            if (x > 0) tenta(p - 1); if (x < W - 1) tenta(p + 1); if (y > 0) tenta(p - W); if (y < H - 1) tenta(p + W);
          }
          // Marca d'água (canto superior direito): apaga o que for cinza claro, mantém a picareta (cinza escuro)
          for (let y = 18; y < 75; y++) for (let x = 420; x < W; x++) {
            const p = y * W + x, i = p * 4; const mn = Math.min(d[i], d[i+1], d[i+2]), mx = Math.max(d[i], d[i+1], d[i+2]);
            if (mn > 120 && mx - mn < 30) fundo[p] = 1;
          }
          // Ilhas de fundo presas no desenho (ex.: entre o cabo da picareta, o braço e o boné): manchas grandes da
          // mesma cor cinza-clara do fundo. Brilho dos olhos e dentes são pequenos ou mais brancos e ficam.
          const doFundo = i => { const r = d[i], g2 = d[i+1], b = d[i+2]; return r > 200 && r < 250 && g2 > 200 && g2 < 250 && b > 200 && b < 252 && Math.max(r, g2, b) - Math.min(r, g2, b) < 16; };
          const visto = new Uint8Array(N);
          for (let p0 = 0; p0 < N; p0++) {
            if (fundo[p0] || visto[p0] || !doFundo(p0 * 4)) continue;
            const grupo = [p0]; visto[p0] = 1;
            for (let j = 0; j < grupo.length; j++) {
              const p = grupo[j], x = p % W, y = (p / W) | 0;
              for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
                if (q >= 0 && !visto[q] && !fundo[q] && doFundo(q * 4)) { visto[q] = 1; grupo.push(q); }
              }
            }
            if (grupo.length > 250) for (const p of grupo) fundo[p] = 1;
          }
          for (let p = 0; p < N; p++) if (fundo[p]) d[p * 4 + 3] = 0;
          // Borda suave: pixel claro encostado no fundo fica semitransparente e escurece (sem halo branco no fundo escuro)
          for (let p = 0; p < N; p++) {
            if (fundo[p]) continue;
            const x = p % W, y = (p / W) | 0;
            const viz = (x > 0 && fundo[p-1]) || (x < W-1 && fundo[p+1]) || (y > 0 && fundo[p-W]) || (y < H-1 && fundo[p+W]);
            if (!viz) continue;
            const i = p * 4, mn = Math.min(d[i], d[i+1], d[i+2]);
            if (mn > 120) { const a = Math.max(0, Math.min(1, (255 - mn) / 135)); d[i+3] = Math.round(255 * a); d[i] *= .55; d[i+1] *= .45; d[i+2] *= .35; }
          }
          return img;
        }

        for (let k = 0; k < total; k++) {
          let img = prontos.get(tempos[k]);
          if (!img) {
            v.currentTime = tempos[k]; await new Promise(ok => { v.onseeked = ok; });
            g.drawImage(v, 0, 0);
            img = g.getImageData(0, 0, W, H);
            if (vd.recorte) tirarFundo(img);
            prontos.set(tempos[k], img);
          }
          tg.clearRect(0, 0, W, H); tg.putImageData(img, 0, 0);
          const corte = vd.recorte ? [0, 0, W, H] : [70, 70, W - 70, H - 70]; // cenário: corta a marca d'água do canto
          fg.drawImage(tmp, ...corte, (k % COLS) * LADO, Math.floor(k / COLS) * LADO, LADO, LADO);
        }
        const url = folha.toDataURL('image/webp', vd.recorte ? 0.86 : 0.8);
        return { url, total, linhas, W, H };
      })()`);
      fs.writeFileSync(path.join(SAIDA, `${vd.nome || `capi${vd.n}`}.webp`), Buffer.from(r.url.split(',')[1], 'base64'));
      meta[vd.nome || `capi${vd.n}`] = { arquivo: `${vd.nome || `capi${vd.n}`}.webp`, quadros: r.total, colunas: COLS, lado: LADO, fps: FPS, recorte: vd.recorte };
      console.log(`${vd.nome || `capi${vd.n}`}: ${r.total} quadros, ${(fs.statSync(path.join(SAIDA, `${vd.nome || `capi${vd.n}`}.webp`)).size / 1024).toFixed(0)} KB`);
    }
    fs.writeFileSync(path.join(SAIDA, 'animacoes.json'), JSON.stringify(meta, null, 2));
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
