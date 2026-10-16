// Magalu — busca pela loja do afiliado no Magazine Você (www.magazinevoce.com.br/magazine<loja>/busca/<termo>/).
// O site principal (magazineluiza.com.br) bloqueia leitura automática (HTTP 403) e não é usado.
// A página de busca da loja Magazine Você traz os produtos no JSON da própria página (__NEXT_DATA__).
// Só a primeira página de cada busca, sem parâmetros na URL (o robots.txt do Magazine Você proíbe busca com "?").
// Preço igual ao que a loja exibe: "De" = preço riscado (price), "Por" = preço à vista no Pix (bestPrice).
const { http } = require('../util');

const VOCE = 'https://www.magazinevoce.com.br';
const SITE = 'https://www.magazineluiza.com.br';

const lojaDe = s => String(s?.magalu_store || '').trim().toLowerCase().replace(/^https?:\/\/[^/]+\//, '').replace(/\/.*$/, '').replace(/^magazine/, '');

function parse(produtos) {
  const deals = [];
  for (const p of produtos || []) {
    const pr = p.price || {};
    const atual = Number(pr.bestPrice || pr.fullPrice) || 0;
    const anterior = Number(pr.price) || 0;
    if (!p.id || !p.title || p.available === false || !(atual > 0) || !(anterior > atual)) continue;
    // Caminho do produto sem o nome da loja: vira o link da Magalu (e o link de afiliado é montado a partir dele).
    const caminho = String(p.path || p.url || '').replace(/^\/magazine[^/]+\//, '/');
    if (!/\/p\/[a-z0-9]+/i.test(caminho)) continue;
    deals.push({
      store_product_id: String(p.variationId || p.id),
      produto: String(p.title).trim(),
      preco_atual: atual,
      preco_anterior: anterior,
      imagem: /^https:\/\//.test(p.image || '') ? p.image.replace('{w}x{h}', '800x800') : null,
      original_url: `${SITE}${caminho}`,
    });
  }
  return deals;
}

async function search(query, s) {
  const loja = lojaDe(s);
  if (!loja) return { status: 'error', message: 'Informe o nome da sua loja Magazine Você no painel (Afiliados → Magalu).', deals: [] };
  const termo = encodeURIComponent(String(query).trim().toLowerCase()).replace(/%20/g, '+');
  const res = await http.get(`${VOCE}/magazine${loja}/busca/${termo}/`, { validateStatus: () => true, timeout: 25000 });
  if (res.status === 403 || res.status === 429) {
    return { status: 'blocked', message: `O Magazine Você recusou a busca (HTTP ${res.status}): possível bloqueio do IP.`, deals: [] };
  }
  if (res.status === 404) return { status: 'error', message: 'Loja Magazine Você não encontrada: confira o nome da loja no painel.', deals: [] };
  if (res.status >= 400) return { status: 'error', message: `HTTP ${res.status}`, deals: [] };
  const m = String(res.data || '').match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return { status: 'error', message: 'A página da loja mudou de formato (sem dados de produtos).', deals: [] };
  let produtos;
  try { produtos = JSON.parse(m[1])?.props?.pageProps?.data?.search?.products; } catch { produtos = null; }
  if (!Array.isArray(produtos)) return { status: 'ok', deals: [] }; // busca sem resultados
  return { status: 'ok', deals: parse(produtos) };
}

module.exports = {
  id: 'magalu',
  name: 'Magalu',
  method: 'Busca na sua loja Magazine Você',
  automatic: true,
  isReady: s => (lojaDe(s)
    ? { ready: true }
    : { ready: false, reason: 'Informe o nome da sua loja Magazine Você (ex.: magazinesualoja) em Afiliados → Magalu.' }),
  search,
  // Magazine Você: https://www.magazinevoce.com.br/magazine<loja>/<slug>/p/<sku>/...
  affiliateLink(offer, s) {
    const loja = lojaDe(s);
    const m = String(offer.original_url).match(/magazineluiza\.com\.br\/(.+)$/i);
    return loja && m ? `${VOCE}/magazine${loja}/${m[1]}` : offer.original_url;
  },
  matchesUrl: url => /magazineluiza\.com\.br|magazinevoce\.com\.br|magalu\./i.test(url),
  productIdFromUrl: url => (String(url).match(/\/p\/([a-z0-9]+)/i) || [])[1] || null,
  parse,
};
