// Funções da API própria pelos endereços, com um WhatsApp simulado: envios, mensagens, conversas, perfil, grupos e ajustes.
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { EventEmitter } = require('events');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ofertou-waf-'));
const express = require('express');
const db = require('../src/db');
const proprio = require('../src/whatsapp-proprio');
const net = require('../src/net');

const G = '120363000000000001@g.us', C = '5511977776666@s.whatsapp.net', EU = '5511999990000@s.whatsapp.net';
const chamadas = [];
const anota = (nome, retorno) => async (...a) => { chamadas.push([nome, ...a]); return typeof retorno === 'function' ? retorno(...a) : retorno; };
function simulado() {
  const ev = new EventEmitter();
  const s = {
    ev, enviados: [], user: { id: '5511999990000:7@s.whatsapp.net', name: 'Teste' },
    end() {}, logout: anota('logout'),
    groupFetchAllParticipating: async () => ({ [G]: { id: G, subject: 'Grupo', owner: EU, participants: [{ id: EU, admin: 'superadmin' }] } }),
    onWhatsApp: async (...js) => js.map(j => (j.startsWith('5500') ? { exists: false, jid: j } : { exists: true, jid: j })),
    sendMessage: async (jid, conteudo, opcoes) => {
      s.enviados.push({ jid, conteudo, opcoes });
      return { key: { id: opcoes.messageId, remoteJid: jid, fromMe: true }, message: conteudo.text ? { conversation: conteudo.text } : { imageMessage: { caption: 'x' } }, messageTimestamp: Math.floor(Date.now() / 1000) };
    },
    readMessages: anota('readMessages'), chatModify: anota('chatModify'), sendPresenceUpdate: anota('presenca'), updateBlockStatus: anota('bloqueio'),
    fetchBlocklist: async () => ['1@s.whatsapp.net', undefined], fetchStatus: async () => [{ status: { status: 'Disponível' } }],
    profilePictureUrl: async () => 'https://pps.whatsapp.net/x.jpg', getBusinessProfile: async () => null,
    updateProfileName: anota('nome'), updateProfileStatus: anota('recado'), updateProfilePicture: anota('foto'), removeProfilePicture: anota('sem-foto'),
    fetchPrivacySettings: async () => ({ last: 'all' }), updateLastSeenPrivacy: anota('visto'), updateGroupsAddPrivacy: anota('add-grupos'),
    groupCreate: anota('criar', (nome) => ({ id: '120363000000000009@g.us', subject: nome })),
    groupMetadata: async id => { if (!id.endsWith('1@g.us')) throw Object.assign(new Error('item-not-found'), { output: { statusCode: 404 } }); return { id, subject: 'Grupo', desc: 'Sobre', owner: EU, size: 2, announce: true, participants: [{ id: EU, admin: 'superadmin' }, { id: C }] }; },
    groupUpdateSubject: anota('assunto'), groupUpdateDescription: anota('descricao'), groupRevokeInvite: async () => 'NOVO', groupInviteCode: async () => 'CODIGO',
    groupParticipantsUpdate: anota('participantes', (j, n, a) => n.map(x => ({ jid: x, status: a === 'add' ? '200' : '200' }))),
    groupSettingUpdate: anota('ajuste'), groupMemberAddMode: anota('modo-add'), groupJoinApprovalMode: anota('aprovacao'), groupToggleEphemeral: anota('temporarias'),
    groupLeave: anota('sair'), groupGetInviteInfo: async () => ({ id: G, subject: 'Convidado', size: 9 }), groupAcceptInvite: anota('aceitar', () => G),
    addChatLabel: anota('etiqueta+'), removeChatLabel: anota('etiqueta-'), rejectCall: anota('rejeitar'),
    getCatalog: async () => ({ products: [{ id: 'p1' }], nextPageCursor: null }), getCollections: async () => ({ collections: [{ id: 'c1' }] }),
  };
  return s;
}
let s;
proprio._paraTestes({
  intervalo: 0,
  criar: async () => {
    s = simulado();
    return { sock: s, saveCreds: () => {}, pareado: () => true, serializar: m => JSON.stringify(m), baixar: async () => Buffer.from('arquivo') };
  },
});
const original = net.safeGet;
let png;
net.safeGet = async () => ({ status: 200, data: png });

let servidor, base;
const chave = `ofw_${crypto.randomBytes(16).toString('hex')}`;
const pede = async (metodo, caminho, corpo) => {
  const r = await fetch(`${base}/api/wa${caminho}`, { method: metodo, headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, d: await r.json().catch(() => ({})) };
};
const certo = async (metodo, caminho, corpo) => { const x = await pede(metodo, caminho, corpo); assert.equal(x.status, 200, `${caminho}: ${JSON.stringify(x.d)}`); return x.d; };
const entrante = (id, chat, m, extra = {}) => ({ key: { id, remoteJid: chat, fromMe: false, ...extra }, pushName: 'Ana', message: m, messageTimestamp: Math.floor(Date.now() / 1000) });
const fez = nome => chamadas.filter(c => c[0] === nome).at(-1);

test.before(async () => {
  png = await require('sharp')({ create: { width: 10, height: 10, channels: 3, background: '#0a0' } }).png().toBuffer();
  const app = express();
  app.use(require('../src/routes/whatsapp-api'));
  await new Promise(ok => { servidor = app.listen(0, ok); });
  base = `http://127.0.0.1:${servidor.address().port}`;
  db.run('INSERT INTO whatsapp_api_chaves (dono, hash) VALUES (?, ?)', 'site', crypto.createHash('sha256').update(chave).digest('hex'));
  await proprio.conectar('site');
  s.ev.emit('connection.update', { connection: 'open' });
  for (let i = 0; i < 100 && !proprio.status('site').conectado; i++) await new Promise(r => setTimeout(r, 10));
  await proprio.carregarGrupos('site');
});
test.after(() => { net.safeGet = original; servidor.close(); });

test('sem conexão, sem chave ou com dado errado a API responde com o motivo', async () => {
  assert.equal((await fetch(`${base}/api/wa/enviar/texto`, { method: 'POST' })).status, 401);
  assert.equal((await pede('POST', '/enviar/texto', { para: 'abc', texto: 'x' })).status, 400);
  assert.equal((await pede('POST', '/enviar/texto', { para: C })).status, 400);
  assert.equal((await pede('POST', '/enviar/midia', { para: C, tipo: 'virus', url: 'https://a.test/x' })).status, 400);
  assert.equal((await pede('POST', '/enviar/localizacao', { para: C, latitude: 200, longitude: 0 })).status, 400);
  assert.equal((await pede('POST', '/enviar/contato', { para: C, contatos: [{ nome: 'A', telefone: '1' }] })).status, 400);
  assert.equal((await pede('POST', '/enviar/enquete', { para: C, pergunta: 'p', opcoes: ['só uma'] })).status, 400);
  assert.equal((await pede('POST', '/mensagens/apagar', { chat: C, id: 'naoexiste' })).status, 404);
  assert.equal((await pede('PUT', '/privacidade', { invente: 'all' })).status, 400);
  assert.equal((await pede('PUT', '/privacidade', { visto_por_ultimo: 'talvez' })).status, 400);
  assert.equal((await pede('PUT', '/ajustes', { invente: true })).status, 400);
  // Erro do WhatsApp volta com o código dele, sem virar defeito do site
  assert.equal((await pede('GET', '/grupos/120363000000000008@g.us')).status, 404);
  // A chave não conecta nem desconecta
  for (const p of ['/conectar', '/desconectar', '/reiniciar']) assert.equal((await pede('POST', p)).status, 404, p);
});

test('enviar texto com menção, resposta e todos do grupo', async () => {
  s.ev.emit('messages.upsert', { type: 'notify', messages: [entrante('R1', C, { conversation: 'pergunta' })] });
  await certo('POST', '/enviar/texto', { para: C, texto: 'resposta', responder_a: 'R1', mencionar: ['5511988887777'] });
  const e = s.enviados.at(-1);
  assert.equal(e.conteudo.text, 'resposta');
  assert.deepEqual(e.conteudo.mentions, ['5511988887777@s.whatsapp.net']);
  assert.equal(e.opcoes.quoted.key.id, 'R1');
  await certo('POST', '/enviar/texto', { para: G, texto: 'aviso', mencionar_todos: true });
  assert.deepEqual(s.enviados.at(-1).conteudo.mentions, [EU, C]);
  assert.equal((await pede('POST', '/enviar/texto', { para: C, texto: 'x', mencionar_todos: true })).status, 400);
});

test('enviar mídia, áudio, figurinha, localização, contato, enquete e reação', async () => {
  const b64 = Buffer.from('conteudo').toString('base64');
  await certo('POST', '/enviar/midia', { para: G, tipo: 'documento', base64: b64, nome: 'lista.pdf', mimetype: 'application/pdf', legenda: 'veja' });
  assert.deepEqual([s.enviados.at(-1).conteudo.fileName, s.enviados.at(-1).conteudo.mimetype, s.enviados.at(-1).conteudo.caption], ['lista.pdf', 'application/pdf', 'veja']);
  await certo('POST', '/enviar/midia', { para: G, tipo: 'video', url: 'https://a.test/v.mp4' });
  assert.ok(s.enviados.at(-1).conteudo.video);
  await certo('POST', '/enviar/midia', { para: G, tipo: 'imagem', base64: png.toString('base64') });
  assert.ok(s.enviados.at(-1).conteudo.image);

  const voz = await certo('POST', '/enviar/audio', { para: C, base64: Buffer.from('OggS....').toString('base64') });
  assert.equal(voz.gravacao_de_voz, true);
  assert.equal(s.enviados.at(-1).conteudo.ptt, true);
  const mp3 = await certo('POST', '/enviar/audio', { para: C, base64: Buffer.from('ID3....').toString('base64') });
  assert.equal(mp3.gravacao_de_voz, false, 'sem conversão, sai como arquivo de áudio');
  assert.equal(s.enviados.at(-1).conteudo.ptt, false);
  await certo('POST', '/enviar/nota-de-video', { para: C, base64: b64 });
  assert.equal(s.enviados.at(-1).conteudo.ptv, true);

  await certo('POST', '/enviar/figurinha', { para: C, base64: png.toString('base64') });
  assert.equal(s.enviados.at(-1).conteudo.sticker.subarray(8, 12).toString(), 'WEBP');

  await certo('POST', '/enviar/localizacao', { para: C, latitude: -23.5, longitude: -46.6, nome: 'Loja' });
  assert.equal(s.enviados.at(-1).conteudo.location.degreesLatitude, -23.5);

  await certo('POST', '/enviar/contato', { para: C, contatos: [{ nome: 'Ana\nEND:VCARD', telefone: '+55 11 98888-7777' }] });
  const v = s.enviados.at(-1).conteudo.contacts.contacts[0].vcard;
  assert.match(v, /waid=5511988887777:\+5511988887777/);
  assert.equal(v.split(/\n/).filter(l => l === 'END:VCARD').length, 1, 'quebra de linha no nome não cria outro campo');

  await certo('POST', '/enviar/enquete', { para: G, pergunta: 'Qual?', opcoes: ['A', 'B'], escolhas: 5 });
  assert.deepEqual(s.enviados.at(-1).conteudo.poll, { name: 'Qual?', values: ['A', 'B'], selectableCount: 2 });

  await certo('POST', '/enviar/reacao', { chat: C, id: 'R1', emoji: '👍' });
  assert.deepEqual(s.enviados.at(-1).conteudo.react, { text: '👍', key: { remoteJid: C, id: 'R1', fromMe: false } });
});

test('status do WhatsApp diz quem vê e não vira conversa', async () => {
  const r = await certo('POST', '/enviar/status', { texto: 'Novidade', destinatarios: ['5511988887777'] });
  assert.equal(r.destinatarios, 1);
  const e = s.enviados.at(-1);
  assert.equal(e.jid, 'status@broadcast');
  assert.deepEqual(e.opcoes.statusJidList, ['5511988887777@s.whatsapp.net']);
  assert.ok(!proprio.conversas('site').some(c => /broadcast/.test(c.chat)));
  assert.equal((await pede('POST', '/enviar/status', { texto: 'x' })).status, 400);
  s.ev.emit('contacts.upsert', [{ id: C, name: 'Ana' }, { id: '123@lid', name: 'Só LID' }]);
  assert.deepEqual(s.enviados.length && (await certo('POST', '/enviar/status', { texto: 'y', todos_contatos: true })).destinatarios >= 1, true);
  assert.ok(s.enviados.at(-1).opcoes.statusJidList.every(j => j.endsWith('@s.whatsapp.net')));
});

test('ler, apagar, editar, entrega e baixar mídia', async () => {
  await certo('POST', '/mensagens/lidas', { chat: C, ids: ['R1'] });
  assert.equal(fez('readMessages')[1][0].id, 'R1');

  const { id } = await certo('POST', '/enviar/texto', { para: C, texto: 'original' });
  await certo('POST', '/mensagens/editar', { chat: C, id, texto: 'corrigido' });
  assert.deepEqual(s.enviados.at(-1).conteudo.edit.id, id);
  assert.ok(proprio.mensagens('site', { chat: C, busca: 'corrigido' }).some(m => m.wa_id === id));
  assert.equal((await pede('POST', '/mensagens/editar', { chat: C, id: 'R1', texto: 'x' })).status, 400, 'mensagem de outra pessoa');

  s.ev.emit('messages.update', [{ key: { remoteJid: C, id }, update: { status: 4 } }]);
  assert.equal((await certo('GET', `/mensagens?chat=${C}&busca=corrigido`)).mensagens[0].entrega, 'lida');

  await certo('POST', '/mensagens/apagar', { chat: C, id });
  assert.equal(s.enviados.at(-1).conteudo.delete.id, id);

  // Em grupo, apagar a mensagem de outra pessoa usa o autor dela
  s.ev.emit('messages.upsert', { type: 'notify', messages: [entrante('G1', G, { conversation: 'spam' }, { participant: C })] });
  await certo('POST', '/mensagens/apagar', { chat: G, id: 'G1' });
  assert.equal(s.enviados.at(-1).conteudo.delete.participant, C);

  s.ev.emit('messages.upsert', { type: 'notify', messages: [entrante('F1', C, { imageMessage: { caption: 'foto', mimetype: 'image/jpeg', fileLength: 7 } })] });
  const lista = (await certo('GET', `/mensagens?chat=${C}`)).mensagens;
  assert.equal(lista.find(m => m.wa_id === 'F1').tem_arquivo, 1);
  assert.equal(lista[0].bruta, undefined, 'a referência da mídia não sai na lista');
  const midia = await certo('POST', '/mensagens/midia', { chat: C, id: 'F1' });
  assert.equal(Buffer.from(midia.base64, 'base64').toString(), 'arquivo');
  assert.equal(midia.mimetype, 'image/jpeg');
  assert.equal((await pede('POST', '/mensagens/midia', { chat: C, id: 'R1' })).status, 404, 'texto não tem arquivo');
});

test('conversas, presença, números, contatos e bloqueios', async () => {
  await certo('POST', '/conversas/arquivar', { chat: C });
  assert.equal(fez('chatModify')[1].archive, true);
  assert.ok(fez('chatModify')[1].lastMessages[0].messageTimestamp > 0);
  await certo('POST', '/conversas/nao-lida', { chat: C, nao_lida: true });
  assert.equal(fez('chatModify')[1].markRead, false);
  assert.equal((await pede('POST', '/conversas/arquivar', { chat: '5511900001111' })).status, 409, 'sem mensagem guardada');

  await certo('POST', '/presenca', { para: C, tipo: 'composing' });
  assert.deepEqual(fez('presenca').slice(1), ['composing', C]);
  assert.equal((await pede('POST', '/presenca', { tipo: 'dançando' })).status, 400);

  const { numeros } = await certo('POST', '/numeros', { numeros: ['5511977776666', '5500999990000'] });
  assert.deepEqual(numeros.map(n => n.existe), [true, false]);
  assert.ok((await certo('GET', '/contatos?busca=Ana')).contatos.some(c => c.jid === C));

  await certo('POST', '/bloqueios', { numero: '5511977776666' });
  assert.deepEqual(fez('bloqueio').slice(1), [C, 'block']);
  await certo('POST', '/bloqueios', { numero: '5511977776666', bloquear: false });
  assert.equal(fez('bloqueio')[2], 'unblock');
  assert.deepEqual((await certo('GET', '/bloqueios')).bloqueados, ['1@s.whatsapp.net']);
  assert.equal((await pede('POST', '/bloqueios', { numero: G })).status, 400, 'grupo não se bloqueia');
});

test('perfil e privacidade', async () => {
  const eu = await certo('GET', '/perfil');
  assert.deepEqual([eu.jid, eu.recado, eu.foto_url], [EU, 'Disponível', 'https://pps.whatsapp.net/x.jpg']);
  await certo('PUT', '/perfil', { nome: 'Ofertou', recado: 'Promoções' });
  assert.equal(fez('nome')[1], 'Ofertou');
  assert.equal(fez('recado')[1], 'Promoções');
  assert.equal((await pede('PUT', '/perfil', {})).status, 400);
  await certo('PUT', '/perfil/foto', { base64: png.toString('base64') });
  assert.equal(fez('foto')[1], EU);
  await certo('DELETE', '/perfil/foto');
  assert.equal(fez('sem-foto')[1], EU);
  assert.deepEqual(await certo('GET', '/privacidade'), { last: 'all' });
  await certo('PUT', '/privacidade', { visto_por_ultimo: 'none', adicionar_em_grupos: 'contacts' });
  assert.equal(fez('visto')[1], 'none');
  assert.equal(fez('add-grupos')[1], 'contacts');
});

test('administração de grupos', async () => {
  const novo = await certo('POST', '/grupos', { nome: 'Novo', participantes: ['5511977776666'] });
  assert.equal(novo.nome, 'Novo');
  assert.deepEqual(fez('criar').slice(1), ['Novo', [C]]);
  const d = await certo('GET', `/grupos/${G}`);
  assert.deepEqual([d.nome, d.descricao, d.so_admins_falam, d.participantes.length], ['Grupo', 'Sobre', true, 2]);
  await certo('PUT', `/grupos/${G}`, { nome: 'Outro', descricao: 'Texto' });
  assert.deepEqual([fez('assunto')[2], fez('descricao')[2]], ['Outro', 'Texto']);
  await certo('PUT', `/grupos/${G}/foto`, { base64: png.toString('base64') });
  assert.equal(fez('foto')[1], G);
  assert.equal((await certo('POST', `/grupos/${G}/convite/novo`)).link, 'https://chat.whatsapp.com/NOVO');
  const conv = await certo('POST', `/grupos/${G}/convite/enviar`, { numeros: ['5511977776666', '5500999990000'], texto: 'Entra aí' });
  assert.deepEqual(conv.resultados.map(r => r.ok), [true, false]);
  assert.match(s.enviados.at(-1).conteudo.text, /Entra aí\n\nhttps:\/\/chat\.whatsapp\.com\/CODIGO/);
  await certo('POST', `/grupos/${G}/participantes`, { acao: 'promover', numeros: ['5511977776666'] });
  assert.deepEqual(fez('participantes').slice(1), [G, [C], 'promote']);
  assert.equal((await pede('POST', `/grupos/${G}/participantes`, { acao: 'explodir', numeros: ['5511977776666'] })).status, 400);
  await certo('PUT', `/grupos/${G}/ajustes`, { so_admins_falam: true, so_admins_editam: false, todos_adicionam: false, aprovacao_para_entrar: true, mensagens_temporarias: 604800 });
  assert.equal(fez('modo-add')[2], 'admin_add');
  assert.equal(fez('aprovacao')[2], 'on');
  assert.equal(fez('temporarias')[2], 604800);
  assert.equal((await pede('PUT', `/grupos/${G}/ajustes`, { mensagens_temporarias: 5 })).status, 400);
  assert.equal((await pede('PUT', `/grupos/${C}`, { nome: 'x' })).status, 400, 'número não é grupo');
  assert.equal((await certo('GET', '/convites/ABCDEFGHIJKL')).nome, 'Convidado');
  assert.equal((await pede('GET', '/convites/x')).status, 400);
  assert.equal((await certo('POST', '/convites/https%3A%2F%2Fchat.whatsapp.com%2FABCDEFGHIJKL')).id, G);
  assert.equal(fez('aceitar')[1], 'ABCDEFGHIJKL');
  await certo('DELETE', `/grupos/${G}`);
  assert.equal(fez('sair')[1], G);
});

test('etiquetas e catálogo', async () => {
  s.ev.emit('labels.edit', { id: '5', name: 'Clientes', color: 2 });
  assert.deepEqual((await certo('GET', '/etiquetas')).etiquetas, [{ id: '5', nome: 'Clientes', cor: 2 }]);
  await certo('POST', '/etiquetas', { chat: C, etiqueta: '5' });
  assert.deepEqual(fez('etiqueta+').slice(1), [C, '5']);
  await certo('POST', '/etiquetas', { chat: C, etiqueta: '5', adicionar: false });
  assert.deepEqual(fez('etiqueta-').slice(1), [C, '5']);
  s.ev.emit('labels.edit', { id: '5', deleted: true });
  assert.deepEqual((await certo('GET', '/etiquetas')).etiquetas, []);
  assert.equal((await certo('GET', '/catalogo')).produtos[0].id, 'p1');
  assert.equal((await certo('GET', '/colecoes')).colecoes[0].id, 'c1');
});

test('ajustes: rejeitar chamada, ler mensagens, ler status e sempre online', async () => {
  assert.equal((await certo('GET', '/ajustes')).rejeitar_chamadas, false);
  const antes = s.enviados.length;
  s.ev.emit('call', [{ id: 'CH0', from: C, status: 'offer' }]);
  assert.equal(chamadas.some(c => c[0] === 'rejeitar'), false, 'desligado: não mexe na chamada');

  await certo('PUT', '/ajustes', { rejeitar_chamadas: true, mensagem_chamada: 'Não atendemos ligações.' });
  s.ev.emit('call', [{ id: 'CH1', from: C, status: 'offer' }, { id: 'CH1', from: C, status: 'timeout' }]);
  await new Promise(r => setTimeout(r, 40));
  assert.deepEqual(fez('rejeitar').slice(1), ['CH1', C]);
  assert.equal(chamadas.filter(c => c[0] === 'rejeitar').length, 1);
  assert.equal(s.enviados.length, antes + 1);
  assert.equal(s.enviados.at(-1).conteudo.text, 'Não atendemos ligações.');

  await certo('PUT', '/ajustes', { ler_mensagens: true, ler_status: true });
  s.ev.emit('messages.upsert', { type: 'notify', messages: [entrante('L1', C, { conversation: 'oi' })] });
  assert.equal(fez('readMessages')[1][0].id, 'L1');
  s.ev.emit('messages.upsert', { type: 'notify', messages: [entrante('ST1', 'status@broadcast', { conversation: 'status' }, { participant: C })] });
  assert.equal(fez('readMessages')[1][0].id, 'ST1');
  assert.equal(proprio.linhaMensagem('site', 'status@broadcast', 'ST1'), undefined, 'status não é guardado');

  await certo('PUT', '/ajustes', { sempre_online: true });
  assert.equal(fez('presenca')[1], 'available');
  await certo('PUT', '/ajustes', { sempre_online: false, ler_mensagens: false, ler_status: false, rejeitar_chamadas: false });
  assert.equal(fez('presenca')[1], 'unavailable');
});
