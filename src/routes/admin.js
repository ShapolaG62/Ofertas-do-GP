const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const settings = require('../settings');
const offers = require('../offers');
const miner = require('../miner');
const users = require('../users');
const lojas = require('../lojas');
const banners = require('../banners');
const whatsapp = require('../whatsapp');
const agenda = require('../agenda');
const clientes = require('../clientes');
const pagamentos = require('../pagamentos');
const anuncios = require('../anuncios');
const { STORES, getStore, storeFromUrl } = require('../stores');
const { CATEGORIES } = require('../categorize');
const { parseBRL } = require('../util');

const router = express.Router();

// ── Sessão ────────────────────────────────────────────────────────────────────
router.get('/api/admin/session', (req, res) => {
  res.json({
    loggedIn: auth.isLoggedIn(req),
    needsSetup: !auth.hasPassword(),
    canSetup: !auth.hasPassword() && auth.isLocalRequest(req),
    minPassword: auth.MIN_PASSWORD,
  });
});

router.post('/api/admin/setup', (req, res) => {
  if (auth.hasPassword()) return res.status(409).json({ error: 'A senha já foi criada.' });
  if (!auth.isLocalRequest(req)) {
    return res.status(403).json({ error: 'Crie a senha acessando o painel no próprio computador do servidor, ou defina ADMIN_PASSWORD.' });
  }
  try {
    auth.setPassword(req.body?.password);
    auth.createSession(req, res);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/login', (req, res) => {
  const ip = req.ip;
  const locked = auth.checkRateLimit(ip);
  if (locked) return res.status(429).json({ error: `Muitas tentativas. Tente de novo em ${locked} min.` });
  const stored = settings.get('admin_password_hash');
  if (!stored || !auth.verifyPassword(req.body?.password || '', stored)) {
    auth.registerFailure(ip);
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  auth.clearFailures(ip);
  auth.createSession(req, res);
  res.json({ ok: true });
});

router.post('/api/admin/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

// Daqui para baixo, tudo exige login.
router.use('/api/admin', auth.requireAdmin);

router.post('/api/admin/password', (req, res) => {
  const { current, next } = req.body || {};
  if (!auth.verifyPassword(current || '', settings.get('admin_password_hash'))) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }
  try {
    auth.setPassword(next);
    auth.createSession(req, res);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Configurações ─────────────────────────────────────────────────────────────
router.get('/api/admin/settings', (req, res) => res.json(settings.getForAdmin()));

router.put('/api/admin/settings', (req, res) => {
  const changed = settings.updateFromAdmin(req.body);
  const affiliateKeys = ['amazon_tag', 'ml_matt_word', 'ml_matt_tool', 'magalu_store', 'kabum_afiliado', 'shopee_afiliado_id'];
  const refreshed = changed.some(k => affiliateKeys.includes(k)) ? offers.refreshAffiliateLinks() : 0;
  res.json({ ok: true, changed, refreshed });
});

// ── Dashboard (resumo do site) ───────────────────────────────────────────────
router.get('/api/admin/dashboard', (req, res) => {
  try { res.json(require('../admin-painel').dashboard()); } catch (err) { console.error('[DASH]', err); res.status(500).json({ error: 'Não foi possível montar o resumo.' }); }
});

// ── Lojas e mineração ─────────────────────────────────────────────────────────
router.get('/api/admin/stores', (req, res) => {
  res.json({ ...miner.getState(), enabled: settings.getEnabledStores(), categories: CATEGORIES });
});

router.post('/api/admin/mine/parar', (req, res) => res.json(miner.pararMineracao()));

router.post('/api/admin/mine', async (req, res) => {
  const query = String(req.body?.query || '').trim().slice(0, 100);
  const storeIds = Array.isArray(req.body?.stores) ? req.body.stores : undefined;
  if (miner.getState().running) {
    return res.status(409).json({ error: 'A mineração automática está rodando agora (lote de termos). Tente de novo em alguns minutos.' });
  }
  if (query) {
    // Busca pontual: espera o resultado para mostrar na tela.
    return res.json(await miner.runMining({ query, storeIds, escolhidas: Boolean(storeIds) }));
  }
  miner.runMining({ storeIds }).catch(err => console.error('[MINER]', err));
  res.json({ ok: true, started: true });
});

// ── Ofertas ───────────────────────────────────────────────────────────────────
router.get('/api/admin/offers', (req, res) => {
  res.json(offers.listForAdmin({
    q: String(req.query.q || ''),
    store: String(req.query.store || ''),
    state: String(req.query.state || 'active'),
    page: Math.max(parseInt(req.query.page, 10) || 1, 1),
  }));
});

// Cadastro manual: dados copiados pelo admin da página da loja (sem nenhum valor inventado).
router.post('/api/admin/offers', (req, res) => {
  const b = req.body || {};
  let url;
  try {
    url = new URL(String(b.url || '').trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    return res.status(400).json({ error: 'Informe o link do produto (começando com https://).' });
  }
  const store = getStore(b.store_id) || storeFromUrl(url.href);
  if (!store) return res.status(400).json({ error: 'Não reconheci a loja deste link. Escolha a loja na lista.' });

  const atual = parseBRL(b.preco_atual);
  const anterior = parseBRL(b.preco_anterior);
  if (!atual || !anterior || anterior <= atual) {
    return res.status(400).json({ error: 'O preço anterior (riscado na loja) precisa ser maior que o preço atual.' });
  }
  const affiliate = String(b.affiliate_url || '').trim();
  if (affiliate && !/^https?:\/\//i.test(affiliate)) return res.status(400).json({ error: 'Link de afiliado inválido.' });
  const imagem = String(b.imagem || '').trim();
  if (imagem && !/^https:\/\//i.test(imagem)) return res.status(400).json({ error: 'O link da imagem precisa começar com https://.' });

  const dias = Math.min(Math.max(parseInt(b.dias, 10) || settings.getNumber('manual_offer_days', 3), 1), 60);
  const productId = store.productIdFromUrl(url.href)
    || crypto.createHash('sha1').update(url.origin + url.pathname).digest('hex').slice(0, 16);
  const expires = new Date(Date.now() + dias * 86400000).toISOString().replace('T', ' ').slice(0, 19);

  const id = offers.saveDeal(store, {
    store_product_id: productId,
    produto: b.produto,
    preco_atual: atual,
    preco_anterior: anterior,
    imagem: imagem || null,
    original_url: url.href,
    affiliate_url: affiliate || null,
    categoria: CATEGORIES.includes(b.categoria) ? b.categoria : null,
  }, { fonte: 'manual', expiresAt: expires });

  if (!id) return res.status(400).json({ error: 'Oferta rejeitada: confira o título e os preços (desconto entre 1% e 95%).' });
  res.json({ ok: true, id });
});

router.patch('/api/admin/offers/:id', (req, res) => {
  const id = Number(req.params.id);
  if (typeof req.body?.oculto === 'boolean') {
    db.run('UPDATE offers SET oculto = ? WHERE id = ?', req.body.oculto ? 1 : 0, id);
  }
  res.json({ ok: true });
});

router.delete('/api/admin/offers/:id', (req, res) => {
  db.run('DELETE FROM offers WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

// ── Usuários do site e lojas parceiras ────────────────────────────────────────
router.get('/api/admin/users', (req, res) => {
  res.json(users.listForAdmin({
    q: String(req.query.q || '').trim(),
    tipo: String(req.query.tipo || ''),
    status: String(req.query.status || ''),
    page: Math.max(parseInt(req.query.page, 10) || 1, 1),
  }));
});

router.get('/api/admin/users/:id', (req, res) => {
  const data = users.detailForAdmin(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'Usuário não encontrado.' });
  data.consentimentos = require('../consentimento').historico(data.user.id, data.user.email);
  // Registro de atividades: conversas, pedidos feitos e (empresa) pedidos recebidos e números da loja
  const chat = require('../chat'), pedidosLoja = require('../pedidos-loja');
  const dono = `u:${data.user.id}`;
  data.atividade = {
    conversas: chat.listarAdmin({ dono, limite: 100 }),
    pedidos_feitos: pedidosLoja.listarAdmin({ dono, limite: 100 }),
    pedidos_recebidos: data.loja ? pedidosLoja.listarAdmin({ lojaId: data.loja.id, limite: 200 }) : [],
    metricas: data.loja ? pedidosLoja.metricas(data.loja.id) : null,
  };
  res.json(data);
});


// Troca manual do plano da conta (qualquer plano, inclusive grátis ou fora de venda; ou "sem plano")
router.post('/api/admin/users/:id/plano', (req, res) => {
  try {
    const u = require('../plano-manual').trocar(Number(req.params.id), req.body || {});
    res.json({ ok: true, plano: u.plano, assinatura_ate: u.assinatura_ate, tipo: u.tipo, status: u.status });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

router.post('/api/admin/users/:id/acao', (req, res) => {
  const b = req.body || {};
  try {
    users.moderate(Number(req.params.id), String(b.acao || ''), {
      motivo: b.motivo, dias: b.dias, bloquearEmail: Boolean(b.bloquear_email),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post('/api/admin/lojas/:id/visibilidade', (req, res) => {
  const lojaId = Number(req.params.id);
  const loja = db.get('SELECT l.*, u.email FROM lojas l JOIN users u ON u.id = l.user_id WHERE l.id = ?', lojaId);
  if (!loja) return res.status(404).json({ error: 'Loja não encontrada.' });
  const oculta = Boolean(req.body?.oculta);
  lojas.setHidden(lojaId, oculta);
  users.logAction(users.getById(loja.user_id), oculta ? 'loja_ocultada' : 'loja_reexibida', String(req.body?.motivo || '').slice(0, 300) || null);
  res.json({ ok: true });
});

router.post('/api/admin/lojas/:id/sincronizar', async (req, res) => {
  res.json(await lojas.syncFeed(Number(req.params.id)));
});

router.get('/api/admin/moderacao', (req, res) => {
  res.json(db.all('SELECT * FROM moderation_log ORDER BY id DESC LIMIT 200'));
});

router.get('/api/admin/store-list', (req, res) => {
  res.json(STORES.map(s => ({ id: s.id, name: s.name, automatic: s.automatic })));
});

// ── Atendimento: conversas, pedidos às lojas e números de cada loja ──────────
router.get('/api/admin/atendimento', (req, res) => {
  const chat = require('../chat'), pedidosLoja = require('../pedidos-loja');
  const q = String(req.query.q || '');
  const lojasLista = db.all(`SELECT l.id, l.nome, l.slug, l.user_id, l.oculta, l.aceita_pedidos, (l.mp_access_token IS NOT NULL) AS mp_conectado, l.mp_erro FROM lojas l ORDER BY l.nome`).map(l => {
    const m = pedidosLoja.metricas(l.id);
    return { ...l, finalizacoes: m.finalizacoes, pedidos: m.pedidos.total, conversas: m.conversas, taxas: m.taxas,
      acessos30: m.acessos.pagina.d30, produtos30: m.acessos.produto.d30, site30: m.acessos.site.d30, acessos: m.acessos.pagina.total };
  });
  res.json({ conversas: chat.listarAdmin({ q }), pedidos: pedidosLoja.listarAdmin({ q }), lojas: lojasLista,
    taxa: { pct: pedidosLoja.taxaPct(), gateway_ok: pedidosLoja.gatewayPronto(), retorno: require('../mp-lojas').retornoUrl(), site_https: /^https:\/\//i.test(String(require('../settings').get('site_url') || '')),
      app_ok: Boolean(String(require('../settings').get('mp_mkt_client_id') || '').trim() && require('../settings').get('mp_mkt_client_secret')) } });
});
// Vídeos patrocinados (as pessoas assistem e ganham moedas para a Loja de cosméticos)
// ── Alertas de ofertas no WhatsApp particular ──
router.get('/api/admin/alertas-whatsapp', (req, res) => res.json(require('../alertas-whatsapp').resumo()));
router.post('/api/admin/alertas-whatsapp', (req, res) => {
  settings.set('alertas_wa_ativo', req.body?.ativo ? '1' : '0');
  res.json(require('../alertas-whatsapp').resumo());
});

// ── Acessos suspeitos (varredura de IP) ──
router.get('/api/admin/acessos/varredura', (req, res) => {
  res.json(require('../varredura-ip').varrer({ horas: req.query.horas, km: req.query.km, maxHoras: req.query.max_horas }));
});
router.post('/api/admin/acessos/visto', (req, res) => { require('../varredura-ip').marcarVisto(); res.json({ ok: true }); });
router.post('/api/admin/acessos/dispensar', (req, res) => {
  const dono = String(req.body?.dono || '').slice(0, 40);
  if (!/^(admin|[uc]:\d+)$/.test(dono)) return res.status(400).json({ error: 'Conta inválida.' });
  require('../varredura-ip').dispensar(dono);
  res.json({ ok: true });
});
router.get('/api/admin/acessos/historico', (req, res) => res.json(require('../varredura-ip').historico(req.query.dono, req.query.horas)));
router.get('/api/admin/acessos/ip', (req, res) => {
  const ip = String(req.query.ip || '').trim().slice(0, 64);
  const geoip = require('../geoip');
  res.json({ ip, local: geoip.localizar(ip), contas: db.all('SELECT dono, COUNT(*) AS n, MAX(created_at) AS ultimo FROM registros_acesso WHERE ip = ? AND dono IS NOT NULL GROUP BY dono ORDER BY ultimo DESC LIMIT 50', ip)
    .map(r => ({ ...r, ...require('../varredura-ip').quem(r.dono) })) });
});
router.get('/api/admin/acessos/geoip', (req, res) => res.json({ ...require('../geoip').info(), atualizando: require('../geoip').atualizandoAgora(), erro: geoErro }));
let geoErro = null;
router.post('/api/admin/acessos/geoip/atualizar', (req, res) => {
  const geoip = require('../geoip');
  geoErro = null;
  geoip.atualizar().catch(err => { geoErro = err.message; console.error('[GEOIP]', err.message); });
  res.json({ ok: true, atualizando: true });
});

// ── Avisos na entrada (janelas na tela de ofertas) ──
const avisos = require('../avisos');
const respostaAvisos = () => ({ avisos: avisos.listar(), tipos: avisos.TIPOS, publicos: avisos.PUBLICOS, frequencias: avisos.FREQUENCIAS, max: avisos.MAX_ATIVOS });
router.get('/api/admin/avisos', (req, res) => res.json(respostaAvisos()));
router.post('/api/admin/avisos', (req, res) => {
  try { avisos.salvar(req.body); res.json(respostaAvisos()); } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});
router.put('/api/admin/avisos/:id', (req, res) => {
  try { avisos.salvar(req.body, Number(req.params.id)); res.json(respostaAvisos()); } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});
router.patch('/api/admin/avisos/:id', (req, res) => { avisos.ligar(Number(req.params.id), Boolean(req.body?.ativo)); res.json(respostaAvisos()); });
router.delete('/api/admin/avisos/:id', (req, res) => { avisos.excluir(Number(req.params.id)); res.json(respostaAvisos()); });

router.get('/api/admin/videos-patrocinados', (req, res) => res.json(require('../cosmeticos').listarVideosAdmin()));
router.post('/api/admin/videos-patrocinados', (req, res) => {
  try { res.json(require('../cosmeticos').salvarVideo(req.body || {})); } catch (err) { sendError(res, err); }
});
router.put('/api/admin/videos-patrocinados/:id', (req, res) => {
  try { res.json(require('../cosmeticos').salvarVideo(req.body || {}, req.params.id)); } catch (err) { sendError(res, err); }
});
router.delete('/api/admin/videos-patrocinados/:id', (req, res) => {
  try { res.json(require('../cosmeticos').excluirVideo(req.params.id)); } catch (err) { sendError(res, err); }
});
router.get('/api/admin/conversas/:id', (req, res) => {
  try { res.json(require('../chat').transcricao(req.params.id)); } catch (err) { sendError(res, err); }
});
router.get('/api/admin/pedidos-loja/:id', (req, res) => {
  try { res.json(require('../pedidos-loja').detalheAdmin(req.params.id)); } catch (err) { sendError(res, err); }
});

// ── Planos e pagamentos ──────────────────────────────────────────────────────
const planos = require('../planos');
router.get('/api/admin/planos', (req, res) => {
  res.json({
    planos: planos.todos().map(p => ({ ...p, assinantes: planos.assinantes(p.id) })),
    tipos: planos.TIPOS, funcoes: planos.FUNCOES_TIPO, padrao: planos.PERFIL_PADRAO, limites: planos.PERFIL_LIMITES,
  });
});
router.post('/api/admin/planos', (req, res) => {
  try { res.json({ ok: true, plano: planos.criar(req.body || {}) }); } catch (err) { sendError(res, err); }
});
router.put('/api/admin/planos/:id', (req, res) => {
  try { res.json({ ok: true, plano: planos.editar(req.params.id, req.body || {}) }); } catch (err) { sendError(res, err); }
});
router.delete('/api/admin/planos/:id', (req, res) => {
  try { res.json({ ok: true, ...planos.excluir(req.params.id) }); } catch (err) { sendError(res, err); }
});
router.post('/api/admin/planos/sugerir-beneficios', (req, res) => {
  res.json({ beneficios: planos.sugerirBeneficios(req.body || {}) });
});

router.get('/api/admin/pagamentos', (req, res) => {
  res.json({ pedidos: pagamentos.listar(), metodos: pagamentos.metodosDisponiveis(), email: require('../email').configurado() });
});

router.post('/api/admin/pagamentos/:id/confirmar', (req, res) => {
  try { res.json({ ok: true, pedido: pagamentos.confirmarManual(Number(req.params.id)) }); } catch (err) { sendError(res, err); }
});

router.post('/api/admin/pagamentos/:id/reembolsado', (req, res) => {
  try { res.json({ ok: true, pedido: require('../arrependimento').marcarReembolsado(req.params.id, req.body?.obs) }); } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});
router.post('/api/admin/pagamentos/:id/cancelar', (req, res) => {
  pagamentos.cancelar(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/api/admin/pagamentos/:id/email', async (req, res) => {
  try { await pagamentos.reenviarEmail(Number(req.params.id)); res.json({ ok: true }); } catch (err) { sendError(res, err); }
});

router.post('/api/admin/email/teste', async (req, res) => {
  const para = String(req.body?.para || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  try {
    await require('../email').enviar({ para, assunto: 'Teste de e-mail — Ofertou!', texto: 'Se você recebeu esta mensagem, o e-mail do site está funcionando.' });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: `Falha ao enviar: ${err.message}` }); }
});

// ── Clientes da ferramenta (acesso vendido) ──────────────────────────────────
router.get('/api/admin/clientes', (req, res) => res.json(clientes.listar()));

router.post('/api/admin/clientes', (req, res) => {
  try { res.json({ ok: true, id: clientes.criar(req.body || {}) }); } catch (err) { sendError(res, err); }
});

router.put('/api/admin/clientes/:id', (req, res) => {
  try { clientes.editar(Number(req.params.id), req.body || {}); res.json({ ok: true }); } catch (err) { sendError(res, err); }
});

router.post('/api/admin/clientes/:id/renovar', (req, res) => {
  try { clientes.renovar(Number(req.params.id), req.body?.dias); res.json({ ok: true }); } catch (err) { sendError(res, err); }
});

router.post('/api/admin/clientes/:id/status', (req, res) => {
  try { clientes.definirStatus(Number(req.params.id), String(req.body?.status || '')); res.json({ ok: true }); } catch (err) { sendError(res, err); }
});

router.delete('/api/admin/clientes/:id', (req, res) => {
  clientes.excluir(Number(req.params.id));
  res.json({ ok: true });
});

// ── WhatsApp e postagens agendadas ───────────────────────────────────────────
router.get('/api/admin/whatsapp/status', async (req, res) => {
  res.json(await whatsapp.status(settings.getAll()));
});

router.get('/api/admin/whatsapp/grupos', async (req, res) => {
  try {
    res.json({ grupos: await whatsapp.listarGrupos(settings.getAll()), escolhidos: whatsapp.gruposEscolhidos(settings.getAll()) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/api/admin/agenda', (req, res) => {
  res.json({ estado: agenda.estado(), fila: agenda.listarFila() });
});

// Roda uma rodada agora (para testar); a publicação continua em segundo plano.
router.post('/api/admin/agenda/executar', (req, res) => {
  if (agenda.estado().rodando) return res.status(409).json({ error: 'Já existe uma rodada em andamento.' });
  const r = agenda.executar('manual pelo painel');
  r.then(x => x?.erro && console.log('[AGENDA]', x.erro)).catch(err => console.error('[AGENDA]', err));
  res.json({ ok: true });
});

router.delete('/api/admin/agenda/fila/:id', (req, res) => {
  agenda.removerDaFila(Number(req.params.id));
  res.json({ ok: true });
});

router.delete('/api/admin/agenda/fila', (req, res) => {
  res.json({ ok: true, removidos: agenda.limparFila() });
});

// ── Publicidade (banners de empresas) ─────────────────────────────────────────
const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message });

router.get('/api/admin/publicidade', (req, res) => {
  res.json({
    espacos: banners.ESPACOS,
    video: banners.VIDEO,
    campanhas: banners.listCampaigns(),
    pedidos: banners.listLeads(),
    novos: banners.newLeadsCount(),
  });
});

router.post('/api/admin/publicidade/upload',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }),
  (req, res) => {
    try { res.json({ ok: true, url: anuncios.saveUpload(req.body) }); } catch (err) { sendError(res, err); }
  });

// Vídeo do banner (MP4 ou WEBM, sem som, até 15 s e 8 MB).
router.post('/api/admin/publicidade/video',
  express.raw({ type: ['video/mp4', 'video/webm'], limit: '8mb' }),
  (req, res) => {
    try { res.json({ ok: true, url: banners.saveVideo(req.body) }); } catch (err) { sendError(res, err); }
  });

router.post('/api/admin/publicidade', (req, res) => {
  try { res.json({ ok: true, id: banners.saveCampaign(req.body || {}) }); } catch (err) { sendError(res, err); }
});

router.put('/api/admin/publicidade/:id', (req, res) => {
  try { res.json({ ok: true, id: banners.saveCampaign(req.body || {}, Number(req.params.id)) }); } catch (err) { sendError(res, err); }
});

router.patch('/api/admin/publicidade/:id', (req, res) => {
  banners.setActive(Number(req.params.id), Boolean(req.body?.ativo));
  res.json({ ok: true });
});

router.delete('/api/admin/publicidade/:id', (req, res) => {
  banners.deleteCampaign(Number(req.params.id));
  res.json({ ok: true });
});

router.patch('/api/admin/pedidos-publicidade/:id', (req, res) => {
  banners.setLeadStatus(Number(req.params.id), String(req.body?.status || ''));
  res.json({ ok: true });
});

router.delete('/api/admin/pedidos-publicidade/:id', (req, res) => {
  banners.deleteLead(Number(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
