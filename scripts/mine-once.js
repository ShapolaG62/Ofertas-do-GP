// Executa uma mineração completa uma única vez (sem subir o site). Uso: npm run mine
// Opcional: npm run mine -- "air fryer"   (busca só esse termo)
const miner = require('../src/miner');

miner.runMining({ query: process.argv[2] }).then(result => {
  for (const r of result.results || []) console.log(`${r.store.padEnd(14)} ${String(r.status).padEnd(10)} ${r.saved} gravadas`);
  process.exit(0);
});
