// API das contas de usuários do site (consumidor e empresa) e das páginas públicas de lojas.
const express = require('express');
const users = require('../users');
const lojas = require('../lojas');
const cadastro = require('../cadastro');
const { createLimiter } = require('../ratelimit');

const router = express.Router();
const loginLimiter = createLimiter(8, 15);    // 8 tentativas por 15 min por IP
const signupLimiter = createLimiter(5, 60);   // 5 cadastros por hora por IP
const syncLimiter = createLimiter(6, 60);     // 6 sincronizações manuais por hora por loja

const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message });

// Informa ao site como estão os cadastros (para mostrar "aguardando aprovação" ou "fechado").
router.get('/api/conta/cadastro-info', (req, res) => {
  res.json({
    consumidor: users.signupMode('consumidor'),
    empresa: users.signupMode('empresa'),
    ufs: cadastro.UFS,
    ramos: cadastro.RAMOS,
    idade_minima: cadastro.IDADE_MINIMA,
  });
});

router.post('/api/conta/cadastro', (req, res) => {
  const wait = signupLimiter.hit(req.ip);
  if (wait) return res.status(429).json({ error: `Muitos cadastros deste endereço. Tente de novo em ${wait} min.` });
  try {
    const u = users.register(req.body || {});
    if (u.status === 'active') {
      users.createSession(req, res, u.id);
      return res.json({ ok: true, status: 'active' });
    }
    res.json({ ok: true, status: 'pending' });
  } catch (err) { sendError(res, err); }
});

router.post('/api/conta/entrar', (req, res) => {
  const wait = loginLimiter.hit(req.ip);
  if (wait) return res.status(429).json({ error: `Muitas tentativas. Tente de novo em ${wait} min.` });
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

// Sessão atual (não exige login: responde null quando ninguém está logado).
router.get('/api/conta/me', (req, res) => {
  const u = users.currentUser(req);
  if (!u) return res.json({ user: null });
  res.json({ user: users.publicUser(u), loja: u.tipo === 'empresa' ? lojas.getByUser(u.id) : null });
});

router.use('/api/conta', users.requireUser);

router.put('/api/conta/perfil', (req, res) => {
  try { users.updateProfile(req.user, req.body || {}); res.json({ ok: true }); } catch (err) { sendError(res, err); }
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
    users.deleteOwnAccount(req.user, req.body?.senha);
    users.destroySession(req, res);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// ── Loja (somente empresas) ───────────────────────────────────────────────────
router.put('/api/conta/loja', (req, res) => {
  try { res.json({ ok: true, loja: lojas.saveLoja(req.user, req.body || {}) }); } catch (err) { sendError(res, err); }
});

router.get('/api/conta/produtos', (req, res) => {
  const loja = lojas.getByUser(req.user.id);
  res.json(loja ? lojas.listProducts(loja.id) : []);
});

router.post('/api/conta/produtos', (req, res) => {
  try { res.json({ ok: true, id: lojas.addProduct(req.user, req.body || {}) }); } catch (err) { sendError(res, err); }
});

router.delete('/api/conta/produtos/:id', (req, res) => {
  try { lojas.deleteProduct(req.user, Number(req.params.id)); res.json({ ok: true }); } catch (err) { sendError(res, err); }
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

// ── Páginas públicas das lojas ───────────────────────────────────────────────
router.get('/api/lojas/:slug', (req, res) => {
  const data = lojas.publicStore(String(req.params.slug));
  if (!data) return res.status(404).json({ error: 'Loja não encontrada.' });
  res.json(data);
});

module.exports = router;
