// Usuários do site (consumidores e empresas): cadastro, login, sessão e moderação.
// São contas separadas do administrador: nenhum usuário do site acessa o painel /admin.
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');
const { hashPassword, verifyPassword, tokenHash, parseCookies, cookieFlags } = require('./auth');
const cadastro = require('./cadastro');

// Campos cadastrais que o próprio usuário vê e (exceto documentos e e-mail) pode editar.
const PESSOA_FIELDS = ['nome', 'data_nascimento', 'telefone', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
const EMPRESA_FIELDS = ['razao_social', 'empresa_nome', 'inscricao_estadual', 'telefone_empresa', 'ramo', 'site_empresa',
  'emp_cep', 'emp_logradouro', 'emp_numero', 'emp_complemento', 'emp_bairro', 'emp_cidade', 'emp_uf'];

const COOKIE = 'gp_user';
const SESSION_DAYS = 30;
const MIN_PASSWORD = 8;
const TIPOS = ['consumidor', 'empresa'];
const SIGNUP_MODES = ['aberto', 'aprovacao', 'fechado'];

// SQL reutilizado: conta liberada (ativa ou com suspensão já vencida)
const ACTIVE_SQL = alias => `(${alias}.status = 'active' OR (${alias}.status = 'suspended' AND ${alias}.suspenso_ate <= datetime('now')))`;

const normalizeEmail = e => String(e || '').trim().toLowerCase();
const fmtDate = s => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

function signupMode(tipo) {
  const mode = settings.get(`signup_${tipo}`);
  return SIGNUP_MODES.includes(mode) ? mode : 'aprovacao';
}

// Formato enviado ao próprio usuário (sem hash de senha).
function publicUser(u) {
  if (!u) return null;
  const out = {
    id: u.id, tipo: u.tipo, email: u.email, cpf: u.cpf, cnpj: u.cnpj,
    status: u.status, bloqueio_publicacao: Boolean(u.bloqueio_publicacao), pode_postar: Boolean(u.pode_postar),
    plano: u.plano || null, assinatura_ate: u.assinatura_ate || null,
    assinatura_vencida: Boolean(u.assinatura_ate && u.assinatura_ate < nowSql()),
    created_at: u.created_at,
    avatar_url: u.avatar_url, google: Boolean(u.google_id), tem_senha: Boolean(u.senha_hash),
  };
  for (const k of [...PESSOA_FIELDS, ...(u.tipo === 'empresa' ? EMPRESA_FIELDS : [])]) out[k] = u[k] ?? null;
  return out;
}

// e-mails, CPFs e CNPJs bloqueados pelo administrador ficam na mesma tabela ("cpf:...", "cnpj:...").
const isBlocked = key => Boolean(db.get('SELECT 1 FROM blocked_emails WHERE email = ?', key));

const allSignupsClosed = () => TIPOS.every(t => signupMode(t) === 'fechado');
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// Passo 1: cria a conta só com e-mail e senha. O perfil (consumidor/empresa) e os dados vêm no primeiro acesso.
function register(body) {
  if (allSignupsClosed()) throw new Error('Os cadastros estão fechados no momento.');
  const email = normalizeEmail(body.email);
  const senha = String(body.senha || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) throw new Error('Informe um e-mail válido.');
  if (senha.length < MIN_PASSWORD || senha.length > 200) throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  if (body.senha_confirmacao !== undefined && body.senha_confirmacao !== senha) throw new Error('As senhas não conferem.');
  if (isBlocked(email)) throw new Error('Não é possível criar uma conta com este e-mail. Fale com o administrador.');
  const existing = db.get('SELECT google_id FROM users WHERE email = ?', email);
  if (existing) {
    throw new Error(existing.google_id
      ? 'Já existe uma conta com este e-mail criada pelo Google. Use "Entrar com Google".'
      : 'Já existe uma conta com este e-mail. Use "Entrar".');
  }
  const res = db.run(`INSERT INTO users (email, senha_hash, status) VALUES (?, ?, 'onboarding')`, email, hashPassword(senha));
  return getById(Number(res.lastInsertRowid));
}

// Login/cadastro com Google: acha pela conta Google, depois pelo e-mail (vincula) ou cria uma conta nova.
function loginWithGoogle(profile) {
  let u = db.get('SELECT * FROM users WHERE google_id = ?', profile.sub)
    || db.get('SELECT * FROM users WHERE email = ?', profile.email);
  if (u && !u.google_id) {
    db.run('UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?', profile.sub, profile.picture, u.id);
    u = getById(u.id);
  }
  if (!u) {
    if (allSignupsClosed()) throw new Error('Os cadastros estão fechados no momento.');
    if (isBlocked(profile.email)) throw new Error('Não é possível criar uma conta com este e-mail. Fale com o administrador.');
    const res = db.run(
      `INSERT INTO users (email, google_id, avatar_url, nome, status) VALUES (?, ?, ?, ?, 'onboarding')`,
      profile.email, profile.sub, profile.picture, String(profile.name || '').slice(0, 100) || null
    );
    u = getById(Number(res.lastInsertRowid));
  }
  const reason = blockedReason(u);
  if (reason) throw Object.assign(new Error(reason), { status: 403 });
  db.run(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`, u.id);
  return u;
}

// Passo 2 (primeiro acesso): escolhe o perfil e informa os dados cadastrais.
function completeProfile(u, body) {
  if (u.status !== 'onboarding') throw new Error('Seu perfil já foi definido.');
  const tipo = String(body.tipo || '');
  if (!TIPOS.includes(tipo)) throw new Error('Escolha o perfil: consumidor ou empresarial.');
  const mode = signupMode(tipo);
  if (mode === 'fechado') throw new Error(`Os cadastros de ${tipo === 'empresa' ? 'empresas' : 'consumidores'} estão fechados no momento.`);
  if (!(body.aceite_termos === true || body.aceite_termos === 'on' || body.aceite_termos === '1')) {
    throw new Error('É preciso aceitar os Termos de uso e a Política de privacidade.');
  }
  const dados = { ...cadastro.dadosPessoa(body), ...(tipo === 'empresa' ? cadastro.dadosEmpresa(body) : {}) };
  if (isBlocked(`cpf:${dados.cpf}`) || (dados.cnpj && isBlocked(`cnpj:${dados.cnpj}`))) {
    throw new Error('Não é possível concluir o cadastro com estes dados. Fale com o administrador.');
  }
  if (db.get('SELECT 1 FROM users WHERE cpf = ? AND id <> ?', dados.cpf, u.id)) throw new Error('Já existe uma conta com este CPF.');
  if (dados.cnpj && db.get('SELECT 1 FROM users WHERE cnpj = ? AND id <> ?', dados.cnpj, u.id)) throw new Error('Já existe uma conta com este CNPJ.');

  const status = mode === 'aberto' ? 'active' : 'pending';
  const cols = { tipo, status, aceite_termos_em: nowSql(), ...dados };
  db.run(`UPDATE users SET ${Object.keys(cols).map(c => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(cols), u.id);
  logAction(getById(u.id), 'cadastro_concluido', `perfil ${tipo}${status === 'pending' ? ', aguardando aprovação' : ''}`);
  return getById(u.id);
}

const getById = id => db.get('SELECT * FROM users WHERE id = ?', id);

// Explica por que a conta não pode entrar (ou null se pode). Contas em cadastro ou aguardando
// aprovação podem entrar, mas só enxergam a tela de cadastro/espera (ver requireActive).
function blockedReason(u) {
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
  if (u && !u.senha_hash) throw new Error('Esta conta foi criada com o Google. Use "Entrar com Google".');
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

// Usuário da sessão atual; sessões de contas banidas/suspensas/recusadas deixam de valer na hora.
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

// Ferramentas (loja, anúncios, dados) só para contas com perfil definido e liberadas.
function requireActive(req, res, next) {
  const u = req.user;
  if (u.status === 'onboarding') return res.status(403).json({ error: 'Conclua seu cadastro escolhendo o perfil.' });
  if (u.status === 'pending') return res.status(403).json({ error: 'Seu cadastro está aguardando aprovação do administrador.' });
  if (u.assinatura_ate && u.assinatura_ate < nowSql()) return res.status(403).json({ error: 'Sua assinatura venceu. Renove o plano para continuar.' });
  next();
}

// Atualiza os dados cadastrais (CPF, CNPJ e e-mail não podem ser trocados pelo próprio usuário).
function updateProfile(u, body) {
  const dados = {
    ...cadastro.dadosPessoa(body, { exigirDocumento: false }),
    ...(u.tipo === 'empresa' ? cadastro.dadosEmpresa(body, { exigirDocumento: false }) : {}),
  };
  const cols = Object.keys(dados);
  db.run(`UPDATE users SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(dados), u.id);
}

// Contas criadas pelo Google podem definir uma senha sem informar a atual.
function changePassword(u, atual, nova) {
  if (u.senha_hash && !verifyPassword(String(atual || ''), u.senha_hash)) throw new Error('Senha atual incorreta.');
  if (String(nova || '').length < MIN_PASSWORD) throw new Error(`A nova senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  db.run('UPDATE users SET senha_hash = ? WHERE id = ?', hashPassword(nova), u.id);
  db.run('DELETE FROM user_sessions WHERE user_id = ?', u.id);
}

function deleteOwnAccount(u, body) {
  if (u.senha_hash) {
    if (!verifyPassword(String(body.senha || ''), u.senha_hash)) throw new Error('Senha incorreta.');
  } else if (String(body.confirmacao || '').trim().toUpperCase() !== 'EXCLUIR') {
    throw new Error('Digite EXCLUIR para confirmar.');
  }
  logAction(u, 'conta_excluida_pelo_usuario', null);
  db.run('DELETE FROM users WHERE id = ?', u.id); // loja, anúncios e sessões saem junto (ON DELETE CASCADE)
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
    case 'permitir_postagens':
      db.run('UPDATE users SET pode_postar = 1 WHERE id = ?', id);
      logAction(u, 'postagens_permitidas');
      break;
    case 'remover_postagens':
      db.run('UPDATE users SET pode_postar = 0 WHERE id = ?', id);
      logAction(u, 'postagens_removidas', motivo);
      break;
    case 'excluir_publicacoes': {
      const n = db.run('DELETE FROM offers WHERE loja_id IN (SELECT id FROM lojas WHERE user_id = ?)', id).changes;
      logAction(u, 'publicacoes_excluidas', `${n} produto(s)${motivo ? ` — ${motivo}` : ''}`);
      break;
    }
    case 'excluir':
      if (bloquearEmail) {
        // Bloqueia e-mail, CPF e CNPJ para a pessoa não voltar com outro e-mail.
        for (const key of [u.email, u.cpf && `cpf:${u.cpf}`, u.cnpj && `cnpj:${u.cnpj}`].filter(Boolean)) {
          db.run('INSERT OR REPLACE INTO blocked_emails (email, motivo) VALUES (?, ?)', key, motivo || null);
        }
      }
      logAction(u, 'perfil_excluido', `${motivo || ''}${bloquearEmail ? ' (e-mail e documentos bloqueados)' : ''}`.trim());
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
  if (q) {
    const doc = cadastro.digits(q);
    where.push('(u.nome LIKE ? OR u.email LIKE ? OR u.empresa_nome LIKE ? OR u.razao_social LIKE ? OR l.nome LIKE ?'
      + (doc.length >= 5 ? ' OR u.cpf LIKE ? OR u.cnpj LIKE ?' : '') + ')');
    params.push(...Array(5).fill(`%${q}%`), ...(doc.length >= 5 ? [`%${doc}%`, `%${doc}%`] : []));
  }
  if (TIPOS.includes(tipo)) { where.push('u.tipo = ?'); params.push(tipo); }
  if (status) { where.push('u.status = ?'); params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM users u LEFT JOIN lojas l ON l.user_id = u.id';
  const total = db.get(`SELECT COUNT(*) AS n ${from} ${whereSql}`, ...params).n;
  const rows = db.all(
    `SELECT u.id, u.tipo, u.nome, u.email, u.empresa_nome, u.cnpj, u.status, u.status_motivo, u.suspenso_ate,
            u.bloqueio_publicacao, u.pode_postar, u.created_at, u.last_login_at,
            l.id AS loja_id, l.nome AS loja_nome, l.slug AS loja_slug, l.oculta AS loja_oculta,
            (SELECT COUNT(*) FROM offers o WHERE o.loja_id = l.id) AS produtos
     ${from} ${whereSql}
     ORDER BY CASE u.status WHEN 'pending' THEN 0 WHEN 'onboarding' THEN 2 ELSE 1 END, u.created_at DESC
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
  requireUser, requireActive, loginWithGoogle, completeProfile, publicUser, updateProfile, changePassword, deleteOwnAccount, moderate, listForAdmin, detailForAdmin,
  getById, logAction,
};
