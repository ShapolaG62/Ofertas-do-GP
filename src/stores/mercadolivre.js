// Mercado Livre — duas fontes:
//  1) API oficial (se o App ID e a Chave secreta do Mercado Livre Developers estiverem no painel);
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

async function searchApi(query, s) {
  const token = await getToken(s);
  const res = await http.get(`${API}/sites/MLB/search`, {
    params: { q: query, limit: 50 },
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    validateStatus: () => true,
  });
  if (res.status !== 200) throw new Error(`busca recusada (${res.status}: ${res.data?.message || 'sem detalhes'})`);
  return (res.data.results || [])
    .filter(r => r.original_price && r.price && r.original_price > r.price)
    .map(r => ({
      store_product_id: r.id,
      produto: r.title,
      preco_atual: r.price,
      preco_anterior: r.original_price,
      imagem: (r.thumbnail || '').replace(/^http:/, 'https:').replace(/-I\.jpg$/, '-O.jpg'),
      original_url: r.permalink,
    }));
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
  method: 'API oficial (se configurada) ou leitura da busca pública',
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
