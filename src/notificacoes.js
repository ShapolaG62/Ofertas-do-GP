// Central de notificações do site (o sino 🔔 no topo): pedido pago, saque pago ou recusado, etc.
// Cada pessoa é identificada como nos perfis: 'u:<id>', 'c:<id>' ou 'admin'.
const db = require('./db');

db.db.exec(`
  CREATE TABLE IF NOT EXISTS notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dono TEXT NOT NULL,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    texto TEXT,
    link TEXT,
    lida INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_notificacoes_dono ON notificacoes(dono, id);
`);

function criar(dono, { tipo, titulo, texto = null, link = null }) {
  if (!dono) return;
  db.run('INSERT INTO notificacoes (dono, tipo, titulo, texto, link) VALUES (?, ?, ?, ?, ?)', dono, tipo, String(titulo).slice(0, 160), texto ? String(texto).slice(0, 600) : null, link);
}

const listar = dono => db.all('SELECT id, tipo, titulo, texto, link, lida, created_at FROM notificacoes WHERE dono = ? ORDER BY id DESC LIMIT 40', dono)
  .map(n => ({ ...n, lida: Boolean(n.lida) }));
const naoLidas = dono => (dono ? db.get('SELECT COUNT(*) n FROM notificacoes WHERE dono = ? AND lida = 0', dono).n : 0);
function marcarLidas(dono, id = null) {
  if (id) db.run('UPDATE notificacoes SET lida = 1 WHERE dono = ? AND id = ?', dono, Number(id));
  else db.run('UPDATE notificacoes SET lida = 1 WHERE dono = ? AND lida = 0', dono);
}

module.exports = { criar, listar, naoLidas, marcarLidas };
