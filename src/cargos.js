// Cargos da equipe (staff) e o que cada um pode fazer na Área de trabalho (/trabalho).
// Hierarquia: Proprietário > Gerente > Admin > Moderador > Suporte. O dono do site (login "admin") é sempre Proprietário,
// com acesso total; a equipe nunca entra no painel administrativo, só na Área de trabalho.
// O Proprietário define, uma a uma, as funções de cada cargo (Área de trabalho → Equipe → Cargos e permissões).
// As funções viram as marcações pode_sac / pode_moderar / pode_punir / pode_postar / pode_equipe de cada pessoa,
// usadas pelas outras partes do site (SAC, Moderação, Postagens).
const db = require('./db');

const CARGOS = [
  { id: 'proprietario', nome: 'Proprietário', nivel: 5 },
  { id: 'gerente', nome: 'Gerente', nivel: 4 },
  { id: 'admin', nome: 'Admin', nivel: 3 },
  { id: 'moderador', nome: 'Moderador', nivel: 2 },
  { id: 'suporte', nome: 'Suporte', nivel: 1 },
];
const PERMISSOES = [
  { id: 'sac', nome: 'SAC', desc: 'Atender os chamados do Suporte (fila de atendimento)' },
  { id: 'moderar', nome: 'Moderação do chat', desc: 'Ver as conversas com xingamentos, advertir e bloquear as mensagens' },
  { id: 'punir', nome: 'Suspender e banir', desc: 'Suspender e banir contas na Moderação do chat' },
  { id: 'postar', nome: 'Postar anúncios', desc: 'Escolher ofertas e postar nos grupos e redes' },
  { id: 'equipe', nome: 'Gerenciar a equipe', desc: 'Cadastrar pessoas e mudar cargos abaixo do seu' },
];
const PADRAO = {
  gerente: ['sac', 'moderar', 'punir', 'postar', 'equipe'],
  admin: ['sac', 'moderar', 'punir', 'postar'],
  moderador: ['moderar'],
  suporte: ['sac'],
};
const COLUNA = { sac: 'pode_sac', moderar: 'pode_moderar', punir: 'pode_punir', postar: 'pode_postar', equipe: 'pode_equipe' };

db.db.exec(`CREATE TABLE IF NOT EXISTS cargo_permissoes (cargo TEXT NOT NULL, permissao TEXT NOT NULL, PRIMARY KEY (cargo, permissao))`);
for (const col of ['cargo TEXT', 'pode_punir INTEGER NOT NULL DEFAULT 0', 'pode_equipe INTEGER NOT NULL DEFAULT 0', 'pode_moderar INTEGER NOT NULL DEFAULT 0', 'pode_sac INTEGER NOT NULL DEFAULT 0']) {
  try { db.db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* já existe */ }
}
// Primeira vez: grava o padrão
if (!db.get('SELECT 1 FROM cargo_permissoes LIMIT 1')) {
  for (const [c, ps] of Object.entries(PADRAO)) for (const p of ps) db.run('INSERT OR IGNORE INTO cargo_permissoes (cargo, permissao) VALUES (?, ?)', c, p);
}

const cargo = id => CARGOS.find(c => c.id === id) || null;
const nivelCargo = id => cargo(id)?.nivel || 0;

function permissoesDe(cargoId) {
  if (cargoId === 'proprietario') return PERMISSOES.map(p => p.id); // acesso total
  return db.all('SELECT permissao FROM cargo_permissoes WHERE cargo = ?', cargoId).map(r => r.permissao).filter(p => COLUNA[p]);
}

// Tabela cargo × função para a tela "Cargos e permissões"
function matriz() {
  return {
    cargos: CARGOS.map(c => ({ ...c, fixo: c.id === 'proprietario', permissoes: permissoesDe(c.id) })),
    permissoes: PERMISSOES,
  };
}

// Só o Proprietário (dono do site) muda: { gerente: ['sac', …], admin: [...], ... }
function salvarMatriz(m) {
  db.transaction(() => {
    for (const c of CARGOS) {
      if (c.id === 'proprietario' || !Array.isArray(m?.[c.id])) continue;
      db.run('DELETE FROM cargo_permissoes WHERE cargo = ?', c.id);
      for (const p of m[c.id]) if (COLUNA[p]) db.run('INSERT OR IGNORE INTO cargo_permissoes (cargo, permissao) VALUES (?, ?)', c.id, p);
    }
  });
  sincronizarTodos();
  return matriz();
}

// Atualiza as marcações da pessoa conforme o cargo (quem não é da equipe perde as funções da equipe)
function sincronizar(userId) {
  const u = db.get('SELECT id, staff, cargo FROM users WHERE id = ?', Number(userId));
  if (!u) return;
  const ps = u.staff && cargo(u.cargo) ? permissoesDe(u.cargo) : [];
  const sets = Object.entries(COLUNA).map(([p, col]) => `${col} = ${ps.includes(p) ? 1 : 0}`);
  db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, u.id);
}
function sincronizarTodos() {
  for (const u of db.all('SELECT id FROM users WHERE staff = 1')) sincronizar(u.id);
}

// Equipe antiga (sem cargo): ganha o cargo que mais se parece com as funções que tinha
for (const u of db.all('SELECT id, pode_sac, pode_moderar, pode_postar FROM users WHERE staff = 1 AND (cargo IS NULL OR cargo = \'\')')) {
  const c = u.pode_moderar && u.pode_sac && u.pode_postar ? 'admin' : u.pode_moderar ? 'moderador' : 'suporte';
  db.run('UPDATE users SET cargo = ? WHERE id = ?', c, u.id);
}
sincronizarTodos();

// Quem é a pessoa (dono 'admin' ou 'u:<id>') na hierarquia e o que pode fazer
function de(dono) {
  if (dono === 'admin') return { dono, cargo: 'proprietario', cargo_nome: 'Proprietário', nivel: 5, dono_site: true, permissoes: PERMISSOES.map(p => p.id) };
  const m = /^u:(\d+)$/.exec(dono || '');
  const u = m ? db.get(`SELECT id, cargo, staff, status FROM users WHERE id = ?`, Number(m[1])) : null;
  if (!u || !u.staff || u.status !== 'active' || !cargo(u.cargo)) return { dono, cargo: null, nivel: 0, dono_site: false, permissoes: [] };
  return { dono, cargo: u.cargo, cargo_nome: cargo(u.cargo).nome, nivel: nivelCargo(u.cargo), dono_site: false, permissoes: permissoesDe(u.cargo) };
}
const pode = (dono, permissao) => de(dono).permissoes.includes(permissao);

module.exports = { CARGOS, PERMISSOES, cargo, nivelCargo, permissoesDe, matriz, salvarMatriz, sincronizar, sincronizarTodos, de, pode };
