// Mensagens (painel flutuante e aba da conta), pedidos às lojas parceiras, pagamentos e números da loja, e contadores de acesso.
const express = require('express');
const db = require('../db');
const chat = require('../chat');
const pedidos = require('../pedidos-loja');
const perfis = require('../perfis');
const users = require('../users');
const { createLimiter } = require('../ratelimit');

const router = express.Router();
const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message });
const iniciarLimiter = createLimiter(30, 60);   // novas conversas por hora por pessoa
const pedidoLimiter = createLimiter(20, 60);    // pedidos por hora por pessoa
const visitaLimiter = createLimiter(600, 60);   // registros de acesso por hora por IP


// Quem está usando (conta do site, cliente da ferramenta ou admin)
function exigirDono(req, res, next) {
  req.dono = perfis.donoDe(req);
  if (!req.dono) return res.status(401).json({ error: 'Entre na sua conta para usar as mensagens.' });
  next();
}

// ── Mensagens ────────────────────────────────────────────────────────────────
router.get('/api/chat/resumo', (req, res) => {
  const dono = perfis.donoDe(req);
  res.setHeader('Cache-Control', 'no-store');
  const sac = require('../sac');
  res.json({ logado: Boolean(dono), ...chat.resumo(dono), notificacoes: require('../notificacoes').naoLidas(dono),
    sac: dono ? sac.resumoCliente(dono) : 0, sac_atendente: dono ? sac.resumoAtendente(dono) : null });
});

router.get('/api/chat/conversas', exigirDono, (req, res) => {
  try { res.json({ eu: chat.pessoa(req.dono), conversas: chat.lista(req.dono) }); } catch (err) { sendError(res, err); }
});

router.get('/api/chat/conversas/:id', exigirDono, (req, res) => {
  try { res.json(chat.mensagens(req.dono, req.params.id, req.query.depois)); } catch (err) { sendError(res, err); }
});

router.post('/api/chat/conversas/:id/mensagens', exigirDono, (req, res) => {
  try { res.json(chat.enviar(req.dono, req.params.id, req.body?.texto)); } catch (err) { sendError(res, err); }
});

router.post('/api/chat/conversas/:id/responder', exigirDono, (req, res) => {
  try { res.json(chat.responder(req.dono, req.params.id, String(req.body?.acao || ''))); } catch (err) { sendError(res, err); }
});

// Começar: { perfil: slug, texto } (conversa pessoal) ou { loja_id, oferta_id, texto } (atendimento da loja)
router.post('/api/chat/iniciar', exigirDono, (req, res) => {
  const wait = iniciarLimiter.hit(req.dono);
  if (wait) return res.status(429).json({ error: `Muitas conversas novas. Tente de novo em ${wait} min.` });
  const b = req.body || {};
  try {
    res.json(b.loja_id ? chat.iniciarLoja(req.dono, b.loja_id, b.oferta_id, b.texto) : chat.iniciarPessoal(req.dono, b.perfil, b.texto));
  } catch (err) { sendError(res, err); }
});

// ── Pedidos ──────────────────────────────────────────────────────────────────
router.post('/api/pedidos', exigirDono, async (req, res) => {
  const wait = pedidoLimiter.hit(req.dono);
  if (wait) return res.status(429).json({ error: `Muitos pedidos. Tente de novo em ${wait} min.` });
  try { res.json(await pedidos.criar(req.dono, req.body || {})); } catch (err) { sendError(res, err); }
});
router.get('/api/pedidos', exigirDono, (req, res) => res.json(pedidos.meusPedidos(req.dono)));
router.get('/api/pedidos/:id', exigirDono, async (req, res) => {
  try { res.json(await pedidos.detalhe(req.dono, req.params.id)); } catch (err) { sendError(res, err); }
});
router.post('/api/pedidos/:id/acao', exigirDono, async (req, res) => {
  try { res.json(await pedidos.acao(req.dono, req.params.id, String(req.body?.acao || ''), req.body?.motivo)); } catch (err) { sendError(res, err); }
});
// Aviso do Mercado Pago: só serve de gatilho — o pagamento é conferido pela API com o token da loja
router.post('/api/pedidos/mp-webhook', async (req, res) => {
  res.sendStatus(200);
  const id = Number(req.query.pedido);
  if (id) pedidos.verificarMP(id, true).catch(err => console.error('[PEDIDOS] Mercado Pago:', err.message));
});

// ── Loja do usuário (empresa): pagamentos, pedidos recebidos e números ───────
function exigirEmpresa(req, res, next) {
  const u = users.currentUser(req);
  if (!u || u.status !== 'active' || u.tipo !== 'empresa') return res.status(403).json({ error: 'Somente contas de empresa.' });
  req.user = u;
  req.loja = db.get('SELECT * FROM lojas WHERE user_id = ?', u.id);
  next();
}
router.get('/api/conta/loja/vendas', exigirEmpresa, (req, res) => {
  if (!req.loja) return res.json({ loja: null });
  res.json({ loja: { id: req.loja.id, nome: req.loja.nome, slug: req.loja.slug }, pagamento: pedidos.configPagamento(req.loja),
    pedidos: pedidos.pedidosDaLoja(req.user), metricas: pedidos.metricas(req.loja.id), carteira: require('../carteira').painel(req.user) });
});
// Painel da loja (dashboard)
router.get('/api/conta/loja/painel', exigirEmpresa, (req, res) => {
  try { res.json(require('../loja-painel').painel(req.user)); } catch (err) { sendError(res, err); }
});
router.put('/api/conta/loja/pagamento', exigirEmpresa, (req, res) => {
  try { res.json({ ok: true, pagamento: pedidos.salvarPagamento(req.user, req.body || {}) }); } catch (err) { sendError(res, err); }
});
// Carteira: pedido de saque (a partir do mínimo, para a chave Pix cadastrada)
const saqueLimiter = createLimiter(10, 60);
router.post('/api/conta/loja/saque', exigirEmpresa, (req, res) => {
  if (saqueLimiter.hit(`u:${req.user.id}`)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um pouco.' });
  try { res.json(require('../carteira').solicitarSaque(req.user, req.body || {})); } catch (err) { sendError(res, err); }
});

// ── Notificações (sino 🔔) ────────────────────────────────────────────────────
router.get('/api/notificacoes', exigirDono, (req, res) => {
  const n = require('../notificacoes');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ itens: n.listar(req.dono), nao_lidas: n.naoLidas(req.dono) });
});
router.post('/api/notificacoes/lidas', exigirDono, (req, res) => {
  require('../notificacoes').marcarLidas(req.dono, req.body?.id || null);
  res.json({ ok: true });
});

// ── Contadores de acesso (página da loja, produtos do catálogo, site oficial, links) ──
router.post('/api/lojas/:id/visita', (req, res) => {
  if (!visitaLimiter.hit(req.ip)) {
    try { pedidos.registrarVisita(req.params.id, String(req.body?.tipo || ''), req.body?.oferta_id, req.ip, perfis.donoDe(req)); } catch { /* ignora */ }
  }
  res.status(204).end();
});

module.exports = router;
