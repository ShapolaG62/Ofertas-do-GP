// Painel do cliente da ferramenta (/cliente): login próprio, links de afiliado, canais e agendamento DELE.
const express = require('express');
const auth = require('../auth');
const clientes = require('../clientes');
const whatsapp = require('../whatsapp');
const agenda = require('../agenda');
const { createLimiter } = require('../ratelimit');

const router = express.Router();
const loginLimiter = createLimiter(8, 15); // 8 tentativas por 15 min por IP
const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message, ...(err.reativar ? { reativar: err.reativar } : {}) });

router.post('/api/cliente/entrar', (req, res) => {
  const wait = loginLimiter.hit(req.ip);
  if (wait) return res.status(429).json({ error: `Muitas tentativas. Tente de novo em ${wait} min.` });
  try {
    const c = clientes.login(req.body?.email, req.body?.senha);
    loginLimiter.reset(req.ip);
    clientes.criarSessao(req, res, c);
    res.json({ ok: true, cliente: clientes.publico(c) });
  } catch (err) { sendError(res, err); }
});

router.post('/api/cliente/sair', (req, res) => {
  // Sai também da conta do site, quando o acesso à ferramenta é pela conta (afiliado / Google).
  require('../users').destroySession(req, res);
  clientes.encerrarSessao(req, res); // acrescenta o próprio cookie, sem apagar o da conta
  res.json({ ok: true });
});

router.get('/api/cliente/me', (req, res) => {
  const c = clientes.atual(req);
  res.json({ cliente: c ? clientes.publico(c) : null });
});

router.use('/api/cliente', clientes.exigir);

router.get('/api/cliente/config', (req, res) => {
  const s = clientes.config(req.cliente.id);
  res.json({ config: clientes.configParaPainel(req.cliente.id), sem_afiliado: clientes.lojasSemAfiliado(s) });
});

router.put('/api/cliente/config', (req, res) => {
  res.json({ ok: true, alterados: clientes.salvarConfig(req.cliente.id, req.body || {}) });
});

router.post('/api/cliente/senha', (req, res) => {
  const { atual, nova } = req.body || {};
  const c = clientes.getById(req.cliente.id);
  if (!auth.verifyPassword(String(atual || ''), c.senha_hash)) return res.status(401).json({ error: 'Senha atual incorreta.' });
  try { clientes.editar(c.id, { senha: nova }); clientes.criarSessao(req, res, c); res.json({ ok: true }); } catch (err) { sendError(res, err); }
});

router.get('/api/cliente/whatsapp/status', async (req, res) => {
  res.json(await whatsapp.status(clientes.config(req.cliente.id)));
});

router.get('/api/cliente/whatsapp/grupos', async (req, res) => {
  const s = clientes.config(req.cliente.id);
  try { res.json({ grupos: await whatsapp.listarGrupos(s), escolhidos: whatsapp.gruposEscolhidos(s) }); } catch (err) { sendError(res, err); }
});

router.get('/api/cliente/agenda', (req, res) => {
  res.json({ estado: agenda.estado(req.cliente.id), fila: agenda.listarFila(req.cliente.id) });
});

router.post('/api/cliente/agenda/executar', (req, res) => {
  if (agenda.estado(req.cliente.id).rodando) return res.status(409).json({ error: 'Já existe uma rodada em andamento.' });
  agenda.executar('manual pelo painel do cliente', req.cliente.id)
    .then(r => r?.erro && console.log('[AGENDA]', r.erro)).catch(err => console.error('[AGENDA]', err));
  res.json({ ok: true });
});

router.delete('/api/cliente/agenda/fila/:id', (req, res) => {
  agenda.removerDaFila(Number(req.params.id), req.cliente.id);
  res.json({ ok: true });
});

router.delete('/api/cliente/agenda/fila', (req, res) => {
  res.json({ ok: true, removidos: agenda.limparFila(req.cliente.id) });
});

module.exports = router;
