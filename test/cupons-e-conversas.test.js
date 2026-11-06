// Lista de cupons, apagar conversa e respostas da Capi, num banco temporário (nunca o do site).
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
const chat = require('../src/chat');
require('../src/moderacao-chat');
const lista = require('../src/lista-cupons');
const whatsapp = require('../src/whatsapp');
const social = require('../src/social');
const capi = require('../src/ia/assistente');

test.after(() => { try { db.db.close(); } catch { /* */ } try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch { /* */ } });

const cupom = (n, store_id = 'kabum') => ({ codigo: `CUPOM${n}`, ml: false, texto: '10% OFF', minimo: 0, store_id, loja: store_id, ofertas: 1 });

test('lista de cupons: um por linha, com onde usar e Ver mais no fim', () => {
  settings.set('site_url', 'https://exemplo.test');
  const t = lista.mensagem([cupom(1), cupom(2, 'magalu'), { codigo: 'ML55', ml: true, texto: '15% OFF', minimo: 100, store_id: 'mercadolivre', loja: 'Mercado Livre', ofertas: 0 }]);
  const linhas = t.split('\n');
  assert.ok(linhas.includes('*CUPOM1* — 10% OFF — use na KaBuM!'));
  assert.ok(linhas.includes('*CUPOM2* — 10% OFF — use na Magalu'));
  assert.ok(linhas.includes('*15% OFF* acima de R$ 100 — ative no Mercado Livre, em Cupons'));
  assert.ok(!t.includes('ML55'), 'o código interno do Mercado Livre não aparece');
  assert.equal(linhas.at(-1), '*Ver mais:* https://exemplo.test/cupons');
});

test('lista de cupons: 20 por envio, continuando de onde parou', () => {
  const todos = Array.from({ length: 25 }, (_, i) => cupom(i));
  assert.equal(lista.fatia(todos, 0).length, 20);
  assert.equal(lista.fatia(todos, 0)[0].codigo, 'CUPOM0');
  const segunda = lista.fatia(todos, 20);
  assert.equal(segunda.length, 20);
  assert.equal(segunda[0].codigo, 'CUPOM20');
  assert.equal(segunda[5].codigo, 'CUPOM0', 'volta ao começo');
  assert.equal(lista.fatia(todos.slice(0, 3), 7).length, 3, 'com poucos cupons vão todos');
});

test('lista de cupons: cada grupo recebe só as lojas marcadas e falha em um não para os outros', async () => {
  const antes = { enviar: whatsapp.enviar, pronta: social.REDES.whatsapp.pronta };
  const enviados = [];
  whatsapp.enviar = async (s, id, { texto }) => { if (id === 'ruim') throw new Error('sem resposta'); enviados.push({ id, texto }); };
  social.REDES.whatsapp.pronta = () => null;
  const original = require('../src/cupons').resumo;
  require('../src/cupons').resumo = () => [{ store_id: 'kabum', codigo: 'KABUM5', texto: '5% OFF', ofertas: 3 }, { store_id: 'magalu', codigo: 'MAGA5', texto: '5% OFF', ofertas: 2 }];
  settings.set('whatsapp_groups', JSON.stringify([{ id: 'a', nome: 'A', lojas: ['magalu'] }, { id: 'ruim', nome: 'Ruim' }, { id: 'c', nome: 'C', lojas: ['shopee'] }, { id: 'd', nome: 'D' }]));
  try {
    const r = await lista.postar();
    assert.equal(r.enviados, 2);
    assert.equal(r.sem_cupom, 1);
    assert.deepEqual(r.falhas, [{ grupo: 'Ruim', erro: 'sem resposta' }]);
    const a = enviados.find(x => x.id === 'a').texto, d = enviados.find(x => x.id === 'd').texto;
    assert.ok(a.includes('MAGA5') && !a.includes('KABUM5'));
    assert.ok(d.includes('MAGA5') && d.includes('KABUM5'));
    assert.equal(lista.ultimoEnvio(null).enviados, 2);
  } finally {
    whatsapp.enviar = antes.enviar;
    social.REDES.whatsapp.pronta = antes.pronta;
    require('../src/cupons').resumo = original;
  }
});

function conversa(a, b) {
  const id = Number(db.run(`INSERT INTO conversas (tipo, a, b, status) VALUES ('pessoal', ?, ?, 'aceita')`, a, b).lastInsertRowid);
  return id;
}

test('apagar conversa: some só para quem apagou, volta com mensagem nova e o admin vê tudo', () => {
  const id = conversa('u:1', 'u:2');
  chat.enviar('u:1', id, 'primeira');
  chat.enviar('u:2', id, 'segunda');
  chat.apagarParaMim('u:1', id);
  assert.ok(!chat.lista('u:1').some(c => c.id === id), 'sumiu para quem apagou');
  assert.ok(chat.lista('u:2').some(c => c.id === id), 'a outra pessoa continua vendo');
  assert.equal(chat.mensagens('u:1', id).mensagens.length, 0);
  assert.equal(chat.mensagens('u:2', id).mensagens.length, 2);
  assert.equal(chat.resumo('u:1').nao_lidas, 0);
  assert.equal(chat.transcricao(id).mensagens.length, 2, 'o histórico fica para o administrador');
  assert.equal(chat.transcricao(id).apagada_por.length, 1);

  chat.enviar('u:2', id, 'terceira');
  assert.ok(chat.lista('u:1').some(c => c.id === id), 'mensagem nova traz a conversa de volta');
  const volta = chat.mensagens('u:1', id).mensagens;
  assert.deepEqual(volta.map(m => m.texto), ['terceira'], 'só com as mensagens novas');
  assert.equal(chat.transcricao(id).mensagens.length, 3);
});

test('apagar conversa: não desfaz o bloqueio e só quem participa pode apagar', () => {
  const id = conversa('u:3', 'u:4');
  chat.enviar('u:3', id, 'oi');
  chat.responder('u:4', id, 'bloquear');
  chat.apagarParaMim('u:3', id);
  assert.throws(() => chat.enviar('u:3', id, 'de novo'), /bloqueada/);
  assert.throws(() => chat.apagarParaMim('u:9', id), /não encontrada/);
});

test('pedido de mensagem apagado não fica contando como pendente', () => {
  const id = Number(db.run(`INSERT INTO conversas (tipo, a, b, status) VALUES ('pessoal', 'u:5', 'u:6', 'pendente')`).lastInsertRowid);
  chat.enviar('u:5', id, 'posso falar?');
  assert.equal(chat.resumo('u:6').pedidos, 1);
  chat.apagarParaMim('u:6', id);
  assert.equal(chat.resumo('u:6').pedidos, 0);
});

test('apagar histórico (admin): tira as mensagens e a moderação para todos, sem desfazer o bloqueio', () => {
  const id = conversa('u:7', 'u:8');
  chat.enviar('u:7', id, 'mensagem');
  db.run(`INSERT INTO chat_infracoes (origem, ref_id, mensagem_id, autor, palavras, texto_original) VALUES ('chat', ?, 1, 'u:7', 'x', 'x')`, id);
  chat.responder('u:8', id, 'bloquear');
  assert.ok(chat.apagarHistorico(id).removidas >= 1);
  assert.equal(chat.transcricao(id).mensagens.length, 0);
  assert.equal(db.get(`SELECT COUNT(*) n FROM chat_infracoes WHERE origem = 'chat' AND ref_id = ?`, id).n, 0);
  assert.ok(!chat.lista('u:7').some(c => c.id === id));
  assert.ok(!chat.lista('u:8').some(c => c.id === id));
  assert.ok(!chat.listarAdmin().some(c => c.id === id), 'sai da lista do painel');
  assert.throws(() => chat.enviar('u:7', id, 'de novo'), /bloqueada/);
});

test('Capi: senha, conectar o WhatsApp, cupons e apagar conversa', () => {
  const r = q => capi.responder(q).texto;
  assert.match(r('esqueci minha senha'), /Esqueci minha senha/);
  assert.match(r('esqueci minha senha'), /1 hora/);
  for (const q of ['como conecto meu whatsapp para postar nos grupos', 'como conecto meu whatsapp', 'como postar nos meus grupos de whatsapp']) assert.match(r(q), /QR code/, q);
  for (const q of ['como recebo alertas de ofertas no whatsapp', 'quero receber ofertas no whatsapp']) assert.match(r(q), /Sim, quero/, q);
  for (const q of ['como usar cupom', 'onde vejo os cupons']) assert.match(r(q), /\/cupons/, q);
  assert.match(r('como apago uma conversa'), /Apagar conversa/);
  assert.match(r('como bloquear alguém'), /bloqueia/);
});
