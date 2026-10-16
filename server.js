const path = require('path');
const fs = require('fs');
const express = require('express');

const { UPLOADS_DIR } = require('./src/db');
const auth = require('./src/auth');
const miner = require('./src/miner');
const offers = require('./src/offers');
const access = require('./src/access');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');
const contaRoutes = require('./src/routes/conta');
const postagens = require('./src/routes/postagens');
const clienteRoutes = require('./src/routes/cliente');
const assinaturaRoutes = require('./src/routes/assinatura');
const appRoutes = require('./src/routes/app');
const perfilRoutes = require('./src/routes/perfil');
const ganhosRoutes = require('./src/routes/ganhos');

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

// Login obrigatório para ver as ofertas (configurável no painel).
// Mantém conectado quem já entrou: renova as sessões (site, cliente e admin) enquanto a pessoa usa o site.
app.use((req, res, next) => {
  try {
    require('./src/users').renovarSessao(req, res);
    require('./src/clientes').renovarSessao(req, res);
    require('./src/auth').renovarSessao(req, res);
  } catch (err) { console.error('[SESSAO]', err.message); }
  next();
});
app.use(access.guard);

// O painel só abre para quem entrou como "admin". Exceção: antes da senha existir, /admin mostra a criação de senha
// (aceita apenas no próprio computador do servidor).
app.use((req, res, next) => {
  if (req.method === 'GET' && /^\/admin(\.html)?\/?$/.test(req.path) && auth.hasPassword() && !auth.isLoggedIn(req)) {
    return res.redirect('/conta?voltar=/admin');
  }
  // Tela de postagens: só o admin, os usuários que ele liberou e os clientes da ferramenta.
  if (req.method === 'GET' && /^\/postagens(\.html)?\/?$/.test(req.path) && !postagens.poster(req)) {
    return res.redirect('/conta?voltar=/postagens');
  }
  next();
});

// Google AdSense: coloca a meta de verificação e o script do AdSense no <head> das páginas HTML.
// (Sem ID configurado, as páginas são servidas sem mudança.)
const paginaCache = new Map();
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const client = String(require('./src/settings').get('adsense_client') || '').trim();
  if (!/^ca-pub-\d{10,20}$/.test(client)) return next();
  let nome = req.path === '/' ? 'index.html' : req.path.replace(/^\/+/, '');
  if (!nome.endsWith('.html')) nome += '.html';
  if (!/^[a-z0-9-]+\.html$/.test(nome) || nome === 'admin.html') return next();
  const arquivo = path.join(PUBLIC_DIR, nome);
  let st;
  try { st = fs.statSync(arquivo); } catch { return next(); }
  const chave = `${arquivo}|${st.mtimeMs}|${client}`;
  let html = paginaCache.get(chave);
  if (!html) {
    html = fs.readFileSync(arquivo, 'utf8').replace('</head>', `<meta name="google-adsense-account" content="${client}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>
</head>`);
    paginaCache.set(chave, html);
  }
  res.type('html').setHeader('Cache-Control', 'no-cache');
  res.send(html);
});

// Somente a pasta public/ é servida. Banco de dados e código ficam inacessíveis.
app.use(express.static(PUBLIC_DIR, { index: 'index.html', extensions: ['html'] }));

// Fotos enviadas pelas empresas: só imagens já verificadas, sem execução de nada.
app.use('/uploads', express.static(UPLOADS_DIR, {
  index: false,
  dotfiles: 'deny',
  setHeaders: res => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  },
}));

app.use(publicRoutes);
app.use(adminRoutes);
app.use(contaRoutes);
app.use(postagens.router);
app.use(clienteRoutes);
app.use(assinaturaRoutes);
app.use(appRoutes);
app.use(perfilRoutes);
app.use(ganhosRoutes);

app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('/conta', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'conta.html')));
app.get('/postagens', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'postagens.html')));
app.get('/cliente', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'cliente.html')));
app.get('/assinar', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'assinar.html')));
app.get('/anuncie', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'anuncie.html')));
app.get('/privacidade', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'privacidade.html')));
app.get('/loja/:slug', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'loja.html')));
app.get('/anuncio/:id', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'anuncio.html')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.get('*', (req, res) => {
  // Arquivos (com extensão) e caminhos ocultos (.env, .git...) inexistentes respondem 404.
  if (path.extname(req.path) || /\/\./.test(req.path)) return res.status(404).send('Não encontrado');
  if (!access.canSeeOffers(req)) return res.redirect('/conta');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[SERVER]', err);
  res.status(err.status || 500).json({ error: 'Erro interno.' });
});

// Na Vercel o servidor não fica ligado: cada acesso executa o app exportado e não há mineração agendada.
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, HOST, () => {
    console.log('\n==================================================');
    console.log('🚀 OFERTOU! RODANDO');
    console.log(`🌐 Site:   http://localhost:${PORT}`);
    console.log(`🔐 Painel: http://localhost:${PORT}/admin`);
    console.log('==================================================\n');
    if (process.env.DISABLE_MINER !== '1') miner.startScheduler();
    if (process.env.DISABLE_AGENDA !== '1') require('./src/agenda').iniciar(); // postagens agendadas (manhã, tarde, noite)
    require('./src/ganhos').iniciar(); // confere a cada hora se alguma plataforma de afiliados já tem saldo para sacar
    const limparMarcas = () => {
      try { require('./src/watermark').limparCache(); require('./src/vitrine').limparCache(); } catch (err) { console.error('[MARCA]', err.message); }
    };
    limparMarcas();
    setInterval(limparMarcas, 24 * 3600 * 1000); // imagens com marca d'água geradas há mais de 7 dias
  });
}
