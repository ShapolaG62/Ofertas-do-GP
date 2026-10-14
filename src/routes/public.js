const express = require('express');
const db = require('../db');
const settings = require('../settings');
const offers = require('../offers');
const { safeGet } = require('../net');

// Tipos de imagem aceitos no proxy (SVG fica de fora: pode conter scripts).
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)/i;

const router = express.Router();

router.get('/api/offers', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 2000, 1), 5000);
  res.json(offers.listActive(limit));
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

module.exports = router;
