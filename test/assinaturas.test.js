// Planos: períodos de compra, período grátis, renovação automática e troca, com um Mercado Pago falso e um banco temporário.
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const test = require('node:test');
const assert = require('node:assert/strict');

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'ofertou-teste-'));
process.env.DATA_DIR = PASTA;
process.env.DISABLE_MINER = '1';
process.env.DISABLE_AGENDA = '1';

const db = require('../src/db');
assert.ok(db.DB_PATH.startsWith(PASTA), 'os testes só rodam no banco temporário');
const settings = require('../src/settings');
const planos = require('../src/planos');
const pagamentos = require('../src/pagamentos');
const assinaturas = require('../src/assinaturas');
const users = require('../src/users');
const clientes = require('../src/clientes');

// Mercado Pago falso
const MP = { pedidos: [], preapproval: {}, cobrancas: {}, pagamentos: {} };
let servidor;
test.before(async () => {
  servidor = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', d => { corpo += d; });
    req.on('end', () => {
      const dados = corpo ? JSON.parse(corpo) : null;
      const url = new URL(req.url, 'http://x');
      MP.pedidos.push({ metodo: req.method, caminho: url.pathname, dados });
      const manda = (o, st = 200) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.method === 'POST' && url.pathname === '/preapproval') {
        const id = `pre${Object.keys(MP.preapproval).length + 1}xyz`;
        MP.preapproval[id] = { id, ...dados, init_point: `https://mp.test/checkout/${id}` };
        return manda(MP.preapproval[id]);
      }
      let m;
      if ((m = /^\/preapproval\/(.+)$/.exec(url.pathname))) {
        if (req.method === 'PUT') Object.assign(MP.preapproval[m[1]], dados);
        return manda(MP.preapproval[m[1]] || {}, MP.preapproval[m[1]] ? 200 : 404);
      }
      if (url.pathname === '/authorized_payments/search') return manda({ results: MP.cobrancas[url.searchParams.get('preapproval_id')] || [] });
      if ((m = /^\/v1\/payments\/(.+)$/.exec(url.pathname))) return manda(MP.pagamentos[m[1]] || {}, MP.pagamentos[m[1]] ? 200 : 404);
      manda({ id: 1 });
    });
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  process.env.MP_API_URL = `http://127.0.0.1:${servidor.address().port}`;
  settings.set('mp_access_token', 'TESTE');
  settings.set('site_url', 'https://site.test');
});
test.after(() => { servidor?.close(); try { db.db.close(); } catch { /* */ } try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch { /* */ } });

const req = (cookie = '') => ({ headers: { cookie }, ip: '1.1.1.1', get: () => '', protocol: 'https', cookies: {} });
const ACEITES = { aceite_privacidade: true, aceite_termos: true, aceite_afiliado: true, aceite_lojista: true };
let n = 0;
function cpfValido() {
  const base = String(100000000 + (++n * 7919)).slice(0, 9).split('').map(Number);
  const dv = arr => { const s = arr.reduce((t, d, i) => t + d * (arr.length + 1 - i), 0) % 11; return s < 2 ? 0 : 11 - s; };
  const d1 = dv(base), d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}
const novoAfiliado = (extra = {}) => ({ plano: 'pro', email: `a${++n}@exemplo.test`, senha: 'Senha!Forte9x', senha_confirmacao: 'Senha!Forte9x', nome: 'Pessoa Teste', cpf: cpfValido(), telefone: '11999998888', ...ACEITES, ...extra });
const pedido = token => db.get('SELECT * FROM pagamentos WHERE token = ?', token);
const pro = () => planos.plano('pro'), loja = () => planos.plano('empresa');
const ciclo = (p, id) => p.ciclos.find(c => c.id === id);

test('preços de lançamento e períodos de compra', () => {
  assert.equal(pro().preco, 59.9);
  assert.ok(pro().preco <= 60, 'afiliado não passa de 60 reais');
  assert.deepEqual(pro().ciclos.map(c => [c.id, c.dias, c.preco]), [['mensal', 30, 59.9], ['trimestral', 90, 159.9], ['anual', 365, 599]]);
  assert.deepEqual(loja().ciclos.map(c => [c.id, c.dias, c.preco]), [['mensal', 30, 39.9], ['trimestral', 90, 107.9], ['anual', 365, 399]]);
  assert.ok(ciclo(pro(), 'anual').por_mes < 60 && ciclo(pro(), 'trimestral').por_mes < 60);
  assert.equal(ciclo(pro(), 'mensal').preco_auto, 53.91);
  db.run(`UPDATE planos SET preco = 0, dias = 0 WHERE id = 'consumidor'`); // como no site: o Caçador é grátis
  assert.equal(planos.plano('consumidor').gratis, true);
  assert.deepEqual(planos.plano('consumidor').ciclos, []);
  assert.equal(assinaturas.cortesia(planos.plano('consumidor'), []), null);
});

test('o preço editado no painel não volta sozinho', () => {
  db.run('UPDATE planos SET preco = 69.9 WHERE id = ?', 'pro');
  delete require.cache[require.resolve('../src/planos')];
  assert.equal(require('../src/planos').plano('pro').preco, 69.9);
  db.run('UPDATE planos SET preco = 59.9 WHERE id = ?', 'pro');
});

test('painel: edita períodos, dias grátis e desconto; deixar em branco tira o período', () => {
  const p = pro();
  const base = { nome: p.nome, tipos: p.tipos, preco: '59,90', dias: 30, ativo: true, beneficios: p.beneficios, perfil: p.recursos.perfil };
  let e = planos.editar('pro', { ...base, preco_trimestral: '149,90', preco_anual: '', teste_dias: 5, desconto_auto: 15 });
  assert.deepEqual(e.ciclos.map(c => c.id), ['mensal', 'trimestral']);
  assert.deepEqual([e.teste_dias, e.desconto_auto], [5, 15]);
  e = planos.editar('pro', base); // sem os campos: fica como estava
  assert.equal(ciclo(e, 'trimestral').preco, 149.9);
  e = planos.editar('pro', { ...base, preco_trimestral: '159,90', preco_anual: '599', teste_dias: 7, desconto_auto: 10 });
  assert.equal(ciclo(e, 'anual').preco, 599);
  assert.throws(() => planos.editar('pro', { ...base, preco_anual: 'abc' }), /trimestral ou anual/);
});

test('7 dias grátis: libera sem pagamento e só uma vez por pessoa', async () => {
  const b = novoAfiliado({ teste: true });
  const { token } = await pagamentos.criarPedido(b, req());
  const p = pedido(token);
  assert.deepEqual([p.status, p.valor, p.metodo, p.dias], ['aprovado', 0, 'teste', 7]);
  const c = clientes.getById(p.conta_id);
  assert.equal(c.plano, 'pro');
  const dias = (new Date(`${c.validade.replace(' ', 'T')}Z`) - Date.now()) / 86400000;
  assert.ok(dias > 6.9 && dias < 7.1, `validade em ${dias} dias`);
  await assert.rejects(pagamentos.criarPedido({ ...novoAfiliado({ teste: true }), cpf: b.cpf }, req()), /já foi usado/);
  await assert.rejects(pagamentos.criarPedido({ ...b, renovar: true }, req()), /já foi usado|já tem/);
});

test('quem já pagou o plano não ganha período grátis', async () => {
  const b = novoAfiliado({ metodo: 'mercadopago' });
  const { token } = await pagamentos.criarPedido(b, req());
  pagamentos.aprovar(pedido(token).id, 'teste');
  assert.equal(assinaturas.cortesia(pro(), [b.email]), null);
});

test('período escolhido define valor e dias, e o preço não vem do navegador', async () => {
  const { token } = await pagamentos.criarPedido(novoAfiliado({ metodo: 'mercadopago', ciclo: 'anual', preco: 1, valor: 1 }), req());
  const p = pedido(token);
  assert.deepEqual([p.valor, p.dias, p.ciclo, p.renovacao_auto], [599, 365, 'anual', 0]);
  const mens = await pagamentos.criarPedido(novoAfiliado({ metodo: 'mercadopago', ciclo: 'inventado' }), req());
  assert.deepEqual([pedido(mens.token).valor, pedido(mens.token).dias], [59.9, 30]);
});

test('1 mês grátis só para as 20 primeiras lojas', () => {
  assert.deepEqual(assinaturas.cortesia(loja(), []), { tipo: 'loja_mes', dias: 30, restantes: 20 });
  for (let i = 0; i < 20; i++) assinaturas.registrarCortesia([`loja${i}@x.test`], 'empresa', 'loja_mes', 9000 + i);
  assert.equal(assinaturas.lojasGratisRestantes(), 0);
  assert.deepEqual(assinaturas.cortesia(loja(), []), { tipo: 'teste', dias: 7 });
  assert.deepEqual(assinaturas.cortesia(pro(), []), { tipo: 'teste', dias: 7 });
});

test('renovação automática: desconto, autorização no Mercado Pago e cobranças conferidas', async () => {
  await assert.rejects(pagamentos.criarPedido(novoAfiliado({ metodo: 'mercadopago', renovacao_auto: false, teste: false, ciclo: 'mensal', ...{ metodo: 'pix' }, renovacao_auto: true }), req()), /só no cartão/);
  const r = await pagamentos.criarPedido(novoAfiliado({ metodo: 'mercadopago', renovacao_auto: true, ciclo: 'trimestral' }), req());
  assert.match(r.checkout_url, /mp\.test/);
  const p = pedido(r.token);
  assert.deepEqual([p.status, p.metodo, p.valor, p.dias, p.renovacao_auto], ['pendente', 'assinatura', 143.91, 90, 1]);
  const pre = MP.preapproval[p.mp_preference_id];
  assert.deepEqual(pre.auto_recurring, { frequency: 3, frequency_type: 'months', transaction_amount: 143.91, currency_id: 'BRL' });
  assert.equal(pre.status, 'pending');
  assert.equal(pre.external_reference, r.token);

  // Autorizou, mas sem cobrança aprovada: não libera
  await pagamentos.verificar(p);
  assert.equal(pedido(r.token).status, 'pendente');

  // Valor diferente: não libera
  MP.pagamentos[7001] = { id: 7001, status: 'approved', transaction_amount: 1 };
  MP.cobrancas[pre.id] = [{ id: 1, payment: { id: 7001, status: 'approved' } }];
  await pagamentos.verificar(pedido(r.token));
  assert.equal(pedido(r.token).status, 'pendente');

  // Primeira cobrança aprovada: libera 90 dias
  MP.pagamentos[7002] = { id: 7002, status: 'approved', transaction_amount: 143.91 };
  MP.cobrancas[pre.id] = [{ id: 2, payment: { id: 7002, status: 'approved' } }];
  await pagamentos.verificar(pedido(r.token));
  const ok = pedido(r.token);
  assert.equal(ok.status, 'aprovado');
  assert.equal(clientes.getById(ok.conta_id).plano, 'pro');
  const a = db.get('SELECT * FROM assinaturas_auto WHERE token = ?', r.token);
  assert.deepEqual([a.status, a.conta_tipo, a.conta_id], ['ativa', 'cliente', ok.conta_id]);
  const v1 = clientes.getById(ok.conta_id).validade;

  // Conferir de novo não soma de novo
  await assinaturas.conferirTodas();
  assert.equal(clientes.getById(ok.conta_id).validade, v1);

  // Segunda cobrança: renova sozinho, pelo aviso do Mercado Pago, somando 90 dias
  MP.pagamentos[7003] = { id: 7003, status: 'approved', transaction_amount: 143.91 };
  MP.cobrancas[pre.id].push({ id: 3, payment: { id: 7003, status: 'approved' } });
  await pagamentos.webhook({ type: 'subscription_preapproval', data: { id: pre.id } }, {});
  const v2 = clientes.getById(ok.conta_id).validade;
  const somou = (new Date(`${v2.replace(' ', 'T')}Z`) - new Date(`${v1.replace(' ', 'T')}Z`)) / 86400000;
  assert.ok(Math.abs(somou - 90) < 0.01, `somou ${somou}`);
  assert.equal(db.get(`SELECT COUNT(*) n FROM pagamentos WHERE plano = 'pro' AND metodo = 'assinatura' AND status = 'aprovado' AND conta_id = ?`, ok.conta_id).n, 2);

  // Aviso com outro número não aprova nada
  await pagamentos.webhook({ type: 'subscription_preapproval', data: { id: 'naoexiste1' } }, {});

  // Desligar: para no Mercado Pago e o acesso continua até o fim
  await assert.rejects(assinaturas.desligar(a.id, null, { id: ok.conta_id + 999 }), /não encontrada/);
  await assinaturas.desligar(a.id, null, clientes.getById(ok.conta_id));
  assert.equal(MP.preapproval[pre.id].status, 'cancelled');
  assert.equal(clientes.getById(ok.conta_id).validade, v2);
  assert.equal(db.get('SELECT status FROM assinaturas_auto WHERE id = ?', a.id).status, 'cancelada');
});

test('assinatura cancelada no Mercado Pago antes de pagar cancela o pedido', async () => {
  const r = await pagamentos.criarPedido(novoAfiliado({ metodo: 'mercadopago', renovacao_auto: true }), req());
  const p = pedido(r.token);
  MP.preapproval[p.mp_preference_id].status = 'cancelled';
  await pagamentos.verificar(p);
  assert.equal(pedido(r.token).status, 'cancelado');
});

// Conta do site logada, para os testes de adicionar e trocar
function contaLogada({ tipo = 'consumidor', extra = {} } = {}) {
  const email = `c${++n}@exemplo.test`;
  const id = Number(db.run(`INSERT INTO users (email, nome, senha_hash, status, tipo, plano, assinatura_ate, cpf, telefone) VALUES (?, 'Conta Teste', 'x', 'active', ?, ?, ?, ?, '11999990000')`,
    email, tipo, extra.plano || null, extra.ate || null, cpfValido()).lastInsertRowid);
  return users.getById(id);
}
function logar(u) {
  const antes = users.currentUser;
  users.currentUser = () => users.getById(u.id);
  return () => { users.currentUser = antes; };
}
const EMPRESA = { empresa_tipo: 'pj', cnpj: '11222333000181', razao_social: 'Loja Teste Ltda', empresa_nome: 'Loja Teste', telefone_empresa: '1133334444', ramo: null, mesmo_endereco: false,
  emp_cep: '01001000', emp_logradouro: 'Praça da Sé', emp_numero: '1', emp_bairro: 'Sé', emp_cidade: 'São Paulo', emp_uf: 'SP' };
const ramo = () => require('../src/cadastro').RAMOS[0];

test('adicionar outro plano: consumidor vira loja e ganha a ferramenta no mesmo login', async () => {
  const u = contaLogada();
  const volta = logar(u);
  try {
    const a = await pagamentos.criarPedido({ plano: 'empresa', metodo: 'pix', ciclo: 'mensal', ...ACEITES, ...EMPRESA, ramo: ramo() }, req());
    pagamentos.aprovar(pedido(a.token).id, 'teste');
    let conta = users.getById(u.id);
    assert.deepEqual([conta.tipo, conta.plano, conta.cnpj], ['empresa', 'empresa', '11222333000181']);
    const b = await pagamentos.criarPedido({ plano: 'pro', metodo: 'pix', ciclo: 'mensal', ...ACEITES }, req());
    pagamentos.aprovar(pedido(b.token).id, 'teste');
    conta = users.getById(u.id);
    assert.deepEqual([conta.tipo, conta.plano], ['empresa', 'empresa'], 'continua loja');
    assert.equal(clientes.getById(conta.cliente_id).plano, 'pro', 'e também tem a ferramenta');
    assert.deepEqual(assinaturas.meus(conta, null).planos.map(p => p.plano).sort(), ['empresa', 'pro']);
    assert.deepEqual(assinaturas.meus(conta, null).disponiveis, []);
  } finally { volta(); }
});

test('afiliado adiciona a loja sem perder a ferramenta', async () => {
  const u = contaLogada({ tipo: 'consumidor' });
  const volta = logar(u);
  try {
    const a = await pagamentos.criarPedido({ plano: 'pro', metodo: 'pix', ...ACEITES }, req());
    pagamentos.aprovar(pedido(a.token).id, 'teste');
    db.run(`UPDATE users SET tipo = 'afiliado', plano = 'pro', assinatura_ate = datetime('now', '+20 days') WHERE id = ?`, u.id);
    const b = await pagamentos.criarPedido({ plano: 'empresa', metodo: 'pix', ...ACEITES, ...EMPRESA, cnpj: '11444777000161', ramo: ramo() }, req());
    pagamentos.aprovar(pedido(b.token).id, 'teste');
    const conta = users.getById(u.id);
    assert.deepEqual([conta.tipo, conta.plano], ['empresa', 'empresa']);
    assert.equal(clientes.getById(conta.cliente_id).plano, 'pro');
    assert.ok(clientes.getById(conta.cliente_id).validade > new Date().toISOString().replace('T', ' ').slice(0, 19));
  } finally { volta(); }
});

test('trocar de plano: o que falta usar vira dias a mais e o antigo termina', async () => {
  const u = contaLogada();
  const volta = logar(u);
  try {
    const a = await pagamentos.criarPedido({ plano: 'pro', metodo: 'pix', ciclo: 'mensal', ...ACEITES }, req());
    pagamentos.aprovar(pedido(a.token).id, 'teste');
    let conta = users.getById(u.id);
    // Meio mês usado
    db.run(`UPDATE clientes SET validade = datetime('now', '+15 days') WHERE id = ?`, conta.cliente_id);
    conta = users.getById(u.id);
    const t = await pagamentos.criarPedido({ plano: 'pro', metodo: 'pix', ciclo: 'anual', trocar_de: 'pro', ...ACEITES }, req());
    const p = pedido(t.token);
    assert.equal(p.valor, 599);
    assert.equal(p.trocado_de, 'pro');
    assert.ok(p.dias >= 365 + 18 && p.dias <= 365 + 19, `dias ${p.dias}`); // R$ 29,95 de crédito / (599/365 por dia)
    pagamentos.aprovar(p.id, 'teste');
    const fim = new Date(`${clientes.getById(conta.cliente_id).validade.replace(' ', 'T')}Z`);
    const restam = (fim - Date.now()) / 86400000;
    assert.ok(restam > 382 && restam < 385, 'não soma os 15 dias de novo');
  } finally { volta(); }
});

test('trocar para o mesmo plano e período é recusado; trocar loja por ferramenta tira a loja do ar sem apagar', async () => {
  const u = contaLogada({ tipo: 'empresa' });
  db.run(`UPDATE users SET plano = 'empresa', assinatura_ate = datetime('now', '+20 days') WHERE id = ?`, u.id);
  const lojaId = Number(db.run(`INSERT INTO lojas (user_id, slug, nome) VALUES (?, ?, 'Minha Loja')`, u.id, `minha-loja-${u.id}`).lastInsertRowid);
  const volta = logar(u);
  try {
    await assert.rejects(pagamentos.criarPedido({ plano: 'empresa', metodo: 'pix', ciclo: 'mensal', trocar_de: 'empresa', ...ACEITES }, req()), /já está neste plano/);
    const t = await pagamentos.criarPedido({ plano: 'pro', metodo: 'pix', ciclo: 'mensal', trocar_de: 'empresa', ...ACEITES }, req());
    pagamentos.aprovar(pedido(t.token).id, 'teste');
    const conta = users.getById(u.id);
    assert.deepEqual([conta.tipo, conta.plano], ['afiliado', 'pro']);
    assert.equal(db.get('SELECT oculta FROM lojas WHERE id = ?', lojaId).oculta, 2);
    assert.equal(clientes.getById(conta.cliente_id).plano, 'pro');
    assert.ok(conta.assinatura_ate > new Date().toISOString().replace('T', ' ').slice(0, 19), 'a conta não fica vencida');
  } finally { volta(); }
});

test('não troca plano que não tem', async () => {
  const u = contaLogada();
  const volta = logar(u);
  try {
    await assert.rejects(pagamentos.criarPedido({ plano: 'pro', metodo: 'pix', trocar_de: 'empresa', ...ACEITES }, req()), /não tem esse plano/);
  } finally { volta(); }
  await assert.rejects(pagamentos.criarPedido(novoAfiliado({ metodo: 'pix', trocar_de: 'empresa' }), req()), /Entre na sua conta/);
});

test('troca para de cobrar o plano antigo no Mercado Pago', async () => {
  const u = contaLogada();
  const volta = logar(u);
  try {
    const a = await pagamentos.criarPedido({ plano: 'pro', metodo: 'mercadopago', renovacao_auto: true, ...ACEITES }, req());
    const ped = pedido(a.token);
    const preId = ped.mp_preference_id;
    MP.pagamentos[8001] = { id: 8001, status: 'approved', transaction_amount: ped.valor };
    MP.cobrancas[preId] = [{ id: 9, payment: { id: 8001, status: 'approved' } }];
    await pagamentos.verificar(ped);
    assert.equal(pedido(a.token).status, 'aprovado');
    const t = await pagamentos.criarPedido({ plano: 'pro', metodo: 'pix', ciclo: 'anual', trocar_de: 'pro', ...ACEITES }, req());
    pagamentos.aprovar(pedido(t.token).id, 'teste');
    await new Promise(r => setTimeout(r, 200));
    assert.equal(MP.preapproval[preId].status, 'cancelled');
  } finally { volta(); }
});
