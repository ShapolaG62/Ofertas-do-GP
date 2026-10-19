// Foto da empresa: a foto do perfil e o logo da loja são sempre a mesma imagem.
// Trocar a foto do perfil troca o logo da loja, e trocar o logo da loja troca a foto do perfil.
// Quando as duas estão diferentes (contas antigas), vale o logo da loja; sem logo, a loja passa a usar a foto do perfil.
const db = require('./db');

const IMAGEM = /^(https:\/\/\S+|\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)|\/uploads\/perfis\/[\w.-]+\.webp)$/i;
const valida = url => (IMAGEM.test(String(url || '')) ? String(url) : null);

// Perfil → loja (dono 'u:<id>' de uma empresa com loja)
function doPerfil(dono, url) {
  const m = /^u:(\d+)$/.exec(String(dono || ''));
  if (!m) return;
  db.run('UPDATE lojas SET logo_url = ? WHERE user_id = ?', valida(url), Number(m[1]));
}

// Loja → perfil
function daLoja(userId, url) {
  db.run(`UPDATE perfis SET avatar = ?, updated_at = datetime('now') WHERE dono = ?`, valida(url), `u:${Number(userId)}`);
}

// Logo atual da loja da conta (usado ao criar o perfil)
const logoDaConta = userId => valida(db.get('SELECT logo_url FROM lojas WHERE user_id = ?', Number(userId))?.logo_url);

// Deixa iguais as que estão diferentes
function alinharTudo() {
  const linhas = db.all(`SELECT l.user_id, l.logo_url, p.avatar FROM lojas l JOIN perfis p ON p.dono = 'u:' || l.user_id
                         WHERE COALESCE(l.logo_url, '') <> COALESCE(p.avatar, '')`);
  for (const r of linhas) {
    if (valida(r.logo_url)) daLoja(r.user_id, r.logo_url);
    else if (valida(r.avatar)) doPerfil(`u:${r.user_id}`, r.avatar);
  }
  return linhas.length;
}

module.exports = { doPerfil, daLoja, logoDaConta, alinharTudo, valida, IMAGEM };
