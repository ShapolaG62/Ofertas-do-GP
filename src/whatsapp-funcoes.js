// Funções da API própria além de conectar e postar: outros tipos de mensagem, ações sobre mensagens e conversas, perfil,
// privacidade, administração de grupos, etiquetas e catálogo. Tudo passa pela conexão de cada dono (src/whatsapp-proprio.js).
const db = require('./db');
const net = require('./net');
const proprio = require('./whatsapp-proprio');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const MAX_ARQUIVO = 30 * 1024 * 1024;
const MAX_MIDIA_BAIXADA = 25 * 1024 * 1024;
const sock = dono => proprio.socket(dono);
const jidDe = proprio.paraJid;
const texto = (v, nome, max = 4000) => {
  const t = String(v ?? '').trim();
  if (!t) throw falha(`Informe ${nome}.`);
  if (t.length > max) throw falha(`${nome} passou do limite de ${max} caracteres.`);
  return t;
};
const lista = (v, nome, max = 256) => {
  if (!Array.isArray(v) || !v.length) throw falha(`Informe ${nome} em uma lista.`);
  if (v.length > max) throw falha(`${nome}: no máximo ${max} por vez.`);
  return v;
};
const pessoa = n => {
  const j = jidDe(n);
  if (j.endsWith('@g.us')) throw falha('Informe um número, não um grupo.');
  return j;
};
const grupo = id => {
  const j = jidDe(id);
  if (!j.endsWith('@g.us')) throw falha('Informe o id de um grupo.');
  return j;
};

// Arquivo enviado na chamada: endereço público ou base64
async function arquivoDe({ url, base64 }) {
  if (base64) {
    const b = Buffer.from(String(base64).replace(/^data:[^,]*,/, ''), 'base64');
    if (!b.length) throw falha('O arquivo em base64 está vazio.');
    if (b.length > MAX_ARQUIVO) throw falha('O arquivo passou de 30 MB.', 413);
    return b;
  }
  if (!url) throw falha('Informe o arquivo: url ou base64.');
  const r = await net.safeGet(String(url), { responseType: 'arraybuffer', timeout: 60000, maxContentLength: MAX_ARQUIVO });
  if (r.status !== 200) throw falha(`Não consegui baixar o arquivo (erro ${r.status}).`);
  return Buffer.from(r.data);
}

// ── Mensagens guardadas: a chave que o WhatsApp pede ─────────────────────────
function chaveDe(dono, chat, id) {
  const j = jidDe(chat);
  const m = proprio.linhaMensagem(dono, j, String(id));
  if (!m) throw falha('Mensagem não encontrada. Só as guardadas depois de conectar podem ser usadas aqui.', 404);
  return { chave: { remoteJid: j, id: m.wa_id, fromMe: Boolean(m.de_mim), ...(m.participante ? { participant: m.participante } : {}) }, linha: m };
}
const segundosDe = sql => Math.floor(Date.parse(`${String(sql).replace(' ', 'T')}Z`) / 1000);
function ultimaDaConversa(dono, chat) {
  const m = proprio.ultimaMensagem(dono, chat);
  if (!m) throw falha('Esta conversa ainda não tem mensagem guardada neste servidor.', 409);
  return [{ key: { remoteJid: chat, id: m.wa_id, fromMe: Boolean(m.de_mim), ...(m.participante ? { participant: m.participante } : {}) }, messageTimestamp: segundosDe(m.criado_em) }];
}

// ── Enviar ───────────────────────────────────────────────────────────────────
// Texto com menções e resposta a uma mensagem
async function enviarTexto(dono, b) {
  const para = jidDe(b.para);
  const conteudo = { text: texto(b.texto, 'o texto') };
  const mencoes = Array.isArray(b.mencionar) ? b.mencionar.map(pessoa) : [];
  if (b.mencionar_todos) {
    if (!para.endsWith('@g.us')) throw falha('Mencionar todos só funciona em grupo.');
    const g = await sock(dono).groupMetadata(para);
    mencoes.push(...(g.participants || []).map(p => p.id));
  }
  if (mencoes.length) conteudo.mentions = [...new Set(mencoes)];
  const opcoes = {};
  if (b.responder_a) {
    const { chave, linha } = chaveDe(dono, para, b.responder_a);
    opcoes.quoted = { key: chave, message: { conversation: linha.texto || '' } };
  }
  return proprio.enviarConteudo(dono, para, conteudo, opcoes);
}
const TIPOS_MIDIA = ['imagem', 'video', 'documento'];
async function enviarMidia(dono, b) {
  if (!TIPOS_MIDIA.includes(b.tipo)) throw falha(`Tipo de mídia: ${TIPOS_MIDIA.join(', ')}.`);
  const arquivo = await arquivoDe(b);
  const legenda = b.legenda ? String(b.legenda).slice(0, 4000) : undefined;
  let conteudo;
  if (b.tipo === 'imagem') conteudo = { image: arquivo, caption: legenda };
  else if (b.tipo === 'video') conteudo = { video: arquivo, caption: legenda, ...(b.mimetype ? { mimetype: String(b.mimetype) } : {}) };
  else conteudo = { document: arquivo, caption: legenda, mimetype: String(b.mimetype || 'application/octet-stream'), fileName: String(b.nome || 'arquivo').slice(0, 200) };
  return proprio.enviarConteudo(dono, jidDe(b.para), conteudo);
}
// Mensagem de voz: o WhatsApp só toca como "gravação" o formato OGG/Opus. Outros formatos saem como arquivo de áudio.
async function enviarAudio(dono, b) {
  const arquivo = await arquivoDe(b);
  const ogg = arquivo.subarray(0, 4).toString('latin1') === 'OggS';
  const conteudo = ogg ? { audio: arquivo, ptt: true, mimetype: 'audio/ogg; codecs=opus' } : { audio: arquivo, ptt: false, mimetype: String(b.mimetype || 'audio/mpeg') };
  return { id: await proprio.enviarConteudo(dono, jidDe(b.para), conteudo), gravacao_de_voz: ogg };
}
async function enviarNotaDeVideo(dono, b) {
  return proprio.enviarConteudo(dono, jidDe(b.para), { video: await arquivoDe(b), ptv: true });
}
async function enviarFigurinha(dono, b) {
  const webp = await require('sharp')(await arquivoDe(b)).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp().toBuffer();
  return proprio.enviarConteudo(dono, jidDe(b.para), { sticker: webp });
}
function enviarLocalizacao(dono, b) {
  const lat = Number(b.latitude), lon = Number(b.longitude);
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180) || b.latitude === undefined || b.longitude === undefined) throw falha('Latitude ou longitude inválida.');
  return proprio.enviarConteudo(dono, jidDe(b.para), { location: { degreesLatitude: lat, degreesLongitude: lon, name: b.nome ? String(b.nome).slice(0, 200) : undefined, address: b.endereco ? String(b.endereco).slice(0, 300) : undefined } });
}
const limpaVcard = v => String(v ?? '').replace(/[\r\n;]+/g, ' ').trim();
function enviarContato(dono, b) {
  const contatos = lista(b.contatos, 'os contatos', 20).map(c => {
    const nome = limpaVcard(texto(c?.nome, 'o nome do contato', 200));
    const fone = String(c?.telefone || '').replace(/\D/g, '');
    if (!/^\d{10,15}$/.test(fone)) throw falha(`Telefone inválido no contato ${nome}.`);
    return { displayName: nome, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${nome}\nTEL;type=CELL;waid=${fone}:+${fone}\nEND:VCARD` };
  });
  return proprio.enviarConteudo(dono, jidDe(b.para), { contacts: { displayName: contatos.length === 1 ? contatos[0].displayName : `${contatos.length} contatos`, contacts: contatos } });
}
function enviarEnquete(dono, b) {
  const opcoes = lista(b.opcoes, 'as opções', 12).map(o => texto(o, 'a opção', 100));
  if (opcoes.length < 2) throw falha('A enquete precisa de pelo menos 2 opções.');
  if (new Set(opcoes).size !== opcoes.length) throw falha('As opções da enquete precisam ser diferentes.');
  return proprio.enviarConteudo(dono, jidDe(b.para), { poll: { name: texto(b.pergunta, 'a pergunta', 255), values: opcoes, selectableCount: Math.min(Math.max(Number(b.escolhas) || 1, 1), opcoes.length) } });
}
function enviarReacao(dono, b) {
  const { chave } = chaveDe(dono, b.chat, b.id);
  return proprio.enviarConteudo(dono, chave.remoteJid, { react: { text: String(b.emoji ?? ''), key: chave } }); // emoji vazio tira a reação
}
// Status do WhatsApp: precisa dizer quem vê. todos_contatos: os contatos conhecidos por este servidor.
async function enviarStatus(dono, b) {
  const quem = b.todos_contatos ? proprio.contatos(dono, { limite: 5000 }).map(c => c.jid).filter(j => j.endsWith('@s.whatsapp.net')) : lista(b.destinatarios, 'quem vê o status', 5000).map(pessoa);
  if (!quem.length) throw falha('Nenhum contato conhecido para ver o status.');
  let conteudo;
  if (b.tipo === 'imagem') conteudo = { image: await arquivoDe(b), caption: b.legenda ? String(b.legenda) : undefined };
  else if (b.tipo === 'video') conteudo = { video: await arquivoDe(b), caption: b.legenda ? String(b.legenda) : undefined };
  else conteudo = { text: texto(b.texto, 'o texto', 700) };
  const id = await proprio.enviarConteudo(dono, 'status@broadcast', conteudo, { statusJidList: quem, ...(b.cor ? { backgroundColor: String(b.cor) } : {}) });
  return { id, destinatarios: quem.length };
}

// ── Ações sobre mensagens ────────────────────────────────────────────────────
async function marcarLidas(dono, b) {
  const chaves = lista(b.ids, 'os ids', 200).map(id => chaveDe(dono, b.chat, id).chave);
  await sock(dono).readMessages(chaves);
  return { lidas: chaves.length };
}
async function apagarParaTodos(dono, b) {
  const { chave } = chaveDe(dono, b.chat, b.id);
  return { id: await proprio.enviarConteudo(dono, chave.remoteJid, { delete: chave }) };
}
async function editarMensagem(dono, b) {
  const { chave } = chaveDe(dono, b.chat, b.id);
  if (!chave.fromMe) throw falha('Só dá para editar mensagens enviadas por este número.');
  const novo = texto(b.texto, 'o texto');
  const id = await proprio.enviarConteudo(dono, chave.remoteJid, { text: novo, edit: chave });
  proprio.textoEditado(dono, chave.remoteJid, chave.id, novo);
  return { id };
}
async function baixarMidia(dono, b) {
  const { linha } = chaveDe(dono, b.chat, b.id);
  if (!linha.bruta) throw falha('Esta mensagem não tem arquivo guardado para baixar.', 404);
  return proprio.baixarMidia(dono, linha, MAX_MIDIA_BAIXADA);
}

// ── Conversas e contatos ─────────────────────────────────────────────────────
async function arquivarConversa(dono, b) {
  const chat = jidDe(b.chat);
  await sock(dono).chatModify({ archive: b.arquivar !== false, lastMessages: ultimaDaConversa(dono, chat) }, chat);
  return { ok: true };
}
async function marcarNaoLida(dono, b) {
  const chat = jidDe(b.chat);
  await sock(dono).chatModify({ markRead: b.nao_lida === false, lastMessages: ultimaDaConversa(dono, chat) }, chat);
  return { ok: true };
}
const PRESENCAS = ['available', 'unavailable', 'composing', 'recording', 'paused'];
async function presenca(dono, b) {
  if (!PRESENCAS.includes(b.tipo)) throw falha(`Presença: ${PRESENCAS.join(', ')}.`);
  await sock(dono).sendPresenceUpdate(b.tipo, b.para ? jidDe(b.para) : undefined);
  return { ok: true };
}
async function conferirNumeros(dono, b) {
  const numeros = lista(b.numeros, 'os números', 50).map(pessoa);
  const achados = await sock(dono).onWhatsApp(...numeros);
  const porNumero = new Map((achados || []).map(a => [String(a.jid).split('@')[0], a]));
  return { numeros: numeros.map(j => {
    const n = j.split('@')[0];
    const a = porNumero.get(n) || (achados || []).find(x => x.jid === j);
    return { numero: n, existe: Boolean(a?.exists), jid: a?.jid || null };
  }) };
}
async function bloquear(dono, b) {
  await sock(dono).updateBlockStatus(pessoa(b.numero), b.bloquear === false ? 'unblock' : 'block');
  return { ok: true };
}
async function bloqueados(dono) { return { bloqueados: (await sock(dono).fetchBlocklist()).filter(Boolean) }; }

// ── Perfil e privacidade ─────────────────────────────────────────────────────
async function perfilDe(dono, numero) {
  const s = sock(dono);
  const jid = numero ? pessoa(numero) : proprio.meuJid(dono);
  const [recado, foto, empresa] = await Promise.all([
    s.fetchStatus(jid).catch(() => null),
    s.profilePictureUrl(jid, 'image').catch(() => null),
    s.getBusinessProfile(jid).catch(() => null),
  ]);
  const linha = Array.isArray(recado) ? recado[0]?.status : recado;
  return { jid, recado: linha?.status ?? null, foto_url: foto || null, empresa: empresa || null, nome: proprio.nomeConhecido(dono, jid) };
}
async function atualizarPerfil(dono, b) {
  const s = sock(dono);
  if (b.nome === undefined && b.recado === undefined) throw falha('Informe o nome ou o recado.');
  if (b.nome !== undefined) await s.updateProfileName(texto(b.nome, 'o nome', 25));
  if (b.recado !== undefined) await s.updateProfileStatus(String(b.recado).slice(0, 139));
  return { ok: true };
}
const fotoQuadrada = async b => require('sharp')(await arquivoDe(b)).resize(640, 640, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
async function trocarFotoPerfil(dono, b) {
  await sock(dono).updateProfilePicture(proprio.meuJid(dono), await fotoQuadrada(b));
  return { ok: true };
}
async function removerFotoPerfil(dono) {
  await sock(dono).removeProfilePicture(proprio.meuJid(dono));
  return { ok: true };
}
const PRIVACIDADE = {
  visto_por_ultimo: ['updateLastSeenPrivacy', ['all', 'contacts', 'contact_blacklist', 'none']],
  online: ['updateOnlinePrivacy', ['all', 'match_last_seen']],
  foto: ['updateProfilePicturePrivacy', ['all', 'contacts', 'contact_blacklist', 'none']],
  status: ['updateStatusPrivacy', ['all', 'contacts', 'contact_blacklist', 'none']],
  confirmacao_leitura: ['updateReadReceiptsPrivacy', ['all', 'none']],
  adicionar_em_grupos: ['updateGroupsAddPrivacy', ['all', 'contacts', 'contact_blacklist']],
};
async function lerPrivacidade(dono) { return sock(dono).fetchPrivacySettings(true); }
async function salvarPrivacidade(dono, b) {
  const s = sock(dono);
  const pedidos = Object.entries(b || {});
  if (!pedidos.length) throw falha(`Informe: ${Object.keys(PRIVACIDADE).join(', ')}.`);
  for (const [k, v] of pedidos) {
    if (!PRIVACIDADE[k]) throw falha(`Ajuste de privacidade desconhecido: ${k}.`);
    if (!PRIVACIDADE[k][1].includes(v)) throw falha(`${k}: ${PRIVACIDADE[k][1].join(', ')}.`);
  }
  for (const [k, v] of pedidos) await s[PRIVACIDADE[k][0]](v);
  return { ok: true };
}

// ── Grupos ───────────────────────────────────────────────────────────────────
async function criarGrupo(dono, b) {
  const g = await sock(dono).groupCreate(texto(b.nome, 'o nome do grupo', 100), lista(b.participantes, 'os participantes').map(pessoa));
  proprio.gruposMudaram(dono);
  return { id: g.id, nome: g.subject };
}
async function detalhesDoGrupo(dono, id) {
  const g = await sock(dono).groupMetadata(grupo(id));
  return {
    id: g.id, nome: g.subject, descricao: g.desc || null, criador: g.ownerPn || g.owner || null, criado_em: g.creation || null, membros: g.size ?? g.participants?.length ?? null,
    so_admins_falam: Boolean(g.announce), so_admins_editam: Boolean(g.restrict), mensagens_temporarias: g.ephemeralDuration || 0, aprovacao_para_entrar: Boolean(g.joinApprovalMode),
    participantes: (g.participants || []).map(p => ({ id: p.id, numero: p.phoneNumber || null, admin: p.admin || null })),
  };
}
async function editarGrupo(dono, id, b) {
  const j = grupo(id);
  const s = sock(dono);
  if (b.nome === undefined && b.descricao === undefined) throw falha('Informe o nome ou a descrição.');
  if (b.nome !== undefined) await s.groupUpdateSubject(j, texto(b.nome, 'o nome do grupo', 100));
  if (b.descricao !== undefined) await s.groupUpdateDescription(j, String(b.descricao).slice(0, 2048) || undefined);
  proprio.gruposMudaram(dono);
  return { ok: true };
}
async function trocarFotoGrupo(dono, id, b) {
  await sock(dono).updateProfilePicture(grupo(id), await fotoQuadrada(b));
  return { ok: true };
}
async function novoConvite(dono, id) {
  const codigo = await sock(dono).groupRevokeInvite(grupo(id));
  return { link: codigo ? `https://chat.whatsapp.com/${codigo}` : null };
}
// Manda o link do grupo para os números pedidos, um por vez, na fila de envio
async function enviarConvite(dono, id, b) {
  const j = grupo(id);
  const numeros = lista(b.numeros, 'os números', 50).map(pessoa);
  const codigo = await sock(dono).groupInviteCode(j);
  const mensagem = `${b.texto ? `${String(b.texto).slice(0, 1000)}\n\n` : ''}https://chat.whatsapp.com/${codigo}`;
  const resultados = [];
  for (const n of numeros) {
    try { await proprio.enviar(dono, n, { texto: mensagem }); resultados.push({ numero: n.split('@')[0], ok: true }); }
    catch (err) { resultados.push({ numero: n.split('@')[0], ok: false, erro: err.message }); }
  }
  return { resultados };
}
const codigoConvite = c => {
  const t = String(c || '').replace(/^https?:\/\/chat\.whatsapp\.com\//, '').trim();
  if (!/^[\w-]{10,40}$/.test(t)) throw falha('Código de convite inválido.');
  return t;
};
async function infoConvite(dono, codigo) {
  const g = await sock(dono).groupGetInviteInfo(codigoConvite(codigo));
  return { id: g.id, nome: g.subject, descricao: g.desc || null, membros: g.size ?? null };
}
async function aceitarConvite(dono, codigo) {
  const id = await sock(dono).groupAcceptInvite(codigoConvite(codigo));
  proprio.gruposMudaram(dono);
  return { id };
}
const ACOES = { adicionar: 'add', remover: 'remove', promover: 'promote', rebaixar: 'demote' };
async function participantes(dono, id, b) {
  if (!ACOES[b.acao]) throw falha(`Ação: ${Object.keys(ACOES).join(', ')}.`);
  const r = await sock(dono).groupParticipantsUpdate(grupo(id), lista(b.numeros, 'os números', 50).map(pessoa), ACOES[b.acao]);
  proprio.gruposMudaram(dono);
  return { resultados: (r || []).map(x => ({ jid: x.jid, status: x.status })) };
}
const AJUSTES_GRUPO = { so_admins_falam: ['announcement', 'not_announcement'], so_admins_editam: ['locked', 'unlocked'] };
async function ajustarGrupo(dono, id, b) {
  const j = grupo(id);
  const s = sock(dono);
  let feitos = 0;
  for (const [k, [sim, nao]] of Object.entries(AJUSTES_GRUPO)) {
    if (b[k] === undefined) continue;
    await s.groupSettingUpdate(j, b[k] ? sim : nao);
    feitos++;
  }
  if (b.todos_adicionam !== undefined) { await s.groupMemberAddMode(j, b.todos_adicionam ? 'all_member_add' : 'admin_add'); feitos++; }
  if (b.aprovacao_para_entrar !== undefined) { await s.groupJoinApprovalMode(j, b.aprovacao_para_entrar ? 'on' : 'off'); feitos++; }
  if (b.mensagens_temporarias !== undefined) {
    const seg = Number(b.mensagens_temporarias);
    if (![0, 86400, 604800, 7776000].includes(seg)) throw falha('Mensagens temporárias: 0, 86400 (24 h), 604800 (7 dias) ou 7776000 (90 dias).');
    await s.groupToggleEphemeral(j, seg);
    feitos++;
  }
  if (!feitos) throw falha('Informe: so_admins_falam, so_admins_editam, todos_adicionam, aprovacao_para_entrar ou mensagens_temporarias.');
  return { ok: true };
}
async function sairDoGrupo(dono, id) {
  await sock(dono).groupLeave(grupo(id));
  proprio.gruposMudaram(dono);
  return { ok: true };
}

// ── Etiquetas e catálogo (conta WhatsApp Business) ───────────────────────────
async function etiquetar(dono, b) {
  const chat = jidDe(b.chat);
  const id = texto(b.etiqueta, 'a etiqueta', 50);
  if (b.adicionar === false) await sock(dono).removeChatLabel(chat, id);
  else await sock(dono).addChatLabel(chat, id);
  return { ok: true };
}
function exigeBusiness(s, metodo) {
  if (typeof s[metodo] !== 'function') throw falha('Função disponível só em conta WhatsApp Business.', 501);
}
async function catalogo(dono, numero, limite) {
  const s = sock(dono);
  exigeBusiness(s, 'getCatalog');
  const { products = [], nextPageCursor = null } = await s.getCatalog({ jid: numero ? pessoa(numero) : proprio.meuJid(dono), limit: Math.min(Number(limite) || 10, 50) });
  return { produtos: products, proxima_pagina: nextPageCursor };
}
async function colecoes(dono, numero) {
  const s = sock(dono);
  exigeBusiness(s, 'getCollections');
  const r = await s.getCollections(numero ? pessoa(numero) : proprio.meuJid(dono));
  return { colecoes: r?.collections || [] };
}

module.exports = {
  enviarTexto, enviarMidia, enviarAudio, enviarNotaDeVideo, enviarFigurinha, enviarLocalizacao, enviarContato, enviarEnquete, enviarReacao, enviarStatus,
  marcarLidas, apagarParaTodos, editarMensagem, baixarMidia, arquivarConversa, marcarNaoLida, presenca, conferirNumeros, bloquear, bloqueados,
  perfilDe, atualizarPerfil, trocarFotoPerfil, removerFotoPerfil, lerPrivacidade, salvarPrivacidade,
  criarGrupo, detalhesDoGrupo, editarGrupo, trocarFotoGrupo, novoConvite, enviarConvite, infoConvite, aceitarConvite, participantes, ajustarGrupo, sairDoGrupo,
  etiquetar, catalogo, colecoes,
};
