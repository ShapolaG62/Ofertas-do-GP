// Compra de planos (página /assinar): lista de planos, pedido, situação do pagamento e aviso do Mercado Pago.
const express = require('express');
const planos = require('../planos');
const pagamentos = require('../pagamentos');

const cadastro = require('../cadastro');
const settings = require('../settings');
const offers = require('../offers');
const vitrine = require('../vitrine');
const { createLimiter } = require('../ratelimit');

const router = express.Router();
const pedidoLimiter = createLimiter(20, 60);   // 20 tentativas de pedido por hora por IP (inclui erros de digitação)
const statusLimiter = createLimiter(240, 10);  // consultas da página de pagamento

router.get('/api/planos', (req, res) => {
  const s = settings.getAll();
  res.json({ planos: planos.listar(s), funcoes_base: planos.FUNCOES_TIPO.consumidor, metodos: pagamentos.metodosDisponiveis(s, req.query.plano ? String(req.query.plano) : null),
    whatsapp: String(s.pag_whatsapp || s.whatsapp_anuncios || '').replace(/\D/g, ''),
    ufs: cadastro.UFS, ramos: cadastro.RAMOS, idade_minima: cadastro.IDADE_MINIMA });
});

// Números e fotos para a apresentação da página inicial (sem preços nem links: só o "aperitivo").
let apresentacaoCache = { at: 0, dados: null };
router.get('/api/apresentacao', async (req, res) => {
  if (!apresentacaoCache.dados || Date.now() - apresentacaoCache.at > 10 * 60 * 1000) {
    const st = offers.stats();
    let fotos = [];
    try { fotos = (await vitrine.itens()).map(o => ({ id: o.id, tipo: o.tipo, desconto: Math.round(o.desconto_pct) })); } catch { /* sem fotos */ }
    apresentacaoCache = { at: Date.now(), dados: { ofertas: st.offer_count, hoje: st.offers_today, lojas: st.stores, diamantes: st.diamonds, fotos } };
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(apresentacaoCache.dados);
});

router.post('/api/assinatura', async (req, res) => {
  const wait = pedidoLimiter.hit(req.ip);
  if (wait) return res.status(429).json({ error: `Muitas tentativas. Tente de novo em ${wait} min.` });
  try {
    res.json(await pagamentos.criarPedido(req.body || {}, req));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// Situação do pedido. Quando aprovado, entrega o login a este navegador (uma vez) e indica para onde ir.
router.get('/api/assinatura/:token', async (req, res) => {
  if (statusLimiter.hit(req.ip)) return res.status(429).json({ error: 'Aguarde um pouco.' });
  let pedido = pagamentos.porToken(req.params.token);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
  try { pedido = await pagamentos.verificar(pedido); } catch (err) { console.error('[PAGAMENTO]', err.message); }
  const redirect = pagamentos.entregarLogin(pedido, req, res);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ...pagamentos.publico(pedido), redirect: redirect || (pedido.status === 'aprovado' ? '/' : null) });
});

// Aviso do Mercado Pago: responde rápido e confere o pagamento na API em seguida.
router.post('/api/pagamentos/webhook', (req, res) => {
  res.sendStatus(200);
  pagamentos.webhook(req.body || {}, req.query || {}).catch(err => console.error('[PAGAMENTO] webhook:', err.message));
});

module.exports = router;
