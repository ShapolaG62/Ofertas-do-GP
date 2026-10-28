// Mede cada fala (sem o silêncio do começo e do fim) e grava video/<pasta>/tempos.json, usado pelo vídeo.
// Uso: node video/medir-falas.js [pasta]   (padrão: narracao; o tutorial usa narracao-tutorial)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, process.argv[2] || 'narracao');
const out = [];
for (const f of fs.readdirSync(dir).filter(x => /^fala\d+\.wav$/.test(x)).sort()) {
  const b = fs.readFileSync(path.join(dir, f));
  const sr = b.readUInt32LE(24), canais = b.readUInt16LE(22), bits = b.readUInt16LE(34);
  let o = 12, ini = 0, tam = 0;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'data') { ini = o + 8; tam = sz; break; } o += 8 + sz; }
  const n = tam / (bits / 8) / canais, lim = 600;
  let a = 0, z = n - 1;
  while (a < n && Math.abs(b.readInt16LE(ini + a * 2 * canais)) < lim) a++;
  while (z > a && Math.abs(b.readInt16LE(ini + z * 2 * canais)) < lim) z--;
  out.push({ arquivo: f, total: +(n / sr).toFixed(3), voz_ini: +(a / sr).toFixed(3), voz_fim: +(z / sr).toFixed(3), voz: +((z - a) / sr).toFixed(2) });
}
fs.writeFileSync(path.join(dir, 'tempos.json'), JSON.stringify(out, null, 1));
console.log(out.map(x => `${x.arquivo} voz ${x.voz}s`).join('\n'), '\ntotal de fala:', out.reduce((s, x) => s + x.voz, 0).toFixed(1) + 's');
