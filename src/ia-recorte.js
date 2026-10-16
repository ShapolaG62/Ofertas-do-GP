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

// Recorta o produto: devolve PNG/WebP com fundo transparente, ou lança erro se o recorte não for confiável.
async function recortarIA(foto) {
  const { data: rgb, info } = await sharp(foto, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' })
    .resize(900, 900, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const m = await mascara(rgb, w, h);
  if (!m) throw new Error('IA indisponível');
  // Limpa o "véu" fraco em volta e deixa a borda nítida, mas suave (sem serrilhado).
  const rgba = Buffer.alloc(w * h * 4);
  let produto = 0, incerto = 0;
  for (let i = 0; i < w * h; i++) {
    const a = Math.max(0, Math.min(255, Math.round((m[i] - 25) * 255 / 205)));
    rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = a;
    if (a > 128) produto++;
    if (a > 40 && a < 215) incerto++;
  }
  const area = produto / (w * h);
  // Recorte confiável: o produto ocupa uma parte razoável da foto e a borda da máscara é bem definida.
  if (area < 0.05 || area > 0.95) throw new Error('recorte ruim');
  if (incerto / Math.max(produto, 1) > 0.25) throw new Error('recorte incerto');
  if (temTextoSolto(rgba, w, h)) throw new Error('foto com textos ou selos');
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 8 })
    .resize(560, 560, { fit: 'inside' }).webp({ quality: 86, alphaQuality: 92, effort: 5 }).toBuffer();
}

module.exports = { disponivel, recortarIA, garantirModelo, ARQUIVO };
