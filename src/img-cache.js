// Cópia local das fotos das ofertas (proxy /img/o/:id.jpg e /api/img/:id). Sem isto, cada foto de cada visita era
// baixada de novo da loja pelo servidor. A foto fica em data/cache-img por até 3 dias; acima de 600 MB, as mais
// antigas saem primeiro. Pedidos iguais ao mesmo tempo esperam um único download.
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('./db');

const PASTA = path.join(path.dirname(DB_PATH), 'cache-img');
const VALIDADE_MS = 3 * 24 * 3600 * 1000;
const LIMITE_BYTES = 600 * 1024 * 1024;
const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };
const DE_EXT = Object.fromEntries(Object.entries(TIPOS).map(([t, e]) => [e, t]));
fs.mkdirSync(PASTA, { recursive: true });

const baixando = new Map(); // id → Promise

function guardada(id) {
  for (const ext of Object.values(TIPOS)) {
    const arq = path.join(PASTA, `${id}.${ext}`);
    try {
      const st = fs.statSync(arq);
      if (Date.now() - st.mtimeMs < VALIDADE_MS) return { arquivo: arq, tipo: DE_EXT[ext] };
    } catch { /* não tem */ }
  }
  return null;
}

// baixar: async () => ({ tipo, dados: Buffer })
async function obter(id, baixar) {
  const ja = guardada(id);
  if (ja) return { tipo: ja.tipo, dados: await fs.promises.readFile(ja.arquivo) };
  if (baixando.has(id)) return baixando.get(id);
  const p = (async () => {
    const { tipo, dados } = await baixar();
    const ext = TIPOS[tipo.split(';')[0].trim()];
    if (ext) fs.promises.writeFile(path.join(PASTA, `${id}.${ext}`), dados).catch(() => {});
    return { tipo, dados };
  })().finally(() => baixando.delete(id));
  baixando.set(id, p);
  return p;
}

// Limpeza (chamada de hora em hora pelo servidor): apaga as vencidas e, se passar do limite, as mais antigas
async function limpar() {
  let arquivos;
  try { arquivos = await fs.promises.readdir(PASTA); } catch { return; }
  const lista = [];
  for (const nome of arquivos) {
    const arq = path.join(PASTA, nome);
    try {
      const st = await fs.promises.stat(arq);
      if (Date.now() - st.mtimeMs > VALIDADE_MS) await fs.promises.unlink(arq);
      else lista.push({ arq, t: st.mtimeMs, n: st.size });
    } catch { /* sumiu */ }
  }
  let total = lista.reduce((s, x) => s + x.n, 0);
  for (const x of lista.sort((a, b) => a.t - b.t)) {
    if (total <= LIMITE_BYTES) break;
    try { await fs.promises.unlink(x.arq); total -= x.n; } catch { /* em uso */ }
  }
}

module.exports = { obter, limpar, PASTA };
