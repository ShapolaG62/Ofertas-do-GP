// Perfis estilo Steam: página própria (/perfil), perfis públicos (/perfil/<endereço>), ações do admin
// e o redirecionamento rastreado dos links dos afiliados (/ir/<cliente>-<oferta>), que conta os cliques.
const express = require('express');
const path = require('path');
const perfis = require('../perfis');
const auth = require('../auth');
const db = require('../db');
const clientes = require('../clientes');
const settings = require('../settings');
const { createLimiter } = require('../ratelimit');

const router = express.Router();
const uploadLimiter = createLimiter(30, 60); // 30 imagens por hora por perfil
const PAGINA = path.join(__dirname, '..', '..', 'public', 'perfil.html');
const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message });

function exigirDono(req, res, next) {
  req.dono = perfis.donoDe(req);
  if (!req.dono) return res.status(401).json({ error: 'Entre na sua conta para ter um perfil.' });
  next();
}

router.get(['/perfil', '/perfil/:slug'], (req, res) => res.sendFile(PAGINA));

router.get('/api/perfil', exigirDono, (req, res) => {
  try { res.json(perfis.meu(req.dono)); } catch (err) { sendError(res, err); }
});

router.put('/api/perfil', exigirDono, (req, res) => {
  try { res.json(perfis.salvar(req.dono, req.body || {})); } catch (err) { sendError(res, err); }
});

router.post('/api/perfil/imagem/:tipo', exigirDono,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
  async (req, res) => {
    const wait = uploadLimiter.hit(req.dono);
    if (wait) return res.status(429).json({ error: `Muitas imagens enviadas. Tente de novo em ${wait} min.` });
    try { res.json(await perfis.salvarImagem(req.dono, req.params.tipo, req.body)); } catch (err) { sendError(res, err); }
  });

router.delete('/api/perfil/imagem/:tipo', exigirDono, (req, res) => {
  try { res.json(perfis.removerImagem(req.dono, req.params.tipo)); } catch (err) { sendError(res, err); }
});

router.get('/api/perfis/:slug', (req, res) => {
  try { res.json(perfis.porSlug(req.params.slug, perfis.donoDe(req))); } catch (err) { sendError(res, err); }
});

// ── Admin: vendas confirmadas e moderação ────────────────────────────────────
router.get('/api/admin/perfis/:dono', auth.requireAdmin, (req, res) => {
  try { res.json(perfis.resumoAdmin(req.params.dono)); } catch (err) { sendError(res, err); }
});
router.post('/api/admin/perfis/:dono/vendas', auth.requireAdmin, (req, res) => {
  const b = req.body || {};
  try { res.json(perfis.registrarVenda(req.params.dono, b.tipo, b.quantidade, b.observacao)); } catch (err) { sendError(res, err); }
});
router.post('/api/admin/perfis/:dono/moderar', auth.requireAdmin, (req, res) => {
  try { res.json(perfis.moderar(req.params.dono, req.body || {})); } catch (err) { sendError(res, err); }
});

// ── Link rastreado dos afiliados: conta o clique e manda para o link de afiliado do cliente ──
router.get('/ir/:cod', async (req, res) => {
  const m = /^(\d+)-(\d+)$/.exec(String(req.params.cod));
  const c = m && clientes.getById(Number(m[1]));
  const o = m && db.get('SELECT * FROM offers WHERE id = ?', Number(m[2]));
  if (!c || !o) return res.redirect('/');
  try {
    const dono = db.get('SELECT id FROM users WHERE cliente_id = ?', c.id);
    perfis.incrementar(dono ? `u:${dono.id}` : `c:${c.id}`, 'cliques_links');
    res.redirect(await clientes.linkAfiliado(c.id, o, clientes.config(c.id)));
  } catch {
    res.redirect(o.original_url || '/');
  }
});

module.exports = router;
