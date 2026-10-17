// Vitrine da página inicial: um produto por vez (carrossel), escolhido entre as melhores ofertas do momento de
// vários tipos (TV, notebook, console, celular, geladeira, air fryer…), com a foto da loja recortada (fundo branco
// removido). Fotos com cenário ou fundo colorido são descartadas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const db = require('./db');
const offers = require('./offers');
const { baixarFoto } = require('./watermark');
const ia = require('./ia-recorte');

const CACHE_DIR = path.join(path.dirname(db.UPLOADS_DIR), 'recorte');
fs.mkdirSync(CACHE_DIR, { recursive: true });

// Monta o filtro SQL de um tipo: categoria/subcategoria, palavras no nome (alguma delas), preço mínimo
// (evita acessórios) e palavras que excluem (capa, suporte, controle…).
const q = t => `'${String(t).replace(/'/g, "''")}'`;
function filtro({ cat, subs, nomes = [], min = 0, sem = [] }) {
  const partes = [`o.categoria = ${q(cat)}`, `o.subcategoria IN (${subs.map(q).join(', ')})`, `o.preco_atual >= ${Number(min)}`];
  if (nomes.length) partes.push(`(${nomes.map(n => `lower(o.produto) LIKE ${q(n)}`).join(' OR ')})`);
  for (const n of sem) partes.push(`lower(o.produto) NOT LIKE ${q(`%${n}%`)}`);
  return partes.join(' AND ');
}
const ACESSORIOS = ['capa', 'capinha', 'película', 'pelicula', 'suporte', 'case ', 'cabo', 'carregador', 'controle remoto', 'adesivo'];

// Tipos que podem aparecer na vitrine (até 3 produtos de cada).
const TIPOS = [
  { id: 'tv', nome: 'Smart TV', where: filtro({ cat: 'audio_tv', subs: ['TVs'], nomes: ['%tv%'], min: 500, sem: ACESSORIOS }) },
  { id: 'notebook', nome: 'Notebook', where: filtro({ cat: 'informatica', subs: ['Notebooks'], nomes: ['notebook%'], min: 1000, sem: ['infantil', 'educativo', 'brinquedo', ...ACESSORIOS] }) },
  { id: 'console', nome: 'Console', where: filtro({ cat: 'games', subs: ['Consoles'], min: 1200,
    nomes: ['console%', 'playstation%5%', 'sony playstation%', 'xbox series%', 'nintendo switch%', 'ps5 %'],
    sem: ['base ', 'controle', 'jogo', 'capa', 'suporte', 'case', 'película'] }) },
  { id: 'iphone', nome: 'iPhone', where: filtro({ cat: 'celulares', subs: ['iPhone'], nomes: ['iphone%', 'apple iphone%'], min: 1500, sem: ACESSORIOS }) },
  { id: 'celular', nome: 'Smartphone', where: filtro({ cat: 'celulares', subs: ['Celulares', 'Samsung Galaxy', 'Xiaomi'], min: 700,
    nomes: ['smartphone%', 'celular%', 'samsung galaxy%', 'galaxy %', 'xiaomi%', 'redmi%', 'poco %', 'motorola%', 'moto g%'], sem: ACESSORIOS }) },
  { id: 'tablet', nome: 'Tablet', where: filtro({ cat: 'celulares', subs: ['Tablets'], nomes: ['tablet%', 'ipad%', 'apple ipad%', 'samsung galaxy tab%'], min: 600, sem: ACESSORIOS }) },
  { id: 'relogio', nome: 'Smartwatch', where: filtro({ cat: 'celulares', subs: ['Smartwatches e relógios'], min: 150,
    nomes: ['%smartwatch%', '%apple watch%', '%galaxy watch%', '%relógio inteligente%', '%relogio inteligente%', '%amazfit%'], sem: ['pulseira', ...ACESSORIOS] }) },
  { id: 'fone', nome: 'Fone de ouvido', where: filtro({ cat: 'audio_tv', subs: ['Fones de ouvido'], min: 120, sem: ['adaptador', 'espuma', 'almofada', ...ACESSORIOS] }) },
  { id: 'caixa', nome: 'Caixa de som', where: filtro({ cat: 'audio_tv', subs: ['Caixas de som', 'Soundbars e home theater'], min: 250, sem: ACESSORIOS }) },
  { id: 'monitor', nome: 'Monitor', where: filtro({ cat: 'informatica', subs: ['Monitores'], nomes: ['monitor%'], min: 500, sem: ['braço', 'braco', ...ACESSORIOS] }) },
  { id: 'cadeira', nome: 'Cadeira gamer', where: filtro({ cat: 'games', subs: ['Cadeiras gamer'], nomes: ['cadeira%'], min: 450, sem: ['rodízio', 'rodizio', 'capa', 'almofada'] }) },
  { id: 'airfryer', nome: 'Air fryer', where: filtro({ cat: 'cozinha', subs: ['Air fryers'], min: 200, sem: ['forma', 'papel', 'tapete', 'cesto', 'grade', 'acessório', 'acessorio'] }) },
  { id: 'aspirador', nome: 'Robô aspirador', where: filtro({ cat: 'cozinha', subs: ['Aspiradores'], nomes: ['%robô%', '%robo %', '%robot%'], min: 400, sem: ['escova', 'filtro', 'refil', 'kit '] }) },
  { id: 'cafeteira', nome: 'Cafeteira', where: filtro({ cat: 'cozinha', subs: ['Cafeteiras'], nomes: ['cafeteira%'], min: 300, sem: ['cápsula', 'capsula', 'filtro'] }) },
  { id: 'geladeira', nome: 'Geladeira', where: filtro({ cat: 'eletrodomesticos', subs: ['Geladeiras e freezers'], nomes: ['geladeira%', 'refrigerador%'], min: 1500, sem: ['puxador', 'borracha', 'filtro'] }) },
  { id: 'lavadora', nome: 'Máquina de lavar', where: filtro({ cat: 'eletrodomesticos', subs: ['Máquinas de lavar'], min: 1200,
    nomes: ['lavadora%', 'máquina de lavar%', 'maquina de lavar%', 'lava e seca%', 'lava-e-seca%'], sem: ['capa', 'pé ', 'base'] }) },
  { id: 'microondas', nome: 'Micro-ondas', where: filtro({ cat: 'cozinha', subs: ['Micro-ondas'], nomes: ['micro-ondas%', 'microondas%', 'forno micro%'], min: 350, sem: ['prato', 'tampa', 'suporte'] }) },
  { id: 'arcondicionado', nome: 'Ar-condicionado', where: filtro({ cat: 'eletrodomesticos', subs: ['Ar-condicionado'], nomes: ['ar condicionado%', 'ar-condicionado%'], min: 1200, sem: ['suporte', 'controle', 'climatizador', 'ventilador'] }) },
  { id: 'bicicleta', nome: 'Bicicleta', where: filtro({ cat: 'esporte', subs: ['Bicicletas'], nomes: ['bicicleta%', 'bike %'], min: 700, sem: ['pneu', 'câmara', 'camara', 'selim', 'suporte'] }) },
];
const POR_TIPO = 3;          // produtos de cada tipo no carrossel
const CANDIDATOS = 10;       // ofertas testadas por tipo (a foto precisa dar um bom recorte)
const VALIDADE_MS = 10 * 60 * 1000; // a vitrine é refeita a cada 10 min

// Imagem da vitrine: a foto ORIGINAL da loja, inteira, num cartão branco com o selo do Ofertou!
// (sem remover o fundo, então nenhuma parte do produto some). O recorte serve só para escolher boas fotos:
// produto de estúdio, sem textos, selos ou montagens; a imagem mostrada é sempre a foto completa.
async function avaliarFoto(foto) {
  if (!ia.disponivel()) return recortarSimples(foto);
  try { return await ia.recortarEstudio(foto); } catch (err) {
    if (/textos|recorte ruim/.test(err.message)) throw err;
  }
  return ia.recortarIA(foto);
}
async function recortar(foto) {
  await avaliarFoto(foto); // lança erro se a foto não servir
  return require('./watermark').cartao(foto);
}

// Método simples: remove o fundo branco ligado às bordas (preenchimento a partir das bordas), suavizando o contorno.
async function recortarSimples(foto) {
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
  // Foto de estúdio: praticamente toda a borda vira fundo. Se sobra borda (chão, parede, janela), tem cenário.
  const bordaFundo = bordaIdx.filter(i => fundo[i]).length / bordaIdx.length;
  if (bordaFundo < 0.97) throw new Error('foto com cenário');
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 1 })
    .resize(560, 560, { fit: 'inside' }).webp({ quality: 86, alphaQuality: 90, effort: 5 }).toBuffer();
}

async function recorteDaOferta(o) {
  const chave = crypto.createHash('sha1').update(`cartao1|${ia.disponivel() ? 'ia' : 's'}|${o.imagem}`).digest('hex').slice(0, 12);
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

// Escolhe, para cada tipo, as melhores ofertas cujas fotos dão um bom recorte. Refeita a cada 10 min.
let cache = { at: 0, itens: null };
let montando = null;
let parcial = [];

// Ordem do carrossel: um de cada tipo por vez (TV, notebook, console…), começando de um tipo aleatório.
function intercalar(lista) {
  const porTipo = new Map();
  for (const it of lista) { if (!porTipo.has(it.tipo)) porTipo.set(it.tipo, []); porTipo.get(it.tipo).push(it); }
  const grupos = [...porTipo.values()];
  const desloc = grupos.length ? Math.floor(Math.random() * grupos.length) : 0;
  const ordem = [...grupos.slice(desloc), ...grupos.slice(0, desloc)];
  const out = [];
  for (let i = 0; ordem.some(g => g[i]); i++) for (const g of ordem) if (g[i]) out.push(g[i]);
  return out;
}

async function montar() {
  const achados = [];
  parcial = achados;
  // Mesmo produto em lojas diferentes (ou variações de cor) aparece uma vez só.
  const vistos = new Set();
  const chaveProduto = t => String(t).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 5).join(' ');
  for (const t of TIPOS) {
    const candidatos = db.all(
      `SELECT o.id, o.produto, o.imagem, o.preco_atual, o.preco_anterior, o.desconto_pct, o.store_id FROM offers o
       WHERE ${t.where} AND o.oculto = 0 AND o.desconto_pct BETWEEN 8 AND 75 AND o.imagem LIKE 'https://%'
         AND o.imagem NOT LIKE '%mlcdn.com.br%' AND o.last_seen_at > datetime('now', '-24 hours')
       ORDER BY o.desconto_pct DESC LIMIT ${CANDIDATOS * 2}`);
    let n = 0;
    for (const o of candidatos) {
      if (n >= POR_TIPO) break;
      if (!offers.isActive(o.id) || vistos.has(chaveProduto(o.produto))) continue;
      if (await recorteDaOferta(o)) {
        vistos.add(chaveProduto(o.produto));
        achados.push({ tipo: t.id, nome: t.nome, id: o.id, produto: o.produto, preco_atual: o.preco_atual,
          preco_anterior: o.preco_anterior, desconto_pct: o.desconto_pct, store_id: o.store_id });
        n++;
      }
    }
  }
  cache = { at: Date.now(), itens: intercalar(achados) };
  return cache.itens;
}

async function itens() {
  if (!cache.itens || Date.now() - cache.at >= VALIDADE_MS) montando ||= montar().finally(() => { montando = null; });
  if (cache.itens) return cache.itens; // devolve a anterior enquanto renova em segundo plano
  // Primeira vez (sem nada pronto): espera até 6 s e devolve o que já deu para recortar.
  await Promise.race([montando, new Promise(r => setTimeout(r, 6000))]);
  return cache.itens || intercalar(parcial);
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

module.exports = { itens, arquivoRecorte, recortar, recortarSimples, limparCache, TIPOS };
