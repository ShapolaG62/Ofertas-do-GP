// Erros do servidor: agrupados por mensagem e rota, para o Painel avisar quando algo quebra (compra, login, postagem...)
// sem depender de alguém reclamar. Não guarda dados de quem acessou nem o corpo do pedido.
const db = require('./db');

db.db.exec(`CREATE TABLE IF NOT EXISTS erros_site (
  chave TEXT PRIMARY KEY,
  mensagem TEXT NOT NULL,
  rota TEXT,
  vezes INTEGER NOT NULL DEFAULT 0,
  primeira TEXT NOT NULL DEFAULT (datetime('now')),
  ultima TEXT NOT NULL DEFAULT (datetime('now'))
)`);

function registrar(err, rota = '') {
  try {
    // Números e códigos mudam a cada erro: fora da chave, para juntar os iguais
    const mensagem = String(err?.message || err || 'erro desconhecido').replace(/\s+/g, ' ').slice(0, 300);
    const local = String(rota).replace(/\d{2,}/g, '#').slice(0, 120);
    const chave = `${local}|${mensagem.replace(/\d+/g, '#')}`.slice(0, 300);
    db.run(`INSERT INTO erros_site (chave, mensagem, rota, vezes) VALUES (?, ?, ?, 1)
            ON CONFLICT(chave) DO UPDATE SET vezes = vezes + 1, mensagem = excluded.mensagem, ultima = datetime('now')`, chave, mensagem, local);
  } catch { /* registrar erro nunca pode causar outro erro */ }
}

function recentes(horas = 24) {
  db.run(`DELETE FROM erros_site WHERE ultima < datetime('now', '-30 days')`);
  return db.all(`SELECT mensagem, rota, vezes, ultima FROM erros_site WHERE ultima >= datetime('now', ?) ORDER BY ultima DESC LIMIT 30`, `-${horas} hours`);
}

function limpar() { db.run('DELETE FROM erros_site'); }

module.exports = { registrar, recentes, limpar };
