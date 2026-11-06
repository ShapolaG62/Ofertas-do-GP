// Lista de ofertas montada em partes (sem travar o servidor) e índices do painel, num banco temporário. Rode com: npm test
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'ofertou-teste-'));
process.env.DATA_DIR = PASTA;
process.env.DISABLE_MINER = '1';
process.env.DISABLE_AGENDA = '1';

const db = require('../src/db');
assert.ok(db.DB_PATH.startsWith(PASTA), 'os testes só rodam no banco temporário');
const settings = require('../src/settings');
const offers = require('../src/offers');
const busca = require('../src/busca-ofertas');
const { getStore } = require('../src/stores');

const amazon = getStore('amazon');
let n = 0;
const oferta = (produto, extra = {}) => offers.saveDeal(amazon, {
  store_product_id: `P${++n}`, produto, preco_anterior: 200, preco_atual: 100,
  imagem: 'https://exemplo.test/f.jpg', original_url: `https://www.exemplo.test/p/${n}`, ...extra,
}, { settings: { ...settings.getAll(), min_discount_pct: 5 } });
const total = () => busca.buscar({ por: 1 }, { comissao: false }).total;
const ids = () => busca.ativas().map(o => o.id);

test.after(() => { try { db.db.close(); } catch { /* */ } try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch { /* */ } });

for (let i = 0; i < 4000; i++) oferta(`Produto de teste numero ${i}`);

// Precisa ser o primeiro teste: é ele que pega o servidor "recém-ligado", ainda sem a lista.
test('pedido que não pode esperar recebe a lista completa, mesmo com a montagem em andamento', async () => {
  const andamento = busca.pronta();
  assert.equal(total(), 4000);
  await andamento;
  assert.equal(total(), 4000);
});

test('a montagem em partes dá o mesmo resultado da montagem de uma vez', async () => {
  oferta('Produto novo para refazer a lista');
  busca.montar();
  const inteira = busca.ativas().map(o => ({ ...o }));
  oferta('Outro produto novo');
  await busca.atualizar();
  const emPartes = busca.ativas().filter(o => o.produto !== 'Outro produto novo').map(({ _s, ...o }) => o);
  assert.deepEqual(emPartes, inteira.map(({ _s, ...o }) => o));
});

test('atualizar inclui o que acabou de ser gravado, mesmo com outra montagem em andamento', async () => {
  const id = oferta('Produto gravado por ultimo');
  await busca.atualizar();
  assert.ok(ids().includes(id));
  const id2 = oferta('Gravado com a montagem rodando');
  const rodando = busca.atualizar();
  const id3 = oferta('Gravado depois de a montagem começar');
  await rodando;
  await busca.atualizar();
  assert.ok(ids().includes(id2) && ids().includes(id3));
});

test('montagem antiga em segundo plano não sobrescreve uma mais nova', async () => {
  const id = oferta('Produto da montagem antiga');
  const antiga = busca.atualizar();
  await new Promise(r => setImmediate(r));
  const novo = oferta('Produto da montagem nova');
  busca.montar();
  await antiga;
  assert.ok(ids().includes(id) && ids().includes(novo));
});

test('o servidor consegue atender outros pedidos durante a montagem', async () => {
  // Basta a montagem de fato ceder a vez: conta as voltas do servidor até ela terminar
  db.run(`WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM s WHERE i < 25000)
    INSERT INTO offers (store_id, store_product_id, plataforma, produto, preco_atual, preco_anterior, desconto_pct, original_url)
    SELECT 'amazon', 'V' || i, 'Amazon', 'Volume ' || i || ' para a lista ficar grande', 100, 200, 50, 'https://www.exemplo.test/v/' || i FROM s`);
  let voltas = 0, fim = false;
  const conta = () => { voltas++; if (!fim) setImmediate(conta); };
  setImmediate(conta);
  await busca.atualizar();
  fim = true;
  assert.ok(voltas >= 2, `cedeu a vez ${voltas} vez(es)`);
});

test('rota espera a lista: a aguardar sempre segue adiante, uma vez só', async () => {
  let chamadas = 0;
  await new Promise(ok => busca.aguardar({}, {}, () => { chamadas++; ok(); }));
  assert.equal(chamadas, 1);
});

test('consultas do painel usam os índices (sem percorrer a tabela inteira)', () => {
  const plano = sql => db.all(`EXPLAIN QUERY PLAN ${sql}`).map(r => r.detail).join(' | ');
  const a = offers.activeClause();
  const cupons = db.all(`EXPLAIN QUERY PLAN SELECT o.store_id, o.cupom_codigo, COUNT(*) FROM offers o WHERE o.cupom_codigo IS NOT NULL AND ${a.sql} GROUP BY o.store_id, o.cupom_codigo`, ...a.params)
    .map(r => r.detail).join(' | ');
  assert.match(cupons, /idx_offers_cupom/);
  assert.match(plano('SELECT id FROM offers WHERE link_clicks > 0 ORDER BY link_clicks DESC LIMIT 30'), /idx_offers_cliques/);
  assert.match(plano("SELECT date(created_at) dia, COUNT(*) n FROM offers WHERE created_at >= date('now', '-29 days') GROUP BY dia"), /idx_offers_created/);
});
