// Compra de planos (página /assinar): lista de planos, pedido, situação do pagamento e aviso do Mercado Pago.
const express = require('express');
const planos = require('../planos');
const pagamentos = require('../pagamentos');

const cadastro = require('../cadastro');
const { createLimiter } = require('../ratelimit');

const router = express.Router();
const pedidoLimiter = createLimiter(20, 60);   // 20 tentativas de pedido por hora por IP (inclui erros de digitação)
const statusLimiter = createLimiter(240, 10);  // consultas da página de pagamento

router.get('/api/planos', (req, res) => {
  res.json({ planos: planos.listar(), metodos: pagamentos.metodosDisponiveis(), ufs: cadastro.UFS, ramos: cadastro.RAMOS,
    idade_minima: cadastro.IDADE_MINIMA });
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
