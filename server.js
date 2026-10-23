const path = require('path');
const fs = require('fs');

// Configurações do servidor no arquivo .env (PORT, DATA_DIR, ADMIN_PASSWORD...), como em .env.example.
// Lido antes de tudo; o que já estiver definido no sistema vale mais que o arquivo. Sobrevive às atualizações.
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* sem .env: usa o padrão */ }

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
  res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // só o próprio site pode exibir as páginas num quadro (o SAC dentro do painel)
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Compressão (brotli/gzip) de páginas, CSS, JS e JSON. A lista de ofertas já sai comprimida pela própria rota.
app.use(require('compression')({ threshold: 1024 }));

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
// Registros de acesso (IP, data e hora) por 6 meses — Marco Civil da Internet, art. 15
app.use(require('./src/registro-acesso').middleware);
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

// Mensagens ficam no painel flutuante do canto inferior direito: /mensagens?c=ID&pedido=ID abre a página de ofertas
// com a conversa aberta no painel. A tela completa só é usada dentro de Minha conta (aba Mensagens): /mensagens/tela.
app.get(['/mensagens', '/mensagens.html'], (req, res) => {
  const q = new URLSearchParams();
  q.set('chat', String(Number(req.query.c) || ''));
  if (Number(req.query.pedido)) q.set('pedido', String(Number(req.query.pedido)));
  res.redirect(`/?${q}`);
});
app.get('/mensagens/tela', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'mensagens.html')));
// SAC: o chamado do usuário abre no painel de Mensagens; /sac é a fila de atendimento (admin e atendentes)
app.get('/sac/meu', (req, res) => res.redirect('/?sac=1'));
app.get(['/sac', '/sac.html'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'sac.html')));
// Área de trabalho da equipe (SAC e Moderação do chat); as próprias páginas conferem a permissão pela API
app.get(['/trabalho', '/trabalho.html'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'trabalho.html')));
app.get(['/moderacao', '/moderacao.html'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'moderacao.html')));
app.get(['/equipe', '/equipe.html'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'equipe.html')));
// Guia da equipe: só para quem tem cargo na equipe (ou o dono do site); fica fora de public/ para não abrir sem login
app.get('/trabalho/guia', (req, res) => {
  const dono = require('./src/perfis').donoDe(req);
  if (!dono) return res.redirect('/conta?voltar=/trabalho%23guia');
  if (!require('./src/cargos').de(dono).permissoes.length) return res.redirect('/trabalho');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'src', 'paginas', 'guia-equipe.html'));
});

// O próprio perfil fica em Minha conta (aba "Meu perfil"); admin e clientes só da ferramenta continuam em /perfil.
app.get(['/perfil', '/perfil.html'], (req, res, next) => {
  const dono = require('./src/perfis').donoDe(req);
  if (dono && dono.startsWith('u:')) return res.redirect('/conta?aba=meuperfil');
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
    // Só a etiqueta de verificação do AdSense; o script dos anúncios (que usa cookies) carrega depois do aceite (cookies.js)
    html = fs.readFileSync(arquivo, 'utf8').replace('</head>', `<meta name="google-adsense-account" content="${client}">
</head>`);
    paginaCache.set(chave, html);
  }
  res.type('html').setHeader('Cache-Control', 'no-cache');
  res.send(html);
});

// Somente a pasta public/ é servida. Banco de dados e código ficam inacessíveis.
// Cache no navegador: CSS/JS com ?v= (o número muda a cada versão) ficam guardados por 1 ano; imagens por 7 dias;
// páginas HTML são sempre conferidas (ETag), para as mudanças aparecerem na hora.
app.use(express.static(PUBLIC_DIR, {
  index: 'index.html',
  extensions: ['html'],
  setHeaders(res, arquivo) {
    if (/\.(css|js)$/.test(arquivo) && res.req.query.v) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else if (/\.(png|jpe?g|webp|svg|ico|woff2?)$/.test(arquivo)) res.setHeader('Cache-Control', 'public, max-age=604800');
    else if (/\.html$/.test(arquivo)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

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
app.use(require('./src/routes/chat'));
app.use(require('./src/routes/sac')); // SAC: chamados e fila de atendimento
app.use(require('./src/routes/trabalho')); // Área de trabalho da equipe: Moderação do chat
app.use(require('./src/routes/loja')); // página profissional das lojas: aparência, catálogos e avaliações // mensagens, pedidos às lojas e contadores de acesso

app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('/conta', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'conta.html')));
app.get('/postagens', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'postagens.html')));
app.get('/cliente', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'cliente.html')));
app.get('/assinar', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'assinar.html')));
app.get('/anuncie', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'anuncie.html')));
app.get('/privacidade', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'privacidade.html')));
app.get('/ajuda', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'ajuda.html'))); // Guia do usuário (aberto a todos)
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
    if (process.env.DISABLE_AGENDA !== '1') require('./src/agenda').iniciar();
    require('./src/pedidos-loja').iniciar(); require('./src/busca-ofertas').aquecer(); // confere no Mercado Pago os pedidos esperando pagamento // postagens agendadas (manhã, tarde, noite)
    require('./src/ganhos').iniciar(); // confere a cada hora se alguma plataforma de afiliados já tem saldo para sacar
    const acessos = require('./src/registro-acesso');
    acessos.limpar(); setInterval(acessos.limpar, 24 * 3600 * 1000); // registros de acesso com mais de 6 meses
    // Conexões das lojas com o Mercado Pago (valem 180 dias): renova as que estão perto de vencer
    const mpLojas = require('./src/mp-lojas');
    mpLojas.renovarTodas(); setInterval(() => mpLojas.renovarTodas(), 24 * 3600 * 1000);
    // Empresas: foto do perfil = logo da loja (alinha as contas antigas que estavam diferentes)
    try { require('./src/foto-loja').alinharTudo(); } catch (err) { console.error('[FOTO LOJA]', err.message); }
    const limparVitrine = () => {
      try { require('./src/vitrine').limparCache(); } catch (err) { console.error('[VITRINE]', err.message); }
    };
    limparVitrine();
    setInterval(limparVitrine, 24 * 3600 * 1000); // cartões da vitrine gerados há mais de 3 dias
  });
}
