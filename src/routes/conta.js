// API das contas de usuários do site (consumidor e empresa), login com Google, anúncios e lojas públicas.
const express = require('express');
const db = require('../db');
const users = require('../users');
const auth = require('../auth');
const lojas = require('../lojas');
const anuncios = require('../anuncios');
const google = require('../google');
const cadastro = require('../cadastro');
const settings = require('../settings');
const { CATEGORIES } = require('../categorize');
const { createLimiter } = require('../ratelimit');

const router = express.Router();
const loginLimiter = createLimiter(8, 15);    // 8 tentativas por 15 min por IP
const signupLimiter = createLimiter(5, 60);   // 5 contas novas por hora por IP
const syncLimiter = createLimiter(6, 60);     // 6 sincronizações manuais por hora por loja
const uploadLimiter = createLimiter(60, 60);  // 60 fotos por hora por usuário

const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message, ...(err.reativar ? { reativar: err.reativar } : {}) });

// Informações para as telas de login, primeiro acesso e criador de anúncios.
router.get('/api/conta/cadastro-info', (req, res) => {
  res.json({
    consumidor: users.signupMode('consumidor'),
    empresa: users.signupMode('empresa'),
    afiliado: users.signupMode('afiliado'),
    google: google.isEnabled(),
    exigir_login: settings.get('exigir_login') !== '0',
    ufs: cadastro.UFS,
    ramos: cadastro.RAMOS,
    idade_minima: cadastro.IDADE_MINIMA,
    categorias: CATEGORIES,
    condicoes: anuncios.CONDICOES,
    fretes: anuncios.FRETES,
    max_fotos: anuncios.MAX_IMAGES,
  });
});

// ── Login com Google ─────────────────────────────────────────────────────────
// Para onde voltar depois do Google (só a página de assinatura de um plano).
const VOLTAR_COOKIE = 'gp_voltar';
const voltarValido = v => (/^\/assinar\?plano=[a-z]{2,20}$/.test(String(v || '')) ? String(v) : null);
const voltarCookie = (valor, maxAge) => `${VOLTAR_COOKIE}=${encodeURIComponent(valor)}; Path=/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

router.get('/auth/google', (req, res) => {
  const voltar = voltarValido(req.query.voltar);
  if (!google.isEnabled()) return res.redirect((voltar || '/conta') + (voltar ? '&' : '?') + 'erro=' + encodeURIComponent('Login com Google não está disponível.'));
  const url = google.startUrl(req, res);
  if (voltar) res.append('Set-Cookie', voltarCookie(voltar, 600));
  res.redirect(url);
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    const profile = await google.finish(req, res);
    const u = users.loginWithGoogle(profile);
    users.createSession(req, res, u.id); // com o plano vencido, a sessão é curta e só serve para reativar
    if (users.planoVencido(u)) {
      res.append('Set-Cookie', voltarCookie('', 0));
      return res.redirect(`${users.erroPlanoVencido(u).reativar}&vencido=1`);
    }
    // Veio da página de um plano: volta para concluir a compra já logado.
    const voltar = voltarValido(decodeURIComponent(auth.parseCookies(req.headers.cookie)[VOLTAR_COOKIE] || ''));
    if (voltar) {
      res.append('Set-Cookie', voltarCookie('', 0));
      return res.redirect(voltar);
    }
    // Conta liberada vai direto para as ofertas (afiliado, para o painel); as demais vão para /conta (perfil ou aprovação).
    if (u.status === 'active' && u.tipo === 'afiliado') return res.redirect('/cliente');
    res.redirect(u.status === 'active' ? '/' : '/conta');
  } catch (err) {
    res.redirect('/conta?erro=' + encodeURIComponent(err.message));
  }
});

// ── E-mail e senha ───────────────────────────────────────────────────────────
router.post('/api/conta/cadastro', (req, res) => {
  const wait = signupLimiter.hit(req.ip);
  if (wait) return res.status(429).json({ error: `Muitos cadastros deste endereço. Tente de novo em ${wait} min.` });
  try {
    const u = users.register(req.body || {});
    users.createSession(req, res, u.id);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

router.post('/api/conta/entrar', (req, res) => {
  const wait = loginLimiter.hit(req.ip);
  if (wait) return res.status(429).json({ error: `Muitas tentativas. Tente de novo em ${wait} min.` });
  // Usuário "admin": entra com a senha do painel (a mesma já configurada) e recebe a sessão de administrador.
  if (String(req.body?.email || '').trim().toLowerCase() === 'admin') {
    const locked = auth.checkRateLimit(req.ip);
    if (locked) return res.status(429).json({ error: `Muitas tentativas. Tente de novo em ${locked} min.` });
    const stored = settings.get('admin_password_hash');
    if (!stored) {
      return res.status(400).json({ error: 'A senha do administrador ainda não foi criada. Abra /admin no computador do servidor para criá-la.' });
    }
    if (!auth.verifyPassword(String(req.body?.senha || ''), stored)) {
      auth.registerFailure(req.ip);
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }
    auth.clearFailures(req.ip);
    loginLimiter.reset(req.ip);
    auth.createSession(req, res);
    return res.json({ ok: true, admin: true });
  }
  try {
    const u = users.login(req.body?.email, req.body?.senha);
    loginLimiter.reset(req.ip);
    users.createSession(req, res, u.id);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

router.post('/api/conta/sair', (req, res) => {
  users.destroySession(req, res);
  res.json({ ok: true });
});

// Sessão atual (não exige login: responde user null quando ninguém está logado).
router.get('/api/conta/me', (req, res) => {
  const u = users.currentUser(req);
  if (!u) return res.json({ user: null, admin: auth.isLoggedIn(req) });
  res.json({ user: users.publicUser(u), loja: u.tipo === 'empresa' ? lojas.getByUser(u.id) : null });
});

router.use('/api/conta', users.requireUser);

// Primeiro acesso: escolha do perfil + dados cadastrais.
router.post('/api/conta/perfil-inicial', (req, res) => {
  try {
    const u = users.completeProfile(req.user, req.body || {});
    res.json({ ok: true, status: u.status });
  } catch (err) { sendError(res, err); }
});

router.post('/api/conta/senha', (req, res) => {
  try {
    users.changePassword(req.user, req.body?.atual, req.body?.nova);
    users.createSession(req, res, req.user.id);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

router.post('/api/conta/excluir', (req, res) => {
  try {
    users.deleteOwnAccount(req.user, req.body || {});
    users.destroySession(req, res);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// Daqui para baixo: só contas com perfil definido e liberadas.
router.use('/api/conta', users.requireActive);

router.put('/api/conta/perfil', (req, res) => {
  try { users.updateProfile(req.user, req.body || {}); res.json({ ok: true }); } catch (err) { sendError(res, err); }
});

// ── Loja (somente empresas) ──────────────────────────────────────────────────
router.put('/api/conta/loja', (req, res) => {
  try { res.json({ ok: true, loja: lojas.saveLoja(req.user, req.body || {}) }); } catch (err) { sendError(res, err); }
});

router.get('/api/conta/produtos', (req, res) => {
  const loja = lojas.getByUser(req.user.id);
  res.json(loja ? lojas.listProducts(loja.id) : []);
});

router.delete('/api/conta/produtos/:id', (req, res) => {
  try { lojas.deleteProduct(req.user, Number(req.params.id)); res.json({ ok: true }); } catch (err) { sendError(res, err); }
});

// Fotos dos anúncios: corpo binário (image/jpeg, image/png ou image/webp), até 3 MB.
router.post('/api/conta/upload',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }),
  (req, res) => {
    if (req.user.tipo !== 'empresa') return res.status(403).json({ error: 'Somente empresas enviam fotos.' });
    const wait = uploadLimiter.hit(`u:${req.user.id}`);
    if (wait) return res.status(429).json({ error: `Muitas fotos enviadas. Tente de novo em ${wait} min.` });
    try { res.json({ ok: true, url: anuncios.saveUpload(req.body) }); } catch (err) { sendError(res, err); }
  });

router.get('/api/conta/anuncios/:id', (req, res) => {
  try { res.json(anuncios.getOwnAd(req.user, Number(req.params.id))); } catch (err) { sendError(res, err); }
});

router.post('/api/conta/anuncios', (req, res) => {
  try { res.json({ ok: true, id: anuncios.saveAd(req.user, req.body || {}) }); } catch (err) { sendError(res, err); }
});

router.put('/api/conta/anuncios/:id', (req, res) => {
  try { res.json({ ok: true, id: anuncios.saveAd(req.user, req.body || {}, Number(req.params.id)) }); } catch (err) { sendError(res, err); }
});

router.put('/api/conta/feed', (req, res) => {
  try { res.json({ ok: true, loja: lojas.setFeed(req.user, req.body?.feed_url) }); } catch (err) { sendError(res, err); }
});

router.post('/api/conta/feed/sincronizar', async (req, res) => {
  const loja = lojas.getByUser(req.user.id);
  if (!loja?.feed_url) return res.status(400).json({ error: 'Configure o link da sua loja primeiro.' });
  if (req.user.bloqueio_publicacao) return res.status(403).json({ error: 'Sua conta está impedida de publicar.' });
  const wait = syncLimiter.hit(`loja:${loja.id}`);
  if (wait) return res.status(429).json({ error: `Aguarde ${wait} min para sincronizar de novo.` });
  try {
    const r = await lojas.syncFeed(loja.id);
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ ok: true, ...r });
  } catch (err) { sendError(res, err); }
});

// ── Páginas públicas ─────────────────────────────────────────────────────────
router.get('/api/lojas/:slug', (req, res) => {
  const data = lojas.publicStore(String(req.params.slug));
  if (!data) return res.status(404).json({ error: 'Loja não encontrada.' });
  // Pedidos pelo site (formas de pagamento da loja) e o perfil do dono (para conversa pessoal)
  const l = db.get('SELECT * FROM lojas WHERE id = ?', data.loja.id);
  const perfil = db.get('SELECT slug FROM perfis WHERE dono = ? AND oculto = 0', `u:${l.user_id}`);
  res.json({ ...data, pedidos: require('../pedidos-loja').publicoLoja(l), perfil_slug: perfil?.slug || null });
});

router.get('/api/anuncios/:id', (req, res) => {
  const ad = anuncios.publicAd(Number(req.params.id));
  if (!ad) return res.status(404).json({ error: 'Anúncio não encontrado ou encerrado.' });
  const l = db.get('SELECT * FROM lojas WHERE slug = ?', ad.loja_slug);
  res.json({ ...ad, loja_id: l?.id, pedidos: l ? require('../pedidos-loja').publicoLoja(l) : null });
});

module.exports = router;
