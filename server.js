const path = require('path');
const express = require('express');

require('./src/db');
const auth = require('./src/auth');
const miner = require('./src/miner');
const offers = require('./src/offers');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

auth.initFromEnv();
auth.purgeExpiredSessions();
offers.reclassifyAll();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // atrás do Nginx na VPS

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '100kb' }));

// Somente a pasta public/ é servida. Banco de dados e código ficam inacessíveis.
app.use(express.static(PUBLIC_DIR, { index: 'index.html', extensions: ['html'] }));

app.use(publicRoutes);
app.use(adminRoutes);

app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.get('*', (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Não encontrado');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[SERVER]', err);
  res.status(err.status || 500).json({ error: 'Erro interno.' });
});

app.listen(PORT, HOST, () => {
  console.log('\n==================================================');
  console.log('🚀 OFERTAS DO GP RODANDO');
  console.log(`🌐 Site:   http://localhost:${PORT}`);
  console.log(`🔐 Painel: http://localhost:${PORT}/admin`);
  console.log('==================================================\n');
  if (process.env.DISABLE_MINER !== '1') miner.startScheduler();
});
