// Shopee — somente pela API oficial do programa Shopee Afiliados (affiliate.shopee.com.br > Open API).
// A Shopee bloqueia a leitura do site por robôs, então sem App ID + Senha da API não há coleta automática.
const crypto = require('crypto');
const { http, round2 } = require('../util');

const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';

// Cada termo pede 3 listas (relevância págs. 1 e 2 + mais vendidos), até 150 produtos: termos amplos
// como "infantil" ou "vestido" têm milhares de anúncios e só a 1ª página deixava muita oferta de fora.
const LISTAS = [{ sortType: 1, page: 1 }, { sortType: 1, page: 2 }, { sortType: 2, page: 1 }];

async function search(query, s) {
  const vistos = new Set();
  const deals = [];
  let erro = null, semPagina2 = false;
  for (const l of LISTAS) {
    if (l.page === 2 && semPagina2) continue; // poucos resultados: a 2ª página viria vazia
    let d;
    try {
      d = await gql(`{ productOfferV2(keyword: ${JSON.stringify(query)}, sortType: ${l.sortType}, page: ${l.page}, limit: 50) {
        nodes { itemId productName priceMin priceMax priceDiscountRate imageUrl productLink offerLink commissionRate sellerCommissionRate }
        pageInfo { hasNextPage }
      } }`, s);
    } catch (err) {
      erro = err.message;
      if (!deals.length && l === LISTAS[0]) return { status: 'error', message: erro, deals: [] };
      continue;
    }
    const nodes = d.productOfferV2?.nodes || [];
    for (const n of nodes) {
      const price = Number(n.priceMin);
      const rate = Number(n.priceDiscountRate);
      // A Shopee informa o preço atual e o percentual de desconto anunciado; o preço "de" é derivado deles.
      if (!price || !rate || rate <= 0 || rate >= 100 || vistos.has(String(n.itemId))) continue;
      vistos.add(String(n.itemId));
      deals.push({
        store_product_id: String(n.itemId),
        produto: n.productName,
        preco_atual: price,
        preco_anterior: round2(price / (1 - rate / 100)),
        imagem: n.imageUrl,
        original_url: n.productLink,
        affiliate_url: n.offerLink || null,
        // Comissão: commissionRate = total; sellerCommissionRate = a extra ("Comissão Xtra") paga pelo vendedor
        comissao_pct: n.commissionRate != null ? Number(n.commissionRate) * 100 : null,
        comissao_extra_pct: n.sellerCommissionRate != null ? Number(n.sellerCommissionRate) * 100 : null,
      });
    }
    if (l.page === 1 && !d.productOfferV2?.pageInfo?.hasNextPage) semPagina2 = true;
  }
  return { status: 'ok', deals, message: erro ? `via API de afiliados (aviso: ${erro})` : 'via API de afiliados' };
}

// Chamada assinada à API GraphQL do Shopee Afiliados.
async function gql(query, s) {
  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha256').update(`${s.shopee_app_id}${ts}${payload}${s.shopee_app_secret}`).digest('hex');
  const res = await http.post(ENDPOINT, payload, {
    headers: { 'Content-Type': 'application/json', Authorization: `SHA256 Credential=${s.shopee_app_id}, Timestamp=${ts}, Signature=${signature}` },
    validateStatus: () => true,
  });
  const data = res.data || {};
  if (data.errors?.length) throw new Error(`API Shopee: ${data.errors[0].message}`);
  return data.data || {};
}

// Link de comissão de um produto já minerado, com as chaves de afiliado informadas (usado pelos clientes).
async function gerarLink(url, s) {
  const d = await gql(`mutation { generateShortLink(input: { originUrl: ${JSON.stringify(url)}, subIds: [] }) { shortLink } }`, s);
  const link = d.generateShortLink?.shortLink;
  if (!link) throw new Error('a API da Shopee não devolveu o link');
  return link;
}

module.exports = {
  gerarLink,
  gql,
  id: 'shopee',
  name: 'Shopee',
  method: 'API oficial Shopee Afiliados (relevância + mais vendidos, até 150 por termo)',
  automatic: true,
  isReady: s => (s.shopee_app_id && s.shopee_app_secret)
    ? { ready: true }
    : { ready: false, reason: 'Informe o App ID e a Senha da API do Shopee Afiliados no painel.' },
  search,
  // Sem link da API: usa o ID de afiliado no mesmo formato dos links de afiliado da Shopee (utm_source=an_<ID>).
  affiliateLink(offer, s = {}) {
    const id = String(s.shopee_afiliado_id || '').trim();
    const url = String(offer.original_url || '');
    if (!/^\d{5,20}$/.test(id) || !/^https:\/\/([a-z0-9-]+\.)*shopee\.com\.br\//i.test(url)) return url;
    const u = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(k => u.searchParams.delete(k));
    u.searchParams.set('utm_source', `an_${id}`);
    u.searchParams.set('utm_medium', 'affiliates');
    u.searchParams.set('utm_campaign', 'ofertou');
    return u.href;
  },
  matchesUrl: url => /shopee\.com\.br|shp\.ee/i.test(url),
  productIdFromUrl: url => {
    const m = String(url).match(/i\.(\d+)\.(\d+)/) || String(url).match(/product\/(\d+)\/(\d+)/);
    return m ? `${m[1]}.${m[2]}` : null;
  },
};
