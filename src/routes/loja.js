// Página profissional das lojas: aparência, catálogos e avaliações (dono da loja, visitantes e admin).
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const users = require('../users');
const perfis = require('../perfis');
const lojaPerfil = require('../loja-perfil');

const router = express.Router();
const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message });

function exigirEmpresa(req, res, next) {
  const u = users.currentUser(req);
  if (!u || u.status !== 'active' || u.tipo !== 'empresa') return res.status(403).json({ error: 'Somente contas de empresa.' });
  req.user = u;
  req.loja = db.get('SELECT * FROM lojas WHERE user_id = ?', u.id);
  next();
}

// ── Dono da loja: editor ─────────────────────────────────────────────────────
router.get('/api/conta/loja/editor', exigirEmpresa, (req, res) => {
  if (!req.loja) return res.json({ loja: null, cores: lojaPerfil.CORES_LOJA });
  res.json({
    loja: { id: req.loja.id, nome: req.loja.nome, slug: req.loja.slug, descricao: req.loja.descricao || '', site_url: req.loja.site_url || '' },
    aparencia: lojaPerfil.aparencia(req.loja), cores: lojaPerfil.CORES_LOJA,
    catalogos: lojaPerfil.catalogos(req.loja.id),
    produtos: db.all(`SELECT id, produto, preco_atual, oculto, (expires_at > datetime('now')) no_ar FROM offers WHERE loja_id = ? ORDER BY created_at DESC LIMIT 500`, req.loja.id),
    avaliacoes: lojaPerfil.avaliacoes(req.loja.id, `u:${req.user.id}`),
  });
});
router.put('/api/conta/loja/aparencia', exigirEmpresa, (req, res) => {
  try { res.json({ ok: true, aparencia: lojaPerfil.salvarAparencia(req.user, req.body || {}) }); } catch (err) { sendError(res, err); }
});
router.post('/api/conta/loja/catalogos', exigirEmpresa, (req, res) => {
  try { res.json({ ok: true, catalogos: lojaPerfil.salvarCatalogo(req.user, null, req.body || {}) }); } catch (err) { sendError(res, err); }
});
router.put('/api/conta/loja/catalogos/:id', exigirEmpresa, (req, res) => {
  try { res.json({ ok: true, catalogos: lojaPerfil.salvarCatalogo(req.user, req.params.id, req.body || {}) }); } catch (err) { sendError(res, err); }
});
router.delete('/api/conta/loja/catalogos/:id', exigirEmpresa, (req, res) => {
  try { res.json({ ok: true, catalogos: lojaPerfil.excluirCatalogo(req.user, req.params.id) }); } catch (err) { sendError(res, err); }
});
router.post('/api/conta/loja/avaliacoes/:id/responder', exigirEmpresa, (req, res) => {
  try { res.json(lojaPerfil.responder(req.user, req.params.id, req.body?.resposta)); } catch (err) { sendError(res, err); }
});

// ── Visitantes: avaliações ───────────────────────────────────────────────────
router.get('/api/lojas/:id/avaliacoes', (req, res) => {
  const dono = perfis.donoDe(req);
  res.json(lojaPerfil.avaliacoes(Number(req.params.id), dono, { admin: dono === 'admin' }));
});
router.post('/api/lojas/:id/avaliacoes', (req, res) => {
  try { res.json(lojaPerfil.avaliar(perfis.donoDe(req), req.params.id, req.body || {})); } catch (err) { sendError(res, err); }
});
router.delete('/api/lojas/:id/avaliacoes/minha', (req, res) => {
  try { res.json(lojaPerfil.excluirMinhaAvaliacao(perfis.donoDe(req), req.params.id)); } catch (err) { sendError(res, err); }
});

// ── Admin: ocultar avaliação ─────────────────────────────────────────────────
router.post('/api/admin/avaliacoes/:id/ocultar', auth.requireAdmin, (req, res) => {
  try { res.json(lojaPerfil.moderar(req.params.id, req.body?.oculta !== false, String(req.body?.motivo || ''))); } catch (err) { sendError(res, err); }
});
router.get('/api/admin/avaliacoes/motivos', auth.requireAdmin, (req, res) => {
  res.json(Object.entries(lojaPerfil.MOTIVOS_OCULTAR).map(([valor, nome]) => ({ valor, nome })));
});

module.exports = router;
