// Links curtos para as postagens nas redes. Com o site público (https), usa o próprio link curto do site (/o/<id>,
// que conta o clique e manda para a loja). Sem isso, encurta o link de afiliado no is.gd (TinyURL de reserva)
// e guarda o resultado, para não pedir de novo o mesmo link.
const axios = require('axios');
const db = require('./db');

db.db.exec(`CREATE TABLE IF NOT EXISTS links_curtos (url TEXT PRIMARY KEY, curto TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);

const SERVICOS = [
  url => `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
  url => `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
];
const emAndamento = new Map();

async function curto(url) {
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url) || url.length <= 32) return url;
  const salvo = db.get('SELECT curto FROM links_curtos WHERE url = ?', url);
  if (salvo) return salvo.curto;
  if (emAndamento.has(url)) return emAndamento.get(url);
  const p = (async () => {
    for (const servico of SERVICOS) {
      try {
        const r = await axios.get(servico(url), { timeout: 6000, responseType: 'text', validateStatus: () => true });
        const c = String(r.data || '').trim();
        if (r.status === 200 && /^https:\/\/\S{5,40}$/.test(c)) {
          db.run('INSERT OR REPLACE INTO links_curtos (url, curto) VALUES (?, ?)', url, c);
          return c;
        }
      } catch { /* tenta o próximo */ }
    }
    return url; // sem internet ou serviços fora: vai o link inteiro
  })();
  emAndamento.set(url, p);
  try { return await p; } finally { emAndamento.delete(url); }
}

// Vários de uma vez (poucos em paralelo, para não abusar dos serviços)
async function curtos(urls, paralelo = 6) {
  const out = new Array(urls.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(paralelo, urls.length) }, async () => {
    while (i < urls.length) { const k = i++; out[k] = await curto(urls[k]); }
  }));
  return out;
}

module.exports = { curto, curtos };
