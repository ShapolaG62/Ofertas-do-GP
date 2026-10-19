// Recorte de fundo com IA (modelo IS-Net "isnet-general-use", licença Apache-2.0, o mesmo do rembg), rodando no
// próprio servidor com o onnxruntime-node (MIT). Nenhuma foto é enviada para fora.
// O motor é opcional: instale com `npm run ia` (fica fora do package.json para não pesar no deploy da Vercel).
// O modelo (~176 MB) é baixado uma vez para data/modelos e conferido pelo MD5 publicado pelo rembg.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const db = require('./db');

const MODELO_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx';
const MODELO_MD5 = 'fc16ebd8b0c10d971d3513d564d01e29';
const DIR = path.join(path.dirname(db.UPLOADS_DIR), 'modelos');
const ARQUIVO = path.join(DIR, 'isnet-general-use.onnx');
const LADO = 1024; // entrada do modelo: 1024 x 1024

let ort = null;
try { ort = require('onnxruntime-node'); } catch { /* motor não instalado: usa o recorte simples */ }

const md5 = f => new Promise((ok, erro) => {
  const h = crypto.createHash('md5');
  fs.createReadStream(f).on('data', d => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', erro);
});

// Baixa o modelo se ainda não existir (uma vez só) e confere a integridade.
let baixando = null;
async function garantirModelo() {
  if (fs.existsSync(ARQUIVO)) return ARQUIVO;
  baixando ||= (async () => {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${ARQUIVO}.part`;
    console.log('[IA] Baixando o modelo de recorte (~176 MB)…');
    const res = await fetch(MODELO_URL);
    if (!res.ok) throw new Error(`download do modelo: HTTP ${res.status}`);
    await fs.promises.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
    if (await md5(tmp) !== MODELO_MD5) { fs.rmSync(tmp, { force: true }); throw new Error('modelo baixado não confere (MD5)'); }
    fs.renameSync(tmp, ARQUIVO);
    console.log('[IA] Modelo pronto.');
    return ARQUIVO;
  })().finally(() => { baixando = null; });
  return baixando;
}

let sessao = null;
async function obterSessao() {
  if (!ort) return null;
  sessao ||= garantirModelo().then(f => ort.InferenceSession.create(f, { graphOptimizationLevel: 'all', intraOpNumThreads: 2 }))
    .catch(err => { console.error('[IA]', err.message); sessao = null; return null; });
  return sessao;
}

const disponivel = () => Boolean(ort);

// Máscara do produto (0–255, do tamanho da foto). Mesmo pré/pós-processamento do rembg para o IS-Net:
// RGB 1024x1024, pixel / maior valor, menos 0,5; saída normalizada entre o mínimo e o máximo.
async function mascara(rgb, w, h) {
  const s = await obterSessao();
  if (!s) return null;
  const { data } = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .resize(LADO, LADO, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  let max = 1e-6;
  for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
  const n = LADO * LADO;
  const entrada = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    entrada[i] = data[i * 3] / max - 0.5;
    entrada[n + i] = data[i * 3 + 1] / max - 0.5;
    entrada[2 * n + i] = data[i * 3 + 2] / max - 0.5;
  }
  const saida = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', entrada, [1, 3, LADO, LADO]) });
  const pred = saida[s.outputNames[0]].data; // [1, 1, 1024, 1024]
  let mi = Infinity, ma = -Infinity;
  for (let i = 0; i < n; i++) { if (pred[i] < mi) mi = pred[i]; if (pred[i] > ma) ma = pred[i]; }
  const faixa = ma - mi || 1;
  const m = Buffer.alloc(n);
  for (let i = 0; i < n; i++) m[i] = Math.round(((pred[i] - mi) / faixa) * 255);
  // Volta ao tamanho da foto mantendo 1 canal (o sharp devolveria 3 canais sem o extractChannel).
  const { data: final, info } = await sharp(m, { raw: { width: LADO, height: LADO, channels: 1 } })
    .resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || final.length !== w * h) throw new Error('máscara com formato inesperado');
  return final;
}

// Fotos de anúncio (textos, selos "garantia", tabelas) deixam muitos pedaços soltos depois do recorte.
// Conta as "ilhas" do recorte numa versão reduzida: produto de verdade = uma ou poucas peças grandes.
function temTextoSolto(rgba, w, h) {
  const esc = Math.min(1, 160 / Math.max(w, h));
  const W = Math.max(1, Math.round(w * esc)), H = Math.max(1, Math.round(h * esc));
  const cheio = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.floor(x / esc)), sy = Math.min(h - 1, Math.floor(y / esc));
      cheio[y * W + x] = rgba[(sy * w + sx) * 4 + 3] > 128 ? 1 : 0;
    }
  }
  const visto = new Uint8Array(W * H);
  const pilha = [];
  const areas = [];
  for (let i = 0; i < W * H; i++) {
    if (!cheio[i] || visto[i]) continue;
    let area = 0;
    visto[i] = 1; pilha.push(i);
    while (pilha.length) {
      const k = pilha.pop(); area++;
      const x = k % W;
      for (const v of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W]) {
        if (v >= 0 && v < W * H && cheio[v] && !visto[v]) { visto[v] = 1; pilha.push(v); }
      }
    }
    areas.push(area);
  }
  if (!areas.length) return true;
  const total = areas.reduce((a, b) => a + b, 0);
  const maior = Math.max(...areas);
  const pedacinhos = areas.filter(a => a >= 3 && a < total * 0.03).length; // letras, ícones, selos pequenos
  // Selo ou etiqueta solta: peça separada de tamanho médio, bem menor que o produto principal.
  // (Pares parecidos, como dois fones ou duas caixas de som, continuam valendo.)
  const seloSolto = areas.some(a => a !== maior && a >= total * 0.01 && a < maior * 0.25);
  return pedacinhos > 6 || seloSolto || maior / total < 0.45;
}

// Fotos de estúdio (fundo branco ou quase branco, o caso da maioria das lojas): recorte "à prova de cortes".
// A IA sozinha às vezes apaga partes do produto (ex.: a pulseira escura atrás de um relógio). Aqui, o que tem cor
// claramente diferente do fundo NUNCA é removido; a IA só decide os pixels parecidos com o fundo (vãos fechados,
// sombras, contorno suave). O fundo ligado às bordas sai sempre. Lança erro se a foto não for de estúdio.
const PERTO = 10;   // até 10 tons do fundo: é fundo (se ligado à borda) ou vão (se a IA disser que é fundo)
const LONGE = 60;   // mais de 60 tons de diferença em algum canal: é produto, fica sempre
async function recortarEstudio(foto) {
  const { data: rgb, info } = await sharp(foto, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' })
    .resize(900, 900, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  // Cor do fundo medida na borda: precisa ser quase toda clara e uniforme
  const borda = [];
  for (let x = 0; x < w; x++) borda.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) borda.push(y * w, y * w + w - 1);
  const claros = borda.filter(i => Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) > 228);
  if (claros.length / borda.length < 0.9) throw new Error('foto com fundo');
  const fundoCor = [0, 1, 2].map(c => claros.reduce((a, i) => a + rgb[i * 3 + c], 0) / claros.length);
  const dist = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    dist[i] = Math.min(255, Math.max(Math.abs(rgb[i * 3] - fundoCor[0]), Math.abs(rgb[i * 3 + 1] - fundoCor[1]), Math.abs(rgb[i * 3 + 2] - fundoCor[2])));
  }
  // Fundo ligado às bordas (preenchimento a partir das bordas)
  const fora = new Uint8Array(n);
  const fila = new Int32Array(n);
  let ini = 0, fim = 0;
  const marcar = i => { if (!fora[i] && dist[i] <= PERTO) { fora[i] = 1; fila[fim++] = i; } };
  for (const i of borda) marcar(i);
  while (ini < fim) {
    const i = fila[ini++], x = i % w;
    if (x > 0) marcar(i - 1);
    if (x < w - 1) marcar(i + 1);
    if (i >= w) marcar(i - w);
    if (i < n - w) marcar(i + w);
  }
  if (borda.filter(i => fora[i]).length / borda.length < 0.97) throw new Error('foto com cenário');
  const m = await mascara(rgb, w, h);
  if (!m) throw new Error('IA indisponível');
  // O que a IA pode remover além do fundo de fora:
  //  • sombra/contorno: pixels claros (até LONGE) ligados ao fundo de fora por pixels que a IA diz serem fundo;
  //    áreas claras DENTRO do produto (tela, carcaça branca) não se ligam ao fundo assim e ficam.
  //  • vão de verdade: região fechada com exatamente a cor do fundo (média até 3 tons) e que a IA diz ser fundo;
  //    partes brancas do produto quase nunca têm a cor idêntica à do fundo.
  const removivel = new Uint8Array(n);
  ini = 0; fim = 0;
  for (let i = 0; i < n; i++) if (fora[i]) fila[fim++] = i;
  while (ini < fim) {
    const i = fila[ini++], x = i % w;
    for (const v of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1]) {
      if (v >= 0 && !fora[v] && !removivel[v] && dist[v] > PERTO && dist[v] <= LONGE && m[v] < 128) { removivel[v] = 1; fila[fim++] = v; }
    }
  }
  const visto = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (fora[s] || visto[s] || dist[s] > PERTO) continue;
    const membros = [];
    let somaIA = 0, somaD = 0;
    visto[s] = 1; fila[0] = s; ini = 0; fim = 1;
    while (ini < fim) {
      const k = fila[ini++];
      membros.push(k); somaIA += m[k]; somaD += dist[k];
      const x = k % w;
      for (const v of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k >= w ? k - w : -1, k < n - w ? k + w : -1]) {
        if (v >= 0 && !visto[v] && !fora[v] && dist[v] <= PERTO) { visto[v] = 1; fila[fim++] = v; }
      }
    }
    if (somaIA / membros.length < 40 && somaD / membros.length <= 3) for (const k of membros) removivel[k] = 1;
  }
  const rgba = Buffer.alloc(n * 4);
  let produto = 0;
  for (let i = 0; i < n; i++) {
    const ia = Math.max(0, Math.min(255, Math.round((m[i] - 25) * 255 / 205)));
    const a = fora[i] ? 0 : removivel[i] ? ia : 255; // o resto é produto: fica sempre, inteiro
    // Contorno sem "auréola" branca: tira a cor do fundo misturada nos pixels semitransparentes
    for (let c = 0; c < 3; c++) {
      const v = rgb[i * 3 + c];
      rgba[i * 4 + c] = a > 0 && a < 255 ? Math.max(0, Math.min(255, Math.round((v - fundoCor[c] * (1 - a / 255)) / (a / 255)))) : v;
    }
    rgba[i * 4 + 3] = a;
  }
  // Peças soltas que a IA considera fundo (acessório no canto, etiqueta, película) saem; o que está ligado
  // ao produto fica, mesmo que a IA tenha apagado aquela parte.
  const peca = new Int32Array(n).fill(-1);
  const pilha = [];
  for (let s = 0; s < n; s++) {
    if (peca[s] !== -1 || rgba[s * 4 + 3] <= 128) continue;
    const membros = [];
    let comIA = 0;
    peca[s] = s; pilha.push(s);
    while (pilha.length) {
      const k = pilha.pop();
      membros.push(k);
      if (m[k] > 153) comIA++;
      const x = k % w;
      for (const v of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k >= w ? k - w : -1, k < n - w ? k + w : -1]) {
        if (v >= 0 && peca[v] === -1 && rgba[v * 4 + 3] > 128) { peca[v] = s; pilha.push(v); }
      }
    }
    if (comIA / membros.length < 0.3) for (const k of membros) rgba[k * 4 + 3] = 0;
    else produto += membros.length;
  }
  // Restos fracos em volta das peças removidas
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] <= 128 && m[i] < 40) rgba[i * 4 + 3] = 0;
  const area = produto / n;
  if (area < 0.05 || area > 0.95) throw new Error('recorte ruim');
  if (temTextoSolto(rgba, w, h)) throw new Error('foto com textos ou selos');
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 8 })
    .resize(560, 560, { fit: 'inside' }).webp({ quality: 86, alphaQuality: 92, effort: 5 }).toBuffer();
}

module.exports = { disponivel, recortarEstudio, garantirModelo, ARQUIVO };
