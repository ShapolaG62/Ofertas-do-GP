// AliExpress — duas fontes:
//  1) API oficial de afiliados (se App Key, App Secret e Tracking ID estiverem no painel) — já devolve link com comissão;
//  2) leitura da busca pública (os dados de preço vêm embutidos na própria página do AliExpress).
const crypto = require('crypto');
const { http, extractJsonAt, absoluteUrl, round2 } = require('../util');

const SITE = 'https://pt.aliexpress.com';

function parseHtml(html) {
  const marker = html.indexOf('"itemList":{"content":');
  if (marker < 0) return null;
  const items = extractJsonAt(html, html.indexOf('[', marker)) || [];
  const deals = [];
  for (const it of items) {
    const sale = it.prices?.salePrice;
    const orig = it.prices?.originalPrice;
    if (!it.productId || !sale || !orig) continue;
    if (sale.currencyCode !== 'BRL' || orig.currencyCode !== 'BRL') continue;
    deals.push({
      store_product_id: String(it.productId),
      produto: it.title?.displayTitle || '',
      preco_atual: Number(sale.minPrice),
      preco_anterior: Number(orig.minPrice),
      imagem: absoluteUrl(it.image?.imgUrl, SITE),
      original_url: `${SITE}/item/${it.productId}.html`,
    });
  }
  return deals;
}

async function searchHtml(query) {
  const slug = query.trim().replace(/\s+/g, '-');
  const url = `${SITE}/w/wholesale-${encodeURIComponent(slug)}.html?g=y&SearchText=${encodeURIComponent(query)}`;
  const res = await http.get(url, { validateStatus: () => true });
  if (res.status >= 400) return { status: 'error', message: `HTTP ${res.status}`, deals: [] };
  const deals = parseHtml(String(res.data || ''));
  if (deals === null) {
    return { status: 'blocked', message: 'A página do AliExpress veio sem a lista de produtos (possível verificação anti-robô).', deals: [] };
  }
  return { status: 'ok', deals };
}

// Assinatura do gateway oficial (api-sg.aliexpress.com/sync): HMAC-SHA256 dos parâmetros ordenados.
function sign(params, secret) {
  const base = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', secret).update(base, 'utf8').digest('hex').toUpperCase();
}

async function searchApi(query, s) {
  const params = {
    app_key: s.aliexpress_app_key,
    method: 'aliexpress.affiliate.product.query',
    sign_method: 'sha256',
    timestamp: String(Date.now()),
    format: 'json',
    v: '2.0',
    keywords: query,
    tracking_id: s.aliexpress_tracking_id,
    target_currency: 'BRL',
    target_language: 'PT',
    ship_to_country: 'BR',
    page_size: '50',
    fields: 'product_id,product_title,target_sale_price,target_original_price,product_main_image_url,promotion_link,product_detail_url',
  };
  params.sign = sign(params, s.aliexpress_app_secret);
  const res = await http.get('https://api-sg.aliexpress.com/sync', { params, validateStatus: () => true });
  const data = res.data || {};
  if (data.error_response) throw new Error(data.error_response.msg || data.error_response.code);
  const result = data.aliexpress_affiliate_product_query_response?.resp_result;
  if (!result || String(result.resp_code) !== '200') {
    if (result && String(result.resp_code) === '405') return []; // nenhum produto para o termo
    throw new Error(result?.resp_msg || `resposta inesperada (HTTP ${res.status})`);
  }
  const products = result.result?.products?.product || [];
  return products.map(p => ({
    store_product_id: String(p.product_id),
    produto: p.product_title,
    preco_atual: round2(Number(p.target_sale_price)),
    preco_anterior: round2(Number(p.target_original_price)),
    imagem: p.product_main_image_url,
    original_url: `${SITE}/item/${p.product_id}.html`,
    affiliate_url: p.promotion_link || null,
  }));
}

function apiConfigured(s) {
  return Boolean(s.aliexpress_app_key && s.aliexpress_app_secret && s.aliexpress_tracking_id);
}

async function search(query, s) {
  if (apiConfigured(s)) {
    try {
      return { status: 'ok', deals: await searchApi(query, s), message: 'via API de afiliados' };
    } catch (err) {
      const fallback = await searchHtml(query);
      fallback.message = `API de afiliados falhou: ${err.message}. ${fallback.message || ''}`.trim();
      return fallback;
    }
  }
  return searchHtml(query);
}

module.exports = {
  id: 'aliexpress',
  name: 'AliExpress',
  method: 'API de afiliados (se configurada) ou leitura da busca pública',
  automatic: true,
  isReady: () => ({ ready: true }),
  search,
  affiliateLink: offer => offer.original_url,
  matchesUrl: url => /aliexpress\./i.test(url),
  productIdFromUrl: url => (String(url).match(/\/item\/(\d+)/) || [])[1] || null,
};
