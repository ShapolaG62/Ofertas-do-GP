// Shopee — somente pela API oficial do programa Shopee Afiliados (affiliate.shopee.com.br > Open API).
// A Shopee bloqueia a leitura do site por robôs, então sem App ID + Senha da API não há coleta automática.
const crypto = require('crypto');
const { http, round2 } = require('../util');

const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';

async function search(query, s) {
  const gql = `{ productOfferV2(keyword: ${JSON.stringify(query)}, page: 1, limit: 50) {
    nodes { itemId productName priceMin priceMax priceDiscountRate imageUrl productLink offerLink }
  } }`;
  const payload = JSON.stringify({ query: gql });
  const ts = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha256')
    .update(`${s.shopee_app_id}${ts}${payload}${s.shopee_app_secret}`)
    .digest('hex');

  const res = await http.post(ENDPOINT, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${s.shopee_app_id}, Timestamp=${ts}, Signature=${signature}`,
    },
    validateStatus: () => true,
  });
  const data = res.data || {};
  if (data.errors?.length) {
    return { status: 'error', message: `API Shopee: ${data.errors[0].message}`, deals: [] };
  }
  const nodes = data.data?.productOfferV2?.nodes || [];
  const deals = [];
  for (const n of nodes) {
    const price = Number(n.priceMin);
    const rate = Number(n.priceDiscountRate);
    // A Shopee informa o preço atual e o percentual de desconto anunciado; o preço "de" é derivado deles.
    if (!price || !rate || rate <= 0 || rate >= 100) continue;
    deals.push({
      store_product_id: String(n.itemId),
      produto: n.productName,
      preco_atual: price,
      preco_anterior: round2(price / (1 - rate / 100)),
      imagem: n.imageUrl,
      original_url: n.productLink,
      affiliate_url: n.offerLink || null,
    });
  }
  return { status: 'ok', deals, message: 'via API de afiliados' };
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
  id: 'shopee',
  name: 'Shopee',
  method: 'API oficial Shopee Afiliados',
  automatic: true,
  isReady: s => (s.shopee_app_id && s.shopee_app_secret)
    ? { ready: true }
    : { ready: false, reason: 'Informe o App ID e a Senha da API do Shopee Afiliados no painel.' },
  search,
  affiliateLink: offer => offer.original_url,
  matchesUrl: url => /shopee\.com\.br|shp\.ee/i.test(url),
  productIdFromUrl: url => {
    const m = String(url).match(/i\.(\d+)\.(\d+)/) || String(url).match(/product\/(\d+)\/(\d+)/);
    return m ? `${m[1]}.${m[2]}` : null;
  },
};
