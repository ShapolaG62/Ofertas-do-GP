// Moderação do chat: xingamentos trocados por *** (src/palavroes.js), registro de cada ocorrência com o texto original
// e punições aplicadas pelo administrador (Painel → Moderação do chat).
// Vale para as conversas entre usuários/lojas (chat) e para o Suporte (sac).
const db = require('./db');
const { censurar } = require('./palavroes');

db.db.exec(`
  CREATE TABLE IF NOT EXISTS chat_infracoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origem TEXT NOT NULL CHECK (origem IN ('chat', 'sac')),
    ref_id INTEGER NOT NULL,             -- conversa (chat) ou chamado (sac)
    mensagem_id INTEGER,
    autor TEXT NOT NULL,                 -- 'u:<id>' | 'c:<id>' | 'admin'
    palavras TEXT NOT NULL,              -- JSON com as palavras encontradas
    texto_original TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'resolvido')),
    acao TEXT,                           -- o que o admin fez (advertência, bloqueio, suspensão…)
    resolvido_em TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_infracoes_ref ON chat_infracoes (origem, ref_id);
  CREATE INDEX IF NOT EXISTS idx_infracoes_status ON chat_infracoes (status);
`);
try { db.db.exec('ALTER TABLE users ADD COLUMN chat_bloqueado_ate TEXT'); } catch { /* já existe */ }

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const agoraSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const dataBr = s => new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const chat = () => require('./chat');

// ── No envio da mensagem ────────────────────────────────────────────────────
// Quem está com o chat bloqueado pelo administrador não envia mensagens (o Suporte continua aberto)
function conferirBloqueio(dono) {
  const m = /^u:(\d+)$/.exec(dono || '');
  if (!m) return;
  const u = db.get('SELECT chat_bloqueado_ate FROM users WHERE id = ?', Number(m[1]));
  if (u?.chat_bloqueado_ate && u.chat_bloqueado_ate > agoraSql()) {
    throw fail(`Você está impedido de enviar mensagens até ${dataBr(u.chat_bloqueado_ate)} por uso de linguagem ofensiva. Dúvidas? Fale com o Suporte.`, 403);
  }
}

// Troca os xingamentos por *** e devolve o texto que será gravado
function filtrar(texto) { return censurar(texto); }

// Registra a ocorrência (chamado depois de gravar a mensagem já filtrada)
function registrar(origem, refId, mensagemId, autor, original, palavras) {
  if (!palavras?.length) return;
  db.run(`INSERT INTO chat_infracoes (origem, ref_id, mensagem_id, autor, palavras, texto_original) VALUES (?, ?, ?, ?, ?, ?)`,
    origem, Number(refId), mensagemId ? Number(mensagemId) : null, autor, JSON.stringify(palavras.slice(0, 20)), String(original).slice(0, 2000));
}

// ── Painel do administrador ─────────────────────────────────────────────────
const novos = () => db.get(`SELECT COUNT(DISTINCT origem || ':' || ref_id) n FROM chat_infracoes WHERE status = 'novo'`).n || 0;

function rotulo(origem, refId) {
  if (origem === 'sac') {
    const c = db.get('SELECT cliente, assunto FROM sac_chamados WHERE id = ?', refId);
    return { codigo: `SAC-${String(refId).padStart(6, '0')}`, tipo: 'Suporte', participantes: c ? [chat().pessoa(c.cliente).nome, 'Equipe Ofertou!'] : [] };
  }
  const c = db.get('SELECT * FROM conversas WHERE id = ?', refId);
  return { codigo: chat().ticket(refId), tipo: c?.tipo === 'loja' ? 'Atendimento de loja' : 'Conversa pessoal', participantes: c ? [chat().pessoa(c.a, c).nome, chat().pessoa(c.b, c).nome] : [] };
}

// Conversas que tiveram xingamento (as com ocorrências novas primeiro)
function listar({ status = '' } = {}) {
  const where = status === 'novo' ? `HAVING SUM(status = 'novo') > 0` : status === 'resolvido' ? `HAVING SUM(status = 'novo') = 0` : '';
  return db.all(`SELECT origem, ref_id, COUNT(*) total, SUM(status = 'novo') novos, MAX(created_at) ultima, MIN(created_at) primeira,
      GROUP_CONCAT(DISTINCT autor) autores
    FROM chat_infracoes GROUP BY origem, ref_id ${where} ORDER BY (SUM(status = 'novo') > 0) DESC, MAX(created_at) DESC LIMIT 200`).map(r => ({
    ...r, ...rotulo(r.origem, r.ref_id),
    autores: String(r.autores || '').split(',').filter(Boolean).map(a => ({ dono: a, nome: chat().pessoa(a).nome })),
  }));
}

function situacaoAutor(dono) {
  const m = /^u:(\d+)$/.exec(dono);
  const u = m ? db.get('SELECT id, email, tipo, status, suspenso_ate, chat_bloqueado_ate FROM users WHERE id = ?', Number(m[1])) : null;
  return {
    dono, nome: chat().pessoa(dono).nome, conta_site: Boolean(u), id: u?.id || null, email: u?.email || null, tipo: u?.tipo || null, status: u?.status || null,
    chat_bloqueado_ate: u?.chat_bloqueado_ate && u.chat_bloqueado_ate > agoraSql() ? u.chat_bloqueado_ate : null,
    total_infracoes: db.get('SELECT COUNT(*) n FROM chat_infracoes WHERE autor = ?', dono).n,
  };
}

// Histórico completo da conversa, com as mensagens do xingamento marcadas (texto original e palavras)
function detalhe(origem, refId) {
  refId = Number(refId);
  if (!['chat', 'sac'].includes(origem)) throw fail('Origem inválida.');
  const infr = db.all('SELECT * FROM chat_infracoes WHERE origem = ? AND ref_id = ? ORDER BY id', origem, refId);
  if (!infr.length) throw fail('Nenhuma ocorrência nesta conversa.', 404);
  const porMsg = new Map(infr.filter(i => i.mensagem_id).map(i => [i.mensagem_id, i]));
  const msgs = origem === 'sac'
    ? db.all('SELECT id, autor, texto, created_at FROM sac_mensagens WHERE chamado_id = ? ORDER BY id', refId)
    : db.all('SELECT id, autor, texto, created_at FROM mensagens WHERE conversa_id = ? ORDER BY id', refId);
  const conv = origem === 'chat' ? db.get('SELECT * FROM conversas WHERE id = ?', refId) : null;
  const mensagens = msgs.map(m => {
    const i = porMsg.get(m.id);
    return {
      id: m.id, autor: m.autor, nome: m.autor ? chat().pessoa(m.autor, conv).nome : 'Sistema', texto: m.texto, created_at: m.created_at,
      infracao: i ? { id: i.id, original: i.texto_original, palavras: JSON.parse(i.palavras), status: i.status, acao: i.acao } : null,
    };
  });
  const autores = [...new Set(infr.map(i => i.autor))].map(situacaoAutor);
  return { origem, ref_id: refId, ...rotulo(origem, refId), mensagens, autores, ocorrencias: infr.length, novos: infr.filter(i => i.status === 'novo').length };
}

function fecharOcorrencias(origem, refId, autor, acao) {
  db.run(`UPDATE chat_infracoes SET status = 'resolvido', acao = ?, resolvido_em = datetime('now') WHERE origem = ? AND ref_id = ? ${autor ? 'AND autor = ?' : ''} AND status = 'novo'`,
    acao, origem, Number(refId), ...(autor ? [autor] : []));
}

// Punições para quem escreveu os xingamentos
// acao: advertir | bloquear_chat (dias) | liberar_chat | suspender (dias) | banir | resolver
function punir(origem, refId, b = {}) {
  const acao = String(b.acao || '');
  const users = require('./users');
  const motivo = String(b.motivo || '').trim().slice(0, 300);
  const ref = rotulo(origem, Number(refId)).codigo;
  if (acao === 'resolver') { fecharOcorrencias(origem, refId, null, 'Resolvido sem punição'); return detalhe(origem, refId); }
  const autor = String(b.autor || '');
  if (!db.get('SELECT 1 FROM chat_infracoes WHERE origem = ? AND ref_id = ? AND autor = ?', origem, Number(refId), autor)) throw fail('Esta pessoa não tem ocorrências nesta conversa.', 404);
  const m = /^u:(\d+)$/.exec(autor);
  const u = m ? users.getById(Number(m[1])) : null;
  const dias = Math.min(Math.max(parseInt(b.dias, 10) || 0, 1), 365);
  let feito;
  if (acao === 'advertir') {
    require('./notificacoes').criar(autor, {
      tipo: 'advertencia', titulo: 'Advertência: linguagem ofensiva no chat',
      texto: `Identificamos xingamentos nas suas mensagens (${ref}). Respeite as outras pessoas: novas ocorrências podem levar ao bloqueio das mensagens ou da conta.${motivo ? ` Motivo: ${motivo}` : ''}`,
    });
    if (u) users.logAction(u, 'chat_advertencia', `${ref}${motivo ? ` — ${motivo}` : ''}`);
    feito = 'Advertência enviada';
  } else if (acao === 'bloquear_chat' || acao === 'liberar_chat') {
    if (!u) throw fail('Só dá para bloquear mensagens de contas do site.');
    if (acao === 'bloquear_chat') {
      db.run(`UPDATE users SET chat_bloqueado_ate = datetime('now', ?) WHERE id = ?`, `+${dias} days`, u.id);
      require('./notificacoes').criar(autor, { tipo: 'advertencia', titulo: `Suas mensagens foram bloqueadas por ${dias} dia(s)`, texto: `Motivo: linguagem ofensiva no chat (${ref}).${motivo ? ` ${motivo}` : ''} O Suporte continua disponível.` });
      users.logAction(u, 'chat_bloqueado', `${dias} dia(s) — ${ref}${motivo ? ` — ${motivo}` : ''}`);
      feito = `Mensagens bloqueadas por ${dias} dia(s)`;
    } else {
      db.run('UPDATE users SET chat_bloqueado_ate = NULL WHERE id = ?', u.id);
      users.logAction(u, 'chat_liberado', ref);
      return detalhe(origem, refId);
    }
  } else if (acao === 'suspender' || acao === 'banir') {
    if (!u) throw fail('Só dá para suspender ou banir contas do site.');
    users.moderate(u.id, acao, { dias, motivo: motivo || `Linguagem ofensiva no chat (${ref})` });
    feito = acao === 'suspender' ? `Conta suspensa por ${dias} dia(s)` : 'Conta banida';
  } else throw fail('Ação desconhecida.');
  fecharOcorrencias(origem, refId, autor, feito);
  return detalhe(origem, refId);
}

module.exports = { filtrar, registrar, conferirBloqueio, novos, listar, detalhe, punir };
