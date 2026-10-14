// Importação automática de produtos com desconto a partir do link da loja de uma empresa.
// Formatos aceitos (detectados sozinhos):
//  - Shopify:      https://minhaloja.com.br               (usa /products.json, campo "compare_at_price")
//  - WooCommerce:  https://minhaloja.com.br               (usa a Store API pública, só itens em promoção)
//  - Feed XML:     https://minhaloja.com.br/feed.xml      (padrão Google Shopping: g:price + g:sale_price)
// Só entram produtos em que a PRÓPRIA loja informa preço normal maior que o promocional.
const cheerio = require('cheerio');
const { safeGet } = require('./net');
const { parseBRL, round2 } = require('./util');

const MAX_ITEMS = 300;

function cleanText(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const notBRL = moeda => Object.assign(
  new Error(`Os preços desta loja estão em ${moeda}. Só aceitamos lojas com preços em reais (BRL).`), { currency: true }
);

async function tryShopify(origin) {
  const res = await safeGet(`${origin}/products.json?limit=250`, { headers: { Accept: 'application/json' } });
  if (res.status !== 200 || !Array.isArray(res.data?.products)) return null;
  const meta = await safeGet(`${origin}/meta.json`, { headers: { Accept: 'application/json' } }).catch(() => null);
  const moeda = meta?.data?.currency;
  if (moeda && moeda !== 'BRL') throw notBRL(moeda);
  const items = [];
  for (const p of res.data.products) {
    const v = (p.variants || []).find(x => Number(x.compare_at_price) > Number(x.price) && x.available !== false);
    if (!v) continue;
    items.push({
      id: `${p.id}`,
      titulo: cleanText(p.title),
      url: `${origin}/products/${p.handle}`,
      imagem: p.images?.[0]?.src || null,
      preco: Number(v.price),
      preco_anterior: Number(v.compare_at_price),
    });
  }
  return { tipo: 'shopify', items };
}

async function tryWoo(origin) {
  const items = [];
  for (let page = 1; page <= 3; page++) {
    const res = await safeGet(`${origin}/wp-json/wc/store/v1/products?on_sale=true&per_page=100&page=${page}`,
      { headers: { Accept: 'application/json' } });
    if (res.status !== 200 || !Array.isArray(res.data)) return page === 1 ? null : { tipo: 'woocommerce', items };
    for (const p of res.data) {
      const pr = p.prices || {};
      if (pr.currency_code && pr.currency_code !== 'BRL') throw notBRL(pr.currency_code);
      const div = 10 ** Number(pr.currency_minor_unit ?? 2);
      const preco = Number(pr.sale_price || pr.price) / div;
      const anterior = Number(pr.regular_price) / div;
      if (!(anterior > preco) || p.is_in_stock === false) continue;
      items.push({
        id: `${p.id}`,
        titulo: cleanText(p.name),
        url: p.permalink,
        imagem: p.images?.[0]?.src || null,
        preco, preco_anterior: anterior,
      });
    }
    if (res.data.length < 100) break;
  }
  return { tipo: 'woocommerce', items };
}

async function tryXml(url) {
  const res = await safeGet(url, { headers: { Accept: 'application/xml,text/xml,*/*' }, responseType: 'text' });
  if (res.status !== 200) return null;
  const xml = String(res.data || '');
  if (!/<(rss|feed|channel)\b/i.test(xml.slice(0, 2000))) return null;
  const $ = cheerio.load(xml, { xmlMode: true });
  const pick = (el, ...names) => {
    for (const n of names) {
      const t = $(el).find(n.replace(':', '\\:')).first();
      if (t.length) return (n === 'link' && t.attr('href')) ? t.attr('href') : t.text().trim();
    }
    return '';
  };
  const items = [];
  $('item, entry').each((_, el) => {
    const avail = pick(el, 'g:availability').toLowerCase();
    if (avail && /out|fora|sem estoque/.test(avail)) return;
    const moeda = (pick(el, 'g:price').match(/\b([A-Z]{3})\b/) || [])[1];
    if (moeda && moeda !== 'BRL') throw notBRL(moeda);
    const preco = parseBRL(pick(el, 'g:sale_price').replace(/[A-Z]{3}/g, '').trim().replace(/\.(\d{2})$/, ',$1'));
    const anterior = parseBRL(pick(el, 'g:price').replace(/[A-Z]{3}/g, '').trim().replace(/\.(\d{2})$/, ',$1'));
    if (!(anterior > preco)) return;
    items.push({
      id: pick(el, 'g:id', 'id', 'guid') || pick(el, 'g:link', 'link'),
      titulo: cleanText(pick(el, 'g:title', 'title')),
      url: pick(el, 'g:link', 'link'),
      imagem: pick(el, 'g:image_link') || null,
      preco, preco_anterior: anterior,
    });
  });
  return { tipo: 'feed_xml', items };
}

// Descobre o formato e devolve os produtos com desconto.
async function fetchStoreFeed(rawUrl) {
  const url = new URL(rawUrl);
  const origin = url.origin;
  const looksLikeFeed = /\.xml$|feed|rss|google|merchant/i.test(url.pathname + url.search);
  const attempts = looksLikeFeed
    ? [() => tryXml(url.href), () => tryShopify(origin), () => tryWoo(origin)]
    : [() => tryShopify(origin), () => tryWoo(origin), () => tryXml(url.href)];
  for (const attempt of attempts) {
    try {
      const r = await attempt();
      if (r) {
        r.items = r.items
          .filter(i => i.titulo && i.url && /^https?:\/\//i.test(i.url))
          .map(i => ({ ...i, preco: round2(i.preco), preco_anterior: round2(i.preco_anterior) }))
          .slice(0, MAX_ITEMS);
        return r;
      }
    } catch (err) {
      if (err.currency || /não permitido|inválido|Porta/.test(err.message)) throw err;
    }
  }
  throw new Error('Não reconheci a loja neste link. Use o endereço de uma loja Shopify ou WooCommerce, ou o link de um feed XML (Google Shopping).');
}

module.exports = { fetchStoreFeed };
