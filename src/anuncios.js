// Criador de anúncios das empresas: dados completos do produto, fotos enviadas e página pública do anúncio.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const offers = require('./offers');
const lojas = require('./lojas');
const { assertPublicUrl } = require('./net');
const { parseBRL } = require('./util');
const { CATEGORIES } = require('./categorize');

const MAX_IMAGES = 6;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_DAYS = 30;
const CONDICOES = { novo: 'Novo', usado: 'Usado', recondicionado: 'Recondicionado' };
const FRETES = { gratis: 'Frete grátis', pago: 'Frete pago', retirada: 'Retirada no local', a_combinar: 'Frete a combinar' };
const LOCAL_IMAGE = /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });

function text(v, label, { min = 0, max = 120, required = false } = {}) {
  const s = String(v ?? '').trim().replace(/[ \t]+/g, ' ');
  if (!s) { if (required) throw fail(`Informe ${label}.`); return null; }
  if (s.length < min || s.length > max) throw fail(`${label[0].toUpperCase()}${label.slice(1)}: entre ${min} e ${max} caracteres.`);
  return s;
}

// ── Fotos ────────────────────────────────────────────────────────────────────
// Confere o tipo pelo conteúdo do arquivo (não pela extensão) e salva com nome aleatório.
function saveUpload(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw fail('Arquivo vazio.');
  if (buffer.length > MAX_UPLOAD_BYTES) throw fail('A foto pode ter no máximo 3 MB.');
  let ext = null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ext = 'jpg';
  else if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = 'png';
  else if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') ext = 'webp';
  if (!ext) throw fail('Envie fotos em JPG, PNG ou WEBP.');
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(db.UPLOADS_DIR, name), buffer);
  return `/uploads/${name}`;
}

function parseImages(list) {
  const arr = (Array.isArray(list) ? list : []).map(s => String(s || '').trim()).filter(Boolean);
  if (!arr.length) throw fail('Adicione pelo menos uma foto do produto.');
  if (arr.length > MAX_IMAGES) throw fail(`No máximo ${MAX_IMAGES} fotos por anúncio.`);
  for (const img of arr) {
    if (LOCAL_IMAGE.test(img)) {
      if (!fs.existsSync(path.join(db.UPLOADS_DIR, path.basename(img)))) throw fail('Uma das fotos enviadas não foi encontrada. Envie de novo.');
    } else if (/^https:\/\//i.test(img) && img.length <= 500) {
      assertPublicUrl(img);
    } else {
      throw fail('Foto inválida: envie um arquivo ou use um link https://');
    }
  }
  return arr;
}

// ── Validação do anúncio ─────────────────────────────────────────────────────
function parseAd(body) {
  const titulo = text(body.titulo, 'o título do anúncio', { min: 5, max: 150, required: true });
  const descricao = text(body.descricao, 'a descrição', { min: 20, max: 3000, required: true });
  const condicao = String(body.condicao || '');
  if (!CONDICOES[condicao]) throw fail('Selecione a condição do produto.');
  const categoria = String(body.categoria || '');
  if (!CATEGORIES.includes(categoria)) throw fail('Selecione a categoria.');

  const anterior = parseBRL(body.preco_anterior);
  const atual = parseBRL(body.preco_atual);
  if (!anterior || !atual) throw fail('Informe o preço normal e o preço promocional.');
  if (anterior <= atual) throw fail('O preço normal precisa ser maior que o preço promocional.');

  const frete = String(body.frete || '');
  if (!FRETES[frete]) throw fail('Selecione como é o frete.');
  let freteValor = null;
  if (frete === 'pago' && String(body.frete_valor ?? '').trim()) {
    freteValor = parseBRL(body.frete_valor);
    if (freteValor == null || freteValor < 0) throw fail('Valor do frete inválido.');
  }

  let estoque = null;
  if (String(body.estoque ?? '').trim()) {
    estoque = Number(body.estoque);
    if (!Number.isInteger(estoque) || estoque < 0 || estoque > 1e6) throw fail('Estoque inválido.');
  }
  const ean = String(body.ean || '').replace(/\D/g, '') || null;
  if (ean && ![8, 12, 13, 14].includes(ean.length)) throw fail('Código de barras (EAN/GTIN) deve ter 8, 12, 13 ou 14 dígitos.');
  const cupom = String(body.cupom_codigo || '').trim().toUpperCase() || null;
  if (cupom && !/^[A-Z0-9_-]{3,30}$/.test(cupom)) throw fail('Cupom: use de 3 a 30 letras, números, - ou _.');
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '') || null;
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 11)) throw fail('WhatsApp inválido: use DDD + número.');

  const url = String(body.url || '').trim();
  if (!/^https:\/\//i.test(url) || url.length > 500) throw fail('Informe o link de compra começando com https://');
  assertPublicUrl(url);

  const dias = Math.min(Math.max(parseInt(body.dias, 10) || 7, 1), MAX_DAYS);

  return {
    offer: { titulo, categoria, anterior, atual, url, dias },
    details: {
      descricao,
      marca: text(body.marca, 'a marca', { max: 60 }),
      modelo: text(body.modelo, 'o modelo', { max: 80 }),
      condicao,
      garantia: text(body.garantia, 'a garantia', { max: 80 }),
      parcelamento: text(body.parcelamento, 'o parcelamento', { max: 80 }),
      frete,
      frete_valor: freteValor,
      prazo_entrega: text(body.prazo_entrega, 'o prazo de entrega', { max: 80 }),
      estoque,
      sku: text(body.sku, 'o código (SKU)', { max: 40 }),
      ean,
      cupom_codigo: cupom,
      cupom_descricao: cupom ? text(body.cupom_descricao, 'a descrição do cupom', { max: 120 }) : null,
      whatsapp,
      imagens: JSON.stringify(parseImages(body.imagens)),
    },
  };
}

function ownAd(loja, offerId) {
  const row = db.get(`SELECT * FROM offers WHERE id = ? AND loja_id = ? AND fonte = 'empresa'`, offerId, loja.id);
  if (!row) throw fail('Anúncio não encontrado.', 404);
  return row;
}

function saveDetails(offerId, d) {
  const cols = Object.keys(d);
  db.run(
    `INSERT INTO ad_details (offer_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})
     ON CONFLICT(offer_id) DO UPDATE SET ${cols.map(c => `${c} = excluded.${c}`).join(', ')}, updated_at = datetime('now')`,
    offerId, ...Object.values(d)
  );
}

// Cria (sem offerId) ou atualiza um anúncio da loja do usuário.
function saveAd(user, body, offerId = null) {
  lojas.assertCanPublishUser(user);
  const loja = lojas.getByUser(user.id);
  if (!loja) throw fail('Crie sua loja antes de anunciar.');
  const existing = offerId ? ownAd(loja, offerId) : null;
  if (!existing) {
    const max = require('./planos').maxProdutos(user.id); // o do plano da empresa, ou o geral do painel
    if (db.get('SELECT COUNT(*) AS n FROM offers WHERE loja_id = ?', loja.id).n >= max) {
      throw fail(`Limite de ${max} anúncios/produtos atingido. Exclua anúncios antigos.`);
    }
  }
  const { offer, details } = parseAd(body);
  const images = JSON.parse(details.imagens);
  const expires = new Date(Date.now() + offer.dias * 86400000).toISOString().replace('T', ' ').slice(0, 19);

  const id = offers.saveDeal(lojas.pseudoStore(loja), {
    store_product_id: existing ? existing.store_product_id : `ad:${crypto.randomBytes(8).toString('hex')}`,
    produto: offer.titulo,
    preco_atual: offer.atual,
    preco_anterior: offer.anterior,
    imagem: images[0],
    original_url: offer.url,
    affiliate_url: offer.url,
    categoria: offer.categoria,
  }, { fonte: 'empresa', expiresAt: expires, lojaId: loja.id });
  if (!id) throw fail('Anúncio recusado: o desconto precisa ficar entre 1% e 95%.');

  // A categoria escolhida pela empresa vale também na edição.
  db.run('UPDATE offers SET categoria = ?, imagem = ? WHERE id = ?', offer.categoria, images[0], id);
  offers.reclassifyOne(id);
  saveDetails(id, details);
  return id;
}

function getOwnAd(user, offerId) {
  const loja = lojas.getByUser(user.id);
  if (!loja) throw fail('Loja não encontrada.', 404);
  const o = ownAd(loja, offerId);
  const d = db.get('SELECT * FROM ad_details WHERE offer_id = ?', o.id) || {};
  return { ...o, ...d, imagens: d.imagens ? JSON.parse(d.imagens) : (o.imagem ? [o.imagem] : []) };
}

// Página pública do anúncio (somente se estiver no ar).
function publicAd(offerId) {
  if (!offers.isActive(offerId)) return null;
  const o = db.get(
    `SELECT o.id, o.produto, o.preco_atual, o.preco_anterior, o.desconto_pct, o.categoria, o.subcategoria, o.imagem,
            o.expires_at, o.created_at, o.updated_at, l.nome AS loja_nome, l.slug AS loja_slug, l.logo_url AS loja_logo
     FROM offers o JOIN lojas l ON l.id = o.loja_id WHERE o.id = ? AND o.fonte = 'empresa'`, offerId
  );
  if (!o) return null;
  const d = db.get('SELECT * FROM ad_details WHERE offer_id = ?', offerId) || {};
  return {
    ...o,
    descricao: d.descricao, marca: d.marca, modelo: d.modelo, condicao: CONDICOES[d.condicao] || null,
    garantia: d.garantia, parcelamento: d.parcelamento, frete: FRETES[d.frete] || null, frete_valor: d.frete_valor,
    prazo_entrega: d.prazo_entrega, estoque: d.estoque, sku: d.sku, ean: d.ean,
    cupom_codigo: d.cupom_codigo, cupom_descricao: d.cupom_descricao, whatsapp: d.whatsapp,
    imagens: d.imagens ? JSON.parse(d.imagens) : (o.imagem ? [o.imagem] : []),
  };
}

module.exports = { saveUpload, saveAd, getOwnAd, publicAd, CONDICOES, FRETES, MAX_IMAGES };
