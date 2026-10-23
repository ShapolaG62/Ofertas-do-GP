// Moedas, missões, vídeos patrocinados e os cosméticos de perfil (efeitos de perfil e efeitos de nome).
//  • Moedas = moedas ganhas − moedas gastas na Loja de cosméticos. Todo mundo começa com zero e ganha:
//    as moedas do plano escolhido (uma vez por plano: trocar para outro plano soma as moedas do novo),
//    as das missões (creditadas sozinhas ao completar) e as dos vídeos patrocinados.
//    Gastar não tira XP nem nível. Não há dinheiro real envolvido.
//  • Missões: diárias (zeram à meia-noite de Brasília), semanais (segunda a domingo) e únicas. O servidor confere
//    o que a pessoa fez de verdade no site; completa, ela resgata as moedas.
//  • Vídeos patrocinados: cadastrados pelo admin (Painel → Publicidade). A moeda só sai depois do tempo mínimo
//    assistido, uma vez por vídeo por dia e no máximo VIDEOS_POR_DIA vídeos por dia.
//  • As molduras (comuns, de temporada e animadas) continuam em perfis.js; aqui ficam os outros cosméticos.
const crypto = require('crypto');
const db = require('./db');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const VIDEOS_POR_DIA = 5;

db.db.exec(`
  CREATE TABLE IF NOT EXISTS cosmeticos_compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT, dono TEXT NOT NULL, item TEXT NOT NULL, preco INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (dono, item));
  CREATE TABLE IF NOT EXISTS moedas_ganhas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, dono TEXT NOT NULL, origem TEXT NOT NULL, ref TEXT NOT NULL, valor INTEGER NOT NULL,
    descricao TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (dono, ref));
  CREATE TABLE IF NOT EXISTS checkins (dono TEXT NOT NULL, dia TEXT NOT NULL, PRIMARY KEY (dono, dia));
  CREATE TABLE IF NOT EXISTS missoes_base (dono TEXT NOT NULL, periodo TEXT NOT NULL, chave TEXT NOT NULL, base INTEGER NOT NULL,
    PRIMARY KEY (dono, periodo, chave));
  CREATE TABLE IF NOT EXISTS videos_patrocinados (
    id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, anunciante TEXT NOT NULL, url TEXT NOT NULL,
    duracao_s INTEGER NOT NULL DEFAULT 30, moedas INTEGER NOT NULL DEFAULT 10, ativo INTEGER NOT NULL DEFAULT 1,
    visualizacoes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS video_sessoes (token TEXT PRIMARY KEY, dono TEXT NOT NULL, video_id INTEGER NOT NULL,
    inicio INTEGER NOT NULL);
`);
for (const col of ['efeito TEXT', 'efeito_nome TEXT']) {
  try { db.db.exec(`ALTER TABLE perfis ADD COLUMN ${col}`); } catch { /* já existe */ }
}

// ── Cosméticos (além das molduras) ──────────────────────────────────────────
const ITENS = [
  // Efeitos de perfil: animação de fundo no topo do perfil
  { id: 'efeito-neve', tipo: 'efeito', nome: 'Neve', preco: 200, desc: 'Flocos de neve caindo devagar no topo do perfil.' },
  { id: 'efeito-bolhas', tipo: 'efeito', nome: 'Bolhas', preco: 200, desc: 'Bolhas de sabão subindo e brilhando.' },
  { id: 'efeito-confete', tipo: 'efeito', nome: 'Confete', preco: 250, desc: 'Chuva de confete colorido o tempo todo.' },
  { id: 'efeito-estrelas', tipo: 'efeito', nome: 'Estrelas cadentes', preco: 300, desc: 'Céu estrelado com estrelas cadentes cruzando.' },
  { id: 'efeito-vagalumes', tipo: 'efeito', nome: 'Vaga-lumes', preco: 350, desc: 'Luzinhas amarelas flutuando e piscando.' },
  { id: 'efeito-sakura', tipo: 'efeito', nome: 'Pétalas de sakura', preco: 400, desc: 'Pétalas de cerejeira caindo com o vento.' },
  { id: 'efeito-matrix', tipo: 'efeito', nome: 'Código Matrix', preco: 500, desc: 'Colunas de código verde caindo.' },
  { id: 'efeito-pontilhado', tipo: 'efeito', nome: 'Retícula', preco: 300, desc: 'Grade de pontos com uma onda de luz passando.' },
  { id: 'efeito-padrao', tipo: 'efeito', nome: 'Padrão geométrico', preco: 350, desc: 'Losangos e triângulos em linhas finas deslizando.' },
  { id: 'efeito-y2k', tipo: 'efeito', nome: 'Brilhos Y2K', preco: 450, desc: 'Estrelas de quatro pontas e cruzinhas cromadas flutuando.' },
  { id: 'efeito-neon-ondas', tipo: 'efeito', nome: 'Ondas de neon', preco: 550, desc: 'Fitas de neon onduladas correndo pelo topo.' },
  { id: 'efeito-gradiente', tipo: 'efeito', nome: 'Gradiente líquido', preco: 650, desc: 'Manchas de cor se misturando devagar, como tinta.' },
  { id: 'efeito-holografico', tipo: 'efeito', nome: 'Holográfico', preco: 700, desc: 'Brilho furta-cor mudando de tom com reflexo passando.' },
  { id: 'efeito-aurora', tipo: 'efeito', nome: 'Aurora boreal', preco: 600, desc: 'Faixas de luz verde e roxa ondulando no céu.' },
  // Efeitos de nome: o nome de exibição animado
  { id: 'nome-arcoiris', tipo: 'nome', nome: 'Arco-íris', preco: 250, desc: 'O nome passa por todas as cores.' },
  { id: 'nome-neon', tipo: 'nome', nome: 'Neon', preco: 300, desc: 'Letreiro de neon ciano pulsando.' },
  { id: 'nome-gelo', tipo: 'nome', nome: 'Gelo', preco: 300, desc: 'Letras de gelo com um brilho frio passando.' },
  { id: 'nome-ouro', tipo: 'nome', nome: 'Ouro brilhante', preco: 350, desc: 'Letras de ouro com um reflexo correndo.' },
  { id: 'nome-fogo', tipo: 'nome', nome: 'Fogo', preco: 400, desc: 'Letras em brasa com chamas tremulando.' },
  { id: 'nome-glitch', tipo: 'nome', nome: 'Glitch', preco: 450, desc: 'Falha digital: o nome treme em vermelho e azul.' },
];
const POR_ID = Object.fromEntries(ITENS.map(i => [i.id, i]));
const COLUNA = { efeito: 'efeito', nome: 'efeito_nome' };

// ── Datas (horário de Brasília, UTC−3) ──────────────────────────────────────
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
function inicioSemana(dia = hoje()) { // segunda-feira da semana
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const utcDe = dia => `${dia} 03:00:00`; // meia-noite de Brasília em UTC (como o banco guarda)

// ── Moedas ──────────────────────────────────────────────────────────────────
const ganhos = dono => db.get('SELECT COALESCE(SUM(valor), 0) v FROM moedas_ganhas WHERE dono = ?', dono).v;
const gastos = dono => db.get('SELECT COALESCE(SUM(preco), 0) v FROM cosmeticos_compras WHERE dono = ?', dono).v;
function creditar(dono, origem, ref, valor, descricao) {
  const r = db.run('INSERT OR IGNORE INTO moedas_ganhas (dono, origem, ref, valor, descricao) VALUES (?, ?, ?, ?, ?)', dono, origem, ref, valor, descricao);
  return r.changes > 0;
}
// Planos em vigor da conta (do site e/ou da ferramenta de afiliado)
function planosEmVigor(dono) {
  const ids = [];
  const m = /^([uc]):(\d+)$/.exec(dono || '');
  if (!m) return ids;
  if (m[1] === 'u') {
    const u = db.get(`SELECT plano, cliente_id FROM users WHERE id = ? AND plano IS NOT NULL AND (assinatura_ate IS NULL OR assinatura_ate > datetime('now'))`, Number(m[2]))
      || db.get('SELECT NULL AS plano, cliente_id FROM users WHERE id = ?', Number(m[2]));
    if (u?.plano) ids.push(u.plano);
    if (u?.cliente_id) { const c = db.get(`SELECT plano FROM clientes WHERE id = ? AND validade > datetime('now') AND status = 'ativo'`, u.cliente_id); if (c?.plano) ids.push(c.plano); }
  } else {
    const c = db.get(`SELECT plano FROM clientes WHERE id = ? AND validade > datetime('now') AND status = 'ativo'`, Number(m[2]));
    if (c?.plano) ids.push(c.plano);
  }
  return [...new Set(ids)];
}
// Moedas do plano: entram uma vez por plano. Mudou para outro plano → soma as moedas do novo.
function creditarPlanos(dono) {
  for (const id of planosEmVigor(dono)) {
    const p = require('./planos').plano(id);
    const valor = p ? Math.max(0, Math.round(p.recursos.moedas || 0)) : 0;
    if (valor > 0) creditar(dono, 'plano', `plano:${id}`, valor, `Moedas do plano ${p.nome}`);
  }
}
function saldo(dono) {
  if (!dono) return 0;
  creditarPlanos(dono);
  creditarMissoes(dono);
  return Math.max(0, ganhos(dono) - gastos(dono));
}

// Uma vez (23/10/2026): a regra antiga (boas-vindas pelo tipo de conta + XP das conquistas) sai e todos os saldos
// começam do zero. Um lançamento de ajuste deixa ganhos − gastos = 0; depois entram as moedas do plano de cada um.
if (!db.get(`SELECT 1 FROM settings WHERE key = 'moedas_zeradas_2026_10_23'`)) {
  const donos = db.all('SELECT dono FROM moedas_ganhas UNION SELECT dono FROM cosmeticos_compras').map(r => r.dono);
  db.db.exec('BEGIN');
  try {
    for (const d of donos) {
      const liquido = ganhos(d) - gastos(d);
      if (liquido !== 0) creditar(d, 'ajuste', 'ajuste:zerar-2026-10-23', -liquido, 'Saldo zerado (nova regra das moedas)');
    }
    db.run(`INSERT INTO settings (key, value) VALUES ('moedas_zeradas_2026_10_23', ?)`, String(donos.length));
    db.db.exec('COMMIT');
  } catch (err) { db.db.exec('ROLLBACK'); console.error('[MOEDAS] falha ao zerar os saldos:', err.message); }
}
function extrato(dono) {
  const linhas = db.all(`SELECT origem, valor, descricao, created_at FROM moedas_ganhas WHERE dono = ?
    UNION ALL SELECT 'compra', -preco, item, created_at FROM cosmeticos_compras WHERE dono = ? ORDER BY created_at DESC LIMIT 30`, dono, dono)
    .map(r => ({ ...r, descricao: r.origem === 'compra' ? `Compra: ${POR_ID[r.descricao]?.nome || require('./perfis').nomeMoldura(r.descricao) || r.descricao}` : r.descricao }));
  return linhas;
}

// ── Presença: marca o dia (missões de entrar no site) e guarda a base dos contadores do período ──
const contador = (dono, chave) => db.get('SELECT valor FROM metricas WHERE dono = ? AND chave = ?', dono, chave)?.valor || 0;
function registrarPresenca(dono) {
  if (!dono) return;
  const dia = hoje(), sem = inicioSemana(dia);
  const novo = db.run('INSERT OR IGNORE INTO checkins (dono, dia) VALUES (?, ?)', dono, dia).changes > 0;
  if (!novo) return;
  const idas = contador(dono, 'idas_loja');
  db.run('INSERT OR IGNORE INTO missoes_base (dono, periodo, chave, base) VALUES (?, ?, ?, ?)', dono, `d:${dia}`, 'idas_loja', idas);
  db.run('INSERT OR IGNORE INTO missoes_base (dono, periodo, chave, base) VALUES (?, ?, ?, ?)', dono, `s:${sem}`, 'idas_loja', idas);
}
const base = (dono, periodo, chave) => db.get('SELECT base FROM missoes_base WHERE dono = ? AND periodo = ? AND chave = ?', dono, periodo, chave)?.base;
const delta = (dono, periodo, chave) => { const b = base(dono, periodo, chave); return b === undefined ? 0 : Math.max(0, contador(dono, chave) - b); };

// ── Missões ─────────────────────────────────────────────────────────────────
// progresso(dono, { dia, sem }) → número atual; meta → quanto precisa
const MISSOES = [
  { id: 'entrar', periodo: 'dia', nome: 'Passe no site hoje', desc: 'Entre no Ofertou! com a sua conta.', meta: 1, moedas: 10,
    progresso: (d, { dia }) => (db.get('SELECT 1 FROM checkins WHERE dono = ? AND dia = ?', d, dia) ? 1 : 0) },
  { id: 'lojas3', periodo: 'dia', nome: 'Caçador do dia', desc: 'Vá a 3 ofertas nas lojas pelo site.', meta: 3, moedas: 20,
    progresso: (d, { dia }) => delta(d, `d:${dia}`, 'idas_loja') },
  { id: 'mensagem', periodo: 'dia', nome: 'Bate-papo', desc: 'Mande uma mensagem para alguém ou para uma loja.', meta: 1, moedas: 10,
    progresso: (d, { dia }) => db.get('SELECT COUNT(*) n FROM mensagens WHERE autor = ? AND created_at >= ?', d, utcDe(dia)).n },
  { id: 'video', periodo: 'dia', nome: 'Pausa patrocinada', desc: 'Assista a um vídeo patrocinado até o fim.', meta: 1, moedas: 10,
    progresso: (d, { dia }) => db.get(`SELECT COUNT(*) n FROM moedas_ganhas WHERE dono = ? AND origem = 'video' AND created_at >= ?`, d, utcDe(dia)).n },
  { id: 'dias5', periodo: 'semana', nome: 'Frequentador da semana', desc: 'Entre no site em 5 dias diferentes da semana.', meta: 5, moedas: 50,
    progresso: (d, { sem }) => db.get('SELECT COUNT(*) n FROM checkins WHERE dono = ? AND dia >= ?', d, sem).n },
  { id: 'lojas15', periodo: 'semana', nome: 'Garimpeiro', desc: 'Vá a 15 ofertas nas lojas pelo site durante a semana.', meta: 15, moedas: 60,
    progresso: (d, { sem }) => delta(d, `s:${sem}`, 'idas_loja') },
  { id: 'seguir', periodo: 'semana', nome: 'Fazendo amigos', desc: 'Siga um perfil novo na comunidade.', meta: 1, moedas: 30,
    progresso: (d, { sem }) => db.get('SELECT COUNT(*) n FROM seguidores WHERE seguidor = ? AND created_at >= ?', d, utcDe(sem)).n },
  { id: 'avaliar', periodo: 'semana', nome: 'Opinião sincera', desc: 'Avalie uma loja parceira.', meta: 1, moedas: 40,
    progresso: (d, { sem }) => db.get('SELECT COUNT(*) n FROM loja_avaliacoes WHERE autor = ? AND updated_at >= ?', d, utcDe(sem)).n },
  { id: 'perfil', periodo: 'unica', nome: 'Cara nova', desc: 'Complete o perfil: coloque uma foto e escreva o seu resumo.', meta: 1, moedas: 50,
    progresso: d => { const p = db.get('SELECT avatar, bio FROM perfis WHERE dono = ?', d); return p?.avatar && p?.bio ? 1 : 0; } },
  { id: 'seguir5', periodo: 'unica', nome: 'Popular', desc: 'Siga 5 perfis na comunidade.', meta: 5, moedas: 40,
    progresso: d => db.get('SELECT COUNT(*) n FROM seguidores WHERE seguidor = ?', d).n },
];
const ROTULO_PERIODO = { dia: 'Diária', semana: 'Semanal', unica: 'Única' };
const refMissao = (m, ctx) => `missao:${m.id}:${m.periodo === 'dia' ? ctx.dia : m.periodo === 'semana' ? ctx.sem : 'unica'}`;
// Missão completa = moedas creditadas na hora (sem precisar resgatar)
function creditarMissoes(dono) {
  if (!/^[uc]:\d+$/.test(dono || '')) return;
  const ctx = { dia: hoje(), sem: inicioSemana() };
  for (const m of MISSOES) {
    try {
      if ((Number(m.progresso(dono, ctx)) || 0) >= m.meta) creditar(dono, 'missao', refMissao(m, ctx), m.moedas, `Missão: ${m.nome}`);
    } catch { /* tabela da missão ainda não existe */ }
  }
}
function missoes(dono) {
  registrarPresenca(dono);
  creditarMissoes(dono);
  const ctx = { dia: hoje(), sem: inicioSemana() };
  return MISSOES.map(m => {
    const atual = Math.min(m.meta, Number(m.progresso(dono, ctx)) || 0);
    const resgatada = Boolean(db.get('SELECT 1 FROM moedas_ganhas WHERE dono = ? AND ref = ?', dono, refMissao(m, ctx)));
    return { id: m.id, periodo: m.periodo, periodo_nome: ROTULO_PERIODO[m.periodo], nome: m.nome, desc: m.desc, meta: m.meta, atual,
      moedas: m.moedas, completa: atual >= m.meta, resgatada };
  });
}
function resgatarMissao(dono, id) {
  const m = MISSOES.find(x => x.id === id);
  if (!m) throw fail('Missão não encontrada.', 404);
  const ctx = { dia: hoje(), sem: inicioSemana() };
  if ((Number(m.progresso(dono, ctx)) || 0) < m.meta) throw fail('Esta missão ainda não foi completada.');
  if (!creditar(dono, 'missao', refMissao(m, ctx), m.moedas, `Missão: ${m.nome}`)) throw fail('Você já resgatou esta missão.');
  return painel(dono);
}

// ── Vídeos patrocinados ─────────────────────────────────────────────────────
function youtubeId(url) {
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i.exec(String(url || ''));
  return m ? m[1] : null;
}
const videoPublico = v => ({ id: v.id, titulo: v.titulo, anunciante: v.anunciante, duracao_s: v.duracao_s, moedas: v.moedas,
  youtube: youtubeId(v.url), mp4: youtubeId(v.url) ? null : v.url });
function videos(dono) {
  const dia = hoje();
  const vistos = new Set(db.all(`SELECT ref FROM moedas_ganhas WHERE dono = ? AND origem = 'video' AND ref LIKE ?`, dono, `video:%:${dia}`).map(r => r.ref));
  const hojeN = vistos.size;
  return {
    limite: VIDEOS_POR_DIA, assistidos_hoje: hojeN,
    itens: db.all('SELECT * FROM videos_patrocinados WHERE ativo = 1 ORDER BY id DESC').map(v => ({ ...videoPublico(v), visto_hoje: vistos.has(`video:${v.id}:${dia}`) })),
  };
}
function iniciarVideo(dono, id) {
  const v = db.get('SELECT * FROM videos_patrocinados WHERE id = ? AND ativo = 1', Number(id));
  if (!v) throw fail('Vídeo não encontrado.', 404);
  const token = crypto.randomBytes(18).toString('hex');
  db.run('DELETE FROM video_sessoes WHERE dono = ? OR inicio < ?', dono, Date.now() - 3600000);
  db.run('INSERT INTO video_sessoes (token, dono, video_id, inicio) VALUES (?, ?, ?, ?)', token, dono, v.id, Date.now());
  return { token, video: videoPublico(v) };
}
function resgatarVideo(dono, token) {
  const s = db.get('SELECT * FROM video_sessoes WHERE token = ? AND dono = ?', String(token || ''), dono);
  if (!s) throw fail('Sessão do vídeo não encontrada. Comece de novo.');
  const v = db.get('SELECT * FROM videos_patrocinados WHERE id = ?', s.video_id);
  if (!v) throw fail('Vídeo não encontrado.', 404);
  if (Date.now() - s.inicio < (v.duracao_s - 1) * 1000) throw fail('Assista ao vídeo até o fim para ganhar as moedas.');
  const dia = hoje();
  const n = db.get(`SELECT COUNT(*) n FROM moedas_ganhas WHERE dono = ? AND origem = 'video' AND ref LIKE ?`, dono, `video:%:${dia}`).n;
  if (n >= VIDEOS_POR_DIA) throw fail(`Você já assistiu ${VIDEOS_POR_DIA} vídeos hoje. Volte amanhã!`);
  db.run('DELETE FROM video_sessoes WHERE token = ?', s.token);
  if (!creditar(dono, 'video', `video:${v.id}:${dia}`, v.moedas, `Vídeo patrocinado: ${v.titulo} (${v.anunciante})`)) throw fail('Você já ganhou as moedas deste vídeo hoje.');
  db.run('UPDATE videos_patrocinados SET visualizacoes = visualizacoes + 1 WHERE id = ?', v.id);
  return painel(dono);
}

// Admin
function listarVideosAdmin() { return db.all('SELECT * FROM videos_patrocinados ORDER BY id DESC'); }
function salvarVideo(b, id = null) {
  const titulo = String(b.titulo || '').trim().slice(0, 80), anunciante = String(b.anunciante || '').trim().slice(0, 60);
  const url = String(b.url || '').trim();
  if (titulo.length < 3) throw fail('Informe o título do vídeo.');
  if (anunciante.length < 2) throw fail('Informe o anunciante.');
  if (!youtubeId(url) && !/^https:\/\/\S+\.(mp4|webm)(\?\S*)?$/i.test(url)) throw fail('Use um link do YouTube ou um arquivo de vídeo .mp4/.webm (https).');
  const duracao = Math.min(Math.max(parseInt(b.duracao_s, 10) || 30, 5), 180), moedas = Math.min(Math.max(parseInt(b.moedas, 10) || 10, 1), 100);
  const ativo = b.ativo === false || b.ativo === '0' ? 0 : 1;
  if (id) db.run('UPDATE videos_patrocinados SET titulo = ?, anunciante = ?, url = ?, duracao_s = ?, moedas = ?, ativo = ? WHERE id = ?', titulo, anunciante, url, duracao, moedas, ativo, Number(id));
  else db.run('INSERT INTO videos_patrocinados (titulo, anunciante, url, duracao_s, moedas, ativo) VALUES (?, ?, ?, ?, ?, ?)', titulo, anunciante, url, duracao, moedas, ativo);
  return listarVideosAdmin();
}
function excluirVideo(id) { db.run('DELETE FROM videos_patrocinados WHERE id = ?', Number(id)); return listarVideosAdmin(); }

// ── Loja: efeitos de perfil e de nome ───────────────────────────────────────
const possui = (dono, id) => Boolean(db.get('SELECT 1 FROM cosmeticos_compras WHERE dono = ? AND item = ?', dono, id));
function itensDe(dono, admin = false) {
  const p = db.get('SELECT efeito, efeito_nome FROM perfis WHERE dono = ?', dono) || {};
  return ITENS.map(i => ({ ...i, possui: admin || possui(dono, i.id), equipada: p[COLUNA[i.tipo]] === i.id }));
}
function comprar(dono, id, admin = false) {
  const it = POR_ID[id];
  if (!it) return null; // não é deste módulo (moldura)
  if (admin || possui(dono, id)) throw fail('Você já tem este item.');
  db.transaction(() => {
    const s = saldo(dono);
    if (s < it.preco) throw fail(`Moedas insuficientes: faltam ${it.preco - s}. Faça missões ou assista a vídeos patrocinados.`);
    db.run('INSERT INTO cosmeticos_compras (dono, item, preco) VALUES (?, ?, ?)', dono, id, it.preco);
  });
  return true;
}
function equipar(dono, id, admin = false, usar = true) {
  const it = POR_ID[id];
  if (!it) return null;
  if (usar && !admin && !possui(dono, id)) throw fail('Este item ainda não é seu.');
  db.run(`UPDATE perfis SET ${COLUNA[it.tipo]} = ? WHERE dono = ?`, usar ? id : null, dono);
  return true;
}
// Efeitos em uso no perfil (só os que a pessoa tem)
function emUso(dono, admin = false) {
  const p = db.get('SELECT efeito, efeito_nome FROM perfis WHERE dono = ?', dono) || {};
  const ok = id => (id && POR_ID[id] && (admin || possui(dono, id)) ? id : null);
  return { efeito: ok(p.efeito), efeito_nome: ok(p.efeito_nome) };
}

// Tudo para a aba "Ganhar moedas"
function painel(dono) {
  return { moedas: saldo(dono), missoes: missoes(dono), videos: videos(dono), extrato: extrato(dono) };
}

module.exports = {
  ITENS, saldo, painel, missoes, resgatarMissao, videos, iniciarVideo, resgatarVideo, registrarPresenca,
  listarVideosAdmin, salvarVideo, excluirVideo, itensDe, comprar, equipar, emUso, youtubeId, VIDEOS_POR_DIA,
};
