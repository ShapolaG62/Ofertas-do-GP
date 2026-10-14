// Amazon Brasil — lê a página pública de resultados de busca.
// Só aceita produtos que mostram o preço anterior riscado pela própria Amazon.
const cheerio = require('cheerio');
const { http, parseBRL } = require('../util');

const BASE = 'https://www.amazon.com.br';

function parse(html) {
  const $ = cheerio.load(html);
  const deals = [];
  $('[data-component-type="s-search-result"][data-asin]').each((_, el) => {
    const card = $(el);
    const asin = card.attr('data-asin');
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) return;

    // Em moda, a Amazon separa a marca ("Olympikus") e o nome do produto em dois títulos.
    const parts = card.find('h2').map((__, h) => ($(h).attr('aria-label') || $(h).text() || '')
      .replace(/^an[úu]ncio patrocinado\s*[–-]\s*/i, '').replace(/\s+/g, ' ').trim()).get().filter(Boolean);
    let title = parts.reduce((a, b) => (b.length > a.length ? b : a), '');
    const brand = parts.find(p => p !== title && p.length <= 40);
    if (brand && !title.toLowerCase().includes(brand.toLowerCase())) title = `${brand} ${title}`;
    const current = parseBRL(card.find('.a-price:not(.a-text-price) .a-offscreen').first().text());
    const previous = parseBRL(card.find('.a-price.a-text-price .a-offscreen').first().text());
    const img = card.find('img.s-image').attr('src');

    if (!title || !current || !previous) return;
    deals.push({
      store_product_id: asin,
      produto: title,
      preco_atual: current,
      preco_anterior: previous,
      imagem: img || null,
      original_url: `${BASE}/dp/${asin}`,
    });
  });
  return deals;
}

async function search(query) {
  const url = `${BASE}/s?k=${encodeURIComponent(query)}`;
  const res = await http.get(url, { validateStatus: () => true });
  const html = String(res.data || '');
  const challenged = /validateCaptcha|captcha|bm-verify|_sec\/verify/i.test(html.slice(0, 20000));
  if (res.status === 503 || (challenged && !html.includes('s-search-result'))) {
    return { status: 'blocked', message: 'A Amazon pediu verificação anti-robô para este IP. Reduza a frequência da mineração ou use a API oficial de associados.', deals: [] };
  }
  if (res.status >= 400) return { status: 'error', message: `HTTP ${res.status}`, deals: [] };
  return { status: 'ok', deals: parse(html) };
}

module.exports = {
  id: 'amazon',
  name: 'Amazon',
  method: 'Leitura da busca pública',
  automatic: true,
  isReady: () => ({ ready: true }),
  search,
  affiliateLink(offer, s) {
    const tag = (s.amazon_tag || '').trim();
    const base = `${BASE}/dp/${offer.store_product_id}`;
    return tag ? `${base}?tag=${encodeURIComponent(tag)}` : base;
  },
  matchesUrl: url => /amazon\.com\.br/i.test(url),
  productIdFromUrl: url => (url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i) || [])[1] || null,
};
