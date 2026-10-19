// Registros de acesso (Marco Civil da Internet, art. 15): data, hora e IP de quem usa o site, guardados por 6 meses.
// Para não encher o banco, grava um registro por pessoa (ou visitante) e IP a cada 30 minutos de uso,
// e um registro a cada entrada na conta. Depois de 6 meses (e alguns dias de folga) o registro é apagado sozinho.
const db = require('./db');

db.db.exec(`
  CREATE TABLE IF NOT EXISTS registros_acesso (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dono TEXT,                 -- 'u:<id>' | 'c:<id>' | 'admin' | null (visitante)
    ip TEXT NOT NULL,
    evento TEXT NOT NULL DEFAULT 'acesso', -- 'acesso' | 'login' | 'logout'
    rota TEXT,
    navegador TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_registros_acesso_data ON registros_acesso (created_at);
  CREATE INDEX IF NOT EXISTS idx_registros_acesso_dono ON registros_acesso (dono, created_at);
`);

const JANELA_MS = 30 * 60 * 1000;
const GUARDAR = '-190 days'; // 6 meses exigidos + folga
const ultimos = new Map(); // "dono|ip" → quando gravou

const ipDe = req => String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 64);

function gravar(req, dono, evento = 'acesso') {
  const ip = ipDe(req);
  if (!ip) return;
  try {
    db.run('INSERT INTO registros_acesso (dono, ip, evento, rota, navegador) VALUES (?, ?, ?, ?, ?)',
      dono || null, ip, evento, String(req.path || '').slice(0, 120), String(req.headers['user-agent'] || '').slice(0, 200));
  } catch (err) { console.error('[ACESSO]', err.message); }
}

// Middleware: um registro por pessoa e IP a cada 30 minutos (páginas e chamadas da API; arquivos estáticos não contam)
function middleware(req, res, next) {
  if (req.method === 'GET' && /\.(js|css|png|jpe?g|webp|gif|svg|ico|mp4|woff2?|json|txt|map)$/i.test(req.path)) return next();
  let dono = null;
  try { dono = require('./perfis').donoDe(req); } catch { /* visitante */ }
  const chave = `${dono || '-'}|${ipDe(req)}`;
  const agora = Date.now();
  if (!ultimos.has(chave) || agora - ultimos.get(chave) > JANELA_MS) {
    ultimos.set(chave, agora);
    gravar(req, dono, 'acesso');
    if (ultimos.size > 50000) ultimos.clear();
  }
  next();
}

function limpar() {
  try { db.run(`DELETE FROM registros_acesso WHERE created_at < datetime('now', ?)`, GUARDAR); } catch { /* tenta amanhã */ }
}

// Para o administrador entregar quando houver ordem judicial (art. 22 do Marco Civil)
function consultar({ dono = '', ip = '', de = '', ate = '' } = {}, limite = 500) {
  const where = [], p = [];
  if (dono) { where.push('dono = ?'); p.push(dono); }
  if (ip) { where.push('ip = ?'); p.push(ip); }
  if (de) { where.push('created_at >= ?'); p.push(de); }
  if (ate) { where.push('created_at <= ?'); p.push(ate); }
  return db.all(`SELECT * FROM registros_acesso ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`, ...p, limite);
}

module.exports = { middleware, gravar, limpar, consultar };
