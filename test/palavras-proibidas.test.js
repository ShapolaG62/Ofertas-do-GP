// Palavras proibidas na mineração, num banco temporário (nunca o do site).
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
const pp = require('../src/palavras-proibidas');
const { getStore } = require('../src/stores');

test.after(() => { try { db.db.close(); } catch { /* */ } try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch { /* */ } });

const kabum = getStore('kabum');
let n = 0;
const deal = produto => ({ store_product_id: `P${++n}`, produto, preco_anterior: 500, preco_atual: 400, original_url: `https://www.exemplo.test/p/${n}` });
const opts = { settings: { ...settings.getAll(), min_discount_pct: 5 } };
const salvar = (produto, o = opts) => offers.saveDeal(kabum, deal(produto), o);
const oculto = id => db.get('SELECT oculto FROM offers WHERE id = ?', id).oculto;

test('barra a palavra inteira, sem acento e no plural', () => {
  for (const nome of ['Arma de pressão 5.5mm', 'ARMAS de brinquedo', 'Cigarro Eletrônico', 'Kit 2 vibradores', 'Revolver calibre', 'Vape-descartável', 'Munição real', 'Sex Shop kit']) {
    assert.equal(pp.bloqueia(nome), true, nome);
  }
});

test('não barra palavras parecidas', () => {
  for (const nome of ['Armário de cozinha', 'Farmácia portátil', 'Drogaria kit', 'Armazenamento SSD 1TB', 'Conserva de pepino', 'Defumador de carne', 'Bongô infantil', 'Consolador']) {
    assert.equal(pp.bloqueia(nome), false, nome);
  }
});

test('a mineração não grava produto proibido; o cadastro à mão grava', () => {
  assert.equal(salvar('Narguile completo'), null);
  assert.ok(salvar('Fone Bluetooth'));
  assert.ok(offers.saveDeal(kabum, deal('Narguile completo'), { fonte: 'manual', expiresAt: '2099-01-01 00:00:00' }));
});

test('adicionar tira do ar, tirar devolve, e nada é apagado', () => {
  const id = salvar('Isqueiro recarregável');
  assert.equal(oculto(id), 0);
  const a = pp.adicionar('Isqueiro, ISQUEIRO');
  assert.deepEqual(a.adicionadas, ['Isqueiro']);
  assert.equal(a.ocultadas, 1);
  assert.equal(oculto(id), 1);
  assert.equal(offers.isActive(id), false);
  assert.equal(salvar('Isqueiro de cozinha'), null);
  const r = pp.remover('isqueiro');
  assert.equal(r.devolvidas, 1);
  assert.equal(oculto(id), 0);
  assert.ok(salvar('Isqueiro de cozinha'));
});

test('a oferta escondida à mão continua escondida ao tirar a palavra', () => {
  const id = salvar('Caneca térmica');
  db.run('UPDATE offers SET oculto = 1 WHERE id = ?', id);
  pp.adicionar('caneca');
  assert.equal(pp.remover('caneca').devolvidas, 0);
  assert.equal(oculto(id), 1);
});

test('uma oferta manual com a palavra não sai do ar', () => {
  const id = offers.saveDeal(kabum, deal('Bicicleta aro 29'), { fonte: 'manual', expiresAt: '2099-01-01 00:00:00' });
  pp.adicionar('bicicleta');
  assert.equal(oculto(id), 0);
  pp.remover('bicicleta');
});

test('a lista pode ficar vazia e continua vazia', () => {
  for (const p of pp.listar()) pp.remover(p);
  assert.deepEqual(pp.listar(), []);
  assert.equal(pp.bloqueia('Arma de pressão'), false);
  assert.equal(settings.get(pp.CHAVE), '');
});

test('recusa palavra vazia, curta, longa ou repetida', () => {
  assert.throws(() => pp.adicionar('  , '), /Digite/);
  assert.throws(() => pp.adicionar('a'), /letras/);
  assert.throws(() => pp.adicionar('x'.repeat(61)), /letras/);
  pp.adicionar('tabaco');
  assert.throws(() => pp.adicionar('Tabaco'), /já está/);
  assert.throws(() => pp.remover('nada disso'), /não está/);
});

test('caractere especial na palavra não quebra a comparação', () => {
  pp.adicionar('xy++ (.*), [teste');
  assert.equal(pp.bloqueia('Produto qualquer'), false);
  assert.equal(pp.bloqueia('Curso XY avançado'), true);
  assert.equal(pp.bloqueia('Kit teste completo'), true);
});

test('a tela de configurações não mexe na lista', () => {
  const antes = settings.get(pp.CHAVE);
  assert.deepEqual(settings.updateFromAdmin({ [pp.CHAVE]: 'outra coisa' }), []);
  assert.equal(settings.get(pp.CHAVE), antes);
});
