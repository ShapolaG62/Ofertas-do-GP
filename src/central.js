// Central: reúne numa guia só as áreas que a pessoa pode usar (ofertas, afiliado, loja, equipe, painel do administrador).
const auth = require('./auth');
const users = require('./users');
const clientes = require('./clientes');
const access = require('./access');

const ABAS_DA_LOJA = ['painel', 'loja', 'anuncios', 'vendas'];

function areas(req) {
  const lista = [];
  const admin = auth.isLoggedIn(req);
  const u = users.currentUser(req);
  const ativo = u && u.status === 'active' ? u : null;
  if (access.canSeeOffers(req)) lista.push({ id: 'ofertas', nome: 'Ofertas', inicio: '/' });
  if (clientes.atual(req)) lista.push({ id: 'afiliado', nome: 'Afiliado', inicio: '/cliente' });
  if (ativo?.tipo === 'empresa') lista.push({ id: 'loja', nome: 'Minha loja', inicio: '/conta?aba=painel' });
  if (ativo && !(ativo.tipo === 'afiliado' && ativo.cliente_id)) lista.push({ id: 'conta', nome: 'Minha conta', inicio: '/conta?aba=meuperfil' });
  if (!admin && ativo) {
    const cargos = require('./cargos');
    if (cargos.de(`u:${ativo.id}`).permissoes.length) lista.push({ id: 'equipe', nome: 'Equipe', inicio: '/trabalho' });
  }
  if (admin) lista.push({ id: 'admin', nome: 'Painel admin', inicio: '/admin' });
  return lista;
}

// Só quem tem uma área de trabalho usa a central; quem apenas compra continua no site normal.
const temTrabalho = lista => lista.some(a => ['afiliado', 'loja', 'equipe', 'admin'].includes(a.id));

const PAGINAS = /^\/($|admin\/?$|cliente\/?$|conta\/?$|postagens\/?$|ajuda\/?$|cosmeticos\/?$|trabalho\/?$|perfil(\/|$)|loja\/|anuncio\/)/;

// Abrir uma dessas páginas direto na barra de endereço leva para a central. Dentro de um quadro o navegador
// manda "Sec-Fetch-Dest: iframe", então isso nunca entra em repetição. O app instalado continua como está.
function redirecionar(req, res, next) {
  if (req.method !== 'GET' || req.headers['sec-fetch-dest'] !== 'document' || !PAGINAS.test(req.path)) return next();
  if (req.query.embed || req.query.voltar || req.query.erro || /OfertouApp/.test(req.headers['user-agent'] || '')) return next();
  const lista = areas(req);
  if (!temTrabalho(lista)) return next();
  // Sem conta do site, /conta é a tela de login: ela precisa da guia inteira (login com Google não abre em quadro)
  if (/^\/conta/.test(req.path) && !lista.some(a => a.id === 'conta' || a.id === 'loja')) return next();
  res.redirect(`/central?p=${encodeURIComponent(req.originalUrl)}`);
}

module.exports = { areas, temTrabalho, redirecionar, ABAS_DA_LOJA };
