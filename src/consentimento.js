// Aceites do cadastro (LGPD — Lei nº 13.709/2018): o novo usuário marca, em duas caixas separadas e nunca
// pré-marcadas, (1) que leu a Política de Privacidade e está ciente do tratamento dos seus dados e (2) que leu os
// Termos de Uso, entende a finalidade do site e os limites de responsabilidade do Ofertou!.
// Cada aceite fica registrado com a versão dos documentos, data/hora, IP e navegador, como prova do consentimento
// (o ônus da prova é de quem trata os dados — art. 8º, § 2º, da LGPD).
const db = require('./db');

// Mude a versão sempre que os Termos ou a Política mudarem de forma relevante (aparece na página /privacidade).
const VERSAO = '2026-10-20';

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
// Termos do Parceiro (item 6-A): lojista e afiliado aceitam numa caixa a mais ('lojista', 'afiliado' ou 'lojista,afiliado')
try { db.db.exec('ALTER TABLE consentimentos ADD COLUMN parceiro TEXT'); } catch { /* já existe */ }
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

// Lojista parceiro e afiliado: caixa obrigatória com responsabilidade exclusiva, direito de regresso e (afiliado)
// proibição de revender ou compartilhar o acesso. papeis: ['lojista'] | ['afiliado'] | os dois.
const TEXTO_PAPEL = {
  lojista: 'Para continuar, aceite os Termos do Lojista Parceiro (responsabilidade pelos prazos e pelos direitos do consumidor e direito de regresso do Ofertou!).',
  afiliado: 'Para continuar, aceite os Termos do Afiliado (responsabilidade pelo que você divulga, direito de regresso do Ofertou! e proibição de revender ou compartilhar o acesso).',
};
function validarParceiro(b, papeis = []) {
  for (const p of papeis) if (!marcado(b[`aceite_${p}`])) throw fail(TEXTO_PAPEL[p]);
}

function registrar({ dono = null, email = null, origem, req, papeis = [] }) {
  const ip = req ? String(req.ip || req.socket?.remoteAddress || '').slice(0, 64) : null;
  const navegador = req ? String(req.get?.('user-agent') || '').slice(0, 300) : null;
  db.run('INSERT INTO consentimentos (dono, email, origem, versao, termos, privacidade, parceiro, ip, navegador) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)',
    dono, email ? String(email).toLowerCase() : null, origem, VERSAO, papeis.length ? papeis.join(',') : null, ip, navegador);
  const m = /^u:(\d+)$/.exec(dono || '');
  if (m) db.run(`UPDATE users SET aceite_privacidade_em = datetime('now'), aceite_versao = ? WHERE id = ?`, VERSAO, Number(m[1]));
}

// Histórico de aceites de uma conta (ficha do usuário no painel)
function historico(userId, email) {
  return db.all('SELECT origem, versao, parceiro, ip, navegador, created_at FROM consentimentos WHERE dono = ? OR (email IS NOT NULL AND email = ?) ORDER BY id DESC LIMIT 20',
    `u:${userId}`, String(email || '').toLowerCase());
}

// Versão dos Termos do Parceiro (item 6-A). Quem é parceiro e não aceitou esta versão ou uma mais nova (cadastrado antes,
// criado pelo painel...) aceita ao entrar: Minha conta ou painel do afiliado. Mude só quando o item 6-A mudar.
const VERSAO_PARCEIRO = '2026-10-20';
function pendentesParceiro({ dono, email, papeis }) {
  return papeis.filter(p => !db.get(`SELECT 1 FROM consentimentos WHERE (dono = ? OR (email IS NOT NULL AND email = ?)) AND versao >= ?
    AND ',' || parceiro || ',' LIKE ?`, dono, String(email || '').toLowerCase(), VERSAO_PARCEIRO, `%,${p},%`));
}
// Aceite feito depois (janela ao entrar): só as caixas que faltavam
function aceitarParceiro({ dono, email, papeis, b, req }) {
  const falta = pendentesParceiro({ dono, email, papeis });
  validarParceiro(b, falta);
  if (falta.length) {
    const ip = req ? String(req.ip || req.socket?.remoteAddress || '').slice(0, 64) : null;
    db.run(`INSERT INTO consentimentos (dono, email, origem, versao, termos, privacidade, parceiro, ip, navegador) VALUES (?, ?, 'parceiro', ?, 1, 0, ?, ?, ?)`,
      dono, email ? String(email).toLowerCase() : null, VERSAO, falta.join(','), ip, req ? String(req.get?.('user-agent') || '').slice(0, 300) : null);
  }
  return { ok: true };
}

// Papéis de parceiro de um cadastro: tipo da conta do site e/ou plano com a ferramenta de afiliado
function papeisDe({ tipo = null, ferramenta = false } = {}) {
  const p = [];
  if (tipo === 'empresa') p.push('lojista');
  if (tipo === 'afiliado' || ferramenta) p.push('afiliado');
  return p;
}

module.exports = { VERSAO, VERSAO_PARCEIRO, validar, validarParceiro, papeisDe, pendentesParceiro, aceitarParceiro, registrar, historico };
