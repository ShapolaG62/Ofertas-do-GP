const db = require('./db');
const settings = require('./settings');
const { getStore } = require('./stores');
const { classifyCategory, classifySubcategory } = require('./categorize');
const { discountOf, round2 } = require('./util');

const MAX_DISCOUNT = 95; // acima disso quase sempre é erro de leitura de preço

function activeClause() {
  const hours = settings.getNumber('offer_max_age_hours', 24);
  return {
    sql: `o.oculto = 0 AND (
      (o.fonte = 'auto' AND o.last_seen_at >= datetime('now', ?)) OR
      (o.fonte = 'manual' AND o.expires_at > datetime('now'))
    )`,
    params: [`-${hours} hours`],
  };
}

function affiliateFor(store, offer, s) {
  try { return store.affiliateLink(offer, s) || offer.original_url; } catch { return offer.original_url; }
}

// Valida e grava uma oferta encontrada numa loja. Retorna o id ou null se foi rejeitada.
function saveDeal(store, deal, opts = {}) {
  const s = opts.settings || settings.getAll();
  const fonte = opts.fonte || 'auto';
  const minDiscount = fonte === 'manual' ? 1 : Number(s.min_discount_pct) || 5;

  const produto = String(deal.produto || '').replace(/\s+/g, ' ').trim();
  const atual = round2(Number(deal.preco_atual));
  const anterior = round2(Number(deal.preco_anterior));
  const desconto = discountOf(atual, anterior);
  if (!produto || !deal.store_product_id || !deal.original_url) return null;
  if (!(atual > 0) || desconto < minDiscount || desconto > MAX_DISCOUNT) return null;

  const offer = { ...deal, produto, preco_atual: atual, preco_anterior: anterior };
  const affFixed = deal.affiliate_url ? 1 : 0;
  const affiliate = deal.affiliate_url || affiliateFor(store, offer, s);
  const categoria = deal.categoria || classifyCategory(produto, opts.catHint);
  const expiresAt = fonte === 'manual' ? opts.expiresAt : null;

  return db.transaction(() => {
    const existing = db.get(
      'SELECT id, preco_atual, categoria FROM offers WHERE store_id = ? AND store_product_id = ?',
      store.id, String(deal.store_product_id)
    );
    if (existing) {
      db.run(
        `UPDATE offers SET produto = ?, preco_atual = ?, preco_anterior = ?, desconto_pct = ?, imagem = COALESCE(?, imagem),
           original_url = ?, affiliate_url = ?, aff_fixed = ?, fonte = ?, expires_at = ?, subcategoria = ?,
           updated_at = datetime('now'), last_seen_at = datetime('now')
         WHERE id = ?`,
        produto, atual, anterior, desconto, deal.imagem || null, deal.original_url, affiliate, affFixed,
        fonte, expiresAt, classifySubcategory(produto, existing.categoria), existing.id
      );
      if (Number(existing.preco_atual) !== atual) {
        db.run('INSERT INTO price_history (offer_id, price) VALUES (?, ?)', existing.id, atual);
      }
      return existing.id;
    }
    const res = db.run(
      `INSERT INTO offers (store_id, store_product_id, plataforma, produto, preco_atual, preco_anterior, desconto_pct,
         categoria, subcategoria, imagem, original_url, affiliate_url, aff_fixed, fonte, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      store.id, String(deal.store_product_id), store.name, produto, atual, anterior, desconto,
      categoria, classifySubcategory(produto, categoria), deal.imagem || null, deal.original_url, affiliate, affFixed, fonte, expiresAt
    );
    const id = Number(res.lastInsertRowid);
    db.run('INSERT INTO price_history (offer_id, price) VALUES (?, ?)', id, atual);
    return id;
  });
}

const PUBLIC_FIELDS = `o.id, o.store_id, o.plataforma, o.produto, o.preco_atual, o.preco_anterior, o.desconto_pct,
  o.categoria, o.subcategoria, o.imagem, o.affiliate_url, o.link_clicks, o.fonte, o.created_at, o.last_seen_at`;

function listActive(limit = 2000) {
  const active = activeClause();
  return db.all(
    `SELECT ${PUBLIC_FIELDS},
       CASE WHEN h.n >= 2 AND o.created_at <= datetime('now', '-7 days') AND o.preco_atual <= h.min30
            THEN 1 ELSE 0 END AS menor_preco_30d
     FROM offers o
     LEFT JOIN (
       SELECT offer_id, MIN(price) AS min30, COUNT(*) AS n FROM price_history
       WHERE checked_at >= datetime('now', '-30 days') GROUP BY offer_id
     ) h ON h.offer_id = o.id
     WHERE ${active.sql}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT ?`,
    ...active.params, limit
  );
}

function featured() {
  const active = activeClause();
  return db.get(
    `SELECT ${PUBLIC_FIELDS} FROM offers o WHERE ${active.sql} AND o.desconto_pct >= 30
     ORDER BY o.desconto_pct DESC, o.last_seen_at DESC LIMIT 1`,
    ...active.params
  ) || null;
}

function stats() {
  const active = activeClause();
  const row = db.get(
    `SELECT COUNT(*) AS offer_count,
       SUM(CASE WHEN o.created_at >= datetime('now', 'start of day') THEN 1 ELSE 0 END) AS offers_today,
       SUM(CASE WHEN o.desconto_pct >= 55 THEN 1 ELSE 0 END) AS diamonds,
       COUNT(DISTINCT o.store_id) AS stores
     FROM offers o WHERE ${active.sql}`,
    ...active.params
  );
  return {
    offer_count: row.offer_count || 0,
    offers_today: row.offers_today || 0,
    diamonds: row.diamonds || 0,
    stores: row.stores || 0,
  };
}

function isActive(id) {
  const active = activeClause();
  return Boolean(db.get(`SELECT 1 FROM offers o WHERE o.id = ? AND ${active.sql}`, id, ...active.params));
}

// Lista para o painel, com filtro por situação.
function listForAdmin({ q = '', store = '', state = 'active', page = 1, perPage = 50 }) {
  const active = activeClause();
  const where = [];
  const params = [];
  if (state === 'active') { where.push(active.sql); params.push(...active.params); }
  else if (state === 'expired') { where.push(`o.oculto = 0 AND NOT (${active.sql})`); params.push(...active.params); }
  else if (state === 'hidden') where.push('o.oculto = 1');
  if (store) { where.push('o.store_id = ?'); params.push(store); }
  if (q) { where.push('o.produto LIKE ?'); params.push(`%${q}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM offers o ${whereSql}`, ...params).n;
  const rows = db.all(
    `SELECT o.*, (${active.sql}) AS ativo FROM offers o ${whereSql}
     ORDER BY o.last_seen_at DESC LIMIT ? OFFSET ?`,
    ...active.params, ...params, perPage, (page - 1) * perPage
  );
  return { total, page, perPage, rows };
}

// Recalcula os links de afiliado depois que o admin altera as tags.
function refreshAffiliateLinks() {
  const s = settings.getAll();
  const rows = db.all('SELECT id, store_id, store_product_id, original_url FROM offers WHERE aff_fixed = 0');
  let count = 0;
  db.transaction(() => {
    for (const row of rows) {
      const store = getStore(row.store_id);
      if (!store) continue;
      db.run('UPDATE offers SET affiliate_url = ? WHERE id = ?', affiliateFor(store, row, s), row.id);
      count++;
    }
  });
  return count;
}

// Remove do banco ofertas automáticas que não aparecem há mais de 30 dias.
function purgeOld() {
  return db.run(`DELETE FROM offers WHERE fonte = 'auto' AND last_seen_at < datetime('now', '-30 days')`).changes;
}

// Reaplica as regras de categoria e tipo de produto (rodado ao iniciar, para valer também para ofertas antigas).
function reclassifyAll() {
  const rows = db.all('SELECT id, produto, categoria, fonte FROM offers');
  db.transaction(() => {
    for (const r of rows) {
      const categoria = r.fonte === 'auto' ? classifyCategory(r.produto, r.categoria) : r.categoria;
      db.run('UPDATE offers SET categoria = ?, subcategoria = ? WHERE id = ?',
        categoria, classifySubcategory(r.produto, categoria), r.id);
    }
  });
  return rows.length;
}

module.exports = {
  saveDeal, listActive, featured, stats, isActive, listForAdmin, refreshAffiliateLinks, purgeOld, reclassifyAll,
};
