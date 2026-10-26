// SAC (atendimento ao cliente): o usuário abre um chamado pelo painel de Mensagens; o chamado entra numa FILA;
// um atendente (o administrador ou um usuário com a permissão "Atendente do SAC") ASSUME o chamado e conversa
// com a pessoa até resolver. Pode devolver à fila; ao resolver, o cliente avalia de 1 a 5.
const db = require('./db');
const chat = require('./chat');
const notificacoes = require('./notificacoes');

const MAX_TEXTO = 2000;
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const txt = v => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXTO);
const codigo = id => `SAC-${String(id).padStart(6, '0')}`;
const ASSUNTOS = {
  duvida: 'Dúvida sobre o site', pedido: 'Pedido ou pagamento', conta: 'Minha conta ou plano',
  loja: 'Loja parceira', anuncio: 'Anúncios e publicidade', outro: 'Outro assunto',
};
const STATUS = { fila: 'Na fila', atendimento: 'Em atendimento', resolvido: 'Resolvido' };

try { db.db.exec('ALTER TABLE users ADD COLUMN pode_sac INTEGER NOT NULL DEFAULT 0'); } catch { /* já existe */ }
db.db.exec(`
  CREATE TABLE IF NOT EXISTS sac_chamados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente TEXT NOT NULL,                       -- 'u:<id>' | 'c:<id>'
    assunto TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'fila' CHECK (status IN ('fila', 'atendimento', 'resolvido')),
    atendente TEXT,                              -- 'admin' | 'u:<id>'
    lido_cliente INTEGER NOT NULL DEFAULT 0,     -- última mensagem lida pelo cliente
    lido_atendente INTEGER NOT NULL DEFAULT 0,
    nota INTEGER,
    nota_texto TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    assumido_em TEXT,
    resolvido_em TEXT,
    ultima_msg_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sac_cliente ON sac_chamados (cliente, id);
  CREATE INDEX IF NOT EXISTS idx_sac_status ON sac_chamados (status, id);
  CREATE TABLE IF NOT EXISTS sac_mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chamado_id INTEGER NOT NULL REFERENCES sac_chamados(id) ON DELETE CASCADE,
    autor TEXT,                                  -- null = aviso do sistema
    texto TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sac_msgs ON sac_mensagens (chamado_id, id);
`);

// Primeiro atendimento pela Capi, a assistente virtual (src/ia/assistente.js): ela responde com o Guia do usuário,
// pergunta se há mais dúvidas e, quando não sabe ou a pessoa pede, chama um atendente (o chamado vai para a fila).
for (const col of ['ia_estado TEXT', 'ia_respostas INTEGER NOT NULL DEFAULT 0']) {
  try { db.db.exec(`ALTER TABLE sac_chamados ADD COLUMN ${col}`); } catch { /* já existe */ }
}
const IA = 'ia';
const iaAtiva = () => require('./settings').get('ia_sac_ativa') !== '0';

// ── Quem atende ─────────────────────────────────────────────────────────────
function ehAtendente(dono) {
  if (dono === 'admin') return true;
  const m = /^u:(\d+)$/.exec(dono || '');
  return Boolean(m && db.get(`SELECT 1 FROM users WHERE id = ? AND status = 'active' AND pode_sac = 1`, Number(m[1])));
}
function atendentes() {
  return ['admin', ...db.all(`SELECT id FROM users WHERE status = 'active' AND pode_sac = 1`).map(u => `u:${u.id}`)];
}
const nome = dono => (dono === 'admin' ? 'Equipe Ofertou!' : dono === IA ? 'Capi · assistente virtual' : chat.pessoa(dono).nome);

// ── Mensagens ───────────────────────────────────────────────────────────────
function msg(id, autor, texto) {
  // Mensagens de pessoas: xingamentos viram *** e ficam registrados (Painel → Moderação do chat)
  const f = autor && autor !== IA ? require('./moderacao-chat').filtrar(texto) : { texto, palavras: [] };
  const r = db.run('INSERT INTO sac_mensagens (chamado_id, autor, texto) VALUES (?, ?, ?)', id, autor, f.texto);
  db.run(`UPDATE sac_chamados SET ultima_msg_at = datetime('now') WHERE id = ?`, id);
  const msgId = Number(r.lastInsertRowid);
  if (f.palavras.length) require('./moderacao-chat').registrar('sac', id, msgId, autor, texto, f.palavras);
  return msgId;
}
const sistema = (id, texto) => msg(id, null, texto);
function posicao(c) {
  if (c.status !== 'fila') return null;
  return db.get(`SELECT COUNT(*) n FROM sac_chamados WHERE status = 'fila' AND id <= ?`, c.id).n;
}
function naoLidasCliente(c) {
  return db.get('SELECT COUNT(*) n FROM sac_mensagens WHERE chamado_id = ? AND id > ? AND (autor IS NULL OR autor <> ?)', c.id, c.lido_cliente, c.cliente).n;
}
function naoLidasAtendente(c) {
  return db.get('SELECT COUNT(*) n FROM sac_mensagens WHERE chamado_id = ? AND id > ? AND autor = ?', c.id, c.lido_atendente, c.cliente).n;
}
function montar(c, para) {
  const p = chat.pessoa(c.cliente);
  return {
    id: c.id, codigo: codigo(c.id), assunto: c.assunto, assunto_nome: ASSUNTOS[c.assunto] || c.assunto,
    status: c.status, status_nome: STATUS[c.status], posicao: posicao(c),
    atendente: c.atendente ? { dono: c.atendente, nome: nome(c.atendente) } : null,
    cliente: { dono: c.cliente, nome: p.nome, avatar: p.avatar || null, slug: p.slug || null },
    nota: c.nota, nota_texto: c.nota_texto,
    created_at: c.created_at, assumido_em: c.assumido_em, resolvido_em: c.resolvido_em, ultima_msg_at: c.ultima_msg_at || c.created_at,
    nao_lidas: para === 'cliente' ? naoLidasCliente(c) : naoLidasAtendente(c),
    ultima: (db.get('SELECT texto, autor FROM sac_mensagens WHERE chamado_id = ? ORDER BY id DESC LIMIT 1', c.id) || null),
  };
}
function mensagens(id, depois = 0) {
  return db.all('SELECT id, autor, texto, created_at FROM sac_mensagens WHERE chamado_id = ? AND id > ? ORDER BY id LIMIT 500', id, Number(depois) || 0)
    .map(m => ({ ...m, autor_nome: m.autor ? nome(m.autor) : null }));
}
const pegar = id => db.get('SELECT * FROM sac_chamados WHERE id = ?', Number(id));

// ── Lado do cliente ─────────────────────────────────────────────────────────
function aberto(dono) {
  return db.get(`SELECT * FROM sac_chamados WHERE cliente = ? AND status <> 'resolvido' ORDER BY id DESC LIMIT 1`, dono);
}
function abrir(dono, b) {
  if (!dono) throw fail('Entre na sua conta para falar com o suporte.', 401);
  if (dono === 'admin') throw fail('O administrador atende o SAC pela Fila do SAC.');
  const texto = txt(b.texto);
  if (texto.length < 3) throw fail('Escreva sua dúvida.');
  let c = aberto(dono);
  if (c) { msg(c.id, dono, texto); if (c.status === 'atendimento' && c.atendente === IA) turnoIa(c, texto); return meu(dono); }
  const assunto = ASSUNTOS[b.assunto] ? b.assunto : 'outro';
  const id = Number(db.run('INSERT INTO sac_chamados (cliente, assunto) VALUES (?, ?)', dono, assunto).lastInsertRowid);
  msg(id, dono, texto);
  if (iaAtiva()) {
    db.run(`UPDATE sac_chamados SET status = 'atendimento', atendente = ?, assumido_em = datetime('now') WHERE id = ?`, IA, id);
    sistema(id, `Chamado ${codigo(id)} aberto (${ASSUNTOS[assunto]}). A Capi, nossa assistente virtual, faz o primeiro atendimento; se precisar, ela chama um atendente da equipe.`);
    turnoIa(pegar(id), texto, true);
    return meu(dono);
  }
  sistema(id, `Chamado ${codigo(id)} aberto (${ASSUNTOS[assunto]}). Você está na fila: um atendente vai assumir e responder aqui mesmo.`);
  avisarAtendentes(id, dono, assunto);
  return meu(dono);
}
function avisarAtendentes(id, dono, assunto) {
  for (const a of atendentes()) {
    try { notificacoes.criar(a, { tipo: 'sac_fila', titulo: `Novo chamado no SAC: ${codigo(id)}`, texto: `${nome(dono)} — ${ASSUNTOS[assunto] || assunto}`, link: '/sac' }); } catch { /* opcional */ }
  }
}

// ── Capi: uma rodada da conversa ────────────────────────────────────────────
const QUER_HUMANO = /\b(atendente|humano|humana|pessoa de verdade|pessoa real|alguem da equipe|falar com alguem|operador|suporte humano|quero falar com|me transfere|transferir)\b/;
const SIM = /^(sim|s|quero|pode|pode sim|claro|ok|okay|isso|por favor|pfv|pf|aham|uhum|com certeza|bora|manda)\b/;
const NAO = /^(nao|n|nada|so isso|era so isso|era isso|resolveu|resolvido|tudo certo|ta bom|beleza|blz|nao precisa|obrigad|valeu|vlw|tchau)\b/;
const OI = /^(oi+|ola|opa|e ai|eai|bom dia|boa tarde|boa noite|hey|hello|salve)[!. ]*$/;
const OBRIGADO = /^(obrigad[oa]|valeu|vlw|brigad[oa]|muito obrigad[oa]|agradeco)[!. ]*$/;
function turnoIa(c, texto, primeira = false) {
  const assistente = require('./ia/assistente');
  const t = assistente.semAcento(texto).trim();
  const estado = c.ia_estado || '';
  const curto = t.split(/\s+/).length <= 4; // "sim", "não, obrigado"… (frase longa é uma nova pergunta)
  const falar = s => msg(c.id, IA, s);
  const definir = (e, mais = 0) => db.run('UPDATE sac_chamados SET ia_estado = ?, ia_respostas = ia_respostas + ? WHERE id = ?', e, mais, c.id);
  const chamarHumano = () => {
    db.run(`UPDATE sac_chamados SET status = 'fila', atendente = NULL, assumido_em = NULL, ia_estado = 'humano' WHERE id = ?`, c.id);
    falar('Certo! Já chamei um atendente da nossa equipe: ele vai continuar a conversa aqui mesmo. Enquanto isso, se quiser, pode ir adiantando os detalhes (ex.: número do pedido). 😊');
    avisarAtendentes(c.id, c.cliente, c.assunto);
  };
  if (QUER_HUMANO.test(t) || (estado === 'oferta_humano' && curto && SIM.test(t))) return chamarHumano();
  if (estado === 'oferta_humano' && curto && NAO.test(t) && !OBRIGADO.test(t)) { definir(''); return falar('Tudo bem! Me conte a sua dúvida que eu procuro a resposta no Guia do usuário.'); }
  if ((estado === 'mais_duvidas' || estado === 'oferta_humano') && curto && (NAO.test(t) || OBRIGADO.test(t))) {
    db.run(`UPDATE sac_chamados SET status = 'resolvido', resolvido_em = datetime('now'), ia_estado = 'encerrado' WHERE id = ?`, c.id);
    return falar('Que bom que pude ajudar! Vou encerrar este atendimento. Se surgir outra dúvida, é só escrever aqui de novo. Até mais! 🦫');
  }
  if (estado === 'mais_duvidas' && SIM.test(t) && t.split(' ').length <= 3) { definir(''); return falar('Claro! Qual é a sua dúvida?'); }
  if (OI.test(t)) { definir(''); return falar(`Olá! Eu sou a Capi, a assistente virtual do Ofertou! 🦫 Me conte a sua dúvida que eu te ajudo${primeira ? '' : ' agora mesmo'}.`); }
  if (OBRIGADO.test(t)) { definir('mais_duvidas'); return falar('Por nada! Posso ajudar em mais alguma coisa?'); }

  const r = assistente.responder(texto);
  if (r.interno) { definir('oferta_humano'); return falar(`${r.texto}\n\nDeseja falar com um atendente?`); }
  if (r.confianca === 'baixa') {
    definir('oferta_humano');
    return falar('Não encontrei a resposta para isso no nosso Guia do usuário. 🤔 Você pode escrever de outro jeito ou, se preferir, eu chamo um atendente da equipe. Deseja falar com um atendente?');
  }
  const feitas = (c.ia_respostas || 0) + 1;
  const abertura = primeira ? 'Olá! Eu sou a Capi, a assistente virtual do Ofertou! 🦫 Encontrei isto no nosso Guia do usuário:\n\n' : '';
  if (feitas >= 3) {
    definir('oferta_humano', 1);
    return falar(`${abertura}${r.texto}\n\nAinda ficou alguma dúvida? Se preferir, posso chamar um atendente da equipe. Deseja falar com um atendente?`);
  }
  definir('mais_duvidas', 1);
  return falar(`${abertura}${r.texto}\n\nIsso ajudou? Tem mais alguma dúvida?`);
}

// Chamado atual (aberto, ou o último resolvido há menos de 3 dias, para avaliar/ver), com as mensagens
function meu(dono, depois = 0) {
  if (!dono) throw fail('Entre na sua conta.', 401);
  const c = aberto(dono) || db.get(`SELECT * FROM sac_chamados WHERE cliente = ? AND status = 'resolvido' AND resolvido_em > datetime('now', '-3 days') ORDER BY id DESC LIMIT 1`, dono);
  if (!c) return { chamado: null, mensagens: [], assuntos: ASSUNTOS };
  const ms = mensagens(c.id, depois);
  const ult = db.get('SELECT MAX(id) m FROM sac_mensagens WHERE chamado_id = ?', c.id).m || 0;
  if (ult > c.lido_cliente) db.run('UPDATE sac_chamados SET lido_cliente = ? WHERE id = ?', ult, c.id);
  return { chamado: montar({ ...c, lido_cliente: ult }, 'cliente'), mensagens: ms, assuntos: ASSUNTOS };
}
function enviarCliente(dono, id, texto) {
  const c = pegar(id);
  if (!c || c.cliente !== dono) throw fail('Chamado não encontrado.', 404);
  if (c.status === 'resolvido') return abrir(dono, { assunto: c.assunto, texto }); // escreveu de novo: novo chamado
  const t = txt(texto);
  if (!t) throw fail('Escreva a mensagem.');
  msg(c.id, dono, t);
  if (c.status === 'atendimento' && c.atendente === IA) turnoIa(c, t);
  return meu(dono);
}
function encerrarCliente(dono, id) {
  const c = pegar(id);
  if (!c || c.cliente !== dono) throw fail('Chamado não encontrado.', 404);
  if (c.status !== 'resolvido') {
    db.run(`UPDATE sac_chamados SET status = 'resolvido', resolvido_em = datetime('now') WHERE id = ?`, c.id);
    sistema(c.id, 'Você encerrou o chamado. Se precisar, é só escrever de novo.');
  }
  return meu(dono);
}
function avaliar(dono, id, b) {
  const c = pegar(id);
  if (!c || c.cliente !== dono) throw fail('Chamado não encontrado.', 404);
  if (c.status !== 'resolvido') throw fail('Avalie depois que o atendimento for concluído.');
  const nota = Math.min(Math.max(parseInt(b.nota, 10) || 0, 1), 5);
  db.run('UPDATE sac_chamados SET nota = ?, nota_texto = ? WHERE id = ?', nota, txt(b.texto).slice(0, 300) || null, c.id);
  return meu(dono);
}
function resumoCliente(dono) {
  if (!dono || dono === 'admin') return 0;
  const c = aberto(dono) || db.get(`SELECT * FROM sac_chamados WHERE cliente = ? ORDER BY id DESC LIMIT 1`, dono);
  return c ? naoLidasCliente(c) : 0;
}

// ── Lado do atendente ───────────────────────────────────────────────────────
function exigirAtendente(dono) { if (!ehAtendente(dono)) throw fail('Somente atendentes do SAC.', 403); }
function fila(dono) {
  exigirAtendente(dono);
  const lista = sql => db.all(sql, dono).map(c => montar(c, 'atendente'));
  return {
    eu: { dono, nome: nome(dono), admin: dono === 'admin' },
    fila: lista(`SELECT * FROM sac_chamados WHERE status = 'fila' AND ? IS NOT NULL ORDER BY id`),
    meus: lista(`SELECT * FROM sac_chamados WHERE status = 'atendimento' AND atendente = ? ORDER BY COALESCE(ultima_msg_at, created_at) DESC`),
    outros: lista(`SELECT * FROM sac_chamados WHERE status = 'atendimento' AND atendente <> ? ORDER BY id`),
    resolvidos: lista(`SELECT * FROM sac_chamados WHERE status = 'resolvido' AND ? IS NOT NULL ORDER BY resolvido_em DESC LIMIT 30`),
    numeros: db.get(`SELECT SUM(status = 'fila') fila, SUM(status = 'atendimento') atendimento,
      SUM(status = 'resolvido' AND resolvido_em > datetime('now', '-1 day')) resolvidos_24h, ROUND(AVG(nota), 1) nota_media, COUNT(nota) avaliacoes FROM sac_chamados`),
    assuntos: ASSUNTOS,
  };
}
function ver(dono, id, depois = 0) {
  exigirAtendente(dono);
  const c = pegar(id);
  if (!c) throw fail('Chamado não encontrado.', 404);
  const ms = mensagens(c.id, depois);
  if (c.atendente === dono) {
    const ult = db.get('SELECT MAX(id) m FROM sac_mensagens WHERE chamado_id = ?', c.id).m || 0;
    if (ult > c.lido_atendente) db.run('UPDATE sac_chamados SET lido_atendente = ? WHERE id = ?', ult, c.id);
  }
  const anteriores = db.all(`SELECT id, assunto, status, created_at FROM sac_chamados WHERE cliente = ? AND id <> ? ORDER BY id DESC LIMIT 10`, c.cliente, c.id)
    .map(x => ({ ...x, codigo: codigo(x.id), assunto_nome: ASSUNTOS[x.assunto] || x.assunto, status_nome: STATUS[x.status] }));
  return { chamado: montar(pegar(id), 'atendente'), mensagens: ms, anteriores };
}
function assumir(dono, id) {
  exigirAtendente(dono);
  const c = pegar(id);
  if (!c) throw fail('Chamado não encontrado.', 404);
  // Da fila: o primeiro que clicar fica com ele. Em atendimento com outra pessoa: só o administrador pode assumir.
  const r = c.status === 'atendimento' && c.atendente !== dono && (dono === 'admin' || c.atendente === IA)
    ? db.run(`UPDATE sac_chamados SET atendente = ?, assumido_em = datetime('now') WHERE id = ? AND status = 'atendimento'`, dono, c.id)
    : db.run(`UPDATE sac_chamados SET status = 'atendimento', atendente = ?, assumido_em = datetime('now') WHERE id = ? AND status = 'fila'`, dono, c.id);
  if (!r.changes) throw fail(c.status === 'resolvido' ? 'Este chamado já foi resolvido.' : 'Outro atendente já assumiu este chamado.', 409);
  sistema(c.id, `${nome(dono)} assumiu o seu atendimento.`);
  try { notificacoes.criar(c.cliente, { tipo: 'sac', titulo: `Seu chamado ${codigo(c.id)} está em atendimento`, texto: `${nome(dono)} vai te ajudar.`, link: '/sac/meu' }); } catch { /* opcional */ }
  return ver(dono, c.id);
}
function minhaVez(dono, id) {
  exigirAtendente(dono);
  const c = pegar(id);
  if (!c) throw fail('Chamado não encontrado.', 404);
  if (c.status !== 'atendimento' || c.atendente !== dono) throw fail('Assuma o chamado antes de responder.', 409);
  return c;
}
function responder(dono, id, texto) {
  const c = minhaVez(dono, id);
  const t = txt(texto);
  if (!t) throw fail('Escreva a resposta.');
  const clienteEmDia = c.lido_cliente >= (db.get('SELECT MAX(id) m FROM sac_mensagens WHERE chamado_id = ?', c.id).m || 0);
  msg(c.id, dono, t);
  // Avisa o cliente no sino (uma vez por rodada de respostas, para não encher de avisos)
  if (clienteEmDia) {
    try { notificacoes.criar(c.cliente, { tipo: 'sac', titulo: `Resposta do suporte — ${codigo(c.id)}`, texto: t.slice(0, 120), link: '/sac/meu' }); } catch { /* opcional */ }
    chat.avisarPorEmail(c.cliente, `Resposta do suporte Ofertou! — ${codigo(c.id)}`, `${nome(dono)} respondeu o seu chamado ${codigo(c.id)}:

${t}`);
  }
  return ver(dono, c.id);
}
function devolver(dono, id) {
  const c = minhaVez(dono, id);
  db.run(`UPDATE sac_chamados SET status = 'fila', atendente = NULL, assumido_em = NULL WHERE id = ?`, c.id);
  sistema(c.id, 'Seu atendimento voltou para a fila: outro atendente vai continuar daqui.');
  return ver(dono, c.id);
}
function resolver(dono, id) {
  const c = minhaVez(dono, id);
  db.run(`UPDATE sac_chamados SET status = 'resolvido', resolvido_em = datetime('now') WHERE id = ?`, c.id);
  sistema(c.id, `${nome(dono)} marcou o chamado como resolvido. Conte como foi o atendimento! Se ainda precisar de ajuda, é só escrever.`);
  try { notificacoes.criar(c.cliente, { tipo: 'sac', titulo: `Chamado ${codigo(c.id)} resolvido`, texto: 'Avalie o atendimento.', link: '/sac/meu' }); } catch { /* opcional */ }
  return ver(dono, c.id);
}
function resumoAtendente(dono) {
  if (!ehAtendente(dono)) return null;
  const fila = db.get(`SELECT COUNT(*) n FROM sac_chamados WHERE status = 'fila'`).n;
  const meus = db.all(`SELECT * FROM sac_chamados WHERE status = 'atendimento' AND atendente = ?`, dono);
  return { admin: dono === 'admin', fila, meus: meus.length, nao_lidas: meus.reduce((s, c) => s + naoLidasAtendente(c), 0) };
}

// Permissão de atendente (painel → Usuários)
function permitir(userId, sim) {
  db.run('UPDATE users SET pode_sac = ? WHERE id = ?', sim ? 1 : 0, Number(userId));
}

// Teste da Capi no painel (não grava nada)
function perguntarIa(texto) { return require('./ia/assistente').responder(texto); }

module.exports = {
  perguntarIa,
  ASSUNTOS, STATUS, codigo, ehAtendente, abrir, meu, enviarCliente, encerrarCliente, avaliar, resumoCliente,
  fila, ver, assumir, responder, devolver, resolver, resumoAtendente, permitir,
};
