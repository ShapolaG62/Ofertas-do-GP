const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const settings = require('../settings');
const offers = require('../offers');
const miner = require('../miner');
const users = require('../users');
const lojas = require('../lojas');
const { STORES, getStore, storeFromUrl } = require('../stores');
const { CATEGORIES } = require('../categorize');
const { parseBRL } = require('../util');

const router = express.Router();

// ── Sessão ────────────────────────────────────────────────────────────────────
router.get('/api/admin/session', (req, res) => {
  res.json({
    loggedIn: auth.isLoggedIn(req),
    needsSetup: !auth.hasPassword(),
    canSetup: !auth.hasPassword() && auth.isLocalRequest(req),
    minPassword: auth.MIN_PASSWORD,
  });
});

router.post('/api/admin/setup', (req, res) => {
  if (auth.hasPassword()) return res.status(409).json({ error: 'A senha já foi criada.' });
  if (!auth.isLocalRequest(req)) {
    return res.status(403).json({ error: 'Crie a senha acessando o painel no próprio computador do servidor, ou defina ADMIN_PASSWORD.' });
  }
  try {
    auth.setPassword(req.body?.password);
    auth.createSession(req, res);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/login', (req, res) => {
  const ip = req.ip;
  const locked = auth.checkRateLimit(ip);
  if (locked) return res.status(429).json({ error: `Muitas tentativas. Tente de novo em ${locked} min.` });
  const stored = settings.get('admin_password_hash');
  if (!stored || !auth.verifyPassword(req.body?.password || '', stored)) {
    auth.registerFailure(ip);
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  auth.clearFailures(ip);
  auth.createSession(req, res);
  res.json({ ok: true });
});

router.post('/api/admin/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

// Daqui para baixo, tudo exige login.
router.use('/api/admin', auth.requireAdmin);

router.post('/api/admin/password', (req, res) => {
  const { current, next } = req.body || {};
  if (!auth.verifyPassword(current || '', settings.get('admin_password_hash'))) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }
  try {
    auth.setPassword(next);
    auth.createSession(req, res);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Configurações ─────────────────────────────────────────────────────────────
router.get('/api/admin/settings', (req, res) => res.json(settings.getForAdmin()));

router.put('/api/admin/settings', (req, res) => {
  const changed = settings.updateFromAdmin(req.body);
  const affiliateKeys = ['amazon_tag', 'ml_matt_word', 'ml_matt_tool', 'magalu_store'];
  const refreshed = changed.some(k => affiliateKeys.includes(k)) ? offers.refreshAffiliateLinks() : 0;
  res.json({ ok: true, changed, refreshed });
});

// ── Lojas e mineração ─────────────────────────────────────────────────────────
router.get('/api/admin/stores', (req, res) => {
  res.json({ ...miner.getState(), enabled: settings.getEnabledStores(), categories: CATEGORIES });
});

router.post('/api/admin/mine', async (req, res) => {
  const query = String(req.body?.query || '').trim().slice(0, 100);
  const storeIds = Array.isArray(req.body?.stores) ? req.body.stores : undefined;
  if (miner.getState().running) return res.status(409).json({ error: 'Já existe uma mineração em andamento.' });
  if (query) {
    // Busca pontual: espera o resultado para mostrar na tela.
    return res.json(await miner.runMining({ query, storeIds }));
  }
  miner.runMining({ storeIds }).catch(err => console.error('[MINER]', err));
  res.json({ ok: true, started: true });
});

// ── Ofertas ───────────────────────────────────────────────────────────────────
router.get('/api/admin/offers', (req, res) => {
  res.json(offers.listForAdmin({
    q: String(req.query.q || ''),
    store: String(req.query.store || ''),
    state: String(req.query.state || 'active'),
    page: Math.max(parseInt(req.query.page, 10) || 1, 1),
  }));
});

// Cadastro manual: dados copiados pelo admin da página da loja (sem nenhum valor inventado).
router.post('/api/admin/offers', (req, res) => {
  const b = req.body || {};
  let url;
  try {
    url = new URL(String(b.url || '').trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    return res.status(400).json({ error: 'Informe o link do produto (começando com https://).' });
  }
  const store = getStore(b.store_id) || storeFromUrl(url.href);
  if (!store) return res.status(400).json({ error: 'Não reconheci a loja deste link. Escolha a loja na lista.' });

  const atual = parseBRL(b.preco_atual);
  const anterior = parseBRL(b.preco_anterior);
  if (!atual || !anterior || anterior <= atual) {
    return res.status(400).json({ error: 'O preço anterior (riscado na loja) precisa ser maior que o preço atual.' });
  }
  const affiliate = String(b.affiliate_url || '').trim();
  if (affiliate && !/^https?:\/\//i.test(affiliate)) return res.status(400).json({ error: 'Link de afiliado inválido.' });
  const imagem = String(b.imagem || '').trim();
  if (imagem && !/^https:\/\//i.test(imagem)) return res.status(400).json({ error: 'O link da imagem precisa começar com https://.' });

  const dias = Math.min(Math.max(parseInt(b.dias, 10) || settings.getNumber('manual_offer_days', 3), 1), 60);
  const productId = store.productIdFromUrl(url.href)
    || crypto.createHash('sha1').update(url.origin + url.pathname).digest('hex').slice(0, 16);
  const expires = new Date(Date.now() + dias * 86400000).toISOString().replace('T', ' ').slice(0, 19);

  const id = offers.saveDeal(store, {
    store_product_id: productId,
    produto: b.produto,
    preco_atual: atual,
    preco_anterior: anterior,
    imagem: imagem || null,
    original_url: url.href,
    affiliate_url: affiliate || null,
    categoria: CATEGORIES.includes(b.categoria) ? b.categoria : null,
  }, { fonte: 'manual', expiresAt: expires });

  if (!id) return res.status(400).json({ error: 'Oferta rejeitada: confira o título e os preços (desconto entre 1% e 95%).' });
  res.json({ ok: true, id });
});

router.patch('/api/admin/offers/:id', (req, res) => {
  const id = Number(req.params.id);
  if (typeof req.body?.oculto === 'boolean') {
    db.run('UPDATE offers SET oculto = ? WHERE id = ?', req.body.oculto ? 1 : 0, id);
  }
  res.json({ ok: true });
});

router.delete('/api/admin/offers/:id', (req, res) => {
  db.run('DELETE FROM offers WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

// ── Usuários do site e lojas parceiras ────────────────────────────────────────
router.get('/api/admin/users', (req, res) => {
  res.json(users.listForAdmin({
    q: String(req.query.q || '').trim(),
    tipo: String(req.query.tipo || ''),
    status: String(req.query.status || ''),
    page: Math.max(parseInt(req.query.page, 10) || 1, 1),
  }));
});

router.get('/api/admin/users/:id', (req, res) => {
  const data = users.detailForAdmin(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json(data);
});

router.post('/api/admin/users/:id/acao', (req, res) => {
  const b = req.body || {};
  try {
    users.moderate(Number(req.params.id), String(b.acao || ''), {
      motivo: b.motivo, dias: b.dias, bloquearEmail: Boolean(b.bloquear_email),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post('/api/admin/lojas/:id/visibilidade', (req, res) => {
  const lojaId = Number(req.params.id);
  const loja = db.get('SELECT l.*, u.email FROM lojas l JOIN users u ON u.id = l.user_id WHERE l.id = ?', lojaId);
  if (!loja) return res.status(404).json({ error: 'Loja não encontrada.' });
  const oculta = Boolean(req.body?.oculta);
  lojas.setHidden(lojaId, oculta);
  users.logAction(users.getById(loja.user_id), oculta ? 'loja_ocultada' : 'loja_reexibida', String(req.body?.motivo || '').slice(0, 300) || null);
  res.json({ ok: true });
});

router.post('/api/admin/lojas/:id/sincronizar', async (req, res) => {
  res.json(await lojas.syncFeed(Number(req.params.id)));
});

router.get('/api/admin/moderacao', (req, res) => {
  res.json(db.all('SELECT * FROM moderation_log ORDER BY id DESC LIMIT 200'));
});

router.get('/api/admin/emails-bloqueados', (req, res) => {
  res.json(db.all('SELECT * FROM blocked_emails ORDER BY created_at DESC'));
});

router.delete('/api/admin/emails-bloqueados', (req, res) => {
  db.run('DELETE FROM blocked_emails WHERE email = ?', String(req.body?.email || '').toLowerCase());
  res.json({ ok: true });
});

router.get('/api/admin/store-list', (req, res) => {
  res.json(STORES.map(s => ({ id: s.id, name: s.name, automatic: s.automatic })));
});

module.exports = router;
