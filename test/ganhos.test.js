// Ganhos de afiliados: situação das vendas, saldos e leitura do portal, num banco temporário (nunca o do site).
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
const g = require('../src/ganhos');
const sync = require('../src/ganhos-sync');

test.after(() => { try { db.db.close(); } catch { /* */ } try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch { /* */ } });

const liberada = (plataforma, comissao, status = 'confirmada') => g.registrar({ plataforma, comissao, data_venda: '2026-01-01', status, liberada_em: '2026-02-01', produto: `P${Math.random()}` });

test('venda ainda não paga não vira paga', () => {
  for (const s of ['UNPAID', 'Não pago', 'Aguardando pagamento', 'Pagamento pendente', 'PENDING', 'IN_REVIEW', 'Em análise']) assert.equal(g.statusDe(s), 'pendente', s);
  for (const s of ['Pago', 'Paga', 'PAID', 'Pagamento efetuado']) assert.equal(g.statusDe(s), 'paga', s);
  for (const s of ['APPROVED', 'COMPLETED', 'Confirmado']) assert.equal(g.statusDe(s), 'confirmada', s);
  for (const s of ['CANCELLED', 'CANCELED', 'REJECTED']) assert.equal(g.statusDe(s), 'cancelada', s);
});

test('saque e venda paga do mesmo dinheiro não contam em dobro', () => {
  const { id } = liberada('amazon', 100);
  assert.equal(g.resumo('amazon').disponivel, 100);
  g.registrarSaque({ plataforma: 'amazon', valor: 100 });
  let r = g.resumo('amazon');
  assert.deepEqual([r.disponivel, r.recebido], [0, 100]);
  g.atualizarStatus(id, 'paga');
  r = g.resumo('amazon');
  assert.deepEqual([r.disponivel, r.recebido], [0, 100]);
});

test('saque maior que as vendas pagas abate o que ainda está liberado', () => {
  liberada('shopee', 50, 'paga');
  liberada('shopee', 50);
  g.registrarSaque({ plataforma: 'shopee', valor: 100 });
  const r = g.resumo('shopee');
  assert.deepEqual([r.disponivel, r.recebido], [0, 100]);
});

test('ganho estimado do Mercado Livre é a liberar, não saldo para sacar', () => {
  g.salvarGanhoEstimadoMl(190.02);
  const r = g.resumo('mercadolivre');
  assert.deepEqual([r.disponivel, r.a_liberar, r.pode_sacar], [0, 190.02, false]);
});

test('leitura do portal: saldo real, vendas sem repetir e a nova lista de situação', () => {
  const vendas = [
    { externo: '200-MLB1', data_venda: '06/11/2026', pedido: '200', produto: 'Conjunto', valor_venda: 72.49, comissao: 8.72, status: 'IN_REVIEW' },
    { externo: '201-MLB2', data_venda: '05/11/2026', pedido: '201', produto: 'Camisa', valor_venda: 50, comissao: 5, status: 'APPROVED' },
    { externo: '202-MLB3', data_venda: '04/11/2026', pedido: '202', produto: 'Calça', valor_venda: 40, comissao: 4, status: 'CANCELED' },
  ];
  const a = g.importarPortal('mercadolivre', { saldo: { disponivel: 0, a_liberar: 205.6, recebido: 0, minimo: 30, proximo_pagamento: '12/11' }, vendas });
  assert.deepEqual([a.novas, a.atualizadas, a.ignoradas], [3, 0, 0]);
  const r = g.resumo('mercadolivre');
  assert.deepEqual([r.disponivel, r.a_liberar, r.pode_sacar, r.minimo, r.vendas], [0, 205.6, false, 30, 2]);
  assert.equal(r.estimado, null);
  assert.deepEqual(g.listar({ plataforma: 'mercadolivre' }).map(v => v.status).sort(), ['cancelada', 'confirmada', 'pendente']);
  const b = g.importarPortal('mercadolivre', { saldo: { disponivel: 30, a_liberar: 175.6, recebido: 0 }, vendas });
  assert.deepEqual([b.novas, b.atualizadas], [0, 3]);
  assert.equal(g.resumo('mercadolivre').pode_sacar, true);
});

test('saque depois da leitura zera até a leitura seguinte, e ela é que vale', () => {
  g.registrarSaque({ plataforma: 'mercadolivre', valor: 30 });
  // Saque na mesma hora da leitura: a comparação é por segundo, então a data de registro fica depois
  db.run(`UPDATE ganhos_saques SET registrado_em = datetime('now', '+5 seconds') WHERE plataforma = 'mercadolivre'`);
  let r = g.resumo('mercadolivre');
  assert.deepEqual([r.disponivel, r.recebido, r.pode_sacar], [0, 30, false]);
  db.run(`UPDATE ganhos_saques SET registrado_em = datetime('now', '-5 seconds') WHERE plataforma = 'mercadolivre'`);
  g.importarPortal('mercadolivre', { saldo: { disponivel: 10, a_liberar: 0, recebido: 30 } });
  r = g.resumo('mercadolivre');
  assert.deepEqual([r.disponivel, r.recebido], [10, 30]);
});

test('saldo fora do ar no portal: as vendas entram e fica o último saldo', () => {
  const a = g.importarPortal('mercadolivre', { saldo: null, vendas: [{ externo: '300-MLB9', data_venda: '07/11/2026', comissao: 1, status: 'IN_REVIEW' }] });
  assert.equal(a.saldo_lido, false);
  assert.equal(g.resumo('mercadolivre').disponivel, 10);
});

test('erro na leitura aparece sem apagar o saldo e some na leitura seguinte', () => {
  g.importarPortal('magalu', { saldo: { disponivel: 54.11, a_liberar: 0, recebido: null }, vendas: [] });
  g.importarPortal('magalu', { erro: 'Entre no portal' });
  db.run(`UPDATE settings SET value = replace(value, '"erro_em":"', '"erro_em":"9') WHERE key = 'ganhos_portal'`);
  assert.equal(g.resumo('magalu').disponivel, 54.11);
  let e = sync.estado().plataformas.magalu;
  assert.deepEqual([e.ok, e.extensao, e.mensagem], [false, true, 'Entre no portal']);
  g.importarPortal('magalu', { saldo: { disponivel: 54.11, a_liberar: 0 }, vendas: [] });
  e = sync.estado().plataformas.magalu;
  assert.equal(e.ok, true);
});

test('só Mercado Livre e Magalu entram pela leitura do portal, com valores válidos', () => {
  assert.throws(() => g.importarPortal('amazon', { saldo: { disponivel: 1 } }), /inválida/);
  assert.throws(() => g.importarPortal('nada', {}), /inválida/);
  const a = g.importarPortal('magalu', { saldo: { disponivel: -5, a_liberar: 1 } });
  assert.equal(a.saldo_lido, false);
  const b = g.importarPortal('magalu', { vendas: [{ externo: 'x', data_venda: '01/01/2026', comissao: 'abc' }] });
  assert.equal(b.ignoradas, 1);
});
