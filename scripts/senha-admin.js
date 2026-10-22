// Diagnóstico do login do painel e troca da senha do /admin direto no servidor (via SSH).
// Uso, na pasta do site:  node scripts/senha-admin.js          → mostra o diagnóstico e pede a senha nova
//                         node scripts/senha-admin.js --ver    → só mostra o diagnóstico
// A senha é digitada sem aparecer na tela e guardada só como hash (scrypt). Todas as sessões do painel caem.
const readline = require('readline');
const db = require('../src/db');
const auth = require('../src/auth');
const settings = require('../src/settings');

const conta = sql => { try { return db.get(sql).n; } catch { return '?'; } };
console.log('\n=== Ofertou! — login do painel ===');
console.log('Banco em uso ........:', db.DB_PATH);
console.log('Senha do painel .....:', settings.get('admin_password_hash') ? 'existe' : 'NÃO EXISTE (banco novo/vazio?)');
console.log('Contas de usuários ..:', conta('SELECT COUNT(*) n FROM users'));
console.log('Ofertas .............:', conta('SELECT COUNT(*) n FROM offers'));
console.log('Sessões do painel ...:', conta(`SELECT COUNT(*) n FROM sessions WHERE expires_at > datetime('now')`));
if (conta('SELECT COUNT(*) n FROM users') === 0) {
  console.log('\n⚠ Este banco não tem nenhuma conta: o site provavelmente NÃO está usando o banco que veio do computador.');
  console.log('  Confira se o arquivo data/ofertas.db está dentro da pasta onde o PM2 roda o site (pm2 describe ofertas-do-gp → "exec cwd").');
}
if (process.argv.includes('--ver')) process.exit(0);

// Pergunta sem mostrar o que é digitado (uma leitura só para as duas perguntas)
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let mudo = false;
rl._writeToOutput = s => {
  if (!mudo) rl.output.write(s);
  else if (/[\r\n]/.test(s)) rl.output.write('\n');
};
const linhas = [], esperando = [];
rl.on('line', l => { const f = esperando.shift(); if (f) f(l); else linhas.push(l); });
function perguntar(texto) {
  mudo = false; rl.output.write(texto); mudo = true;
  return new Promise(ok => { if (linhas.length) ok(linhas.shift()); else esperando.push(ok); });
}

(async () => {
  console.log('\nDefina a nova senha do painel (mín. 8 caracteres, com maiúscula, minúscula, número e símbolo).');
  const s1 = await perguntar('Nova senha: ');
  const s2 = await perguntar('Repita a senha: ');
  mudo = false; rl.close();
  if (s1 !== s2) { console.log('\nAs senhas não conferem. Nada foi alterado.'); process.exit(1); }
  try {
    auth.setPassword(s1);
    console.log('\n✔ Senha do painel trocada. Reinicie o site (pm2 restart ofertas-do-gp) e entre em /admin');
    console.log('  ou em /conta digitando "admin" no campo de e-mail.');
  } catch (err) { console.log(`\n✖ ${err.message} Nada foi alterado.`); process.exit(1); }
})();
