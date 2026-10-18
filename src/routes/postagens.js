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
      imagem_url: cid ? `/api/postagens/imagem/${o.id}.jpg` : `/img/marca/${o.id}.jpg`,
    });
  }
  res.json(out);
});

// Imagem para baixar/visualizar com a marca d'água de quem está usando (cliente: a dele, sem a Capi).
router.get('/api/postagens/imagem/:id.jpg', async (req, res) => {
  const o = db.get('SELECT id, imagem FROM offers WHERE id = ?', Number(req.params.id));
  if (!o) return res.status(404).send('Não encontrado');
  const watermark = require('../watermark');
  if (!watermark.ativa(req.cfg)) return res.redirect(`/api/img/${o.id}`);
  try {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(await watermark.paraOferta(o, req.cfg));
  } catch {
    res.redirect(`/api/img/${o.id}`);
  }
});

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
