// Perfis estilo Steam: todos que acessam o site têm um (contas do site, clientes da ferramenta e o admin).
// O que cada um pode personalizar depende do plano; conquistas vêm de métricas reais do site
// (idas à loja, postagens, cliques nos links, anúncios) e de vendas/compras confirmadas pelo admin.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const auth = require('./auth');
const users = require('./users');
const clientes = require('./clientes');
const { LISTA, POR_ID, FAMILIAS, nivel } = require('./conquistas');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const DIR = path.join(db.UPLOADS_DIR, 'perfis');
fs.mkdirSync(DIR, { recursive: true });

// ── Aparência liberada por plano ─────────────────────────────────────────────
const CORES_BASICAS = ['verde', 'azul', 'roxo', 'laranja', 'vermelho', 'grafite'];
const CORES_EXTRAS = ['rosa', 'dourado', 'ciano', 'vinho'];
const GRADIENTES = ['aurora', 'por-do-sol', 'oceano', 'neon', 'galaxia'];
// Conta gratuita e admin têm limites fixos; os planos pagos têm os do próprio plano (Painel → Planos).
const FIXOS = {
  gratis: { rotulo: 'Conta gratuita', vitrine: 3, bio: 160, capa: false, links: 0, slug_livre: false, cores: CORES_BASICAS, gradiente: false, moldura: false, selo: '' },
  admin: { rotulo: 'Administrador', vitrine: 12, bio: 800, capa: true, links: 6, slug_livre: true, cores: [...CORES_BASICAS, ...CORES_EXTRAS, ...GRADIENTES], gradiente: true, moldura: true, selo: '' },
};
function limitesDe(id) {
  if (FIXOS[id]) return FIXOS[id];
  const p = require('./planos').plano(id);
  if (!p) return FIXOS.gratis;
  const pf = p.recursos.perfil;
  return {
    rotulo: p.nome, tipo: p.tipo, vitrine: pf.vitrine, bio: pf.bio, capa: pf.capa, links: pf.links, slug_livre: pf.slug_livre,
    cores: [...CORES_BASICAS, ...(pf.cores_extras || pf.gradiente ? CORES_EXTRAS : []), ...(pf.gradiente ? GRADIENTES : [])],
    gradiente: pf.gradiente, moldura: pf.moldura, selo: pf.selo,
  };
}
// Todos os planos (para mostrar no editor qual plano libera cada cor)
const todosLimites = () => ({ gratis: FIXOS.gratis, ...Object.fromEntries(require('./planos').listar().map(p => [p.id, limitesDe(p.id)])) });
// Molduras do avatar: liberadas pelo nível (e pelo plano)
const MOLDURAS = [
  { id: 'nenhuma', nome: 'Sem moldura', nivel: 0 },
  { id: 'bronze', nome: 'Bronze', nivel: 3 },
  { id: 'prata', nome: 'Prata', nivel: 8 },
  { id: 'ouro', nome: 'Ouro', nivel: 15 },
  { id: 'diamante', nome: 'Diamante', nivel: 25 },
  { id: 'pro', nome: 'Moldura do plano', especial: true }, // planos com "moldura exclusiva"
  { id: 'coroa', nome: 'Coroa do admin', plano: 'admin' },
  // Temporada e datas comemorativas de 2027 (horário de Brasília): quem entra no site durante o período ganha a
  // moldura e fica com ela para sempre. Depois do fim, quem não ganhou não consegue mais.
  { id: 'temporada-1', nome: '1ª Temporada', evento: true, de: '2026-10-01', ate: '2027-03-31' },
  { id: 'ano-novo-2027', nome: 'Ano Novo 2027', evento: true, de: '2027-01-01', ate: '2027-01-10' },
  { id: 'carnaval-2027', nome: 'Carnaval 2027', evento: true, de: '2027-02-05', ate: '2027-02-10' },
  { id: 'consumidor-2027', nome: 'Dia do Consumidor', evento: true, de: '2027-03-10', ate: '2027-03-15' },
  { id: 'pascoa-2027', nome: 'Páscoa 2027', evento: true, de: '2027-03-22', ate: '2027-04-04' },
  { id: 'terra-2027', nome: 'Dia da Terra', evento: true, de: '2027-04-18', ate: '2027-04-25' },
  { id: 'maes-2027', nome: 'Dia das Mães', evento: true, de: '2027-05-03', ate: '2027-05-09' },
  { id: 'halloween-2027', nome: 'Halloween 2027', evento: true, de: '2027-10-24', ate: '2027-10-31' },
  { id: 'black-friday-2027', nome: 'Black Friday 2027', evento: true, de: '2027-11-22', ate: '2027-11-29' },
  { id: 'natal-2027', nome: 'Natal 2027', evento: true, de: '2027-12-15', ate: '2027-12-26' },
];
db.db.exec(`CREATE TABLE IF NOT EXISTS molduras_ganhas (
  dono TEXT NOT NULL, moldura TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (dono, moldura))`);
const hojeBrasilia = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
// Dá as molduras dos eventos que estão acontecendo agora (chamado quando a pessoa usa o site logada)
function ganharMolduras(dono) {
  const hoje = hojeBrasilia();
  for (const mo of MOLDURAS) {
    if (mo.evento && hoje >= mo.de && hoje <= mo.ate) db.run('INSERT OR IGNORE INTO molduras_ganhas (dono, moldura) VALUES (?, ?)', dono, mo.id);
  }
}
const molduraGanhas = dono => new Set(db.all('SELECT moldura FROM molduras_ganhas WHERE dono = ?', dono).map(r => r.moldura));
const diaMes = s => s.slice(8, 10) + '/' + s.slice(5, 7);
// Catálogo para o editor: todas as molduras, com o que falta para liberar cada uma
function catalogoMolduras(pl, lim, nivelAtual, ganhas) {
  const hoje = hojeBrasilia();
  return MOLDURAS.filter(mo => mo.id !== 'coroa' || pl === 'admin').map(mo => {
    const livre = molduraLiberada(mo, pl, lim, nivelAtual, ganhas);
    let req = mo.especial ? 'planos com moldura' : mo.plano ? 'admin' : mo.nivel ? `nível ${mo.nivel}` : 'livre';
    if (mo.evento) req = hoje > mo.ate ? 'evento encerrado' : hoje < mo.de ? `entre no site de ${diaMes(mo.de)} a ${diaMes(mo.ate)}` : 'disponível agora';
    return { id: mo.id, nome: mo.nome, livre, req, evento: Boolean(mo.evento), ...(mo.evento ? { de: mo.de, ate: mo.ate, ganha: ganhas.has(mo.id) } : {}) };
  });
}
function molduraLiberada(mo, pl, lim, nivelAtual, ganhas = new Set()) {
  if (pl === 'admin') return true;
  if (mo.evento) return ganhas.has(mo.id);
  if (mo.plano) return mo.plano === pl;
  if (mo.especial) return Boolean(lim.moldura);
  return nivelAtual >= mo.nivel;
}
const TIPOS_LINK = { site: 'Site', instagram: 'Instagram', whatsapp: 'Grupo de WhatsApp', telegram: 'Telegram', youtube: 'YouTube', tiktok: 'TikTok' };
const RESERVADOS = new Set(['admin', 'api', 'conta', 'cliente', 'perfil', 'perfis', 'editar', 'ofertou', 'suporte', 'loja', 'oferta']);

// ── Quem é o dono ────────────────────────────────────────────────────────────
// 'admin' | 'u:<id>' (conta do site; o acesso de cliente ligado à conta usa o mesmo perfil) | 'c:<id>' (cliente avulso)
function donoDe(req) {
  if (auth.isLoggedIn(req)) return 'admin';
  const u = users.currentUser(req);
  if (u && u.status === 'active') return `u:${u.id}`;
  const c = clientes.atual(req);
  if (c) {
    const ligado = db.get('SELECT id FROM users WHERE cliente_id = ?', c.id);
    return ligado ? `u:${ligado.id}` : `c:${c.id}`;
  }
  return null;
}

function contexto(dono) {
  if (dono === 'admin') return { dono, tipo: 'admin' };
  const [t, idStr] = String(dono).split(':');
  const id = Number(idStr);
  if (t === 'u') {
    const user = users.getById(id);
    if (!user) return null;
    const cliente = user.cliente_id ? clientes.getById(user.cliente_id) : null;
    return { dono, tipo: 'usuario', user, cliente };
  }
  if (t === 'c') {
    const cliente = clientes.getById(id);
    return cliente ? { dono, tipo: 'cliente', cliente } : null;
  }
  return null;
}

const ativo = ate => Boolean(ate && ate > nowSql());
function plano(ctx) {
  if (ctx.tipo === 'admin') return 'admin';
  if (ctx.tipo === 'cliente') {
    if (!ativo(ctx.cliente.validade) || ctx.cliente.status !== 'ativo') return 'gratis';
    const planos = require('./planos');
    return (ctx.cliente.plano && planos.plano(ctx.cliente.plano) && ctx.cliente.plano) || (planos.plano('pro') && 'pro') || planos.planoFerramenta()?.id || 'gratis';
  }
  const u = ctx.user;
  if (u.plano && ativo(u.assinatura_ate) && require('./planos').plano(u.plano)) return u.plano;
  return 'gratis';
}
// Perfil (papel) mostrado no topo: decide quais famílias de conquistas aparecem.
function papel(ctx) {
  if (ctx.tipo === 'admin') return 'admin';
  if (ctx.tipo === 'cliente') return 'afiliado';
  if (ctx.user.tipo === 'afiliado' || ctx.user.cliente_id) return 'afiliado';
  return ctx.user.tipo === 'empresa' ? 'empresa' : 'consumidor';
}
const ROTULO_PAPEL = { admin: 'Administrador', afiliado: 'Afiliado', empresa: 'Empresa', consumidor: 'Consumidor' };

// ── Linha do perfil ──────────────────────────────────────────────────────────
const slugify = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

function nomePadrao(ctx) {
  if (ctx.tipo === 'admin') return 'Ofertou!';
  const base = ctx.user || ctx.cliente;
  if (ctx.user?.tipo === 'empresa' && ctx.user.empresa_nome) return ctx.user.empresa_nome;
  return base.nome || base.email.split('@')[0];
}

function garantir(ctx) {
  const atual = db.get('SELECT * FROM perfis WHERE dono = ?', ctx.dono);
  if (atual) return atual;
  const nome = nomePadrao(ctx).slice(0, 40);
  let slug = ctx.tipo === 'admin' ? 'ofertou' : slugify(nome) || 'perfil';
  if (ctx.tipo !== 'admin' || db.get('SELECT 1 FROM perfis WHERE slug = ?', slug)) {
    const sufixo = ctx.tipo === 'admin' ? 'admin' : ctx.dono.replace(':', '');
    slug = `${slug}-${sufixo}`.slice(0, 30);
  }
  while (db.get('SELECT 1 FROM perfis WHERE slug = ?', slug)) slug = `${slug.slice(0, 24)}-${crypto.randomBytes(2).toString('hex')}`;
  // Empresa com loja: a foto do perfil é o logo da loja (ver foto-loja.js)
  const avatar = ctx.tipo === 'admin' ? '/images/pet-capi-head.png' : (ctx.user && require('./foto-loja').logoDaConta(ctx.user.id)) || ctx.user?.avatar_url || null;
  db.run('INSERT INTO perfis (dono, slug, nome, avatar, cor, moldura) VALUES (?, ?, ?, ?, ?, ?)',
    ctx.dono, slug, nome, avatar, ctx.tipo === 'admin' ? 'dourado' : 'verde', ctx.tipo === 'admin' ? 'coroa' : 'nenhuma');
  return db.get('SELECT * FROM perfis WHERE dono = ?', ctx.dono);
}

// ── Métricas ─────────────────────────────────────────────────────────────────
const contador = (dono, chave) => db.get('SELECT valor FROM metricas WHERE dono = ? AND chave = ?', dono, chave)?.valor || 0;
const vendas = (dono, tipo) => db.get('SELECT COALESCE(SUM(quantidade), 0) n FROM vendas_registro WHERE dono = ? AND tipo = ?', dono, tipo).n;
// Dias de conta contando o primeiro (quem entrou hoje já tem 1 dia).
const dias = desde => (desde ? Math.max(0, Math.floor((Date.now() - new Date(String(desde).replace(' ', 'T') + 'Z')) / 86400000)) + 1 : 0);

function incrementar(dono, chave, n = 1) {
  if (!dono) return;
  db.run(`INSERT INTO metricas (dono, chave, valor) VALUES (?, ?, ?)
          ON CONFLICT(dono, chave) DO UPDATE SET valor = valor + excluded.valor`, dono, chave, n);
}

function metricas(ctx, perfil) {
  const m = {
    idas_loja: contador(ctx.dono, 'idas_loja'),
    cliques_links: contador(ctx.dono, 'cliques_links'),
    compras_codigo: vendas(ctx.dono, 'compra'),
    vendas_afiliado: vendas(ctx.dono, 'afiliado'),
    vendas_empresa: vendas(ctx.dono, 'empresa'),
    perfil_completo: perfil.avatar && perfil.bio ? 1 : 0,
    postagens: 0, anuncios: 0, cliques_anuncios: 0, dias_conta: 0,
    assinante: 0, ferramenta: 0, pioneiro: 0, admin: 0,
  };
  if (ctx.tipo === 'admin') {
    // O admin acompanha o site inteiro.
    m.admin = 1; m.assinante = 1; m.ferramenta = 1; m.pioneiro = 1;
    m.dias_conta = dias(db.get('SELECT MIN(created_at) d FROM offers').d);
    m.idas_loja += db.get('SELECT COALESCE(SUM(link_clicks), 0) n FROM offers WHERE loja_id IS NULL').n;
    m.postagens = db.get(`SELECT COUNT(*) n FROM social_posts WHERE ok = 1 AND cliente_id IS NULL AND autor = 'admin'`).n;
    m.anuncios = db.get('SELECT COUNT(*) n FROM offers WHERE loja_id IS NOT NULL').n;
    m.cliques_anuncios = db.get('SELECT COALESCE(SUM(link_clicks), 0) n FROM offers WHERE loja_id IS NOT NULL').n;
    // Vendas confirmadas nos programas de afiliados (Painel → Ganhos) contam para as conquistas do admin
    try { m.vendas_afiliado += require('./ganhos').vendasConfirmadas(); } catch { /* sem ganhos */ }
    return m;
  }
  const u = ctx.user;
  const c = ctx.cliente;
  m.dias_conta = dias((u || c).created_at);
  m.assinante = plano(ctx) !== 'gratis' ? 1 : 0;
  m.ferramenta = c ? 1 : 0;
  m.pioneiro = u && u.id <= 100 ? 1 : 0;
  if (c) m.postagens += db.get('SELECT COUNT(*) n FROM social_posts WHERE ok = 1 AND cliente_id = ?', c.id).n;
  if (u) m.postagens += db.get('SELECT COUNT(*) n FROM social_posts WHERE ok = 1 AND cliente_id IS NULL AND autor = ?', u.email).n;
  if (u && u.tipo === 'empresa') {
    const loja = db.get('SELECT id FROM lojas WHERE user_id = ?', u.id);
    if (loja) {
      const r = db.get('SELECT COUNT(*) n, COALESCE(SUM(link_clicks), 0) cliques FROM offers WHERE loja_id = ?', loja.id);
      m.anuncios = r.n; m.cliques_anuncios = r.cliques;
    }
  }
  return m;
}

// ── Conquistas ───────────────────────────────────────────────────────────────
function relevante(c, pap) {
  return pap === 'admin' || c.para === 'todos' || c.para === pap;
}

function avaliar(ctx, perfil) {
  const pap = papel(ctx);
  const m = metricas(ctx, perfil);
  const obtidas = Object.fromEntries(db.all('SELECT conquista, obtida_em FROM conquistas_obtidas WHERE dono = ?', ctx.dono).map(r => [r.conquista, r.obtida_em]));
  const lista = [];
  for (const c of LISTA) {
    if (!relevante(c, pap)) continue;
    const valor = m[c.metrica] || 0;
    const ganhou = valor >= c.alvo;
    if (ganhou && !obtidas[c.id]) {
      db.run('INSERT OR IGNORE INTO conquistas_obtidas (dono, conquista) VALUES (?, ?)', ctx.dono, c.id);
      obtidas[c.id] = nowSql();
    }
    // Uma vez ganha, fica (mesmo se o plano acabar).
    lista.push({ ...c, obtida: Boolean(obtidas[c.id]), obtida_em: obtidas[c.id] || null, progresso: Math.min(valor, c.alvo) });
  }
  const xp = lista.filter(c => c.obtida).reduce((s, c) => s + c.xp, 0);
  return { lista, metricas: m, nivel: nivel(xp), papel: pap };
}

// ── Saída para a página ──────────────────────────────────────────────────────
const json = (t, padrao) => { try { return JSON.parse(t) ?? padrao; } catch { return padrao; } };

function montar(perfil, ctx, { proprio = false, admin = false, visitante = null } = {}) {
  const pl = plano(ctx);
  const lim = limitesDe(pl);
  const av = avaliar(ctx, perfil);
  const obtidas = av.lista.filter(c => c.obtida);
  let vitrine = json(perfil.vitrine, []).filter(id => obtidas.some(c => c.id === id)).slice(0, lim.vitrine);
  if (!vitrine.length) vitrine = [...obtidas].sort((a, b) => b.xp - a.xp || (b.obtida_em > a.obtida_em ? 1 : -1)).slice(0, lim.vitrine).map(c => c.id);
  // O admin tem tudo liberado.
  const ganhas = molduraGanhas(ctx.dono);
  const molduras = MOLDURAS.filter(mo => molduraLiberada(mo, pl, lim, av.nivel.nivel, ganhas));
  const familias = [...FAMILIAS.map(f => ({ id: f.id, nome: f.nome, icone: f.icone })), { id: 'especiais', nome: 'Especiais', icone: '✨' }]
    .map(f => ({ ...f, itens: av.lista.filter(c => c.familia === f.id) })).filter(f => f.itens.length);
  const loja = ctx.user?.tipo === 'empresa' ? db.get('SELECT nome, slug FROM lojas WHERE user_id = ?', ctx.user.id) : null;
  const selos = [];
  if (ctx.tipo === 'admin') selos.push({ id: 'admin', nome: 'Equipe Ofertou!' });
  if (lim.selo && pl !== 'admin' && pl !== 'gratis') selos.push({ id: { ferramenta: 'pro', empresa: 'loja' }[lim.tipo] || 'assinante', nome: lim.selo });
  else if (loja && pl !== 'gratis' && pl !== 'admin') selos.push({ id: 'loja', nome: 'Loja verificada' });
  const desde = ctx.tipo === 'admin' ? db.get('SELECT MIN(created_at) d FROM offers').d : (ctx.user || ctx.cliente).created_at;
  const out = {
    slug: perfil.slug, nome: perfil.nome, titulo: perfil.titulo || '', bio: perfil.bio || '', cidade: perfil.cidade || '',
    avatar: perfil.avatar || null, capa: lim.capa ? perfil.capa || null : null,
    cor: lim.cores.includes(perfil.cor) ? perfil.cor : 'verde',
    moldura: molduras.some(mo => mo.id === perfil.moldura) ? perfil.moldura : 'nenhuma',
    links: json(perfil.links, []).slice(0, lim.links),
    papel: av.papel, papel_rotulo: ROTULO_PAPEL[av.papel], plano: pl, plano_rotulo: lim.rotulo, selos,
    membro_desde: desde, loja, oculto: Boolean(perfil.oculto),
    nivel: av.nivel,
    vitrine: vitrine.map(id => av.lista.find(c => c.id === id)).filter(Boolean),
    conquistas: { total: av.lista.length, obtidas: obtidas.length, familias },
    numeros: numerosVisiveis(av.metricas, av.papel),
    proprio, admin_vendo: admin && !proprio,
  };
  if (proprio || admin) {
    out.limites = lim;
    out.opcoes = { cores: lim.cores, gradientes: GRADIENTES, molduras, catalogo_molduras: catalogoMolduras(pl, lim, av.nivel.nivel, ganhas), tipos_link: TIPOS_LINK, todos_planos: todosLimites() };
    out.vitrine_ids = json(perfil.vitrine, []);
  }
  if (admin) out.dono = ctx.dono;
  // Seguidores
  out.seguidores = db.get('SELECT COUNT(*) n FROM seguidores WHERE seguido = ?', ctx.dono).n;
  out.seguindo = db.get('SELECT COUNT(*) n FROM seguidores WHERE seguidor = ?', ctx.dono).n;
  out.eu_sigo = Boolean(visitante && !proprio && db.get('SELECT 1 FROM seguidores WHERE seguidor = ? AND seguido = ?', visitante, ctx.dono));
  out.pode_seguir = Boolean(visitante && !proprio);
  // Quem visita vê só o que a pessoa configurou e as conquistas que ela já tem — sem progresso (só o admin vê tudo).
  if (!proprio && !admin) {
    out.conquistas = {
      obtidas: out.conquistas.obtidas,
      familias: out.conquistas.familias
        .map(fm => ({ ...fm, itens: fm.itens.filter(c => c.obtida).map(semProgresso) }))
        .filter(fm => fm.itens.length),
    };
    out.vitrine = out.vitrine.map(semProgresso);
    out.numeros = [];
    out.nivel = { nivel: out.nivel.nivel };
  }
  return out;
}

const semProgresso = c => ({ id: c.id, nome: c.nome, descricao: c.descricao, icone: c.icone, tier: c.tier, xp: c.xp,
  familia: c.familia, obtida: true, obtida_em: c.obtida_em });

function numerosVisiveis(m, pap) {
  const n = [['Idas à loja', m.idas_loja], ['Compras confirmadas', m.compras_codigo]];
  if (pap === 'afiliado' || pap === 'admin') n.push(['Ofertas postadas', m.postagens], ['Cliques nos links', m.cliques_links], ['Vendas como afiliado', m.vendas_afiliado]);
  if (pap === 'empresa' || pap === 'admin') n.push(['Anúncios', m.anuncios], ['Cliques nos anúncios', m.cliques_anuncios], ['Vendas da loja', m.vendas_empresa]);
  return n.map(([rotulo, valor]) => ({ rotulo, valor }));
}

function meu(dono) {
  const ctx = contexto(dono);
  if (!ctx) throw fail('Perfil não encontrado.', 404);
  ganharMolduras(dono); // temporada e datas comemorativas: usar o site no período dá a moldura
  return montar(garantir(ctx), ctx, { proprio: true, admin: dono === 'admin', visitante: dono });
}

function porSlug(slug, visitante) {
  const perfil = db.get('SELECT * FROM perfis WHERE slug = ?', String(slug || '').toLowerCase());
  const ctx = perfil && contexto(perfil.dono);
  if (!ctx) throw fail('Perfil não encontrado.', 404);
  const proprio = visitante === perfil.dono;
  const admin = visitante === 'admin';
  if (perfil.oculto && !proprio && !admin) throw fail('Este perfil está oculto.', 404);
  return montar(perfil, ctx, { proprio, admin, visitante });
}

// ── Edição ───────────────────────────────────────────────────────────────────
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max);

function validarLink(tipo, url) {
  if (!TIPOS_LINK[tipo]) return null;
  let u;
  try { u = new URL(String(url).trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  const esperado = { instagram: /(^|\.)instagram\.com$/, whatsapp: /^(chat\.whatsapp\.com|wa\.me|whatsapp\.com)$/, telegram: /^(t\.me|telegram\.me)$/,
    youtube: /(^|\.)(youtube\.com|youtu\.be)$/, tiktok: /(^|\.)tiktok\.com$/ }[tipo];
  if (esperado && !esperado.test(host)) return null;
  return { tipo, url: u.href.slice(0, 300) };
}

function salvar(dono, b) {
  const ctx = contexto(dono);
  if (!ctx) throw fail('Perfil não encontrado.', 404);
  const perfil = garantir(ctx);
  const lim = limitesDe(plano(ctx));
  const nome = texto(b.nome, 40);
  if (nome.length < 2) throw fail('Escolha um nome de exibição (mínimo 2 letras).');
  const cols = {
    nome, titulo: texto(b.titulo, 60), bio: texto(b.bio, lim.bio), cidade: texto(b.cidade, 60),
    updated_at: nowSql(),
  };
  if (b.cor !== undefined) {
    if (!lim.cores.includes(b.cor)) throw fail('Esta cor não está liberada no seu plano.');
    cols.cor = b.cor;
  }
  if (b.moldura !== undefined) {
    const av = avaliar(ctx, perfil);
    const pl = plano(ctx);
    const ok = MOLDURAS.find(mo => mo.id === b.moldura && molduraLiberada(mo, pl, lim, av.nivel.nivel, molduraGanhas(ctx.dono)));
    if (!ok) throw fail('Esta moldura ainda não foi liberada.');
    cols.moldura = b.moldura;
  }
  if (Array.isArray(b.links)) {
    const links = b.links.map(l => validarLink(l?.tipo, l?.url)).filter(Boolean);
    if (b.links.length && links.length < b.links.filter(l => l?.url).length) throw fail('Confira os links: use endereços https do serviço escolhido.');
    if (links.length > lim.links) throw fail(lim.links ? `Seu plano permite até ${lim.links} link(s).` : 'Links no perfil fazem parte dos planos pagos.');
    cols.links = JSON.stringify(links);
  }
  if (Array.isArray(b.vitrine)) {
    const ids = [...new Set(b.vitrine.map(String))].filter(id => POR_ID[id]);
    if (ids.length > lim.vitrine) throw fail(`Seu plano mostra até ${lim.vitrine} conquistas na vitrine.`);
    const donas = new Set(db.all('SELECT conquista FROM conquistas_obtidas WHERE dono = ?', dono).map(r => r.conquista));
    cols.vitrine = JSON.stringify(ids.filter(id => donas.has(id)));
  }
  if (b.slug !== undefined && String(b.slug).toLowerCase() !== perfil.slug) {
    if (!lim.slug_livre) throw fail('Endereço personalizado não faz parte do seu plano.');
    const slug = String(b.slug).toLowerCase().trim();
    if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(slug) || RESERVADOS.has(slug)) throw fail('Endereço inválido: use de 3 a 30 letras, números ou hífen.');
    if (db.get('SELECT 1 FROM perfis WHERE slug = ? AND dono <> ?', slug, dono)) throw fail('Este endereço já está em uso.', 409);
    cols.slug = slug;
  }
  db.run(`UPDATE perfis SET ${Object.keys(cols).map(k => `${k} = ?`).join(', ')} WHERE dono = ?`, ...Object.values(cols), dono);
  return meu(dono);
}

// Foto (avatar) ou capa, recortadas e convertidas para WebP.
async function salvarImagem(dono, tipo, buffer) {
  const ctx = contexto(dono);
  if (!ctx) throw fail('Perfil não encontrado.', 404);
  if (!['avatar', 'capa'].includes(tipo)) throw fail('Tipo de imagem inválido.');
  const lim = limitesDe(plano(ctx));
  if (tipo === 'capa' && !lim.capa) throw fail('A capa do perfil faz parte dos planos pagos.');
  if (!Buffer.isBuffer(buffer) || buffer.length < 100) throw fail('Envie uma imagem JPG, PNG ou WEBP.');
  const sharp = require('sharp');
  let img;
  try {
    img = tipo === 'avatar'
      ? await sharp(buffer).rotate().resize(320, 320, { fit: 'cover' }).webp({ quality: 85 }).toBuffer()
      : await sharp(buffer).rotate().resize(1600, 420, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
  } catch { throw fail('Não foi possível ler esta imagem.'); }
  const perfil = garantir(ctx);
  const nome = `${dono.replace(':', '')}-${tipo}-${crypto.randomBytes(5).toString('hex')}.webp`;
  fs.writeFileSync(path.join(DIR, nome), img);
  apagarArquivo(perfil[tipo]);
  db.run(`UPDATE perfis SET ${tipo} = ?, updated_at = ? WHERE dono = ?`, `/uploads/perfis/${nome}`, nowSql(), dono);
  if (tipo === 'avatar') require('./foto-loja').doPerfil(dono, `/uploads/perfis/${nome}`); // o logo da loja acompanha
  return meu(dono);
}

function removerImagem(dono, tipo) {
  const ctx = contexto(dono);
  if (!ctx || !['avatar', 'capa'].includes(tipo)) throw fail('Pedido inválido.');
  const perfil = garantir(ctx);
  apagarArquivo(perfil[tipo]);
  db.run(`UPDATE perfis SET ${tipo} = NULL, updated_at = ? WHERE dono = ?`, nowSql(), dono);
  if (tipo === 'avatar') require('./foto-loja').doPerfil(dono, null);
  return meu(dono);
}

function apagarArquivo(url) {
  const m = /^\/uploads\/perfis\/([\w.-]+\.webp)$/.exec(String(url || ''));
  if (m) fs.promises.unlink(path.join(DIR, m[1])).catch(() => {});
}

// ── Admin ────────────────────────────────────────────────────────────────────
function registrarVenda(dono, tipo, quantidade, observacao) {
  if (!contexto(dono)) throw fail('Perfil não encontrado.', 404);
  if (!['afiliado', 'empresa', 'compra'].includes(tipo)) throw fail('Tipo inválido.');
  const q = parseInt(quantidade, 10);
  if (!q || Math.abs(q) > 100000) throw fail('Informe a quantidade (use número negativo para corrigir).');
  db.run('INSERT INTO vendas_registro (dono, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)', dono, tipo, q, texto(observacao, 200) || null);
  return resumoAdmin(dono);
}

function resumoAdmin(dono) {
  const ctx = contexto(dono);
  if (!ctx) throw fail('Perfil não encontrado.', 404);
  const perfil = garantir(ctx);
  return {
    dono, slug: perfil.slug, nome: perfil.nome, oculto: Boolean(perfil.oculto),
    vendas: { afiliado: vendas(dono, 'afiliado'), empresa: vendas(dono, 'empresa'), compra: vendas(dono, 'compra') },
    registros: db.all('SELECT tipo, quantidade, observacao, created_at FROM vendas_registro WHERE dono = ? ORDER BY id DESC LIMIT 20', dono),
  };
}

function moderar(dono, { oculto, limpar } = {}) {
  const ctx = contexto(dono);
  if (!ctx) throw fail('Perfil não encontrado.', 404);
  const perfil = garantir(ctx);
  if (oculto !== undefined) db.run('UPDATE perfis SET oculto = ? WHERE dono = ?', oculto ? 1 : 0, dono);
  if (limpar) {
    apagarArquivo(perfil.avatar); apagarArquivo(perfil.capa);
    db.run(`UPDATE perfis SET titulo = NULL, bio = NULL, avatar = NULL, capa = NULL, links = NULL WHERE dono = ?`, dono);
    require('./foto-loja').doPerfil(dono, null); // o logo da loja era a mesma foto
  }
  return resumoAdmin(dono);
}

function excluir(dono) {
  const p = db.get('SELECT avatar, capa FROM perfis WHERE dono = ?', dono);
  if (p) { apagarArquivo(p.avatar); apagarArquivo(p.capa); }
  for (const t of ['perfis', 'metricas', 'conquistas_obtidas', 'vendas_registro']) db.run(`DELETE FROM ${t} WHERE dono = ?`, dono);
  db.run('DELETE FROM seguidores WHERE seguidor = ? OR seguido = ?', dono, dono);
}

// ── Comunidade: lista de perfis, busca por #nome, seguir e miniatura ─────────
// Todos com acesso ao site têm perfil: cria os que faltam (contas ativas, clientes avulsos válidos e o admin).
let ultimaGarantia = 0;
function garantirTodos() {
  if (Date.now() - ultimaGarantia < 60000) return;
  ultimaGarantia = Date.now();
  const faltam = [
    ...db.all(`SELECT 'u:' || u.id AS dono FROM users u WHERE u.status = 'active' AND NOT EXISTS (SELECT 1 FROM perfis p WHERE p.dono = 'u:' || u.id)`),
    ...db.all(`SELECT 'c:' || c.id AS dono FROM clientes c WHERE c.status = 'ativo' AND c.validade > datetime('now')
                AND NOT EXISTS (SELECT 1 FROM users u WHERE u.cliente_id = c.id) AND NOT EXISTS (SELECT 1 FROM perfis p WHERE p.dono = 'c:' || c.id)`),
    ...(db.get(`SELECT 1 FROM perfis WHERE dono = 'admin'`) ? [] : [{ dono: 'admin' }]),
  ];
  // Cria o perfil e já calcula as conquistas (para o nível aparecer certo na lista).
  for (const { dono } of faltam) { const ctx = contexto(dono); if (ctx) avaliar(ctx, garantir(ctx)); }
}

// Perfil aparece na comunidade se não estiver oculto e a pessoa ainda tiver acesso ao site.
function visivel(ctx) {
  if (!ctx) return false;
  if (ctx.tipo === 'admin') return true;
  if (ctx.tipo === 'cliente') return ctx.cliente.status === 'ativo';
  return ctx.user.status === 'active';
}

function xpDe(dono) {
  return db.all('SELECT conquista FROM conquistas_obtidas WHERE dono = ?', dono).reduce((t, r) => t + (POR_ID[r.conquista]?.xp || 0), 0);
}

function cartao(p, ctx, visitante) {
  const lim = limitesDe(plano(ctx));
  const xp = xpDe(p.dono);
  return {
    slug: p.slug, nome: p.nome, titulo: p.titulo || '', avatar: p.avatar || null,
    cor: lim.cores.includes(p.cor) ? p.cor : 'verde', moldura: p.moldura || 'nenhuma',
    papel_rotulo: ROTULO_PAPEL[papel(ctx)], nivel: nivel(xp).nivel,
    conquistas: db.get('SELECT COUNT(*) n FROM conquistas_obtidas WHERE dono = ?', p.dono).n,
    seguidores: db.get('SELECT COUNT(*) n FROM seguidores WHERE seguido = ?', p.dono).n,
    eu_sigo: Boolean(visitante && db.get('SELECT 1 FROM seguidores WHERE seguidor = ? AND seguido = ?', visitante, p.dono)),
    eu: visitante === p.dono, _xp: xp,
  };
}

const POR_PAGINA = 24;
const recalculado = new Map();
// grupo: 'empresas' (contas de empresa) | 'consumidores' (as demais pessoas: consumidores, afiliados e o perfil do site) | vazio = todos
function listar({ q = '', filtro = 'todos', pagina = 1, visitante = null, grupo = '' } = {}) {
  garantirTodos();
  const termo = String(q || '').trim().replace(/^#+/, '').trim().slice(0, 40);
  const params = [];
  let sql = 'SELECT p.* FROM perfis p';
  if (filtro === 'seguindo') { sql += ' JOIN seguidores s ON s.seguido = p.dono AND s.seguidor = ?'; params.push(visitante || ''); }
  if (filtro === 'seguidores') { sql += ' JOIN seguidores s ON s.seguidor = p.dono AND s.seguido = ?'; params.push(visitante || ''); }
  sql += ' WHERE p.oculto = 0';
  if (termo) {
    // Busca por #nome (sem diferenciar maiúsculas): nome, endereço do perfil ou título
    sql += " AND (instr(lower(p.nome), ?) > 0 OR instr(p.slug, ?) > 0 OR instr(lower(COALESCE(p.titulo, '')), ?) > 0)";
    const t = termo.toLowerCase();
    params.push(t, t, t);
  }
  const linhas = db.all(`${sql} LIMIT 3000`, ...params);
  const cards = [];
  for (const p of linhas) {
    const ctx = contexto(p.dono);
    if (!visivel(ctx)) continue;
    if (grupo === 'empresas' && papel(ctx) !== 'empresa') continue;
    if (grupo === 'consumidores' && papel(ctx) === 'empresa') continue;
    // Perfil sem conquistas calculadas (ex.: nunca aberto): calcula agora, no máximo a cada 10 min.
    if (!db.get('SELECT 1 FROM conquistas_obtidas WHERE dono = ?', p.dono) && Date.now() - (recalculado.get(p.dono) || 0) > 600000) {
      recalculado.set(p.dono, Date.now());
      avaliar(ctx, p);
    }
    const card = cartao(p, ctx, visitante);
    // Parceiros: dados da loja para o cartão (logo, produtos vendidos, entrega, atendimento e reputação)
    if (papel(ctx) === 'empresa' && ctx.user) {
      const l = db.get('SELECT id, nome, slug, logo_url, oculta FROM lojas WHERE user_id = ?', ctx.user.id);
      if (l && !l.oculta) card.loja = { id: l.id, nome: l.nome, slug: l.slug, logo: require('./foto-loja').valida(l.logo_url), ...require('./pedidos-loja').reputacao(l.id), avaliacoes: require('./loja-perfil').resumoAvaliacoes(l.id) };
    }
    cards.push(card);
  }
  // Quem eu sigo primeiro, depois os de nível mais alto.
  cards.sort((a, b) => (b.eu_sigo - a.eu_sigo) || (b._xp - a._xp) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const pag = Math.max(1, parseInt(pagina, 10) || 1);
  const itens = cards.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA).map(({ _xp, ...c }) => c);
  return { itens, total: cards.length, pagina: pag, mais: pag * POR_PAGINA < cards.length };
}

// Miniatura flutuante: aparência + todas as conquistas já ganhas (sem progresso).
function mini(slug, visitante) {
  const p = porSlug(slug, visitante);
  const todas = p.conquistas.familias.flatMap(fm => fm.itens).filter(c => c.obtida)
    .sort((a, b) => b.xp - a.xp).map(c => ({ id: c.id, nome: c.nome, icone: c.icone, tier: c.tier, descricao: c.descricao }));
  return {
    slug: p.slug, nome: p.nome, titulo: p.titulo, avatar: p.avatar, capa: p.capa, cor: p.cor, moldura: p.moldura,
    papel_rotulo: p.papel_rotulo, selos: p.selos, nivel: p.nivel.nivel, bio: (p.bio || '').slice(0, 140),
    seguidores: p.seguidores, seguindo: p.seguindo, eu_sigo: p.eu_sigo, pode_seguir: p.pode_seguir, conquistas: todas,
  };
}

function seguir(visitante, slug, ligar) {
  if (!visitante) throw fail('Entre na sua conta para seguir perfis.', 401);
  const p = db.get('SELECT dono, oculto FROM perfis WHERE slug = ?', String(slug || '').toLowerCase());
  if (!p || (p.oculto && visitante !== 'admin')) throw fail('Perfil não encontrado.', 404);
  if (p.dono === visitante) throw fail('Você não pode seguir o próprio perfil.');
  if (ligar) db.run('INSERT OR IGNORE INTO seguidores (seguidor, seguido) VALUES (?, ?)', visitante, p.dono);
  else db.run('DELETE FROM seguidores WHERE seguidor = ? AND seguido = ?', visitante, p.dono);
  return {
    eu_sigo: Boolean(ligar),
    seguidores: db.get('SELECT COUNT(*) n FROM seguidores WHERE seguido = ?', p.dono).n,
  };
}

// Cria o perfil de uma conta, se ainda não existir (ex.: empresa que abriu a loja e ainda não apareceu na comunidade)
function garantirPerfil(dono) {
  const ctx = contexto(dono);
  if (!ctx) return null;
  const p = garantir(ctx);
  if (!db.get('SELECT 1 FROM conquistas_obtidas WHERE dono = ?', dono)) avaliar(ctx, p);
  return p;
}

module.exports = {
  garantirPerfil, donoDe, contexto, meu, porSlug, salvar, salvarImagem, removerImagem, incrementar,
  registrarVenda, resumoAdmin, moderar, excluir, limitesDe, listar, mini, seguir,
};
