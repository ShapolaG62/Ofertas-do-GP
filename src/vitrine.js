// Vitrine da página inicial: notebook, TV, PS5 e iPhone das melhores ofertas do momento, com a foto da loja
// recortada (fundo branco removido). Fotos com cenário ou fundo colorido são descartadas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const db = require('./db');
const offers = require('./offers');
const { baixarFoto } = require('./watermark');

const CACHE_DIR = path.join(path.dirname(db.UPLOADS_DIR), 'recorte');
fs.mkdirSync(CACHE_DIR, { recursive: true });

// Tipos mostrados na vitrine (ordem = camadas da montagem: o primeiro fica atrás).
const TIPOS = [
  { id: 'tv', nome: 'Smart TV', where: `o.categoria = 'audio_tv' AND o.subcategoria = 'TVs' AND o.produto LIKE '%tv%' AND o.preco_atual >= 500` },
  { id: 'notebook', nome: 'Notebook', where: `o.categoria = 'informatica' AND o.subcategoria = 'Notebooks' AND o.produto LIKE 'notebook%'
      AND o.preco_atual >= 1000 AND o.produto NOT LIKE '%infantil%' AND o.produto NOT LIKE '%educativo%' AND o.produto NOT LIKE '%brinquedo%'` },
  { id: 'console', nome: 'PlayStation 5', where: `o.categoria = 'games' AND o.subcategoria = 'Consoles'
      AND (o.produto LIKE 'console%playstation%5%' OR o.produto LIKE 'playstation%5%' OR o.produto LIKE 'sony playstation%5%' OR o.produto LIKE 'console ps5%' OR o.produto LIKE 'ps5 %')
      AND o.produto NOT LIKE '%base %' AND o.produto NOT LIKE '%controle%' AND o.produto NOT LIKE '%jogo%' AND o.produto NOT LIKE '%capa%'
      AND o.preco_atual >= 2000` },
  { id: 'iphone', nome: 'iPhone', where: `o.categoria = 'celulares' AND o.subcategoria = 'iPhone' AND o.produto LIKE 'iphone%' AND o.preco_atual >= 1500` },
];


// Remove o fundo branco ligado às bordas (preenchimento a partir das bordas), suavizando o contorno.
async function recortar(foto) {
  const { data, info } = await sharp(foto, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' })
    .resize(720, 720, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = i => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];

  // Cor do fundo medida na borda da foto (branco puro ou quase branco). A borda precisa ser quase toda
  // dessa cor clara; senão a foto tem cenário e não serve para recorte.
  const bordaIdx = [];
  for (let x = 0; x < w; x++) bordaIdx.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) bordaIdx.push(y * w, y * w + w - 1);
  const claros = bordaIdx.map(px).filter(([r, g, b]) => Math.min(r, g, b) > 228);
  if (claros.length / bordaIdx.length < 0.9) throw new Error('foto com fundo');
  const media = [0, 1, 2].map(c => claros.reduce((a, p) => a + p[c], 0) / claros.length);
  // Fundo = pixel a até 8 tons da cor do fundo (o branco sombreado de um produto branco, como o PS5, fica).
  const branco = (r, g, b) => Math.abs(r - media[0]) <= 8 && Math.abs(g - media[1]) <= 8 && Math.abs(b - media[2]) <= 8;

  const fundo = new Uint8Array(w * h);
  const fila = new Int32Array(w * h);
  let ini = 0, fim = 0;
  const marcar = i => { if (!fundo[i] && branco(...px(i))) { fundo[i] = 1; fila[fim++] = i; } };
  for (let x = 0; x < w; x++) { marcar(x); marcar((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { marcar(y * w); marcar(y * w + w - 1); }
  while (ini < fim) {
    const i = fila[ini++], x = i % w;
    if (x > 0) marcar(i - 1);
    if (x < w - 1) marcar(i + 1);
    if (i >= w) marcar(i - w);
    if (i < w * (h - 1)) marcar(i + w);
  }
  let produto = 0;
  for (let i = 0; i < w * h; i++) {
    if (fundo[i]) { data[i * 4 + 3] = 0; continue; }
    produto++;
    // Contorno: pixel claro encostado no fundo fica semitransparente (evita o "serrilhado" branco).
    const x = i % w;
    const vizFundo = (x > 0 && fundo[i - 1]) || (x < w - 1 && fundo[i + 1]) || (i >= w && fundo[i - w]) || (i < w * (h - 1) && fundo[i + w]);
    if (vizFundo) {
      const [r, g, b] = px(i);
      const claro = Math.min(r, g, b);
      const lim = Math.min(...media) - 30;
      if (claro > lim) data[i * 4 + 3] = Math.round(255 * Math.max(0.15, 1 - (claro - lim) / 40));
    }
  }
  const area = produto / (w * h);
  if (area < 0.06 || area > 0.97) throw new Error('recorte ruim');
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 1 })
    .resize(560, 560, { fit: 'inside' }).webp({ quality: 86, alphaQuality: 90, effort: 5 }).toBuffer();
}

async function recorteDaOferta(o) {
  const chave = crypto.createHash('sha1').update(String(o.imagem)).digest('hex').slice(0, 12);
  const ok = path.join(CACHE_DIR, `${o.id}-${chave}.webp`);
  const ruim = path.join(CACHE_DIR, `${o.id}-${chave}.ruim`);
  if (fs.existsSync(ok)) return ok;
  if (fs.existsSync(ruim)) return null; // já tentou e a foto não serve
  try {
    await fs.promises.writeFile(ok, await recortar(await baixarFoto(o.imagem)));
    return ok;
  } catch {
    await fs.promises.writeFile(ruim, '');
    return null;
  }
}

// Escolhe, para cada tipo, a melhor oferta cuja foto dá um bom recorte. Resultado guardado por 30 min.
let cache = { at: 0, itens: null };
let montando = null;

async function montar() {
  const itens = [];
  for (const t of TIPOS) {
    const candidatos = db.all(
      `SELECT o.id, o.produto, o.imagem, o.preco_atual, o.preco_anterior, o.desconto_pct, o.store_id FROM offers o
       WHERE ${t.where} AND o.oculto = 0 AND o.desconto_pct BETWEEN 8 AND 75 AND o.imagem LIKE 'https://%'
         AND o.last_seen_at > datetime('now', '-24 hours')
       ORDER BY CASE o.store_id WHEN 'amazon' THEN 0 WHEN 'mercadolivre' THEN 0 ELSE 1 END, o.desconto_pct DESC LIMIT 12`);
    for (const o of candidatos) {
      if (!offers.isActive(o.id)) continue;
      if (await recorteDaOferta(o)) {
        itens.push({ tipo: t.id, nome: t.nome, id: o.id, produto: o.produto, preco_atual: o.preco_atual,
          preco_anterior: o.preco_anterior, desconto_pct: o.desconto_pct, store_id: o.store_id });
        break;
      }
    }
  }
  cache = { at: Date.now(), itens };
  return itens;
}

async function itens() {
  if (cache.itens && Date.now() - cache.at < 30 * 60 * 1000) return cache.itens;
  montando ||= montar().finally(() => { montando = null; });
  // Primeira vez: espera montar; depois, devolve o anterior enquanto renova em segundo plano.
  return cache.itens || montando;
}

async function arquivoRecorte(id) {
  const o = db.get('SELECT id, imagem FROM offers WHERE id = ?', id);
  return o ? recorteDaOferta(o) : null;
}

function limparCache() {
  const limite = Date.now() - 3 * 86400000;
  for (const f of fs.readdirSync(CACHE_DIR)) {
    const p = path.join(CACHE_DIR, f);
    try { if (fs.statSync(p).mtimeMs < limite) fs.unlinkSync(p); } catch { /* ignora */ }
  }
}

module.exports = { itens, arquivoRecorte, recortar, limparCache, TIPOS };
