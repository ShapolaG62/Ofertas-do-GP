const zlib = require('zlib');
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const settings = require('../settings');
const offers = require('../offers');
const { safeGet } = require('../net');
const banners = require('../banners');
const watermark = require('../watermark');
const vitrine = require('../vitrine');
const { createLimiter } = require('../ratelimit');

// Tipos de imagem aceitos no proxy (SVG fica de fora: pode conter scripts).
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)/i;

const router = express.Router();

// Lista de todas as ofertas no ar (a página filtra e ordena no navegador). Vai em formato de tabela compacta
// (sem repetir nomes de campos, lojas, categorias e datas por extenso em cada oferta: ~60% menor) e comprimida
// (brotli ou gzip). A foto vem por /api/img/:id e o clique passa por /oferta/:slug. A resposta é refeita quando
// as ofertas mudam (ou a cada minuto) e usa ETag.
const OFFERS_CACHE_MS = 60 * 1000;
let offersCache = null; // { at, sig, etag, json, gz, br }

// Tabela compacta: dicionários (lojas, categorias…) + uma linha por oferta. O navegador remonta os objetos.
function ofertasCompactas(rows) {
  const dic = () => {
    const lista = [];
    const pos = new Map();
    return { lista, i: v => { if (v == null) return -1; if (!pos.has(v)) { pos.set(v, lista.length); lista.push(v); } return pos.get(v); } };
  };
  const lojas = dic(), cats = dic(), subs = dic(), fontes = dic();
  const plataformas = {};
  const minutos = s => (s ? Math.round(Date.parse(`${String(s).replace(' ', 'T')}Z`) / 60000) : null);
  let t0 = Infinity;
  for (const o of rows) { const m = minutos(o.created_at); if (m !== null && m < t0) t0 = m; }
  if (!Number.isFinite(t0)) t0 = 0;
  const rel = s => { const m = minutos(s); return m === null ? null : m - t0; };
  const linhas = rows.map(o => {
    plataformas[o.store_id] = o.plataforma;
    return [o.id, lojas.i(o.store_id), o.produto, o.preco_atual, o.preco_anterior, o.desconto_pct, cats.i(o.categoria),
      subs.i(o.subcategoria), o.link_clicks || 0, fontes.i(o.fonte), rel(o.created_at), rel(o.last_seen_at), o.loja_slug || 0, o.menor_preco_30d || 0];
  });
  return { v: 2, t0, lojas: lojas.lista, plataformas: lojas.lista.map(id => plataformas[id]), cat: cats.lista, sub: subs.lista, fontes: fontes.lista, linhas };
}

// Assinatura barata do conteúdo: muda quando uma oferta entra, sai, é atualizada ou ocultada.
const offersSignature = () => {
  const r = db.get('SELECT COUNT(*) AS n, MAX(updated_at) AS u, MAX(last_seen_at) AS s, SUM(oculto) AS h FROM offers');
  return `${r.n}|${r.u}|${r.s}|${r.h}`;
};

function offersPayload() {
  const sig = offersSignature();
  if (offersCache && offersCache.sig === sig && Date.now() - offersCache.at < OFFERS_CACHE_MS) return offersCache;
  const json = Buffer.from(JSON.stringify(ofertasCompactas(offers.listActive(100000))));
  const etag = `"v2-${require('crypto').createHash('sha1').update(json).digest('hex').slice(0, 16)}"`;
  if (offersCache && offersCache.etag === etag) { offersCache.at = Date.now(); offersCache.sig = sig; return offersCache; }
  offersCache = {
    at: Date.now(), sig, etag, json,
    gz: zlib.gzipSync(json, { level: 6 }),
    br: zlib.brotliCompressSync(json, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 7, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: json.length } }),
  };
  return offersCache;
}

router.get('/api/offers', (req, res) => {
  const { json, gz, br, etag } = offersPayload();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-cache'); // o navegador confere o ETag a cada vez (304 se nada mudou)
  res.setHeader('ETag', etag);
  res.setHeader('Vary', 'Accept-Encoding');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  const aceita = req.headers['accept-encoding'] || '';
  if (/\bbr\b/.test(aceita)) { res.setHeader('Content-Encoding', 'br'); return res.end(br); }
  if (/\bgzip\b/.test(aceita)) { res.setHeader('Content-Encoding', 'gzip'); return res.end(gz); }
  res.end(json);
});

router.get('/api/settings/public', (req, res) => res.json(settings.getPublic()));

// Proxy das imagens das lojas (evita bloqueio de hotlink). Só serve imagens de ofertas do banco.
router.get('/api/img/:id', async (req, res) => {
  const row = db.get('SELECT imagem FROM offers WHERE id = ?', Number(req.params.id));
  if (row && /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(row.imagem || '')) return res.redirect(row.imagem);
  if (!row || !/^https:\/\//i.test(row.imagem || '')) return res.redirect('/images/pet-capi-head.png');
  // Fotos da Magalu: o servidor de imagens dela bloqueia o IP de quem baixa muitas fotos seguidas.
  // O navegador de cada visitante baixa direto de lá (cada um pelo próprio IP), sem passar pelo servidor.
  if (/^https:\/\/[a-z0-9-]+\.mlcdn\.com\.br\//i.test(row.imagem)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.redirect(302, row.imagem);
  }
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

// Foto da oferta com a marca d'água do site (usada nas postagens, no Instagram e no "Baixar imagem").
const marcaLimiter = createLimiter(120, 1); // até 120 imagens novas por minuto por IP
router.get('/img/marca/:id.jpg', async (req, res) => {
  const o = db.get('SELECT id, imagem FROM offers WHERE id = ?', Number(req.params.id));
  if (!o) return res.status(404).send('Não encontrado');
  if (!watermark.ativa()) return res.redirect(`/api/img/${o.id}`);
  if (marcaLimiter.hit(req.ip)) return res.status(429).send('Muitas imagens. Tente em instantes.');
  try {
    const buf = await watermark.paraOferta(o);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch {
    res.redirect(`/api/img/${o.id}`);
  }
});

// Vitrine da página inicial: notebook, TV, PS5 e iPhone das melhores ofertas, em cartões com a foto inteira e o selo do site.
router.get('/api/vitrine', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json(await vitrine.itens());
  } catch (err) {
    console.error('[VITRINE]', err.message);
    res.json([]);
  }
});

router.get('/img/recorte/:id.webp', async (req, res) => {
  const arquivo = await vitrine.arquivoRecorte(Number(req.params.id)).catch(() => null);
  if (!arquivo) return res.status(404).send('Não encontrado');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(arquivo);
});

// Link curto das postagens: /o/<id> (vai para /oferta, que conta o clique e manda para a loja)
router.get('/o/:id', (req, res) => res.redirect(`/oferta/${Number(req.params.id) || 0}`));

// Redireciona para a loja (link de afiliado). Só funciona para ofertas válidas e visíveis.
router.get('/oferta/:slug', (req, res) => {
  const id = Number(String(req.params.slug).split('-').pop());
  const offer = id && offers.isActive(id)
    ? db.get('SELECT affiliate_url, original_url, loja_id FROM offers WHERE id = ?', id)
    : null;
  if (!offer) return res.redirect('/?expirada=1');
  db.run('UPDATE offers SET link_clicks = link_clicks + 1 WHERE id = ?', id);
  require('../admin-painel').registrarClique();
  // Conquistas: ida à loja pelo link do site (do admin) de quem está logado.
  if (!offer.loja_id) { try { const perfis = require('../perfis'); perfis.incrementar(perfis.donoDe(req), 'idas_loja'); } catch { /* sem perfil */ } }
  res.redirect(offer.affiliate_url || offer.original_url);
});

// ── Publicidade ──────────────────────────────────────────────────────────────
const leadLimiter = createLimiter(5, 60); // 5 pedidos de contato por hora por IP

// Banners no ar para os espaços pedidos (?espacos=topo,meio,lateral). Espaço sem campanha volta null.
// Google AdSense: espaço sem campanha de anunciante mostra um anúncio do Google (se configurado no painel).
const adsenseCliente = () => {
  const c = String(settings.get('adsense_client') || '').trim();
  return /^ca-pub-\d{10,20}$/.test(c) ? c : '';
};
function googleAds(espacos) {
  const s = settings.getAll();
  const client = adsenseCliente();
  if (!client || s.adsense_ativo !== '1') return null;
  const slots = Object.fromEntries(espacos.map(e => [e, String(s[`adsense_slot_${e}`] || '').trim()]).filter(([, v]) => /^\d{6,14}$/.test(v)));
  return { client, slots };
}

router.get('/api/publicidade', (req, res) => {
  const espacos = String(req.query.espacos || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
  res.setHeader('Cache-Control', 'no-store');
  // Para cada espaço livre, o convite leva direto à conversa no WhatsApp.
  const whatsapp = Object.fromEntries(espacos.map(e => [e, banners.whatsappLink(e)]));
  res.json({ ...banners.pick(espacos), whatsapp, google: googleAds(espacos) });
});

// ads.txt: autoriza o Google a vender anúncios no site (exigido pelo AdSense).
router.get('/ads.txt', (req, res) => {
  const client = adsenseCliente();
  res.type('text/plain').setHeader('Cache-Control', 'public, max-age=3600');
  res.send(client ? `google.com, ${client.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n` : '');
});

// Informações da página "Anuncie aqui".
router.get('/api/anuncie/info', (req, res) => {
  res.json({
    espacos: Object.entries(banners.ESPACOS).map(([id, e]) => ({ id, ...e })),
    whatsapp: banners.whatsappLink(),
    video: banners.VIDEO,
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
