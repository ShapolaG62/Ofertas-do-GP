// Cada envio de oferta para cada grupo de WhatsApp fica registrado aqui. Isso permite:
//  • saber o que foi entregue em cada grupo e o motivo de cada falha;
//  • tentar de novo o que falhou (2 novas tentativas, depois de 5 e de 15 minutos);
//  • contar os cliques por envio: cada grupo recebe um link próprio (/p/<código>) que leva ao mesmo destino de antes.
// Só guarda contagens de cliques, nunca quem clicou.
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');
const whatsapp = require('./whatsapp');

db.db.exec(`
  CREATE TABLE IF NOT EXISTS envio_grupo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    cliente_id INTEGER,
    offer_id INTEGER NOT NULL,
    produto TEXT,
    store_id TEXT,
    categoria TEXT,
    preco REAL,
    grupo_id TEXT NOT NULL,
    grupo_nome TEXT,
    situacao TEXT NOT NULL DEFAULT 'enviando',
    erro TEXT,
    tentativas INTEGER NOT NULL DEFAULT 1,
    proxima_em TEXT,
    texto TEXT,
    rastreado INTEGER NOT NULL DEFAULT 0,
    cliques INTEGER NOT NULL DEFAULT 0,
    autor TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    enviado_em TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_envio_grupo_dono ON envio_grupo (cliente_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_envio_grupo_tentar ON envio_grupo (situacao, proxima_em);
`);

const MAX_TENTATIVAS = 3;
const ESPERA_MIN = { 1: 5, 2: 15 }; // minutos até a próxima tentativa, depois da 1ª e da 2ª falha
const JANELA_MIN = 60; // passou disso, a oferta já pode ter mudado: desiste
const DIAS_GUARDADOS = 180;
const log = m => console.log(`[ENVIO] ${m}`);
const configDe = cid => (cid ? require('./clientes').config(cid) : settings.getAll());
const siteDe = s => { const u = String(s.site_url || '').trim().replace(/\/+$/, ''); return /^https:\/\//i.test(u) ? u : ''; };

// Mensagem de erro que nunca sai vazia (erro de rede do Node pode vir sem texto)
const motivoDe = err => String(err?.message || err?.errors?.[0]?.message || err?.code || 'O serviço não informou o motivo.').slice(0, 300);
// Sem confirmação não dá para saber se saiu: tentar de novo poderia repetir a oferta no grupo
const semResposta = err => /timeout|a tempo|ECONNABORTED|ETIMEDOUT|socket hang up/i.test(`${err?.code || ''} ${err?.message || ''}`);

// Links da oferta que podem estar no texto (o do modelo ou o do texto editado na tela de postagens)
async function linksNoTexto(o, s, texto) {
  const site = siteDe(s);
  if (!site) return [];
  const lista = [o.__link, `${site}/o/${o.id}`];
  if (s.cliente_id) lista.push(`${site}/ir/${s.cliente_id}-${o.id}`);
  if (s.cliente_id && !lista.some(l => l && texto.includes(l))) {
    try { lista.push(require('./encurtador').curto(await require('./clientes').linkAfiliado(s.cliente_id, o, s))); } catch { /* segue sem rastrear */ }
  }
  return [...new Set(lista.filter(Boolean))].filter(l => texto.includes(l)).sort((a, b) => b.length - a.length);
}

// Registra o envio e devolve o texto com o link deste grupo
async function preparar(o, grupo, s, texto, autor = null) {
  const token = crypto.randomBytes(5).toString('base64url');
  const links = await linksNoTexto(o, s, texto);
  const proprio = links.length ? `${siteDe(s)}/p/${token}` : null;
  const final = links.reduce((t, l) => t.split(l).join(proprio), texto);
  const r = db.run(`INSERT INTO envio_grupo (token, cliente_id, offer_id, produto, store_id, categoria, preco, grupo_id, grupo_nome, texto, rastreado, autor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, token, s.cliente_id || null, o.id, o.produto, o.store_id, o.categoria, o.preco_atual,
  String(grupo.id), grupo.nome || String(grupo.id), final, links.length ? 1 : 0, autor);
  return { id: Number(r.lastInsertRowid), texto: final };
}
function confirmar(id) {
  db.run(`UPDATE envio_grupo SET situacao = 'enviado', enviado_em = datetime('now'), erro = NULL, proxima_em = NULL, texto = NULL WHERE id = ?`, id);
}
// Falhou: agenda outra tentativa. Devolve se vai tentar de novo.
function falhou(id, err) {
  const motivo = motivoDe(err);
  if (semResposta(err)) {
    db.run(`UPDATE envio_grupo SET situacao = 'falhou', erro = ?, texto = NULL WHERE id = ?`, `${motivo} (sem confirmação: não reenviei para não repetir no grupo)`, id);
    return false;
  }
  db.run(`UPDATE envio_grupo SET situacao = 'tentando', erro = ?, proxima_em = datetime('now', ?) WHERE id = ?`, motivo, `+${ESPERA_MIN[1]} minutes`, id);
  return true;
}

function encerrar(r, motivo, situacao = 'falhou') {
  db.run(`UPDATE envio_grupo SET situacao = ?, erro = ?, proxima_em = NULL, texto = NULL WHERE id = ?`, situacao, motivo, r.id);
  if (situacao !== 'falhou') return;
  require('./envio-avisos').avisar(r.cliente_id, {
    tipo: `reenvio-${r.grupo_id}`,
    titulo: `Oferta não chegou ao grupo ${r.grupo_nome}`,
    texto: `Tentei ${r.tentativas} vez(es) enviar "${String(r.produto || '').slice(0, 80)}". Último erro: ${motivo}`,
  });
}

async function tentar(r) {
  const s = configDe(r.cliente_id);
  const idadeMin = (Date.now() - Date.parse(`${r.created_at.replace(' ', 'T')}Z`)) / 60000;
  if (idadeMin > JANELA_MIN) return encerrar(r, `Sem conseguir enviar em ${JANELA_MIN} minutos. Último erro: ${r.erro || 'desconhecido'}`);
  if (r.cliente_id && !db.get(`SELECT 1 FROM clientes WHERE id = ? AND status = 'ativo' AND validade >= datetime('now')`, r.cliente_id)) {
    return encerrar(r, 'O acesso à ferramenta não está ativo.', 'cancelado');
  }
  const offers = require('./offers');
  const o = db.get('SELECT * FROM offers WHERE id = ?', r.offer_id);
  if (!o || !offers.isActive(o.id)) return encerrar(r, 'A oferta saiu do ar antes da nova tentativa.', 'cancelado');
  if (Number(o.preco_atual) !== Number(r.preco)) return encerrar(r, 'O preço mudou antes da nova tentativa.', 'cancelado');
  const st = await whatsapp.status(s);
  if (!st.conectado) { // número fora do ar: espera voltar, sem gastar tentativa
    db.run(`UPDATE envio_grupo SET proxima_em = datetime('now', '+2 minutes'), erro = ? WHERE id = ?`, st.mensagem || r.erro, r.id);
    return;
  }
  const social = require('./social');
  try {
    await whatsapp.enviar(s, r.grupo_id, { imagem: social.postImage(o, s), texto: r.texto });
    db.run('UPDATE envio_grupo SET tentativas = tentativas + 1 WHERE id = ?', r.id);
    confirmar(r.id);
    db.run('INSERT INTO social_posts (offer_id, produto, rede, ok, mensagem, autor, cliente_id, preco) VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
      o.id, o.produto, 'whatsapp', `enviado para ${r.grupo_nome} na tentativa ${r.tentativas + 1}`, 'nova tentativa', r.cliente_id, o.preco_atual);
    db.run(`UPDATE post_queue SET status = 'postado', resultado = ? WHERE offer_id = ? AND status = 'erro' AND cliente_id IS ? AND posted_at > datetime('now', ?)`,
      `WhatsApp: ok na tentativa ${r.tentativas + 1}`, o.id, r.cliente_id, `-${JANELA_MIN + 5} minutes`);
    log(`nova tentativa funcionou (envio ${r.id})`);
  } catch (err) {
    const n = r.tentativas + 1;
    const motivo = motivoDe(err);
    db.run('UPDATE envio_grupo SET tentativas = ?, erro = ? WHERE id = ?', n, motivo, r.id);
    if (semResposta(err)) return encerrar({ ...r, tentativas: n }, `${motivo} (sem confirmação: não reenviei para não repetir no grupo)`);
    if (n >= MAX_TENTATIVAS) return encerrar({ ...r, tentativas: n }, motivo);
    db.run(`UPDATE envio_grupo SET proxima_em = datetime('now', ?) WHERE id = ?`, `+${ESPERA_MIN[n]} minutes`, r.id);
  }
}

// Uma nova tentativa por dono a cada rodada (1 por minuto), para não virar uma rajada de mensagens
let ocupado = false;
async function rodarTentativas() {
  if (ocupado) return;
  ocupado = true;
  try {
    const vistos = new Set();
    for (const r of db.all(`SELECT * FROM envio_grupo WHERE situacao = 'tentando' AND proxima_em <= datetime('now') ORDER BY id`)) {
      const d = r.cliente_id || 'site';
      if (vistos.has(d)) continue;
      vistos.add(d);
      await tentar(r).catch(err => log(`erro na nova tentativa ${r.id}: ${err.message}`));
    }
  } finally { ocupado = false; }
}

// ── Cliques ──────────────────────────────────────────────────────────────────
const porToken = token => (/^[\w-]{5,12}$/.test(String(token)) ? db.get('SELECT id, cliente_id, offer_id FROM envio_grupo WHERE token = ?', String(token)) : null);
const jaContados = new Map(); // quem abriu o mesmo link na última hora conta uma vez só (fica só na memória)
function registrarClique(envio, ip) {
  const agora = Date.now();
  const chave = `${envio.id}|${ip}`;
  if (agora - (jaContados.get(chave) || 0) < 3600000) return false;
  if (jaContados.size > 50000) jaContados.clear();
  jaContados.set(chave, agora);
  db.run('UPDATE envio_grupo SET cliques = cliques + 1 WHERE id = ?', envio.id);
  return true;
}

// ── Resultados ───────────────────────────────────────────────────────────────
function resultados(cid, dias = 30) {
  const d = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30;
  const de = [cid, `-${d} days`];
  const onde = `cliente_id IS ? AND created_at >= datetime('now', ?)`;
  const contas = `SUM(situacao = 'enviado') AS envios, SUM(CASE WHEN situacao = 'enviado' THEN cliques ELSE 0 END) AS cliques`;
  const agrupar = (coluna, extra = '') => db.all(`SELECT ${coluna} AS chave, ${contas}${extra} FROM envio_grupo WHERE ${onde} GROUP BY 1 HAVING envios > 0 ORDER BY cliques DESC, envios DESC LIMIT 24`, ...de);
  const { STORES } = require('./stores');
  const { CATEGORIAS } = require('./busca-ofertas');
  const lojas = Object.fromEntries(STORES.map(l => [l.id, l.name]));
  const total = db.get(`SELECT ${contas}, SUM(situacao = 'falhou') AS falhas, SUM(situacao = 'tentando') AS tentando, SUM(situacao = 'enviado' AND tentativas > 1) AS recuperados, SUM(situacao = 'enviado' AND rastreado = 1) AS rastreados FROM envio_grupo WHERE ${onde}`, ...de);
  const grupos = db.all(`SELECT grupo_id AS chave, MAX(grupo_nome) AS nome, ${contas}, SUM(situacao = 'falhou') AS falhas FROM envio_grupo WHERE ${onde} GROUP BY 1 ORDER BY cliques DESC, envios DESC LIMIT 60`, ...de);
  const horas = agrupar(`strftime('%H', COALESCE(enviado_em, created_at), '-3 hours')`).map(h => ({ ...h, nome: `${h.chave}h` }));
  const ofertas = db.all(`SELECT offer_id AS chave, MAX(produto) AS nome, ${contas} FROM envio_grupo WHERE ${onde} GROUP BY 1 HAVING envios > 0 ORDER BY cliques DESC, envios DESC LIMIT 10`, ...de);
  const falhas = db.all(`SELECT grupo_nome, produto, erro, situacao, created_at FROM envio_grupo WHERE ${onde} AND situacao IN ('falhou', 'tentando') ORDER BY id DESC LIMIT 10`, ...de);
  return {
    dias: d,
    total: { envios: total.envios || 0, cliques: total.cliques || 0, falhas: total.falhas || 0, tentando: total.tentando || 0, recuperados: total.recuperados || 0, rastreados: total.rastreados || 0 },
    grupos, horas, ofertas, falhas,
    temas: agrupar('categoria').map(c => ({ ...c, nome: CATEGORIAS[c.chave] || c.chave || 'Sem tema' })),
    lojas: agrupar('store_id').map(l => ({ ...l, nome: lojas[l.chave] || l.chave })),
  };
}

function limpar() {
  db.run(`DELETE FROM envio_grupo WHERE created_at < datetime('now', ?)`, `-${DIAS_GUARDADOS} days`);
}
// Site reiniciou no meio de um envio: sem saber se saiu, não reenvia
function fecharInterrompidos() {
  db.run(`UPDATE envio_grupo SET situacao = 'falhou', erro = 'O site reiniciou durante o envio: confira no grupo.', texto = NULL WHERE situacao = 'enviando' AND created_at < datetime('now', '-5 minutes')`);
}
let timer = null;
function iniciar() {
  if (timer) return;
  fecharInterrompidos();
  limpar();
  timer = setInterval(() => rodarTentativas().catch(err => log(err.message)), 60000);
  timer.unref?.();
  setInterval(limpar, 24 * 3600000).unref?.();
}

module.exports = { preparar, confirmar, falhou, motivoDe, rodarTentativas, porToken, registrarClique, resultados, limpar, iniciar, MAX_TENTATIVAS };
