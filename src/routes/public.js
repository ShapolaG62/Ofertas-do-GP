const express = require('express');
const db = require('../db');
const settings = require('../settings');
const offers = require('../offers');
const { safeGet } = require('../net');
const banners = require('../banners');
const vitrine = require('../vitrine');
const { createLimiter } = require('../ratelimit');

// Tipos de imagem aceitos no proxy (SVG fica de fora: pode conter scripts).
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)/i;

const router = express.Router();

// Página de ofertas: o servidor filtra e devolve só a página pedida (24 ofertas) + os números dos filtros
router.get('/api/offers/busca', (req, res) => {
  res.setHeader('Cache-Control', 'private, no-cache');
  res.json(require('../busca-ofertas').buscar(req.query));
});
// Postagens: "melhor de cada categoria"
router.get('/api/offers/mix', (req, res) => {
  res.setHeader('Cache-Control', 'private, no-cache');
  res.json({ ids: require('../busca-ofertas').mix(String(req.query.loja || '')) });
});

router.get('/api/settings/public', (req, res) => res.json(settings.getPublic()));
// Preenchimento automático do cadastro da loja parceira pelo CNPJ (dados públicos da Receita Federal)
const consultasCnpj = new Map(); // ip → { n, ate }
router.get('/api/cadastro/cnpj/:cnpj', async (req, res) => {
  const ip = req.ip, agora = Date.now(), c = consultasCnpj.get(ip);
  if (c && c.ate > agora && c.n >= 20) return res.status(429).json({ error: 'Muitas consultas seguidas. Aguarde alguns minutos.' });
  consultasCnpj.set(ip, c && c.ate > agora ? { n: c.n + 1, ate: c.ate } : { n: 1, ate: agora + 10 * 60000 });
  try { res.json(await require('../consulta-cnpj').consultar(req.params.cnpj)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
// A Capi aparece minerando pelo site enquanto a mineração está rodando
router.get('/api/mineracao/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(require('../miner').statusPublico());
});
// Proxy das imagens das lojas (evita bloqueio de hotlink). Só serve imagens de ofertas do banco.
// /img/o/:id.jpg é o endereço usado nas páginas: termina em .jpg para a Cloudflare guardar a foto perto do visitante.
// No servidor, a foto fica guardada em disco (src/img-cache.js) e não é baixada da loja a cada visita.
async function fotoDaOferta(req, res) {
  const id = Number(req.params.id) || 0;
  const row = db.get('SELECT imagem FROM offers WHERE id = ?', id);
  if (row && /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(row.imagem || '')) return res.redirect(row.imagem);
  if (!row || !/^https:\/\//i.test(row.imagem || '')) return res.redirect('/images/pet-capi-head.png');
  // Fotos da Magalu: o servidor de imagens dela bloqueia o IP de quem baixa muitas fotos seguidas.
  // O navegador de cada visitante baixa direto de lá (cada um pelo próprio IP), sem passar pelo servidor.
  if (/^https:\/\/[a-z0-9-]+\.mlcdn\.com\.br\//i.test(row.imagem)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.redirect(302, row.imagem);
  }
  try {
    const foto = await require('../img-cache').obter(id, async () => {
      const img = await safeGet(row.imagem, {
        responseType: 'arraybuffer',
        timeout: 8000,
        maxContentLength: 5 * 1024 * 1024,
        headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
      });
      const tipo = String(img.headers['content-type'] || '');
      if (img.status !== 200 || !IMAGE_TYPES.test(tipo)) throw new Error('não é imagem');
      return { tipo, dados: Buffer.from(img.data) };
    });
    res.setHeader('Content-Type', foto.tipo);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.send(foto.dados);
  } catch {
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.redirect('/images/pet-capi-head.png');
  }
}
router.get('/img/o/:id.jpg', fotoDaOferta);
router.get('/api/img/:id', fotoDaOferta);

// Endereço antigo da foto com marca d'água (recurso retirado): leva para a foto original da oferta.
router.get('/img/marca/:id.jpg', (req, res) => res.redirect(301, `/api/img/${Number(req.params.id) || 0}`));

// Vitrine da página inicial: notebook, TV, PS5 e iPhone das melhores ofertas, em cartões com a foto inteira.
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
// Para o WhatsApp/Telegram/Facebook (robôs que montam a prévia do link): devolve a foto grande do produto com a
// o título e o preço. Pessoas vão direto para a loja (pelo /oferta, que conta o clique).
const ROBO_PREVIA = /whatsapp|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|skypeuripreview|googlebot|bingbot|pinterest|vkshare|embedly|iframely|redditbot|applebot/i;
router.get('/o/:id', (req, res) => {
  const id = Number(req.params.id) || 0;
  if (!ROBO_PREVIA.test(String(req.get('user-agent') || ''))) return res.redirect(`/oferta/${id}`);
  const o = id && offers.isActive(id) ? db.get('SELECT id, produto, preco_atual, preco_anterior, desconto_pct, store_id FROM offers WHERE id = ?', id) : null;
  if (!o) return res.redirect(`/oferta/${id}`);
  const site = String(require('../settings').get('site_url') || '').replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
  const social = require('../social');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const h = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const titulo = social.tituloCurto(o.produto);
  const desc = `De R$ ${brl(o.preco_anterior)} por R$ ${brl(o.preco_atual)} (${Math.round(o.desconto_pct)}% off) — oferta conferida pelo Ofertou!`;
  res.set('Cache-Control', 'public, max-age=600');
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${h(titulo)}</title>
<meta property="og:type" content="product"><meta property="og:site_name" content="Ofertou!">
<meta property="og:title" content="${h(titulo)}"><meta property="og:description" content="${h(desc)}">
<meta property="og:image" content="${h(`${site}/api/img/${o.id}`)}">
<meta property="og:url" content="${h(`${site}/o/${o.id}`)}"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=/oferta/${o.id}"></head><body><a href="/oferta/${o.id}">${h(titulo)}</a></body></html>`);
});

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

// Avisos na entrada (public/js/avisos-entrada.js)
router.get('/api/avisos', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ avisos: require('../avisos').paraVisitante(require('../users').currentUser(req)) });
});
router.post('/api/avisos/:id/:evento(visto|clique)', (req, res) => {
  require('../avisos').contar(Number(req.params.id), req.params.evento, req.ip);
  res.json({ ok: true });
});

module.exports = router;
