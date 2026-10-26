// Preenche a comissão (normal e extra) das ofertas da Shopee que entraram antes do site guardar esse dado.
// Consulta a API do Shopee Afiliados um produto por vez, devagar (1 a cada 3 s, ~1.200 por hora), começando pelas
// ofertas no ar mais recentes. As ofertas novas já entram com a comissão pela mineração (src/stores/shopee.js).
const db = require('./db');
const settings = require('./settings');
const offers = require('./offers');
const shopee = require('./stores/shopee');

const PAUSA_MS = 3000;
let timer = null;

function proxima() {
  const active = offers.activeClause();
  return db.get(
    `SELECT o.id, o.store_product_id FROM offers o
     WHERE o.store_id = 'shopee' AND o.comissao_pct IS NULL AND ${active.sql}
     ORDER BY o.last_seen_at DESC LIMIT 1`, ...active.params);
}

async function passo() {
  const s = settings.getAll();
  if (!s.shopee_app_id || !s.shopee_app_secret) return 30 * 60 * 1000; // sem chaves: tenta de novo em 30 min
  const o = proxima();
  if (!o) return 60 * 60 * 1000; // tudo preenchido: confere de novo em 1 h
  const itemId = String(o.store_product_id).split('.').pop();
  if (!/^\d{1,20}$/.test(itemId)) { db.run('UPDATE offers SET comissao_pct = 0 WHERE id = ?', o.id); return PAUSA_MS; }
  try {
    const d = await shopee.gql(`{ productOfferV2(itemId: ${itemId}, limit: 1) { nodes { commissionRate sellerCommissionRate } } }`, s);
    const n = d.productOfferV2?.nodes?.[0];
    // Produto que a API não devolve mais (fora do ar/do programa): 0 para não consultar de novo
    const total = n ? Math.round(Number(n.commissionRate) * 10000) / 100 : 0;
    const extra = n ? Math.round(Number(n.sellerCommissionRate) * 10000) / 100 : 0;
    db.run('UPDATE offers SET comissao_pct = ?, comissao_extra_pct = ? WHERE id = ?', total || 0, extra || 0, o.id);
    return PAUSA_MS;
  } catch (err) {
    console.warn('[COMISSÃO SHOPEE]', err.message);
    return 30 * 60 * 1000; // limite da API ou falha: espera 30 min
  }
}

function iniciar() {
  clearTimeout(timer);
  const rodar = async () => {
    let espera = PAUSA_MS;
    try { espera = await passo(); } catch (err) { console.error('[COMISSÃO SHOPEE]', err.message); espera = 30 * 60 * 1000; }
    timer = setTimeout(rodar, espera);
  };
  timer = setTimeout(rodar, 90 * 1000);
}

module.exports = { iniciar, passo };
