// Área de trabalho da equipe (/trabalho): SAC e Moderação do chat para o administrador e a equipe (staff).
// Cada pessoa vê só o que tem permissão; suspender e banir contas continuam só com o administrador.
const express = require('express');
const perfis = require('../perfis');
const sac = require('../sac');
const mod = require('../moderacao-chat');

const router = express.Router();
const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message });

function quem(req) {
  const dono = perfis.donoDe(req);
  return { dono, sac: Boolean(dono && sac.ehAtendente(dono)), moderar: Boolean(dono && mod.podeModerar(dono)), admin: dono === 'admin' };
}
function exigirModerador(req, res, next) {
  req.q = quem(req);
  if (!req.q.moderar) return res.status(403).json({ error: 'Somente quem modera o chat.' });
  res.setHeader('Cache-Control', 'no-store');
  next();
}

// O que esta pessoa pode fazer na Área de trabalho
router.get('/api/trabalho/me', (req, res) => {
  const q = quem(req);
  res.setHeader('Cache-Control', 'no-store');
  if (!q.dono) return res.status(401).json({ error: 'Entre na sua conta.' });
  res.json({
    nome: q.admin ? 'Administrador' : require('../chat').pessoa(q.dono).nome, admin: q.admin, sac: q.sac, moderar: q.moderar,
    xingamentos: q.moderar ? mod.novos() : 0, sac_fila: q.sac ? sac.resumoAtendente(q.dono)?.fila || 0 : 0,
  });
});

// Moderação do chat
router.get('/api/moderacao', exigirModerador, (req, res) => {
  res.json({ conversas: mod.listar({ status: String(req.query.status || '') }), novos: mod.novos(), admin: req.q.admin, acoes_equipe: mod.ACOES_EQUIPE });
});
router.get('/api/moderacao/:origem/:id', exigirModerador, (req, res) => {
  try { res.json({ ...mod.detalhe(req.params.origem, req.params.id), admin: req.q.admin }); } catch (err) { sendError(res, err); }
});
router.post('/api/moderacao/:origem/:id/acao', exigirModerador, (req, res) => {
  try { res.json({ ...mod.punir(req.params.origem, req.params.id, req.body || {}, req.q.dono), admin: req.q.admin }); } catch (err) { sendError(res, err); }
});

module.exports = router;
