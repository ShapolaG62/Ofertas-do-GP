// Lojas sem fonte automática confiável hoje: bloqueiam leitura por robôs e não oferecem API pública de produtos.
// As ofertas delas entram pelo painel (cadastro manual com os dados copiados da página da loja).
const MANUAL_REASON = 'Esta loja bloqueia leitura automática e não tem API pública de produtos. Cadastre as ofertas pelo painel.';

const magalu = {
  id: 'magalu',
  name: 'Magalu',
  method: 'Cadastro manual pelo painel',
  automatic: false,
  isReady: () => ({ ready: false, reason: MANUAL_REASON }),
  // Magazine Você: https://www.magazinevoce.com.br/magazine<loja>/<slug>/p/<sku>/...
  affiliateLink(offer, s) {
    const store = (s.magalu_store || '').trim().replace(/^magazine/i, '');
    const m = String(offer.original_url).match(/magazineluiza\.com\.br\/(.+)$/i);
    return store && m ? `https://www.magazinevoce.com.br/magazine${store}/${m[1]}` : offer.original_url;
  },
  matchesUrl: url => /magazineluiza\.com\.br|magazinevoce\.com\.br|magalu\./i.test(url),
  productIdFromUrl: url => (String(url).match(/\/p\/([a-z0-9]+)/i) || [])[1] || null,
};

const shein = {
  id: 'shein',
  name: 'Shein',
  method: 'Cadastro manual pelo painel',
  automatic: false,
  isReady: () => ({ ready: false, reason: MANUAL_REASON }),
  affiliateLink: offer => offer.original_url,
  matchesUrl: url => /shein\.com/i.test(url),
  productIdFromUrl: url => (String(url).match(/-p-(\d+)/) || [])[1] || null,
};

const temu = {
  id: 'temu',
  name: 'Temu',
  method: 'Cadastro manual pelo painel',
  automatic: false,
  isReady: () => ({ ready: false, reason: MANUAL_REASON }),
  affiliateLink: offer => offer.original_url,
  matchesUrl: url => /temu\.com/i.test(url),
  productIdFromUrl: url => (String(url).match(/-g-(\d+)/) || String(url).match(/goods_id=(\d+)/) || [])[1] || null,
};

module.exports = { magalu, shein, temu };
