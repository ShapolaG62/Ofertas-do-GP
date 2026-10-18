// SAC: chamados dos usuários (painel de Mensagens) e a fila de atendimento (página /sac, para o admin e os atendentes).
const express = require('express');
const sac = require('../sac');
const perfis = require('../perfis');
const { createLimiter } = require('../ratelimit');

const router = express.Router();
const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message });
const msgLimiter = createLimiter(40, 10);      // mensagens por 10 minutos por pessoa
const abrirLimiter = createLimiter(10, 60);    // chamados novos por hora por pessoa

function exigirDono(req, res, next) {
  req.dono = perfis.donoDe(req);
  if (!req.dono) return res.status(401).json({ error: 'Entre na sua conta para falar com o suporte.' });
  res.setHeader('Cache-Control', 'no-store');
  next();
}
function exigirAtendente(req, res, next) {
  req.dono = perfis.donoDe(req);
  if (!req.dono || !sac.ehAtendente(req.dono)) return res.status(403).json({ error: 'Somente atendentes do SAC.' });
  res.setHeader('Cache-Control', 'no-store');
  next();
}
const limitar = (lim, req, res) => {
  if (lim.hit(req.dono)) { res.status(429).json({ error: 'Muitas mensagens em pouco tempo. Aguarde um pouco.' }); return true; }
  return false;
};

// ── Cliente ──
router.get('/api/sac/meu', exigirDono, (req, res) => {
  try { res.json({ ...sac.meu(req.dono, req.query.depois), atendente: sac.ehAtendente(req.dono) }); } catch (err) { sendError(res, err); }
});
router.post('/api/sac', exigirDono, (req, res) => {
  if (limitar(abrirLimiter, req, res)) return;
  try { res.json(sac.abrir(req.dono, req.body || {})); } catch (err) { sendError(res, err); }
});
router.post('/api/sac/:id/mensagem', exigirDono, (req, res) => {
  if (limitar(msgLimiter, req, res)) return;
  try { res.json(sac.enviarCliente(req.dono, req.params.id, req.body?.texto)); } catch (err) { sendError(res, err); }
});
router.post('/api/sac/:id/encerrar', exigirDono, (req, res) => {
  try { res.json(sac.encerrarCliente(req.dono, req.params.id)); } catch (err) { sendError(res, err); }
});
router.post('/api/sac/:id/avaliar', exigirDono, (req, res) => {
  try { res.json(sac.avaliar(req.dono, req.params.id, req.body || {})); } catch (err) { sendError(res, err); }
});

// ── Atendentes ──
router.get('/api/sac/fila', exigirAtendente, (req, res) => {
  try { res.json(sac.fila(req.dono)); } catch (err) { sendError(res, err); }
});
router.get('/api/sac/chamados/:id', exigirAtendente, (req, res) => {
  try { res.json(sac.ver(req.dono, req.params.id, req.query.depois)); } catch (err) { sendError(res, err); }
});
for (const acao of ['assumir', 'devolver', 'resolver']) {
  router.post(`/api/sac/chamados/:id/${acao}`, exigirAtendente, (req, res) => {
    try { res.json(sac[acao](req.dono, req.params.id)); } catch (err) { sendError(res, err); }
  });
}
router.post('/api/sac/chamados/:id/responder', exigirAtendente, (req, res) => {
  if (limitar(msgLimiter, req, res)) return;
  try { res.json(sac.responder(req.dono, req.params.id, req.body?.texto)); } catch (err) { sendError(res, err); }
});

module.exports = router;
