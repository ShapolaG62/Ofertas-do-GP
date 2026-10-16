// Controle de acesso ao site: com "exigir login" ligado (padrão), só contas liberadas e o administrador
// veem as ofertas. Os demais são levados para a tela de login (/conta).
const settings = require('./settings');
const auth = require('./auth');
const users = require('./users');

const loginRequired = () => settings.get('exigir_login') !== '0';

// Páginas de ofertas (a tela de login, os termos e o painel ficam sempre abertos).
const isOffersPage = p => p === '/' || /^\/(index|loja|anuncio)\.html$/.test(p) || /^\/(loja|anuncio)\//.test(p);

// Rotas da API que entregam ofertas, lojas e anúncios.
const isOffersApi = p => /^\/api\/(offers|featured|stats|price-history|lojas|anuncios|vitrine)(\/|$)/.test(p);

function canSeeOffers(req) {
  if (!loginRequired() || auth.isLoggedIn(req)) return true;
  const u = users.currentUser(req);
  return Boolean(u && u.status === 'active');
}

// Middleware: bloqueia páginas e APIs de ofertas para quem não tem acesso.
function guard(req, res, next) {
  if (req.method !== 'GET') return next();
  const page = isOffersPage(req.path);
  if (!page && !isOffersApi(req.path)) return next();
  if (canSeeOffers(req)) return next();
  if (!page) return res.status(401).json({ error: 'Entre na sua conta para ver as ofertas.' });
  // Volta para a página pedida depois do login
  const destino = req.path === '/' ? '' : `?voltar=${encodeURIComponent(req.originalUrl)}`;
  res.redirect(`/conta${destino}`);
}

module.exports = { guard, canSeeOffers, loginRequired };
