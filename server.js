const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
const db = require('./db');
const miner = require('./miner');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos (HTML, CSS, JS, imagens)
app.use(express.static(__dirname));

// 1. Landing / Listagem de Ofertas
app.get('/api/offers/landing', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10000;
    let offers = await db.all(`SELECT * FROM offers ORDER BY id DESC LIMIT ?`, [limit]);

    // Se o banco estiver vazio na primeira execução, dispara a mineração automática inicial
    if (offers.length === 0) {
      console.log('[SERVER] Banco vazio. Iniciando mineração inicial de ofertas...');
      // Minera em background para popular
      miner.mineAll().then(() => console.log('[SERVER] Mineração inicial concluída.'));
      // Aguarda 4 segundos para retornar ao menos a primeira leva
      await new Promise(r => setTimeout(r, 4000));
      offers = await db.all(`SELECT * FROM offers ORDER BY id DESC LIMIT ?`, [limit]);
    }

    res.json(offers);
  } catch (err) {
    console.error('Erro em /api/offers/landing:', err.message);
    res.status(500).json({ error: 'Erro ao carregar ofertas.' });
  }
});

// 2. Mineração On-Demand via busca
app.get('/api/mine', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Informe o termo de busca em ?q=' });
  }

  try {
    console.log(`[SERVER] Mineração ao vivo solicitada para: "${query}"`);
    const minedDeals = await miner.mineQuery(query);
    const updatedOffers = await db.all(
      `SELECT * FROM offers WHERE produto LIKE ? OR categoria LIKE ? ORDER BY id DESC LIMIT 50`,
      [`%${query}%`, `%${query}%`]
    );
    res.json({ ok: true, count: minedDeals.length, offers: updatedOffers });
  } catch (err) {
    console.error('Erro em /api/mine:', err.message);
    res.status(500).json({ error: 'Erro ao minerar ofertas.' });
  }
});

// 3. Oferta em Destaque (Featured)
app.get('/api/featured', async (req, res) => {
  try {
    const featured = await db.get(
      `SELECT * FROM offers WHERE desconto_pct >= 30 ORDER BY desconto_pct DESC, id DESC LIMIT 1`
    );
    res.json(featured || {});
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter destaque.' });
  }
});

// 4. Estatísticas do Minerador (100% Reais)
app.get('/api/stats', async (req, res) => {
  try {
    const totalRow = await db.get(`SELECT COUNT(*) as count FROM offers`);
    const todayRow = await db.get(`SELECT COUNT(*) as count FROM offers WHERE date(created_at) = date('now') OR date(updated_at) = date('now')`);
    const diamondsRow = await db.get(`SELECT COUNT(*) as count FROM offers WHERE desconto_pct >= 55`);

    res.json({
      offer_count: totalRow ? totalRow.count : 0,
      offers_today: todayRow ? todayRow.count : 0,
      diamonds_today: diamondsRow ? diamondsRow.count : 0
    });
  } catch (err) {
    res.status(500).json({ offer_count: 0, offers_today: 0, diamonds_today: 0 });
  }
});

// 5. Configurações e Links Sociais (GET e POST)
app.get('/api/settings', async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM settings`);
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({});
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`,
        [key, value, value]
      );
    }
    const updatedCount = await miner.updateAllAffiliateUrls();
    res.json({ ok: true, updated_offers: updatedCount });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

// 6. Proxy de Imagens das Lojas (evita erros de CORS/Hotlink)
app.get('/api/img/:id', async (req, res) => {
  try {
    const offer = await db.get(`SELECT imagem FROM offers WHERE id = ?`, [req.params.id]);
    if (!offer || !offer.imagem) {
      return res.redirect('/images/logo_completo.png');
    }

    const response = await axios({
      method: 'get',
      url: offer.imagem,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      timeout: 5000
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
    response.data.pipe(res);
  } catch (err) {
    res.redirect('/images/logo_completo.png');
  }
});

// 7. Histórico de Preços para Gráfico Sparkline
app.get('/api/price-history/:id', async (req, res) => {
  try {
    const history = await db.all(
      `SELECT price, checked_at FROM price_history WHERE offer_id = ? ORDER BY id ASC`,
      [req.params.id]
    );
    res.json(history);
  } catch (err) {
    res.status(500).json([]);
  }
});

// 8. Track de Visualizações / Clicar Oferta
app.post('/api/offers/:id/view', async (req, res) => {
  try {
    await db.run(
      `UPDATE offers SET link_clicks = link_clicks + 1, views = views + 1 WHERE id = ?`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar visualização.' });
  }
});

// 9. Redirecionamento da Oferta para a Loja Oficial (/oferta/:slug)
app.get('/oferta/:slug', async (req, res) => {
  try {
    const parts = req.params.slug.split('-');
    const id = parts[parts.length - 1];

    const offer = await db.get(`SELECT * FROM offers WHERE id = ?`, [id]);
    if (offer) {
      await db.run(`UPDATE offers SET link_clicks = link_clicks + 1 WHERE id = ?`, [id]);
      const targetUrl = offer.affiliate_url || offer.original_url;
      return res.redirect(targetUrl);
    }
  } catch (err) {
    console.error('Erro ao redirecionar oferta:', err.message);
  }
  res.redirect('/');
});

// 10. Inscrição por E-mail
app.post('/api/subscribe/email', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }

  try {
    await db.run(`INSERT INTO subscribers (email) VALUES (?)`, [email]);
    res.json({ ok: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.json({ ok: false, error: 'already' });
    }
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// 11. Alerta de Preço por WhatsApp
app.post('/api/alert/price', async (req, res) => {
  const { phone, offer_id, target_price } = req.body;
  if (!phone || !target_price) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  try {
    let productName = '';
    if (offer_id) {
      const o = await db.get(`SELECT produto FROM offers WHERE id = ?`, [offer_id]);
      if (o) productName = o.produto;
    }

    await db.run(
      `INSERT INTO alerts (phone, offer_id, target_price, product_name) VALUES (?, ?, ?, ?)`,
      [phone, offer_id || null, target_price, productName]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar alerta.' });
  }
});

// 12. Push Notifications Mock Endpoints
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa0RGF4X1z73Wv06w2' });
});
app.post('/api/push/subscribe', (req, res) => {
  res.json({ ok: true });
});
app.get('/api/pv', (req, res) => res.json({ ok: true }));

// Rota fallback para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Agendamento Cron: Varredura de Mineração a cada 15 minutos
cron.schedule('*/15 * * * *', () => {
  console.log('[CRON] ⏰ Iniciando mineração automática agendada...');
  miner.mineAll();
});

// Iniciar Servidor Express
app.listen(PORT, async () => {
  console.log(`\n==================================================`);
  console.log(`🚀 SERVIDOR OFERTAS DO GP RODANDO!`);
  console.log(`🌐 Acesse em: http://localhost:${PORT}`);
  console.log(`==================================================\n`);

  // Disparar mineração inicial em background
  miner.mineAll();
});
