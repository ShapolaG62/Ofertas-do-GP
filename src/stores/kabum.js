// KaBuM! — busca do catálogo (a mesma API que o site da KaBuM! usa para listar os produtos).
// Preço igual ao que a loja exibe no cartão do produto:
//  • em oferta relâmpago (ou produto Prime): "De" = preço normal, "Por" = preço à vista da oferta;
//  • nos outros casos: "De" = preço antigo (old_price), "Por" = preço à vista no PIX.
// Sem preço riscado na loja, o produto não entra (não é oferta).
const { http } = require('../util');

const SITE = 'https://www.kabum.com.br';
const API = 'https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2/products';

function precoDe(a, agora = Date.now() / 1000) {
  const o = a.offer;
  const relampago = o && o.price_with_discount > 0 && (!o.starts_at || o.starts_at <= agora) && (!o.ends_at || agora <= o.ends_at)
    && (o.quantity_available ?? 1) > 0;
  const atual = Number(relampago ? (o.new_price_with_discount || o.price_with_discount) : a.price_with_discount) || 0;
  const anterior = Number(relampago || a.is_prime ? a.price : a.old_price) || 0;
  return { atual, anterior };
}

function parse(lista) {
  const deals = [];
  for (const p of lista || []) {
    const a = p.attributes || {};
    if (!p.id || !a.title || a.available === false || a.is_pre_order) continue;
    const { atual, anterior } = precoDe(a);
    if (!(atual > 0) || !(anterior > atual)) continue;
    const imagem = (a.images || []).find(u => /^https:\/\//.test(u)) || null;
    deals.push({
      store_product_id: String(p.id),
      produto: String(a.title).trim(),
      preco_atual: atual,
      preco_anterior: anterior,
      imagem,
      original_url: `${SITE}/produto/${p.id}${a.product_link ? `/${a.product_link}` : ''}`,
    });
  }
  return deals;
}

async function search(query) {
  const res = await http.get(API, {
    params: { query: query.trim(), page_number: 1, page_size: 60, facet_filters: '', sort: 'most_searched', is_prime: false,
      payload_data: 'products_category_filters', include: 'gift' },
    headers: { Accept: 'application/json', Origin: SITE, Referer: `${SITE}/` },
    validateStatus: () => true,
  });
  // 404 "CATALOG_NOT_MATCH" = a KaBuM! não tem esse produto (não é bloqueio).
  if (res.status === 404 && /CATALOG_NOT_MATCH/.test(JSON.stringify(res.data || ''))) return { status: 'ok', deals: [] };
  if (res.status === 403 || res.status === 429) {
    return { status: 'blocked', message: `A KaBuM! recusou a busca (HTTP ${res.status}): possível bloqueio do IP.`, deals: [] };
  }
  if (res.status >= 400 || !Array.isArray(res.data?.data)) return { status: 'error', message: `HTTP ${res.status}`, deals: [] };
  return { status: 'ok', deals: parse(res.data.data) };
}

module.exports = {
  id: 'kabum',
  name: 'KaBuM!',
  method: 'Busca do catálogo da loja',
  automatic: true,
  isReady: () => ({ ready: true }),
  search,
  // Link de afiliado a partir de UM link de afiliado de qualquer produto da KaBuM! colado no painel:
  //  • link da rede de afiliados com o produto dentro (ex.: ...&ued=https%3A%2F%2Fwww.kabum.com.br%2F...):
  //    troca o produto de dentro pelo da oferta;
  //  • link da própria KaBuM! com parâmetros de rastreamento: copia os parâmetros para o link da oferta;
  //  • modelo com {url} também funciona. Vazio = link direto, sem comissão.
  affiliateLink(offer, s) {
    const modelo = String(s.kabum_afiliado || '').trim();
    if (!modelo) return offer.original_url;
    if (modelo.includes('{url}')) return modelo.replace('{url}', encodeURIComponent(offer.original_url));
    let exemplo;
    try { exemplo = new URL(modelo); } catch { exemplo = null; }
    if (exemplo && !/kabum\.com\.br$/i.test(exemplo.hostname)) {
      for (const [k, v] of exemplo.searchParams) {
        if (/^https?:\/\/(www\.)?kabum\.com\.br/i.test(v)) {
          exemplo.searchParams.set(k, offer.original_url);
          return exemplo.toString();
        }
      }
      return offer.original_url; // não achou o produto dentro do link colado
    }
    const url = new URL(offer.original_url);
    const params = exemplo ? exemplo.searchParams : new URLSearchParams(modelo.replace(/^\?/, ''));
    for (const [k, v] of params) url.searchParams.set(k, v);
    return url.toString();
  },
  matchesUrl: url => /kabum\.com\.br/i.test(url),
  productIdFromUrl: url => (String(url).match(/\/produto\/(\d+)/) || [])[1] || null,
};
