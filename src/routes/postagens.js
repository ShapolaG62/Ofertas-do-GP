// Tela de postagens: o admin, os usuários que ele liberar e os clientes da ferramenta montam as postagens das
// ofertas escolhidas e publicam nas redes sociais.
//  • admin e usuários liberados: canais e links de afiliado do site (configurados pelo admin);
//  • cliente da ferramenta: canais, links de afiliado, fila e histórico DELE — nada do site é usado.
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const users = require('../users');
const social = require('../social');
const agenda = require('../agenda');
const settings = require('../settings');
const clientes = require('../clientes');
const { createLimiter } = require('../ratelimit');

const router = express.Router();
const postLimiter = createLimiter(300, 60); // até 300 publicações por hora por pessoa

// Quem pode usar e com quais configurações.
function poster(req) {
  if (auth.isLoggedIn(req)) return { autor: 'admin', key: 'admin', clienteId: null };
  const c = clientes.atual(req);
  if (c) return { autor: `cliente: ${c.email}`, key: `c:${c.id}`, clienteId: c.id, cliente: c };
  const u = users.currentUser(req);
  if (u && u.status === 'active' && u.pode_postar) return { autor: u.email, key: `u:${u.id}`, clienteId: null };
  return null;
}

function requirePoster(req, res, next) {
  req.poster = poster(req);
  if (!req.poster) return res.status(403).json({ error: 'Você não tem permissão para fazer postagens.' });
  req.cfg = req.poster.clienteId ? clientes.config(req.poster.clienteId) : settings.getAll();
  next();
}

router.get('/api/postagens/permissao', (req, res) => {
  const p = poster(req);
  res.json({ pode: Boolean(p), cliente: p?.clienteId ? clientes.publico(p.cliente) : null });
});

router.use('/api/postagens', requirePoster);

router.get('/api/postagens/redes', (req, res) => {
  const cid = req.poster.clienteId;
  res.json({
    redes: social.listarRedes(req.cfg),
    whatsapp_intervalo_s: Number(req.cfg.whatsapp_intervalo_s) || 90,
    modelo: req.cfg.post_modelo || '',
    agenda: agenda.estado(cid),
    admin: req.poster.key === 'admin',
    cliente: cid ? { nome: req.poster.cliente.nome, sem_afiliado: clientes.lojasSemAfiliado(req.cfg) } : null,
  });
});

// Coloca ofertas (com o texto editado) na fila das postagens agendadas de quem está usando.
router.post('/api/postagens/fila', (req, res) => {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
  if (!itens.length) return res.status(400).json({ error: 'Nenhum produto enviado.' });
  const cid = req.poster.clienteId;
  const n = agenda.enfileirar(itens, req.poster.autor, cid);
  res.json({ ok: true, adicionados: n, pendentes: agenda.pendentes(cid) });
});

// Dados das ofertas escolhidas (com o link e a imagem que vão nas postagens).
// Conversor de link: cola o link de um produto (de qualquer pessoa ou grupo) e recebe o link com o SEU código de
// afiliado (o do site para o admin; o do cliente na ferramenta). Não precisa a oferta estar no site.
const converterLimiter = createLimiter(120, 60);
router.post('/api/postagens/converter', async (req, res) => {
  const wait = converterLimiter.hit(req.poster.key);
  if (wait) return res.status(429).json({ error: `Muitas conversões seguidas. Tente de novo em ${wait} min.` });
  let url;
  try { url = new URL(String(req.body?.url || '').trim()); } catch { return res.status(400).json({ error: 'Cole o link completo do produto (começando com https://).' }); }
  if (!/^https?:$/.test(url.protocol)) return res.status(400).json({ error: 'Link inválido.' });
  const { storeFromUrl } = require('../stores');
  let store = storeFromUrl(url.href);
  if (!store) { // link encurtado (meli.la, amzn.to, s.shopee.com.br…): segue até o produto
    try { url = new URL(await require('../net').resolverLink(url.href)); store = storeFromUrl(url.href); } catch { /* não abriu */ }
  }
  if (!store) return res.status(400).json({ error: 'Esse link não é de uma loja com programa de afiliados ligado no site (Mercado Livre, Amazon, Shopee, Magalu, KaBuM!, AliExpress).' });
  const s = req.cfg;
  const o = { id: null, store_id: store.id, original_url: url.href, fonte: 'auto', store_product_id: store.productIdFromUrl ? store.productIdFromUrl(url.href) : null };
  let link = url.href, aviso = '';
  try {
    const apiPronta = store.id === 'aliexpress' ? s.aliexpress_app_key && s.aliexpress_app_secret && s.aliexpress_tracking_id
      : store.id === 'shopee' ? s.shopee_app_id && s.shopee_app_secret : false;
    link = apiPronta && typeof store.gerarLink === 'function' ? await store.gerarLink(url.href, s) : (store.affiliateLink(o, s) || url.href);
  } catch (err) { aviso = `Não consegui gerar pela API da loja (${err.message}); usei o link com o seu código.`; link = store.affiliateLink(o, s) || url.href; }
  if (link === url.href) aviso = aviso || `Seu código de afiliado da ${store.name} não está configurado: o link saiu sem comissão.`;
  res.json({ loja: store.name, link: require('../encurtador').curto(link), aviso });
});

router.get('/api/postagens/ofertas', async (req, res) => {
  const ids = [...new Set(String(req.query.ids || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 200);
  if (!ids.length) return res.json([]);
  const cid = req.poster.clienteId;
  const rows = db.all(
    `SELECT id, store_id, store_product_id, plataforma, produto, preco_atual, preco_anterior, desconto_pct, categoria, imagem, fonte, loja_id,
            affiliate_url, original_url, last_seen_at, oculto, expires_at
     FROM offers WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const hist = social.historico(ids, cid);
  const out = [];
  // Links curtos para o post (encurtados uma vez e guardados)
  const longos = [];
  for (const o of rows) longos.push(cid ? await clientes.linkAfiliado(cid, o, req.cfg) : social.postLink(o, req.cfg));
  const curtos = await require('../encurtador').curtos(longos);
  for (const [i, o] of rows.entries()) {
    const link = curtos[i];
    out.push({
      id: o.id, store_id: o.store_id, plataforma: o.plataforma, produto: o.produto, preco_atual: o.preco_atual,
      preco_anterior: o.preco_anterior, desconto_pct: o.desconto_pct, categoria: o.categoria, last_seen_at: o.last_seen_at,
      link, imagem_publica: Boolean(social.postImage(o, req.cfg)), postado_em: hist[o.id] || {},
      imagem_url: `/api/img/${o.id}`,
    });
  }
  res.json(out);
});

// Endereço antigo da imagem com marca d'água (recurso retirado): leva para a foto original da oferta.
router.get('/api/postagens/imagem/:id.jpg', (req, res) => res.redirect(301, `/api/img/${Number(req.params.id) || 0}`));

router.post('/api/postagens/publicar', async (req, res) => {
  const wait = postLimiter.hit(req.poster.key);
  if (wait) return res.status(429).json({ error: `Limite de publicações atingido. Tente de novo em ${wait} min.` });
  const b = req.body || {};
  const redes = Array.isArray(b.redes) ? b.redes.map(String) : [];
  if (!redes.length) return res.status(400).json({ error: 'Escolha pelo menos uma rede.' });
  const cid = req.poster.clienteId;
  try {
    let ctx = {};
    if (cid) {
      const o = db.get('SELECT * FROM offers WHERE id = ?', Number(b.offer_id));
      if (!o) return res.status(404).json({ error: 'Oferta não encontrada.' });
      ctx = { s: req.cfg, clienteId: cid, link: await clientes.linkParaPostar(cid, o, req.cfg) };
    }
    res.json({ resultados: await social.publicar(Number(b.offer_id), redes, b.texto, req.poster.autor, ctx) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// Histórico: o admin vê o do site; cada cliente, só o dele. Usuários liberados não veem o histórico.
router.get('/api/postagens/historico', (req, res) => {
  if (req.poster.clienteId) {
    return res.json(db.all('SELECT * FROM social_posts WHERE cliente_id = ? ORDER BY id DESC LIMIT 100', req.poster.clienteId));
  }
  if (req.poster.key !== 'admin') return res.status(403).json({ error: 'Somente o administrador.' });
  res.json(db.all('SELECT * FROM social_posts WHERE cliente_id IS NULL ORDER BY id DESC LIMIT 100'));
});

module.exports = { router, poster };
