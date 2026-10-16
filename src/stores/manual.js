// Lojas sem fonte automática confiável hoje: bloqueiam leitura por robôs e não oferecem API pública de produtos.
// As ofertas delas entram pelo painel (cadastro manual com os dados copiados da página da loja).
const MANUAL_REASON = 'Esta loja bloqueia leitura automática e não tem API pública de produtos. Cadastre as ofertas pelo painel.';

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

module.exports = { shein, temu };
