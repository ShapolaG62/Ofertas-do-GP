// Painel do cliente da ferramenta (/cliente): login próprio, links de afiliado, canais e agendamento DELE.
const express = require('express');
const auth = require('../auth');
const clientes = require('../clientes');
const whatsapp = require('../whatsapp');
const agenda = require('../agenda');
const db = require('../db');
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
  res.json({ cliente: c ? clientes.publico(c) : null, parceiro_pendente: c ? pendenteCliente(c) : [] });
});

// Termos do Afiliado (item 6-A): cliente criado pelo painel ou antes destes Termos aceita ao entrar
const pendenteCliente = c => require('../consentimento').pendentesParceiro({ dono: `c:${c.id}`, email: c.email, papeis: ['afiliado'] });

router.use('/api/cliente', clientes.exigir);

router.post('/api/cliente/aceite-parceiro', (req, res) => {
  try { res.json(require('../consentimento').aceitarParceiro({ dono: `c:${req.cliente.id}`, email: req.cliente.email, papeis: ['afiliado'], b: req.body || {}, req })); } catch (err) { sendError(res, err); }
});
// Sem o aceite, o painel não funciona (a janela de aceite aparece ao entrar)
router.use('/api/cliente', (req, res, next) => (pendenteCliente(req.cliente).length
  ? res.status(428).json({ error: 'Aceite os Termos do Afiliado para continuar usando o painel.', aceite_parceiro: true }) : next()));

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

// Dashboard do painel: envios no período (por dia, ok e falha), conexões, fila e cliques nos links do cliente
router.get('/api/cliente/painel', (req, res) => {
  const cid = req.cliente.id;
  const dias = [1, 7, 30].includes(Number(req.query.dias)) ? Number(req.query.dias) : 7;
  const desde = `-${dias - 1} days`;
  const porDia = db.all(`SELECT date(created_at, '-3 hours') AS dia, SUM(ok) AS ok, SUM(1 - ok) AS erro FROM social_posts
    WHERE cliente_id = ? AND date(created_at, '-3 hours') >= date('now', '-3 hours', ?) GROUP BY dia ORDER BY dia`, cid, desde);
  const mapa = Object.fromEntries(porDia.map(r => [r.dia, r]));
  const serie = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(Date.now() - 3 * 3600000 - i * 86400000).toISOString().slice(0, 10);
    serie.push({ dia: d, ok: mapa[d]?.ok || 0, erro: mapa[d]?.erro || 0 });
  }
  const s = clientes.config(cid);
  const dono = db.get('SELECT id FROM users WHERE cliente_id = ?', cid);
  const cliques = db.get('SELECT valor FROM metricas WHERE dono = ? AND chave = ?', dono ? `u:${dono.id}` : `c:${cid}`, 'cliques_links')?.valor || 0;
  const ultimo = db.get('SELECT MAX(created_at) AS created_at FROM social_posts WHERE cliente_id = ? AND ok = 1', cid)?.created_at || null;
  res.json({
    dias, serie,
    enviados: serie.reduce((a, d) => a + d.ok, 0), falhas: serie.reduce((a, d) => a + d.erro, 0),
    redes: require('../social').listarRedes(s), contingencia: Boolean(whatsapp.configReserva(s) && !whatsapp.configReserva(s).erro),
    grupos_whatsapp: whatsapp.gruposEscolhidos(s).length, fila: agenda.pendentes(cid), agenda: agenda.estado(cid),
    cliques, ultimo_envio: ultimo, sem_afiliado: clientes.lojasSemAfiliado(s),
  });
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
