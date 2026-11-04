// Regras principais, num banco temporário (nunca o do site). Rode com: npm test
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
const cupons = require('../src/cupons');
const busca = require('../src/busca-ofertas');
const dois = require('../src/admin2fa');
const { getStore } = require('../src/stores');

const amazon = getStore('amazon'), shopee = getStore('shopee'), kabum = getStore('kabum');
let n = 0;
const oferta = (store, produto, de, por, extra = {}) => offers.saveDeal(store, {
  store_product_id: `T${++n}`, produto, preco_anterior: de, preco_atual: por,
  imagem: 'https://exemplo.test/f.jpg', original_url: `https://www.exemplo.test/p/${n}`, ...extra,
}, { settings: { ...settings.getAll(), min_discount_pct: 5 } });
const nomes = r => r.itens.map(o => o.produto);

test.after(() => { try { db.db.close(); } catch { /* */ } try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch { /* */ } });

test('login em duas etapas: padrão TOTP (RFC 6238)', () => {
  assert.equal(dois.codigoDe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082');
  assert.equal(dois.codigoDe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 37037036), '081804');
});

test('login em duas etapas: ativar, código novo, repetido e recuperação', async () => {
  assert.equal(dois.ativo(), false);
  assert.equal(dois.conferir('qualquer'), true, 'desligado não atrapalha');
  const { segredo, qr } = await dois.iniciar();
  assert.match(qr, /<svg/);
  assert.equal(dois.ativo(), false, 'só vale depois de confirmar');
  assert.throws(() => dois.confirmar('000000'));
  const agora = Date.now();
  const recuperacao = dois.confirmar(dois.codigoDe(segredo, dois.contadorAgora(agora)));
  assert.equal(recuperacao.length, 8);
  assert.equal(dois.ativo(), true);
  const depois = agora + 60000, codigo = dois.codigoDe(segredo, dois.contadorAgora(depois));
  assert.equal(dois.conferir('123', depois), false);
  assert.equal(dois.conferir(codigo, depois), true);
  assert.equal(dois.conferir(codigo, depois), false, 'o mesmo código não entra duas vezes');
  assert.equal(dois.conferir(recuperacao[0]), true);
  assert.equal(dois.conferir(recuperacao[0]), false, 'recuperação é de uso único');
  assert.equal(dois.estado().codigos_restantes, 7);
  dois.desligar();
  assert.equal(dois.ativo(), false);
});

test('cupom: compra mínima, limite e preço sem cupom', () => {
  const d = { preco_atual: 630.8, preco_anterior: 1030 };
  assert.equal(cupons.aplicar(d, { codigo: 'ML1', tipo: 'pct', valor: 5, minimo: 200, limite: 40 }).preco_atual, 599.26);
  assert.equal(cupons.aplicar(d, { codigo: 'ML1', tipo: 'pct', valor: 50, limite: 40 }).preco_atual, 590.8);
  assert.equal(cupons.aplicar(d, { codigo: 'ML1', tipo: 'pct', valor: 5, minimo: 700 }).cupom_codigo, undefined);
  const sem = cupons.aplicar({ preco_atual: 100, preco_anterior: 0 }, { codigo: 'LEVOU5', tipo: 'pct', valor: 10 });
  assert.deepEqual([sem.preco_atual, sem.preco_anterior, sem.preco_sem_cupom], [90, 100, 100]);
});

test('oferta perde o cupom quando a leitura nova vem sem ele', () => {
  const deal = cupons.aplicar({ store_product_id: 'CUP1', produto: 'Monitor com cupom teste', preco_atual: 100, preco_anterior: 200, original_url: 'https://www.exemplo.test/c' }, { codigo: 'ESQUENTA', tipo: 'pct', valor: 10 });
  const s = { ...settings.getAll(), min_discount_pct: 5 };
  const id = offers.saveDeal(kabum, deal, { settings: s });
  assert.equal(db.get('SELECT cupom_codigo c FROM offers WHERE id = ?', id).c, 'ESQUENTA');
  offers.saveDeal(kabum, { store_product_id: 'CUP1', produto: 'Monitor com cupom teste', preco_atual: 100, preco_anterior: 200, original_url: 'https://www.exemplo.test/c' }, { settings: s });
  assert.equal(db.get('SELECT cupom_codigo c FROM offers WHERE id = ?', id).c, null);
});

test('busca, repetidos e descontos suspeitos', () => {
  oferta(amazon, 'Geladeira Brastemp Frost Free 400L', 4000, 3000);
  oferta(shopee, 'Geladeira Mini de Brinquedo Infantil', 200, 80);
  oferta(amazon, 'Prateleira para geladeira', 100, 60);
  oferta(amazon, 'Lençol de algodão macio', 100, 70);
  oferta(amazon, 'Monitor LG UltraWide 29 polegadas', 1500, 1200);
  oferta(amazon, 'Smart TV 55 Samsung 4K', 3000, 2400);
  oferta(amazon, 'Smart TV 150 polegadas projeção', 9000, 8000);
  oferta(amazon, 'Fone de ouvido Bluetooth', 200, 120);
  oferta(amazon, 'Cafeteira Expresso Repetida XPTO', 800, 500);
  oferta(shopee, 'Cafeteira Expresso Repetida XPTO', 800, 450);
  oferta(shopee, 'Relógio Masculino Barato Demais', 219.8, 10.99); // 95%
  oferta(shopee, 'Tênis Réplica Primeira Linha', 300, 150);
  oferta(amazon, 'Modelo de Telefone Falso para Exibição', 200, 100);
  busca.montar();

  const b = q => busca.buscar({ q, por: 24 }, { comissao: false });
  assert.equal(nomes(b('geladeira'))[0], 'Geladeira Brastemp Frost Free 400L', 'o produto vem antes do brinquedo e da peça');
  const lg = nomes(b('lg'));
  assert.ok(lg.includes('Monitor LG UltraWide 29 polegadas'));
  assert.ok(!lg.includes('Lençol de algodão macio'), 'lg não casa com algodão');
  assert.ok(nomes(b('tv 55')).includes('Smart TV 55 Samsung 4K'));
  assert.equal(b('tv 15').aproximado, true, 'número inteiro: 15 não casa com 150');
  assert.ok(nomes(b('televisao')).includes('Smart TV 55 Samsung 4K'), 'sinônimo');
  assert.ok(nomes(b('fones')).includes('Fone de ouvido Bluetooth'), 'plural');

  const parecido = b('geladeira xyzabc');
  assert.equal(parecido.aproximado, true);
  assert.ok(parecido.total > 0);
  assert.equal(b('xyzabc').total, 0);

  const cafe = b('cafeteira expresso').itens;
  assert.equal(cafe.length, 1, 'anúncios idênticos viram um');
  assert.deepEqual([cafe[0].preco_atual, cafe[0].iguais], [450, 2]);

  const motivos = Object.fromEntries(busca.suspeitas(50).itens.map(o => [o.produto, o.motivo]));
  assert.match(motivos['Relógio Masculino Barato Demais'], /95%/);
  assert.equal(motivos['Tênis Réplica Primeira Linha'], 'Parece réplica');
  assert.equal(motivos['Modelo de Telefone Falso para Exibição'], 'Produto de exibição');
  const r = busca.buscar({ por: 1 }, { comissao: false }).resumo;
  assert.ok(r.maior_desconto < 95, 'suspeita não é o "maior desconto"');
  assert.notEqual(r.destaque?.produto, 'Relógio Masculino Barato Demais');
  assert.notEqual(busca.buscar({ por: 1, ordem: 'desconto' }, { comissao: false }).itens[0].produto, 'Relógio Masculino Barato Demais');
});

test('páginas de categoria e marca', () => {
  const seo = require('../src/paginas/ofertas-seo');
  const p = seo.pagina(['eletrodomesticos'], 'https://exemplo.test');
  assert.match(p.html, /<link rel="canonical" href="https:\/\/exemplo.test\/ofertas\/eletrodomesticos">/);
  assert.match(p.html, /Geladeira Brastemp/);
  assert.equal(seo.pagina(['nao-existe'], 'https://exemplo.test'), null);
  assert.equal(seo.pagina(['marca', 'nao-existe'], 'https://exemplo.test'), null);
});

test('origem do clique', () => {
  const { origemDoClique: o } = require('../src/admin-painel');
  const req = (ref, query = {}) => ({ query, get: () => ref });
  assert.equal(o(req('', { via: 'post' }), 'site.test'), 'postagem');
  assert.equal(o(req(''), 'site.test'), 'direto');
  assert.equal(o(req('https://site.test/?q=tv'), 'site.test'), 'busca_site');
  assert.equal(o(req('https://site.test/ofertas/games'), 'site.test'), 'pagina_categoria');
  assert.equal(o(req('https://site.test/'), 'site.test'), 'site');
  assert.equal(o(req('https://www.google.com.br/'), 'site.test'), 'buscador');
  assert.equal(o(req('https://l.instagram.com/'), 'site.test'), 'rede_social');
  assert.equal(o(req('https://blog.exemplo.test/'), 'site.test'), 'outro_site');
});

test('backup: banco, fotos, pasta externa, restauração e limpeza', async () => {
  const backup = require('../src/backup');
  const externa = fs.mkdtempSync(path.join(os.tmpdir(), 'ofertou-externa-'));
  fs.writeFileSync(path.join(db.UPLOADS_DIR, 'foto-teste.txt'), 'foto');
  settings.set('backup_pasta_externa', externa);
  const r = await backup.fazer();
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.externo, true);
  const noExterno = fs.readdirSync(externa);
  assert.ok(noExterno.some(x => /^ofertas-.*\.db\.gz$/.test(x)));
  assert.ok(noExterno.some(x => /^fotos-.*\.tar\.gz$/.test(x)), 'as fotos também vão');
  assert.ok(require('zlib').gunzipSync(fs.readFileSync(backup.caminho(r.nome))).length > 1000);
  assert.equal(backup.caminho('../ofertas.db'), null);
  assert.equal(backup.estado().atrasado, false);

  const dir = path.dirname(backup.caminho(r.nome));
  for (let d = 1; d <= 40; d++) fs.writeFileSync(path.join(dir, `ofertas-${new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)}.db.gz`), '');
  backup.limpar();
  const sobram = fs.readdirSync(dir).filter(x => x.startsWith('ofertas-')).length;
  assert.ok(sobram >= 8 && sobram <= 11, `sobraram ${sobram}`);

  settings.set('backup_pasta_externa', path.join(externa, 'nao-existe'));
  const r2 = await backup.fazer();
  assert.equal(r2.ok, true, 'pasta externa com problema não derruba o backup local');
  assert.equal(r2.externo, false);
  settings.set('backup_pasta_externa', '');
  fs.rmSync(externa, { recursive: true, force: true });
});

test('agendamento: posta pela nota, sem suspeitas e sem repetir', async () => {
  const agenda = require('../src/agenda');
  const social = require('../src/social');
  busca.montar();
  const escolhidas = agenda.melhoresOfertas(50, new Set());
  const nomesEscolhidos = escolhidas.map(id => db.get('SELECT produto FROM offers WHERE id = ?', id).produto);
  assert.ok(nomesEscolhidos.length > 0);
  assert.ok(!nomesEscolhidos.includes('Relógio Masculino Barato Demais'));
  assert.ok(!nomesEscolhidos.includes('Tênis Réplica Primeira Linha'));

  settings.set('agenda_redes', JSON.stringify(['telegram']));
  settings.set('telegram_bot_token', 'teste');
  settings.set('telegram_chat_id', '-1');
  const original = social.publicar;
  const publicadas = [];
  social.publicar = async (id, redes, texto) => { publicadas.push({ id, texto }); return [{ rede: redes[0], ok: true }]; };
  try {
    const r = await agenda.executar('teste', null, 1);
    assert.equal(r.erro, undefined, r.erro);
    assert.equal(r.feitos.length, 1);
    assert.equal(publicadas.length, 1);
    assert.match(publicadas[0].texto, /R\$/);
  } finally { social.publicar = original; }
});

test('erros do servidor são agrupados', () => {
  const erros = require('../src/erros-site');
  erros.registrar(new Error('falhou o pedido 123'), 'GET /api/x');
  erros.registrar(new Error('falhou o pedido 456'), 'GET /api/x');
  const l = erros.recentes();
  assert.equal(l.length, 1);
  assert.equal(l[0].vezes, 2);
});
