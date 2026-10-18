// Equipe (staff): contas do site que trabalham para o Ofertou!, cadastradas pelo administrador.
// Cada pessoa pode ter as funções "Atender o SAC" (pode_sac) e/ou "Postar anúncios" (pode_postar).
// Entram em /conta com e-mail e senha e veem a aba "Área da equipe" (Fila do SAC e Postagens).
const db = require('./db');
const { hashPassword } = require('./auth');
const users = require('./users');

try { db.db.exec('ALTER TABLE users ADD COLUMN staff INTEGER NOT NULL DEFAULT 0'); } catch { /* já existe */ }
try { db.db.exec('ALTER TABLE users ADD COLUMN pode_sac INTEGER NOT NULL DEFAULT 0'); } catch { /* já existe */ }

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const sim = v => v === true || v === 'on' || v === '1' || v === 1;

function montar(u) {
  return {
    id: u.id, nome: u.nome, email: u.email, status: u.status, tipo: u.tipo,
    staff: Boolean(u.staff), sac: Boolean(u.pode_sac), postar: Boolean(u.pode_postar),
    google: Boolean(u.google_id), created_at: u.created_at, last_login_at: u.last_login_at,
  };
}

function listar() {
  return db.all(`SELECT * FROM users WHERE staff = 1 OR pode_sac = 1 OR pode_postar = 1 ORDER BY staff DESC, nome COLLATE NOCASE`).map(montar);
}

// Cadastra uma pessoa nova na equipe, ou coloca na equipe uma conta que já existe (pelo e-mail)
function adicionar(b) {
  const email = String(b.email || '').trim().toLowerCase();
  const nome = String(b.nome || '').trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) throw fail('Informe um e-mail válido.');
  const sac = sim(b.sac), postar = sim(b.postar);
  if (!sac && !postar) throw fail('Escolha pelo menos uma função: atender o SAC ou postar anúncios.');
  const existe = db.get('SELECT * FROM users WHERE email = ?', email);
  let id;
  if (existe) {
    if (['banned', 'rejected'].includes(existe.status)) throw fail('Esta conta está banida ou recusada. Reative a conta em Usuários antes.');
    db.run(`UPDATE users SET staff = 1, pode_sac = ?, pode_postar = ?, nome = COALESCE(NULLIF(nome, ''), ?) WHERE id = ?`, sac ? 1 : 0, postar ? 1 : 0, nome || null, existe.id);
    if (b.senha) definirSenha(existe.id, b.senha, false);
    id = existe.id;
  } else {
    if (!nome) throw fail('Informe o nome da pessoa.');
    const senha = String(b.senha || '');
    require('./senha').validar(senha, { email, nome }); // padrão de senha forte
    id = Number(db.run(`INSERT INTO users (email, nome, senha_hash, tipo, status, staff, pode_sac, pode_postar) VALUES (?, ?, ?, 'consumidor', 'active', 1, ?, ?)`,
      email, nome, hashPassword(senha), sac ? 1 : 0, postar ? 1 : 0).lastInsertRowid);
  }
  users.logAction(users.getById(id), 'equipe_adicionado', funcoes(sac, postar));
  return montar(users.getById(id));
}

const funcoes = (sac, postar) => [sac && 'atender o SAC', postar && 'postar anúncios'].filter(Boolean).join(' e ') || 'sem funções';

function atualizar(id, b) {
  const u = users.getById(Number(id));
  if (!u) throw fail('Pessoa não encontrada.', 404);
  const sac = 'sac' in b ? sim(b.sac) : Boolean(u.pode_sac);
  const postar = 'postar' in b ? sim(b.postar) : Boolean(u.pode_postar);
  db.run('UPDATE users SET staff = 1, pode_sac = ?, pode_postar = ? WHERE id = ?', sac ? 1 : 0, postar ? 1 : 0, u.id);
  users.logAction(users.getById(u.id), 'equipe_funcoes', funcoes(sac, postar));
  return montar(users.getById(u.id));
}

function definirSenha(id, senha, registrar = true) {
  senha = String(senha || '');
  const u = users.getById(Number(id));
  if (!u) throw fail('Pessoa não encontrada.', 404);
  require('./senha').validar(senha, { email: u.email, nome: u.nome }); // padrão de senha forte
  db.run('UPDATE users SET senha_hash = ? WHERE id = ?', hashPassword(senha), u.id);
  db.run('DELETE FROM user_sessions WHERE user_id = ?', u.id); // sai de todos os aparelhos
  if (registrar) users.logAction(u, 'equipe_senha', 'senha redefinida pelo administrador');
  return montar(users.getById(u.id));
}

// Tira da equipe (a conta continua existindo como conta comum do site)
function remover(id) {
  const u = users.getById(Number(id));
  if (!u) throw fail('Pessoa não encontrada.', 404);
  db.run('UPDATE users SET staff = 0, pode_sac = 0, pode_postar = 0 WHERE id = ?', u.id);
  users.logAction(u, 'equipe_removido');
  return true;
}

module.exports = { listar, adicionar, atualizar, definirSenha, remover };
