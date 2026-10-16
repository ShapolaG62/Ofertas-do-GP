// Tela de postagens: o admin e os usuários que ele liberar montam as postagens das ofertas escolhidas
// e publicam nas redes sociais configuradas no painel.
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const users = require('../users');
const social = require('../social');
const agenda = require('../agenda');
const settings = require('../settings');
const { createLimiter } = require('../ratelimit');

const router = express.Router();
const postLimiter = createLimiter(300, 60); // até 300 publicações por hora por pessoa

// Quem pode usar: o admin, ou um usuário ativo com a permissão "pode postar".
function poster(req) {
  if (auth.isLoggedIn(req)) return { autor: 'admin', key: 'admin' };
  const u = users.currentUser(req);
  if (u && u.status === 'active' && u.pode_postar) return { autor: u.email, key: `u:${u.id}` };
  return null;
}

function requirePoster(req, res, next) {
  req.poster = poster(req);
  if (req.poster) return next();
  res.status(403).json({ error: 'Você não tem permissão para fazer postagens.' });
}

router.get('/api/postagens/permissao', (req, res) => res.json({ pode: Boolean(poster(req)) }));

router.use('/api/postagens', requirePoster);

router.get('/api/postagens/redes', (req, res) => {
  res.json({
    redes: social.listarRedes(),
    whatsapp_intervalo_s: settings.getNumber('whatsapp_intervalo_s', 90),
    agenda: agenda.estado(),
    admin: req.poster.key === 'admin',
  });
});

// Coloca ofertas (com o texto editado) na fila das postagens agendadas.
router.post('/api/postagens/fila', (req, res) => {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
  if (!itens.length) return res.status(400).json({ error: 'Nenhum produto enviado.' });
  const n = agenda.enfileirar(itens, req.poster.autor);
  res.json({ ok: true, adicionados: n, pendentes: agenda.pendentes() });
});

// Dados das ofertas escolhidas (com o link e a imagem que vão nas postagens).
router.get('/api/postagens/ofertas', (req, res) => {
  const ids = [...new Set(String(req.query.ids || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 200);
  if (!ids.length) return res.json([]);
  const s = settings.getAll();
  const rows = db.all(
    `SELECT id, store_id, plataforma, produto, preco_atual, preco_anterior, desconto_pct, categoria, imagem,
            affiliate_url, original_url, last_seen_at, oculto, expires_at
     FROM offers WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const hist = social.historico(ids);
  res.json(rows.map(o => ({
    id: o.id, store_id: o.store_id, plataforma: o.plataforma, produto: o.produto, preco_atual: o.preco_atual,
    preco_anterior: o.preco_anterior, desconto_pct: o.desconto_pct, categoria: o.categoria, last_seen_at: o.last_seen_at,
    link: social.postLink(o, s), imagem_publica: Boolean(social.postImage(o, s)), postado_em: hist[o.id] || {},
  })));
});

router.post('/api/postagens/publicar', async (req, res) => {
  const wait = postLimiter.hit(req.poster.key);
  if (wait) return res.status(429).json({ error: `Limite de publicações atingido. Tente de novo em ${wait} min.` });
  const b = req.body || {};
  const redes = Array.isArray(b.redes) ? b.redes.map(String) : [];
  if (!redes.length) return res.status(400).json({ error: 'Escolha pelo menos uma rede.' });
  try {
    res.json({ resultados: await social.publicar(Number(b.offer_id), redes, b.texto, req.poster.autor) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.get('/api/postagens/historico', (req, res) => {
  res.json(db.all('SELECT * FROM social_posts ORDER BY id DESC LIMIT 100'));
});

module.exports = { router, poster };
