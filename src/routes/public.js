const zlib = require('zlib');
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const settings = require('../settings');
const offers = require('../offers');
const { safeGet } = require('../net');
const banners = require('../banners');
const { createLimiter } = require('../ratelimit');

// Tipos de imagem aceitos no proxy (SVG fica de fora: pode conter scripts).
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)/i;

const router = express.Router();

// Lista de todas as ofertas no ar (a página filtra e ordena no navegador). Vai enxuta — a foto vem por
// /api/img/:id e o clique passa por /oferta/:slug — e compactada; o link de afiliado só vai para o admin
// (gerador de postagens). A resposta fica guardada por 1 minuto.
const OFFERS_CACHE_MS = 60 * 1000;
const offersCache = new Map(); // 'admin' | 'public' -> { at, json, gz }

function offersPayload(admin) {
  const key = admin ? 'admin' : 'public';
  const hit = offersCache.get(key);
  if (hit && Date.now() - hit.at < OFFERS_CACHE_MS) return hit;
  const rows = offers.listActive(100000).map(({ imagem, loja_nome, affiliate_url, ...o }) => (admin ? { ...o, affiliate_url } : o));
  const json = Buffer.from(JSON.stringify(rows));
  const entry = { at: Date.now(), json, gz: zlib.gzipSync(json, { level: 6 }) };
  offersCache.set(key, entry);
  return entry;
}

router.get('/api/offers', (req, res) => {
  const { json, gz } = offersPayload(auth.isLoggedIn(req));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('Vary', 'Accept-Encoding, Cookie');
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.setHeader('Content-Encoding', 'gzip');
    return res.end(gz);
  }
  res.end(json);
});

router.get('/api/featured', (req, res) => res.json(offers.featured() || {}));

router.get('/api/stats', (req, res) => res.json(offers.stats()));

router.get('/api/settings/public', (req, res) => res.json(settings.getPublic()));

router.get('/api/price-history/:id', (req, res) => {
  res.json(db.all(
    'SELECT price, checked_at FROM price_history WHERE offer_id = ? ORDER BY id ASC LIMIT 200', Number(req.params.id)
  ));
});

// Proxy das imagens das lojas (evita bloqueio de hotlink). Só serve imagens de ofertas do banco.
router.get('/api/img/:id', async (req, res) => {
  const row = db.get('SELECT imagem FROM offers WHERE id = ?', Number(req.params.id));
  if (row && /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(row.imagem || '')) return res.redirect(row.imagem);
  if (!row || !/^https:\/\//i.test(row.imagem || '')) return res.redirect('/images/pet-capi-head.png');
  try {
    const img = await safeGet(row.imagem, {
      responseType: 'arraybuffer',
      timeout: 8000,
      maxContentLength: 5 * 1024 * 1024,
      headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    });
    const type = String(img.headers['content-type'] || '');
    if (img.status !== 200 || !IMAGE_TYPES.test(type)) throw new Error('não é imagem');
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(img.data));
  } catch {
    res.redirect('/images/pet-capi-head.png');
  }
});

// Redireciona para a loja (link de afiliado). Só funciona para ofertas válidas e visíveis.
router.get('/oferta/:slug', (req, res) => {
  const id = Number(String(req.params.slug).split('-').pop());
  const offer = id && offers.isActive(id)
    ? db.get('SELECT affiliate_url, original_url FROM offers WHERE id = ?', id)
    : null;
  if (!offer) return res.redirect('/?expirada=1');
  db.run('UPDATE offers SET link_clicks = link_clicks + 1 WHERE id = ?', id);
  res.redirect(offer.affiliate_url || offer.original_url);
});

// ── Publicidade ──────────────────────────────────────────────────────────────
const leadLimiter = createLimiter(5, 60); // 5 pedidos de contato por hora por IP

// Banners no ar para os espaços pedidos (?espacos=topo,meio,lateral). Espaço sem campanha volta null.
router.get('/api/publicidade', (req, res) => {
  const espacos = String(req.query.espacos || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
  res.setHeader('Cache-Control', 'no-store');
  // Para cada espaço livre, o convite leva direto à conversa no WhatsApp.
  const whatsapp = Object.fromEntries(espacos.map(e => [e, banners.whatsappLink(e)]));
  res.json({ ...banners.pick(espacos), whatsapp });
});

// Informações da página "Anuncie aqui".
router.get('/api/anuncie/info', (req, res) => {
  res.json({
    espacos: Object.entries(banners.ESPACOS).map(([id, e]) => ({ id, ...e })),
    whatsapp: banners.whatsappLink(),
  });
});

router.post('/api/anuncie', (req, res) => {
  const wait = leadLimiter.hit(req.ip);
  if (wait) return res.status(429).json({ error: `Muitos envios. Tente de novo em ${wait} min.` });
  try {
    banners.saveLead(req.body || {});
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// Clique no banner: conta e leva ao site do anunciante.
router.get('/publicidade/:id', (req, res) => {
  const link = banners.click(Number(req.params.id));
  res.redirect(link || '/');
});

module.exports = router;
