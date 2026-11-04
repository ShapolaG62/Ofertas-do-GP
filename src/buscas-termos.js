// O que as pessoas buscam no site (só o termo, sem identificar ninguém): mostra no Painel o que mais procuram e o que
// procuram e não acham, para decidir o que minerar. Junta em memória e grava a cada minuto (a busca não escreve no banco).
const db = require('./db');

db.db.exec(`CREATE TABLE IF NOT EXISTS buscas_termos (
  termo TEXT PRIMARY KEY,
  vezes INTEGER NOT NULL DEFAULT 0,
  sem_resultado INTEGER NOT NULL DEFAULT 0,
  resultados INTEGER NOT NULL DEFAULT 0,
  ultima TEXT NOT NULL DEFAULT (datetime('now'))
)`);

let pendentes = new Map();
let timer = null;

function gravar() {
  timer = null;
  const lote = pendentes;
  pendentes = new Map();
  try {
    db.transaction(() => {
      for (const [termo, p] of lote) {
        db.run(`INSERT INTO buscas_termos (termo, vezes, sem_resultado, resultados) VALUES (?, ?, ?, ?)
                ON CONFLICT(termo) DO UPDATE SET vezes = vezes + excluded.vezes, sem_resultado = sem_resultado + excluded.sem_resultado,
                  resultados = excluded.resultados, ultima = datetime('now')`, termo, p.vezes, p.sem, p.resultados);
      }
    });
  } catch (e) { console.error('[BUSCAS]', e.message); }
}

// total: resultados exatos (0 quando a busca só achou "parecidos")
function registrar(q, total) {
  const termo = String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (termo.length < 3 || termo.startsWith('#') || /^https?:/.test(termo)) return;
  const p = pendentes.get(termo) || { vezes: 0, sem: 0, resultados: 0 };
  p.vezes++;
  if (!total) p.sem++;
  p.resultados = total;
  pendentes.set(termo, p);
  if (pendentes.size > 2000) gravar();
  else if (!timer) { timer = setTimeout(gravar, 60 * 1000); timer.unref?.(); }
}

function resumo() {
  db.run(`DELETE FROM buscas_termos WHERE ultima < datetime('now', '-90 days')`);
  return {
    mais: db.all('SELECT termo, vezes, resultados FROM buscas_termos ORDER BY vezes DESC LIMIT 30'),
    sem: db.all('SELECT termo, vezes, ultima FROM buscas_termos WHERE sem_resultado > 0 AND resultados < 5 ORDER BY sem_resultado DESC LIMIT 30'),
  };
}

module.exports = { registrar, resumo };
