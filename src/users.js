// Usuários do site (consumidores e empresas): cadastro, login, sessão e moderação.
// São contas separadas do administrador: nenhum usuário do site acessa o painel /admin.
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');
const { hashPassword, verifyPassword, tokenHash, parseCookies, cookieFlags } = require('./auth');

const COOKIE = 'gp_user';
const SESSION_DAYS = 30;
const MIN_PASSWORD = 8;
const TIPOS = ['consumidor', 'empresa'];
const SIGNUP_MODES = ['aberto', 'aprovacao', 'fechado'];

// SQL reutilizado: conta liberada (ativa ou com suspensão já vencida)
const ACTIVE_SQL = alias => `(${alias}.status = 'active' OR (${alias}.status = 'suspended' AND ${alias}.suspenso_ate <= datetime('now')))`;

const normalizeEmail = e => String(e || '').trim().toLowerCase();
const fmtDate = s => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

function validCnpj(raw) {
  const c = String(raw || '').replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = len => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) { sum += Number(c[len - i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

function signupMode(tipo) {
  const mode = settings.get(`signup_${tipo}`);
  return SIGNUP_MODES.includes(mode) ? mode : 'aprovacao';
}

// Formato enviado ao próprio usuário (sem hash de senha).
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, tipo: u.tipo, nome: u.nome, email: u.email, empresa_nome: u.empresa_nome, cnpj: u.cnpj,
    status: u.status, bloqueio_publicacao: Boolean(u.bloqueio_publicacao), created_at: u.created_at,
  };
}

function register(body) {
  const tipo = String(body.tipo || '');
  if (!TIPOS.includes(tipo)) throw new Error('Escolha o tipo de conta: consumidor ou empresa.');
  const mode = signupMode(tipo);
  if (mode === 'fechado') throw new Error(`Os cadastros de ${tipo === 'empresa' ? 'empresas' : 'consumidores'} estão fechados no momento.`);

  const nome = String(body.nome || '').trim().replace(/\s+/g, ' ');
  const email = normalizeEmail(body.email);
  const senha = String(body.senha || '');
  if (nome.length < 2 || nome.length > 80) throw new Error('Informe seu nome (2 a 80 caracteres).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) throw new Error('Informe um e-mail válido.');
  if (senha.length < MIN_PASSWORD || senha.length > 200) throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);

  let empresaNome = null, cnpj = null;
  if (tipo === 'empresa') {
    empresaNome = String(body.empresa_nome || '').trim().replace(/\s+/g, ' ');
    if (empresaNome.length < 2 || empresaNome.length > 80) throw new Error('Informe o nome da empresa.');
    const rawCnpj = String(body.cnpj || '').replace(/\D/g, '');
    if (rawCnpj) {
      if (!validCnpj(rawCnpj)) throw new Error('CNPJ inválido.');
      cnpj = rawCnpj;
    }
  }

  if (db.get('SELECT 1 FROM blocked_emails WHERE email = ?', email)) {
    throw new Error('Este e-mail não pode ser cadastrado.');
  }
  if (db.get('SELECT 1 FROM users WHERE email = ?', email)) throw new Error('Já existe uma conta com este e-mail.');

  const status = mode === 'aberto' ? 'active' : 'pending';
  const res = db.run(
    `INSERT INTO users (tipo, nome, email, senha_hash, empresa_nome, cnpj, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    tipo, nome, email, hashPassword(senha), empresaNome, cnpj, status
  );
  return getById(Number(res.lastInsertRowid));
}

const getById = id => db.get('SELECT * FROM users WHERE id = ?', id);

// Explica por que a conta não pode entrar (ou null se pode).
function blockedReason(u) {
  if (u.status === 'pending') return 'Seu cadastro está aguardando aprovação do administrador.';
  if (u.status === 'rejected') return `Seu cadastro não foi aprovado.${u.status_motivo ? ` Motivo: ${u.status_motivo}` : ''}`;
  if (u.status === 'banned') return `Esta conta foi banida.${u.status_motivo ? ` Motivo: ${u.status_motivo}` : ''}`;
  if (u.status === 'suspended') {
    const until = new Date(String(u.suspenso_ate).replace(' ', 'T') + 'Z');
    if (until > new Date()) {
      return `Conta suspensa até ${fmtDate(u.suspenso_ate)}.${u.status_motivo ? ` Motivo: ${u.status_motivo}` : ''}`;
    }
    db.run(`UPDATE users SET status = 'active', status_motivo = NULL, suspenso_ate = NULL WHERE id = ?`, u.id);
    u.status = 'active';
  }
  return null;
}

function login(email, senha) {
  const u = db.get('SELECT * FROM users WHERE email = ?', normalizeEmail(email));
  if (!u || !verifyPassword(String(senha || ''), u.senha_hash)) throw new Error('E-mail ou senha incorretos.');
  const reason = blockedReason(u);
  if (reason) throw Object.assign(new Error(reason), { status: 403 });
  db.run(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`, u.id);
  return u;
}

function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.run(
    `INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))`,
    tokenHash(token), userId, `+${SESSION_DAYS} days`
  );
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}; ${cookieFlags(req)}`);
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.run('DELETE FROM user_sessions WHERE token_hash = ?', tokenHash(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${cookieFlags(req)}`);
}

// Usuário da sessão atual; sessões de contas bloqueadas deixam de valer na hora.
function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const u = db.get(
    `SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`, tokenHash(token)
  );
  if (!u || blockedReason(u)) return null;
  return u;
}

function requireUser(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });
  req.user = u;
  next();
}

function updateProfile(u, body) {
  const nome = String(body.nome ?? u.nome).trim().replace(/\s+/g, ' ');
  if (nome.length < 2 || nome.length > 80) throw new Error('Nome inválido.');
  let empresaNome = u.empresa_nome;
  if (u.tipo === 'empresa' && body.empresa_nome !== undefined) {
    empresaNome = String(body.empresa_nome).trim().replace(/\s+/g, ' ');
    if (empresaNome.length < 2 || empresaNome.length > 80) throw new Error('Nome da empresa inválido.');
  }
  db.run('UPDATE users SET nome = ?, empresa_nome = ? WHERE id = ?', nome, empresaNome, u.id);
}

function changePassword(u, atual, nova) {
  if (!verifyPassword(String(atual || ''), u.senha_hash)) throw new Error('Senha atual incorreta.');
  if (String(nova || '').length < MIN_PASSWORD) throw new Error(`A nova senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  db.run('UPDATE users SET senha_hash = ? WHERE id = ?', hashPassword(nova), u.id);
  db.run('DELETE FROM user_sessions WHERE user_id = ?', u.id);
}

function deleteOwnAccount(u, senha) {
  if (!verifyPassword(String(senha || ''), u.senha_hash)) throw new Error('Senha incorreta.');
  logAction(u, 'conta_excluida_pelo_usuario', null);
  db.run('DELETE FROM users WHERE id = ?', u.id); // loja, produtos e sessões saem junto (ON DELETE CASCADE)
}

// ── Moderação (usado pelo painel do administrador) ────────────────────────────
function logAction(u, acao, detalhe) {
  db.run('INSERT INTO moderation_log (user_id, user_email, acao, detalhe) VALUES (?, ?, ?, ?)',
    u ? u.id : null, u ? u.email : null, acao, detalhe || null);
}

const killSessions = id => db.run('DELETE FROM user_sessions WHERE user_id = ?', id);

function moderate(id, action, { motivo = '', dias = 0, bloquearEmail = false } = {}) {
  const u = getById(id);
  if (!u) throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
  motivo = String(motivo || '').trim().slice(0, 300);

  switch (action) {
    case 'aprovar':
      db.run(`UPDATE users SET status = 'active', status_motivo = NULL, suspenso_ate = NULL WHERE id = ?`, id);
      logAction(u, 'aprovado');
      break;
    case 'recusar':
      db.run(`UPDATE users SET status = 'rejected', status_motivo = ? WHERE id = ?`, motivo || null, id);
      killSessions(id);
      logAction(u, 'cadastro_recusado', motivo);
      break;
    case 'suspender': {
      const d = Math.min(Math.max(parseInt(dias, 10) || 0, 1), 365);
      db.run(`UPDATE users SET status = 'suspended', status_motivo = ?, suspenso_ate = datetime('now', ?) WHERE id = ?`,
        motivo || null, `+${d} days`, id);
      killSessions(id);
      logAction(u, 'suspenso', `${d} dia(s)${motivo ? ` — ${motivo}` : ''}`);
      break;
    }
    case 'banir':
      db.run(`UPDATE users SET status = 'banned', status_motivo = ?, suspenso_ate = NULL WHERE id = ?`, motivo || null, id);
      killSessions(id);
      logAction(u, 'banido', motivo);
      break;
    case 'reativar':
      db.run(`UPDATE users SET status = 'active', status_motivo = NULL, suspenso_ate = NULL WHERE id = ?`, id);
      logAction(u, 'reativado');
      break;
    case 'bloquear_publicacao':
      db.run('UPDATE users SET bloqueio_publicacao = 1 WHERE id = ?', id);
      logAction(u, 'publicacoes_bloqueadas', motivo);
      break;
    case 'liberar_publicacao':
      db.run('UPDATE users SET bloqueio_publicacao = 0 WHERE id = ?', id);
      logAction(u, 'publicacoes_liberadas');
      break;
    case 'excluir_publicacoes': {
      const n = db.run('DELETE FROM offers WHERE loja_id IN (SELECT id FROM lojas WHERE user_id = ?)', id).changes;
      logAction(u, 'publicacoes_excluidas', `${n} produto(s)${motivo ? ` — ${motivo}` : ''}`);
      break;
    }
    case 'excluir':
      if (bloquearEmail) {
        db.run('INSERT OR REPLACE INTO blocked_emails (email, motivo) VALUES (?, ?)', u.email, motivo || null);
      }
      logAction(u, 'perfil_excluido', `${motivo || ''}${bloquearEmail ? ' (e-mail bloqueado)' : ''}`.trim());
      db.run('DELETE FROM users WHERE id = ?', id);
      break;
    default:
      throw Object.assign(new Error('Ação desconhecida.'), { status: 400 });
  }
  return getById(id);
}

function listForAdmin({ q = '', tipo = '', status = '', page = 1, perPage = 30 }) {
  const where = [];
  const params = [];
  if (q) { where.push('(u.nome LIKE ? OR u.email LIKE ? OR u.empresa_nome LIKE ? OR l.nome LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
  if (TIPOS.includes(tipo)) { where.push('u.tipo = ?'); params.push(tipo); }
  if (status) { where.push('u.status = ?'); params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM users u LEFT JOIN lojas l ON l.user_id = u.id';
  const total = db.get(`SELECT COUNT(*) AS n ${from} ${whereSql}`, ...params).n;
  const rows = db.all(
    `SELECT u.id, u.tipo, u.nome, u.email, u.empresa_nome, u.cnpj, u.status, u.status_motivo, u.suspenso_ate,
            u.bloqueio_publicacao, u.created_at, u.last_login_at,
            l.id AS loja_id, l.nome AS loja_nome, l.slug AS loja_slug, l.oculta AS loja_oculta,
            (SELECT COUNT(*) FROM offers o WHERE o.loja_id = l.id) AS produtos
     ${from} ${whereSql}
     ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.created_at DESC
     LIMIT ? OFFSET ?`,
    ...params, perPage, (page - 1) * perPage
  );
  const pending = db.get(`SELECT COUNT(*) AS n FROM users WHERE status = 'pending'`).n;
  return { total, page, perPage, pending, rows };
}

function detailForAdmin(id) {
  const u = getById(id);
  if (!u) return null;
  const { senha_hash, ...user } = u;
  const loja = db.get('SELECT * FROM lojas WHERE user_id = ?', id) || null;
  const produtos = loja ? db.all(
    `SELECT id, produto, preco_atual, preco_anterior, desconto_pct, fonte, oculto, link_clicks, created_at, expires_at,
            affiliate_url, (expires_at > datetime('now')) AS no_prazo
     FROM offers WHERE loja_id = ? ORDER BY created_at DESC LIMIT 500`, loja.id
  ) : [];
  const historico = db.all('SELECT acao, detalhe, created_at FROM moderation_log WHERE user_id = ? ORDER BY id DESC LIMIT 50', id);
  return { user, loja, produtos, historico };
}

module.exports = {
  ACTIVE_SQL, TIPOS, SIGNUP_MODES, signupMode, register, login, createSession, destroySession, currentUser,
  requireUser, publicUser, updateProfile, changePassword, deleteOwnAccount, moderate, listForAdmin, detailForAdmin,
  getById, logAction,
};
