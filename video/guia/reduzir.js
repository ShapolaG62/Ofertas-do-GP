// Gera a versão leve do vídeo de apresentação para o Guia do usuário (1280×720, mesmo áudio), usando o Edge:
//   video/guia/original.mp4  →  public/videos/ofertou-apresentacao.mp4  (+ capa .jpg)
// Uso: node video/guia/reduzir.js   (grava em tempo real: ≈ 1 min)
const fs = require('fs');
const path = require('path');
const http = require('http');
const { abrirNavegador } = require('../cdp');
const DIR = __dirname;
const SAIDA = path.join(DIR, '..', '..', 'public', 'videos');

(async () => {
  const srv = http.createServer((req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><body style="margin:0;background:#000"></body>'); }
    const p = path.join(DIR, req.url.split('?')[0]);
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'video/mp4' }); fs.createReadStream(p).pipe(res);
  }).listen(0);
  fs.mkdirSync(SAIDA, { recursive: true });
  const b = await abrirNavegador({ largura: 1280, altura: 720, porta: 9345 });
  try {
    await b.ir(`http://127.0.0.1:${srv.address().port}/`, 300);
    console.log('Regravando em 720p (tempo real)…');
    const info = await b.js(`(async () => {
      const v = document.createElement('video'); v.src = URL.createObjectURL(await (await fetch('/original.mp4')).blob()); v.playsInline = true;
      await new Promise(ok => { v.onloadeddata = ok; });
      const W = 1280, H = 720;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.appendChild(cv); const g = cv.getContext('2d');
      // capa (aos 2 s)
      v.currentTime = 2; await new Promise(ok => { v.onseeked = ok; }); g.drawImage(v, 0, 0, W, H);
      window.__capa = cv.toDataURL('image/jpeg', .82);
      v.currentTime = 0; await new Promise(ok => { v.onseeked = ok; });
      const ac = new AudioContext({ sampleRate: 48000 }); await ac.resume();
      const destino = ac.createMediaStreamDestination();
      ac.createMediaElementSource(v).connect(destino);
      const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...destino.stream.getAudioTracks()]);
      const tipo = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, { mimeType: tipo, videoBitsPerSecond: 1_700_000, audioBitsPerSecond: 128_000 });
      const partes = []; rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
      let rodando = true;
      const quadro = () => { if (!rodando) return; g.drawImage(v, 0, 0, W, H); requestAnimationFrame(quadro); };
      requestAnimationFrame(quadro);
      await new Promise(ok => { rec.onstart = ok; rec.start(1000); });
      await v.play();
      await new Promise(ok => { v.onended = ok; });
      rodando = false;
      await new Promise(r => { rec.onstop = r; rec.stop(); });
      window.__video = new Blob(partes, { type: tipo });
      window.pedaco = async (ini, fim) => {
        const u8 = new Uint8Array(await window.__video.slice(ini, fim).arrayBuffer());
        let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return btoa(s);
      };
      return { tipo, tamanho: window.__video.size, duracao: v.duration };
    })()`);
    console.log(info);
    const partes = [];
    for (let i = 0; i < info.tamanho; i += 3_000_000) partes.push(Buffer.from(await b.js(`window.pedaco(${i}, ${i + 3_000_000})`), 'base64'));
    fs.writeFileSync(path.join(SAIDA, 'ofertou-apresentacao.mp4'), Buffer.concat(partes));
    fs.writeFileSync(path.join(SAIDA, 'ofertou-apresentacao.jpg'), Buffer.from((await b.js('window.__capa')).split(',')[1], 'base64'));
    console.log('Pronto:', `${(fs.statSync(path.join(SAIDA, 'ofertou-apresentacao.mp4')).size / 1048576).toFixed(1)} MB`);
  } finally { await b.fechar(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
