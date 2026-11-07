// Compra de planos (página /assinar): lista de planos, pedido, situação do pagamento e aviso do Mercado Pago.
const express = require('express');
const planos = require('../planos');
const pagamentos = require('../pagamentos');

const cadastro = require('../cadastro');
const settings = require('../settings');
const offers = require('../offers');
const vitrine = require('../vitrine');
const { createLimiter } = require('../ratelimit');
const assinaturas = require('../assinaturas');
const users = require('../users');
const clientes = require('../clientes');

const router = express.Router();
const pedidoLimiter = createLimiter(20, 60);   // 20 tentativas de pedido por hora por IP (inclui erros de digitação)
const statusLimiter = createLimiter(240, 10);  // consultas da página de pagamento

router.get('/api/planos', (req, res) => {
  const s = settings.getAll();
  res.json({ planos: planos.listar(s), lojas_gratis: assinaturas.lojasGratisRestantes(), lojas_gratis_total: assinaturas.LOJAS_GRATIS, funcoes_base: planos.FUNCOES_TIPO.consumidor, metodos: pagamentos.metodosDisponiveis(s, req.query.plano ? String(req.query.plano) : null),
    whatsapp: String(s.pag_whatsapp || s.whatsapp_anuncios || '').replace(/\D/g, ''),
    ufs: cadastro.UFS, ramos: cadastro.RAMOS, idade_minima: cadastro.IDADE_MINIMA });
});

// Quem está comprando: conta do site ou só o acesso da ferramenta
const quem = req => { const u = users.currentUser(req); return { u, c: u ? null : clientes.atual(req) }; };

// Meus planos (Minha conta e painel do afiliado)
router.get('/api/planos/meus', (req, res) => {
  const { u, c } = quem(req);
  res.setHeader('Cache-Control', 'no-store');
  if (!u && !c) return res.status(401).json({ error: 'Entre na sua conta.' });
  res.json(assinaturas.meus(u, c));
});
router.post('/api/planos/renovacao/:id/desligar', async (req, res) => {
  const { u, c } = quem(req);
  if (!u && !c) return res.status(401).json({ error: 'Entre na sua conta.' });
  try { res.json(await assinaturas.desligar(req.params.id, u, c)); } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});
// O que esta compra dá direito: período grátis e, na troca de plano, os dias a mais
router.get('/api/planos/oferta', (req, res) => {
  const p = planos.plano(req.query.plano);
  if (!p || !p.ativo) return res.status(404).json({ error: 'Plano indisponível.' });
  const { u, c } = quem(req);
  res.setHeader('Cache-Control', 'no-store');
  const ciclo = planos.ciclo(p, req.query.ciclo);
  const oferta = { cortesia: assinaturas.cortesia(p, u ? assinaturas.identidade({ email: u.email }, u) : c ? [String(c.email).toLowerCase()] : []), ativo: assinaturas.planoAtivo(p, u, c), troca: null };
  const de = String(req.query.trocar || '');
  const velho = de && planos.plano(de);
  if (velho && !velho.gratis && assinaturas.planoAtivo(velho, u, c)) oferta.troca = { plano: velho.id, nome: velho.nome, ...assinaturas.creditoDaTroca(velho, ciclo, u, c) };
  res.json(oferta);
});

// Números e fotos para a apresentação da página inicial (sem preços nem links: só o "aperitivo").
let apresentacaoCache = { at: 0, dados: null };
router.get('/api/apresentacao', async (req, res) => {
  if (!apresentacaoCache.dados || Date.now() - apresentacaoCache.at > 10 * 60 * 1000) {
    const st = offers.stats();
    let fotos = [];
    // No máximo 6 (uma linha), de tipos diferentes sempre que possível
    try {
      const itens = await vitrine.itens();
      const vistos = new Set();
      const escolhidos = [...itens.filter(o => !vistos.has(o.tipo) && vistos.add(o.tipo)), ...itens].filter((o, i, a) => a.indexOf(o) === i).slice(0, 6);
      fotos = escolhidos.map(o => ({ id: o.id, tipo: o.tipo, desconto: Math.round(o.desconto_pct) }));
    } catch { /* sem fotos */ }
    apresentacaoCache = { at: Date.now(), dados: { ofertas: st.offer_count, hoje: st.offers_today, lojas: st.stores, diamantes: st.diamonds, fotos } };
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(apresentacaoCache.dados);
});

router.post('/api/assinatura', async (req, res) => {
  const wait = pedidoLimiter.hit(req.ip);
  if (wait) return res.status(429).json({ error: `Muitas tentativas. Tente de novo em ${wait} min.` });
  try {
    const r = await pagamentos.criarPedido(req.body || {}, req);
    // Prova do aceite (a conta pode ser criada só depois do pagamento: fica ligada pelo e-mail)
    const logado = require('../users').currentUser(req);
    const pl = require('../planos').plano(req.body?.plano);
    const papeis = pl ? require('../consentimento').papeisDe({ tipo: pl.perfis.includes(logado?.tipo) ? logado.tipo : (req.body?.perfil_conta || pl.perfil), ferramenta: pl.ferramenta }) : [];
    require('../consentimento').registrar({ dono: logado ? `u:${logado.id}` : null, email: logado?.email || req.body?.email, origem: 'assinatura', req, papeis });
    res.json(r);
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
