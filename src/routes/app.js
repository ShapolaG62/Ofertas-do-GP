// App das lojas (Google Play / App Store): configuração do app, sincronização das compras e aviso do RevenueCat.
const express = require('express');
const users = require('../users');
const appLojas = require('../app-lojas');
const { createLimiter } = require('../ratelimit');

const router = express.Router();
const syncLimiter = createLimiter(30, 10); // 30 sincronizações a cada 10 min por IP

router.get('/api/app/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(appLojas.config());
});

// Depois de comprar no app: o site confere no RevenueCat e libera o plano da conta logada.
router.post('/api/app/sincronizar', async (req, res) => {
  if (syncLimiter.hit(req.ip)) return res.status(429).json({ error: 'Aguarde um pouco e tente de novo.' });
  const u = users.currentUser(req);
  if (!u) return res.status(401).json({ error: 'Entre na sua conta para assinar.' });
  try {
    const liberados = await appLojas.sincronizar(u.id);
    res.json({ ok: true, liberados, app_user_id: appLojas.appUserId(u.id) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// O app precisa do id de compra da conta logada antes de abrir a loja.
router.get('/api/app/conta', (req, res) => {
  const u = users.currentUser(req);
  res.setHeader('Cache-Control', 'no-store');
  res.json(u ? { app_user_id: appLojas.appUserId(u.id), user: users.publicUser(u) } : { app_user_id: null, user: null });
});

router.post('/api/app/webhook/revenuecat', async (req, res) => {
  try {
    res.json(await appLojas.webhook(req.headers, req.body || {}));
  } catch (err) {
    if (err.status !== 401) console.error('[APP] webhook:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
