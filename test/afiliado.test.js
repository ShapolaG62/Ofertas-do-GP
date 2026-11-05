// Comissão, membros e site do grupo dos clientes da ferramenta, num banco temporário. Rode com: npm test
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'ofertou-afiliado-'));
process.env.DATA_DIR = PASTA;
process.env.DISABLE_MINER = '1';
process.env.DISABLE_AGENDA = '1';

const db = require('../src/db');
assert.ok(db.DB_PATH.startsWith(PASTA), 'os testes só rodam no banco temporário');
const clientes = require('../src/clientes');
const cg = require('../src/cliente-ganhos');
const membros = require('../src/membros-grupo');
const gc = require('../src/grupos-convite');

const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
function novoCliente(email) {
  return clientes.criar({ nome: 'Afiliado Teste', email, senha: 'Kw9#vTz4!qLm2x', dias: 30 });
}
let A, B;
test.before(() => { A = novoCliente('a@exemplo.test'); B = novoCliente('b@exemplo.test'); });

test('venda repetida é atualizada, não duplicada, e cada cliente vê só as suas', () => {
  assert.equal(cg.registrar(A, { plataforma: 'shopee', externo: 'x1', data_venda: hoje, produto: 'Air Fryer', valor_venda: 200, comissao: 10, status: 'pendente' }, 'api').novo, true);
  assert.equal(cg.registrar(A, { plataforma: 'shopee', externo: 'x1', data_venda: hoje, produto: 'Air Fryer', valor_venda: 200, comissao: 12, status: 'completed' }, 'api').novo, false);
  cg.registrar(B, { plataforma: 'shopee', externo: 'x1', data_venda: hoje, produto: 'Outro', comissao: 99, status: 'paga' });
  const r = cg.resumo(A, 30);
  assert.equal(r.pedidos, 1);
  assert.equal(r.comissao, 12);
  assert.equal(r.confirmada, 12);
  assert.equal(cg.resumo(B, 30).comissao, 99);
});

test('venda cancelada fica fora da comissão, mas é contada à parte', () => {
  cg.registrar(A, { plataforma: 'amazon', externo: 'c1', data_venda: hoje, produto: 'Fone', comissao: 50, status: 'cancelado' });
  const r = cg.resumo(A, 30);
  assert.equal(r.comissao, 12);
  assert.equal(r.cancelados, 1);
});

test('planilha importa em real brasileiro e não duplica ao enviar de novo', () => {
  const csv = `Data;Produto;Pedido;Comissão;Situação\n${hoje.split('-').reverse().join('/')};"Monitor 24""";P9;R$ 1.234,56;Aprovado\ninválida;Nada;P0;x;Aprovado\n`;
  const mapa = { data_venda: 0, produto: 1, pedido: 2, comissao: 3, status: 4 };
  const p = cg.previa(csv);
  assert.equal(p.total, 2);
  const r1 = cg.importar(B, csv, 'kabum', mapa);
  assert.deepEqual([r1.novas, r1.ignoradas], [1, 1]);
  const r2 = cg.importar(B, csv, 'kabum', mapa);
  assert.deepEqual([r2.novas, r2.atualizadas], [0, 1]);
  assert.equal(cg.resumo(B, 30).por_loja.find(l => l.plataforma === 'kabum').comissao, 1234.56);
  assert.throws(() => cg.importar(B, csv, 'kabum', { produto: 1 }), /colunas/);
});

test('avisos do WhatsApp: só contagens, só dos grupos de envio', () => {
  clientes.salvarConfig(A, { whatsapp_groups: [{ id: '120363@g.us', nome: 'Grupo 1' }] });
  assert.deepEqual(membros.lerEvento({ event: 'group-participants.update', data: { id: '120363@g.us', action: 'add', participants: ['551199@s', '551188@s'] } }), { grupo: '120363', entradas: 2, saidas: 0 });
  assert.deepEqual(membros.lerEvento({ event: 'GROUP_PARTICIPANTS_UPDATE', data: { id: '120363@g.us', action: 'remove', participants: ['551199@s'] } }), { grupo: '120363', entradas: 0, saidas: 1 });
  assert.deepEqual(membros.lerEvento({ notification: 'GROUP_PARTICIPANT_LEAVE', phone: '120363-group', notificationParameters: ['5511'] }), { grupo: '120363', entradas: 0, saidas: 1 });
  assert.equal(membros.lerEvento({ event: 'group-participants.update', data: { id: '1@g.us', action: 'promote', participants: ['x'] } }), null);
  assert.equal(membros.lerEvento({ text: { message: 'oi' } }), null);

  assert.equal(membros.receber(A, { event: 'group-participants.update', data: { id: '120363@g.us', action: 'add', participants: ['551199@s', '551188@s'] } }), true);
  assert.equal(membros.receber(A, { notification: 'GROUP_PARTICIPANT_REMOVE', phone: '120363-group', notificationParameters: ['5511'] }), true);
  assert.equal(membros.receber(A, { event: 'group-participants.update', data: { id: '999@g.us', action: 'add', participants: ['x'] } }), false, 'grupo que não é de envio não conta');
  assert.equal(membros.receber(B, { notification: 'GROUP_PARTICIPANT_ADD', phone: '120363-group' }), false, 'o grupo é de outro cliente');
  const r = membros.resumo(A, 7);
  assert.deepEqual([r.entradas, r.saidas], [2, 1]);
  assert.equal(r.grupos[0].nome, 'Grupo 1');
  const salvo = JSON.stringify(db.all('SELECT * FROM grupo_membros_dia'));
  assert.ok(!salvo.includes('551199'), 'o número das pessoas não é guardado');
});

test('site do grupo: endereço único, rotação por limite e contagem separada', () => {
  clientes.salvarConfig(A, { grupo_slug: 'grupo-da-ana', grupos_convite: 'G1 | https://chat.whatsapp.com/aaa | 1\nG2 | https://chat.whatsapp.com/bbb | 0\nRuim | https://exemplo.test/x | 5' });
  assert.throws(() => clientes.salvarConfig(B, { grupo_slug: 'grupo-da-ana' }), /em uso/);
  assert.throws(() => clientes.salvarConfig(B, { grupo_slug: 'a' }), /Endereço/);
  assert.equal(gc.clienteDoEndereco('GRUPO-DA-ANA'), A);
  assert.equal(gc.lista(A).length, 2, 'link que não é de grupo fica de fora');
  assert.equal(gc.proximo(A).nome, 'G1');
  assert.equal(gc.proximo(A).nome, 'G2');
  assert.equal(gc.proximo(A).nome, 'G2');
  assert.deepEqual(gc.resumo(A).map(g => [g.entradas, g.lotado]), [[1, true], [2, false]]);
  assert.equal(gc.lista(null).length, 0, 'não mexe na lista do site');
  gc.zerar(A);
  assert.equal(gc.resumo(A)[0].entradas, 0);
  db.run(`UPDATE clientes SET status = 'bloqueado' WHERE id = ?`, A);
  assert.equal(gc.clienteDoEndereco('grupo-da-ana'), null, 'cliente bloqueado perde a página');
  db.run(`UPDATE clientes SET status = 'ativo' WHERE id = ?`, A);
});

test('configuração do cliente: a contagem interna não pode ser editada', () => {
  clientes.salvarConfig(A, { grupos_convite_entradas: '{"x":999}', ganhos_sync_estado: 'x' });
  const v = db.get(`SELECT value FROM cliente_config WHERE cliente_id = ? AND key = 'ganhos_sync_estado'`, A);
  assert.equal(v, undefined);
});

test('página de venda sai com o preço do plano e sem erro', () => {
  const html = require('../src/paginas/ferramenta').pagina();
  assert.match(html, /Faça a sua conta/);
  assert.match(html, /Não é promessa de resultado/);
});
