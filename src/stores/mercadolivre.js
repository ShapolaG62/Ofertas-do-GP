// Mercado Livre — duas fontes:
//  1) API oficial (se o App ID e a Chave secreta do Mercado Livre Developers estiverem no painel):
//     produtos do catálogo com a palavra + mais vendidos da categoria, só os anúncios com preço riscado pelo próprio ML;
//  2) leitura da busca pública (o ML costuma bloquear com "verificação de conta" quando detecta robô).
const cheerio = require('cheerio');
const { http, parseBRL } = require('../util');

const API = 'https://api.mercadolibre.com';
let tokenCache = { token: null, expiresAt: 0, clientId: null };

async function getToken(s) {
  if (tokenCache.token && tokenCache.clientId === s.ml_client_id && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: s.ml_client_id,
    client_secret: s.ml_client_secret,
  });
  const res = await http.post(`${API}/oauth/token`, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data.access_token) {
    throw new Error(`token recusado (${res.status}: ${res.data?.message || res.data?.error || 'sem detalhes'})`);
  }
  tokenCache = {
    token: res.data.access_token,
    clientId: s.ml_client_id,
    expiresAt: Date.now() + (Number(res.data.expires_in || 21600) - 300) * 1000,
  };
  return tokenCache.token;
}

async function apiGet(path, token, params) {
  const res = await http.get(`${API}${path}`, {
    params,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    validateStatus: () => true,
  });
  return res;
}

// Roda as tarefas com poucas requisições simultâneas, para não sobrecarregar a API.
async function inBatches(list, size, fn) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(...await Promise.all(list.slice(i, i + size).map(fn)));
  }
  return out;
}

// A busca comum (/sites/MLB/search) é recusada para aplicativos (403). Caminho usado:
// termo → produtos do catálogo com a palavra (products/search) + mais vendidos da categoria (highlights) → anúncios de cada produto.
// Entra só o anúncio mais barato que tenha preço anterior (riscado) informado pelo próprio Mercado Livre.
async function searchApi(query, s) {
  const token = await getToken(s);
  const produtos = [];
  // 1º) Busca por palavra no catálogo (products/search): traz os produtos do termo, não só os mais vendidos
  const porPalavra = await cached(`q:${query}`, async () => {
    const r = await apiGet('/products/search', token, { status: 'active', site_id: 'MLB', q: query, limit: 20 });
    return r.status === 200 ? (r.data.results || []).map(p => p.id).filter(Boolean) : [];
  });
  for (const id of porPalavra) if (!produtos.includes(id)) produtos.push(id);

  // 2º) Mais vendidos da categoria do termo (completa a lista)
  const disc = await apiGet('/sites/MLB/domain_discovery/search', token, { q: query, limit: 2 });
  if (disc.status !== 200 && !produtos.length) throw new Error(`categoria não encontrada (${disc.status})`);
  const categorias = disc.status === 200 ? [...new Set((disc.data || []).map(d => d.category_id).filter(Boolean))] : [];

  for (const cat of categorias) {
    const ids = await cached(`cat:${cat}`, async () => {
      const h = await apiGet(`/highlights/MLB/category/${cat}`, token);
      return h.status === 200 ? (h.data.content || []).filter(c => c.type === 'PRODUCT').map(c => c.id) : [];
    });
    for (const id of ids) if (!produtos.includes(id)) produtos.push(id);
  }

  const deals = await inBatches(produtos.slice(0, 40), 5, productId => cached(`prod:${productId}`, () => dealFor(productId, token)));
  return deals.filter(Boolean);
}

// Vários termos caem na mesma categoria ("fone bluetooth", "fone tws"...): guarda as respostas por 30 min.
const CACHE_MS = 30 * 60 * 1000;
const cache = new Map();
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 5000) for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_MS) cache.delete(k);
  return value;
}

// Anúncio mais barato do produto que tenha preço anterior (riscado) informado pelo Mercado Livre.
async function dealFor(productId, token) {
  const items = await apiGet(`/products/${productId}/items`, token);
  if (items.status !== 200) return null;
  const best = (items.data.results || [])
    .filter(i => i.price > 0 && i.original_price > i.price && i.currency_id === 'BRL' && i.condition !== 'used')
    .sort((a, b) => a.price - b.price)[0];
  if (!best) return null;
  const prod = await apiGet(`/products/${productId}`, token);
  if (prod.status !== 200 || !prod.data.name) return null;
  const num = String(best.item_id).replace(/^MLB/i, '');
  return {
    store_product_id: best.item_id,
    produto: prod.data.name,
    preco_atual: best.price,
    preco_anterior: best.original_price,
    imagem: (prod.data.pictures?.[0]?.url || '').replace(/^http:/, 'https:') || null,
    original_url: `https://produto.mercadolivre.com.br/MLB-${num}`,
  };
}

function idFromUrl(url) {
  const m = String(url).match(/(MLB)-?(\d{6,})/i);
  return m ? `MLB${m[2]}` : null;
}

function parseHtml(html) {
  const $ = cheerio.load(html);
  const deals = [];
  $('.poly-card, .ui-search-layout__item').each((_, el) => {
    const card = $(el);
    const titleEl = card.find('.poly-component__title, .poly-component__title-wrapper a, .ui-search-item__title').first();
    const title = titleEl.text().trim();
    const link = card.find('a.poly-component__title, .poly-component__title-wrapper a, a.ui-search-link, a[href*="MLB"]').first().attr('href');

    const prev = card.find('s.andes-money-amount--previous, .andes-money-amount--previous').first();
    const curr = card.find('.poly-price__current .andes-money-amount').first();
    const toNumber = node => {
      const frac = node.find('.andes-money-amount__fraction').first().text();
      const cents = node.find('.andes-money-amount__cents').first().text();
      return parseBRL(cents ? `${frac},${cents}` : frac);
    };
    const current = toNumber(curr);
    const previous = toNumber(prev);
    const img = card.find('img').attr('data-src') || card.find('img').attr('src');
    const id = link && idFromUrl(link);

    if (!title || !link || !id || !current || !previous) return;
    deals.push({
      store_product_id: id,
      produto: title,
      preco_atual: current,
      preco_anterior: previous,
      imagem: img && !img.startsWith('data:') ? img : null,
      original_url: link.split('#')[0].split('?')[0],
    });
  });
  return deals;
}

function isBlocked(res) {
  const html = String(res.data || '');
  const finalUrl = res.request?.res?.responseUrl || '';
  return /suspicious-traffic|account-verification/i.test(finalUrl + html.slice(0, 5000));
}

async function searchHtml(query) {
  const slug = query.trim().toLowerCase().replace(/\s+/g, '-');
  const res = await http.get(`https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}`, { validateStatus: () => true });
  if (isBlocked(res)) {
    return { status: 'blocked', message: 'O Mercado Livre exigiu verificação anti-robô para este IP. Configure a API oficial no painel.', deals: [] };
  }
  if (res.status >= 400) return { status: 'error', message: `HTTP ${res.status}`, deals: [] };
  return { status: 'ok', deals: parseHtml(String(res.data)) };
}

async function search(query, s) {
  if (s.ml_client_id && s.ml_client_secret) {
    try {
      return { status: 'ok', deals: await searchApi(query, s), message: 'via API oficial' };
    } catch (err) {
      const fallback = await searchHtml(query);
      fallback.message = `API oficial falhou: ${err.message}. ${fallback.message || ''}`.trim();
      return fallback;
    }
  }
  return searchHtml(query);
}

module.exports = {
  id: 'mercadolivre',
  name: 'Mercado Livre',
  method: 'API oficial (catálogo por palavra + mais vendidos com desconto) ou leitura da busca pública',
  automatic: true,
  isReady: () => ({ ready: true }),
  search,
  affiliateLink(offer, s) {
    const url = new URL(offer.original_url);
    url.search = '';
    if (s.ml_matt_word) url.searchParams.set('matt_word', s.ml_matt_word.trim());
    if (s.ml_matt_tool) url.searchParams.set('matt_tool', s.ml_matt_tool.trim());
    return url.toString();
  },
  matchesUrl: url => /mercadoli(vre|bre)\.com/i.test(url),
  productIdFromUrl: idFromUrl,
};
