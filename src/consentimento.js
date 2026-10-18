// Aceites do cadastro (LGPD — Lei nº 13.709/2018): o novo usuário marca, em duas caixas separadas e nunca
// pré-marcadas, (1) que leu a Política de Privacidade e está ciente do tratamento dos seus dados e (2) que leu os
// Termos de Uso, entende a finalidade do site e os limites de responsabilidade do Ofertou!.
// Cada aceite fica registrado com a versão dos documentos, data/hora, IP e navegador, como prova do consentimento
// (o ônus da prova é de quem trata os dados — art. 8º, § 2º, da LGPD).
const db = require('./db');

// Mude a versão sempre que os Termos ou a Política mudarem de forma relevante (aparece na página /privacidade).
const VERSAO = '2026-10-18';

db.db.exec(`
  CREATE TABLE IF NOT EXISTS consentimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dono TEXT,                 -- 'u:<id>' (conta do site) ou nulo quando a conta ainda vai ser criada (compra de plano)
    email TEXT,
    origem TEXT NOT NULL,      -- cadastro | assinatura
    versao TEXT NOT NULL,
    termos INTEGER NOT NULL,   -- leu e aceitou os Termos de Uso (finalidade e responsabilidades)
    privacidade INTEGER NOT NULL, -- leu a Política de Privacidade (LGPD)
    ip TEXT,
    navegador TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_consentimentos_dono ON consentimentos (dono);
  CREATE INDEX IF NOT EXISTS idx_consentimentos_email ON consentimentos (email);
`);
for (const col of ['aceite_privacidade_em TEXT', 'aceite_versao TEXT']) {
  try { db.db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* já existe */ }
}

const marcado = v => v === true || v === 'on' || v === '1' || v === 1;
const fail = msg => Object.assign(new Error(msg), { status: 400 });

// As duas caixas são obrigatórias
function validar(b) {
  if (!marcado(b.aceite_privacidade)) throw fail('Para continuar, confirme que leu a Política de Privacidade (LGPD).');
  if (!marcado(b.aceite_termos)) throw fail('Para continuar, confirme que leu os Termos de Uso e está ciente da finalidade do site e das responsabilidades.');
}

function registrar({ dono = null, email = null, origem, req }) {
  const ip = req ? String(req.ip || req.socket?.remoteAddress || '').slice(0, 64) : null;
  const navegador = req ? String(req.get?.('user-agent') || '').slice(0, 300) : null;
  db.run('INSERT INTO consentimentos (dono, email, origem, versao, termos, privacidade, ip, navegador) VALUES (?, ?, ?, ?, 1, 1, ?, ?)',
    dono, email ? String(email).toLowerCase() : null, origem, VERSAO, ip, navegador);
  const m = /^u:(\d+)$/.exec(dono || '');
  if (m) db.run(`UPDATE users SET aceite_privacidade_em = datetime('now'), aceite_versao = ? WHERE id = ?`, VERSAO, Number(m[1]));
}

// Histórico de aceites de uma conta (ficha do usuário no painel)
function historico(userId, email) {
  return db.all('SELECT origem, versao, ip, navegador, created_at FROM consentimentos WHERE dono = ? OR (email IS NOT NULL AND email = ?) ORDER BY id DESC LIMIT 20',
    `u:${userId}`, String(email || '').toLowerCase());
}

module.exports = { VERSAO, validar, registrar, historico };
