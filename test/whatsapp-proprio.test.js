// API própria de WhatsApp com um WhatsApp simulado: QR code, recebimento, envio, queda de conexão e saída da conta.
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ofertou-wa-'));
const proprio = require('../src/whatsapp-proprio');
const whatsapp = require('../src/whatsapp');
const settings = require('../src/settings');
const db = require('../src/db');

const espera = ms => new Promise(r => setTimeout(r, ms));
async function ate(condicao) {
  for (let i = 0; i < 100; i++) { if (condicao()) return; await espera(10); }
  assert.fail('a condição não aconteceu a tempo');
}

function simulado() {
  const ev = new EventEmitter();
  const s = {
    ev, enviados: [], encerrado: false, user: { id: '5511999990000:7@s.whatsapp.net', name: 'Teste' },
    end() { s.encerrado = true; },
    async logout() { s.saiu = true; },
    async groupFetchAllParticipating() { return { '120363000000000001@g.us': { id: '120363000000000001@g.us', subject: 'Ofertas', size: 42 } }; },
    async onWhatsApp(j) { return [j.startsWith('5500') ? { exists: false } : { exists: true, jid: j }]; },
    async sendMessage(jid, conteudo) {
      s.enviados.push({ jid, conteudo });
      return { key: { id: `E${s.enviados.length}`, remoteJid: jid, fromMe: true }, message: { conversation: conteudo.text || conteudo.caption || '' }, messageTimestamp: Math.floor(Date.now() / 1000) };
    },
  };
  return s;
}
const criados = [];
let pareado = false;
proprio._paraTestes({ intervalo: 0, criar: async () => { const s = simulado(); criados.push(s); return { sock: s, saveCreds: () => {}, pareado: () => pareado }; } });
const atual = () => criados[criados.length - 1];
const entrante = (id, chat, texto) => ({ key: { id, remoteJid: chat, fromMe: false }, pushName: 'Ana', message: { conversation: texto }, messageTimestamp: Math.floor(Date.now() / 1000) });

test('endereços de grupo e de celular em qualquer formato', () => {
  assert.equal(proprio.paraJid('120363000000000001@g.us'), '120363000000000001@g.us');
  assert.equal(proprio.paraJid('120363000000000001-group'), '120363000000000001@g.us');
  assert.equal(proprio.paraJid('5511999990000-1600000000'), '5511999990000-1600000000@g.us');
  assert.equal(proprio.paraJid('+55 (11) 99999-0000'), '5511999990000@s.whatsapp.net');
  assert.throws(() => proprio.paraJid('abc'));
});

test('lê texto, legenda e mensagens embrulhadas e ignora o que não é conversa', () => {
  const ler = (message, remoteJid = '1@s.whatsapp.net') => proprio.lerMensagem({ key: { id: 'A', remoteJid }, message });
  assert.equal(ler({ extendedTextMessage: { text: 'oi' } }).texto, 'oi');
  assert.deepEqual([ler({ imageMessage: { caption: 'foto' } }).tipo, ler({ imageMessage: { caption: 'foto' } }).texto], ['imagem', 'foto']);
  assert.equal(ler({ ephemeralMessage: { message: { conversation: 'some' } } }).texto, 'some');
  assert.equal(ler({ reactionMessage: { text: '👍' } }), null);
  assert.equal(ler({ conversation: 'x' }, 'status@broadcast'), null);
});

test('sem conexão, o envio avisa em vez de fingir que foi', async () => {
  await assert.rejects(proprio.enviar('120363000000000001@g.us', { texto: 'oi' }), /não está conectado/);
});

test('QR code, conexão e escolha do serviço depois de ler', async () => {
  settings.set('whatsapp_provider', 'zapi');
  await proprio.conectar();
  atual().ev.emit('connection.update', { qr: 'codigo-de-teste' });
  await ate(() => proprio.status().fase === 'qr');
  assert.match(proprio.status().qr, /^data:image\/png;base64,/);
  assert.equal(settings.get('whatsapp_provider'), 'zapi', 'só troca o serviço depois de ler o QR code');
  pareado = true;
  atual().ev.emit('connection.update', { connection: 'open' });
  await ate(() => proprio.status().conectado);
  assert.equal(proprio.status().numero, '5511999990000');
  assert.equal(proprio.status().qr, null);
  assert.equal(settings.get('whatsapp_provider'), 'proprio');
});

test('o serviço de WhatsApp do site passa a usar a API própria', async () => {
  const s = settings.getAll();
  assert.deepEqual(await whatsapp.status(s), { conectado: true, mensagem: 'Número conectado.' });
  assert.deepEqual(await whatsapp.listarGrupos(s), [{ id: '120363000000000001@g.us', nome: 'Ofertas' }]);
  assert.equal((await whatsapp.tamanhoGrupos(s, ['120363000000000001@g.us'])).get('120363000000000001@g.us'), 42);
  await whatsapp.enviar(s, '120363000000000001-group', { texto: 'promoção' });
  assert.deepEqual(atual().enviados.at(-1), { jid: '120363000000000001@g.us', conteudo: { text: 'promoção' } });
  assert.match(whatsapp.config({ whatsapp_provider: 'proprio', cliente_id: 9 }).erro, /só para o número do site/);
});

test('envia foto como JPEG com legenda', async () => {
  const png = await require('sharp')({ create: { width: 4, height: 4, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  await proprio.enviar('120363000000000001@g.us', { imagem: png, texto: 'legenda' });
  const { conteudo } = atual().enviados.at(-1);
  assert.equal(conteudo.caption, 'legenda');
  assert.equal(conteudo.image[0], 0xff, 'começa como JPEG');
});

test('confere o número de celular antes de enviar', async () => {
  await assert.rejects(proprio.enviar('5500999990000', { texto: 'oi' }), /não tem WhatsApp/);
  await proprio.enviar('5511988887777', { texto: 'oi' });
  assert.equal(atual().enviados.at(-1).jid, '5511988887777@s.whatsapp.net');
});

test('envia um de cada vez, respeitando o intervalo', async () => {
  proprio._paraTestes({ intervalo: 60 });
  const inicio = Date.now();
  await Promise.all([1, 2, 3].map(n => proprio.enviar('120363000000000001@g.us', { texto: `n${n}` })));
  assert.ok(Date.now() - inicio >= 120);
  assert.deepEqual(atual().enviados.slice(-3).map(e => e.conteudo.text), ['n1', 'n2', 'n3']);
  proprio._paraTestes({ intervalo: 0 });
});

test('guarda o que chega e o que sai, sem repetir', () => {
  const chat = '5511977776666@s.whatsapp.net';
  atual().ev.emit('messages.upsert', { type: 'notify', messages: [entrante('M1', chat, 'olá'), entrante('M1', chat, 'olá')] });
  const lista = proprio.mensagens({ chat });
  assert.equal(lista.length, 1);
  assert.equal(lista[0].autor, 'Ana');
  assert.equal(proprio.mensagens({ chat, depois: lista[0].id }).length, 0);
  atual().ev.emit('messages.upsert', { type: 'notify', messages: [entrante('M2', chat, 'tudo bem?')] });
  assert.deepEqual(proprio.mensagens({ chat, depois: lista[0].id }).map(m => m.texto), ['tudo bem?']);
  const c = proprio.conversas().find(x => x.chat === chat);
  assert.equal(c.nome, 'Ana');
  assert.equal(c.texto, 'tudo bem?');
  assert.ok(proprio.mensagens({ chat: '120363000000000001@g.us' }).some(m => m.de_mim === 1), 'o que foi enviado também aparece');
});

test('mensagem do grupo de automação chega nos comandos; comando velho é ignorado', async () => {
  const grupo = '120363000000000099@g.us';
  settings.set('wa_grupo_controle', grupo);
  const antes = atual().enviados.length;
  atual().ev.emit('messages.upsert', { type: 'notify', messages: [{ ...entrante('V1', grupo, 'ajuda'), messageTimestamp: Math.floor(Date.now() / 1000) - 3600 }] });
  await espera(50);
  assert.equal(atual().enviados.length, antes, 'não responde a comando de uma hora atrás');
  atual().ev.emit('messages.upsert', { type: 'notify', messages: [entrante('C1', grupo, 'ajuda')] });
  await ate(() => atual().enviados.length > antes);
  assert.equal(atual().enviados.at(-1).jid, grupo);
  assert.match(atual().enviados.at(-1).conteudo.text, /grupo de automação/);
  settings.set('wa_grupo_controle', '');
});

test('entradas e saídas dos grupos vão para o monitor de membros', () => {
  settings.set('whatsapp_groups', JSON.stringify([{ id: '120363000000000001@g.us', nome: 'Ofertas' }]));
  atual().ev.emit('group-participants.update', { id: '120363000000000001@g.us', action: 'add', participants: ['a', 'b'] });
  const dia = db.get(`SELECT entradas FROM grupo_membros_dia WHERE grupo = '120363000000000001'`);
  assert.equal(dia.entradas, 2);
});

test('conexão caída tenta de novo; 515 reabre na hora', async () => {
  const n = criados.length;
  atual().ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
  await ate(() => criados.length === n + 1);
  atual().ev.emit('connection.update', { connection: 'open' });
  await ate(() => proprio.status().conectado);
  atual().ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 428 } } } });
  assert.equal(proprio.status().fase, 'reconectando');
  await assert.rejects(proprio.enviar('120363000000000001@g.us', { texto: 'x' }), /não está conectado/);
  await proprio.conectar();
  atual().ev.emit('connection.update', { connection: 'open' });
  await ate(() => proprio.status().conectado);
});

test('bloqueio e sessão aberta em outro lugar não ficam tentando sem parar', async () => {
  for (const [codigo, texto] of [[403, /recusou/], [440, /outro lugar/]]) {
    const n = criados.length;
    atual().ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: codigo } } } });
    assert.equal(proprio.status().fase, 'desligado');
    assert.match(proprio.status().erro, texto);
    await espera(30);
    assert.equal(criados.length, n);
    await proprio.conectar();
    atual().ev.emit('connection.update', { connection: 'open' });
    await ate(() => proprio.status().conectado);
  }
});

test('QR code vencido para e pede para gerar outro', async () => {
  await proprio.desconectar();
  pareado = false;
  await proprio.conectar();
  atual().ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 408 } } } });
  assert.equal(proprio.status().fase, 'desligado');
  assert.match(proprio.status().erro, /venceu/);
});

test('o WhatsApp desconectar o aparelho apaga a sessão salva', async () => {
  pareado = true;
  await proprio.conectar();
  atual().ev.emit('connection.update', { connection: 'open' });
  await ate(() => proprio.status().conectado);
  fs.mkdirSync(proprio.PASTA, { recursive: true });
  fs.writeFileSync(path.join(proprio.PASTA, 'creds.json'), JSON.stringify({ me: { id: 'x' } }));
  assert.equal(proprio.status().sessao_salva, true);
  atual().ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
  assert.equal(proprio.status().fase, 'desligado');
  assert.equal(fs.existsSync(proprio.PASTA), false);
});

test('desconectar sai da conta e apaga sessão e mensagens', async () => {
  await proprio.conectar();
  const s = atual();
  s.ev.emit('connection.update', { connection: 'open' });
  await ate(() => proprio.status().conectado);
  s.ev.emit('messages.upsert', { type: 'notify', messages: [entrante('Z1', '5511966665555@s.whatsapp.net', 'oi')] });
  fs.mkdirSync(proprio.PASTA, { recursive: true });
  fs.writeFileSync(path.join(proprio.PASTA, 'creds.json'), '{"me":{"id":"x"}}');
  await proprio.desconectar();
  assert.equal(s.saiu, true);
  assert.equal(fs.existsSync(proprio.PASTA), false);
  assert.equal(proprio.mensagens({}).length, 0);
  assert.equal(proprio.status().fase, 'desligado');
});

test('apaga as mensagens com mais de 30 dias', () => {
  db.run(`INSERT INTO whatsapp_mensagens (wa_id, chat, tipo, texto, criado_em) VALUES ('V', 'x@g.us', 'texto', 'velha', datetime('now', '-31 days')), ('N', 'x@g.us', 'texto', 'nova', datetime('now', '-29 days'))`);
  proprio.limpar();
  assert.deepEqual(proprio.mensagens({ chat: 'x@g.us' }).map(m => m.texto), ['nova']);
});
