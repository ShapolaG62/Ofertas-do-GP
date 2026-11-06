// API própria de WhatsApp: conecta um número ao WhatsApp Web direto do servidor (biblioteca Baileys), sem Z-API nem Evolution.
//  • Conectar: o painel mostra o QR code; depois de lido, a sessão fica em data/whatsapp-sessao e volta sozinha ao religar.
//  • Receber: cada mensagem nova é guardada por 30 dias (só o texto) e segue para o grupo de automação e o monitor de membros.
//  • Enviar: uma mensagem por vez, com pelo menos 3 segundos entre elas.
// Não é a API oficial do WhatsApp: o número pode ser banido. A pasta da sessão dá acesso à conta: nunca copie nem compartilhe.
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const db = require('./db');
const settings = require('./settings');
const net = require('./net');

const PASTA = path.join(path.dirname(db.DB_PATH), 'whatsapp-sessao');
const DIAS_GUARDADOS = 30;
const LIMITE_ENVIO_MS = 45000;
const IDADE_MAX_COMANDO_S = 300; // comando que chegou enquanto o site estava fora do ar e já ficou velho não é executado
let intervaloEnvio = 3000;

db.db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id TEXT NOT NULL,
    chat TEXT NOT NULL,
    chat_nome TEXT,
    de_mim INTEGER NOT NULL DEFAULT 0,
    autor TEXT,
    tipo TEXT NOT NULL DEFAULT 'texto',
    texto TEXT,
    criado_em TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_msg_unica ON whatsapp_mensagens (chat, wa_id);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_chat ON whatsapp_mensagens (chat, id);
`);

const log = m => console.log(`[WHATSAPP PRÓPRIO] ${m}`);
const falhou = (mensagem, status = 400) => Object.assign(new Error(mensagem), { status });

// ── Conversão de endereços e mensagens ──────────────────────────────────────
// Aceita o id em qualquer formato (Z-API "120…-group", Evolution "120…@g.us" ou o número com DDI)
function paraJid(id) {
  const t = String(id || '').trim();
  if (/^[\w.:-]+@(g\.us|s\.whatsapp\.net|lid)$/.test(t)) return t;
  if (/^\d[\d-]*-group$/.test(t)) return `${t.replace(/-group$/, '')}@g.us`;
  if (/^\d+-\d+$/.test(t)) return `${t}@g.us`; // grupo antigo: criador-data
  const d = t.replace(/\D/g, '');
  if (/^120\d{15,}$/.test(d)) return `${d}@g.us`;
  if (/^\d{10,15}$/.test(d)) return `${d}@s.whatsapp.net`;
  throw falhou('Destino inválido: informe o id do grupo ou o número com DDI e DDD.');
}

const EMBRULHOS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'editedMessage'];
const TIPOS = {
  conversation: 'texto', extendedTextMessage: 'texto', imageMessage: 'imagem', videoMessage: 'video', audioMessage: 'audio',
  documentMessage: 'documento', stickerMessage: 'figurinha', contactMessage: 'contato', contactsArrayMessage: 'contato',
  locationMessage: 'localizacao', liveLocationMessage: 'localizacao', pollCreationMessage: 'enquete', pollCreationMessageV3: 'enquete',
};
function desembrulhar(m) {
  let atual = m;
  for (let i = 0; i < 5 && atual; i++) {
    const k = EMBRULHOS.find(x => atual[x]?.message);
    if (!k) break;
    atual = atual[k].message;
  }
  return atual || null;
}
const segundos = v => Number(v?.toNumber ? v.toNumber() : v) || 0;
const dataSql = s => new Date((s || Date.now() / 1000) * 1000).toISOString().replace('T', ' ').slice(0, 19);

// Mensagem do WhatsApp → formato do site (ou nulo: status, canais, reações e avisos internos não entram)
function lerMensagem(m) {
  const chat = m?.key?.remoteJid;
  if (!chat || !m.key.id || /@(broadcast|newsletter)$/.test(chat)) return null;
  const c = desembrulhar(m.message);
  const chaveTipo = c && Object.keys(TIPOS).find(k => c[k]);
  if (!chaveTipo) return null;
  const texto = c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption || c.videoMessage?.caption || c.documentMessage?.caption || '';
  return {
    wa_id: String(m.key.id), chat, de_mim: m.key.fromMe ? 1 : 0, autor: m.key.fromMe ? null : (m.pushName || null),
    tipo: TIPOS[chaveTipo], texto, segundos: segundos(m.messageTimestamp),
  };
}

// ── Estado da conexão ───────────────────────────────────────────────────────
let estado = { fase: 'desligado', qr: null, numero: null, nome: null, erro: null, desde: null };
let sock = null;
let geracao = 0; // conexões antigas que ainda dispararem eventos são ignoradas
let tentativas = 0;
let timerVolta = null;
let pareando = false;
let abrindo = false;
let gruposCache = null;
let fabrica = criarSocketReal;

const mudar = novo => { estado = { ...estado, ...novo }; };
function fecharSocket() {
  clearTimeout(timerVolta);
  const s = sock;
  sock = null;
  gruposCache = null;
  try { s?.ev?.removeAllListeners?.(); s?.end?.(undefined); } catch { /* já estava fechado */ }
}

function temSessao() {
  try { return Boolean(JSON.parse(fs.readFileSync(path.join(PASTA, 'creds.json'), 'utf8')).me); } catch { return false; }
}
function apagarSessao() {
  fs.rmSync(PASTA, { recursive: true, force: true });
}

async function criarSocketReal() {
  const b = await import('baileys');
  fs.mkdirSync(PASTA, { recursive: true, mode: 0o700 });
  const { state, saveCreds } = await b.useMultiFileAuthState(PASTA);
  const logger = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return this; } };
  const { version } = await b.fetchLatestWaWebVersion({}).catch(() => ({}));
  const socket = b.default({
    auth: { creds: state.creds, keys: b.makeCacheableSignalKeyStore(state.keys, logger) },
    ...(version ? { version } : {}),
    browser: b.Browsers.windows('Ofertou'),
    logger,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false, // só as mensagens novas: não copia o histórico da conta para o servidor
    markOnlineOnConnect: false, // o celular continua recebendo as notificações normalmente
    getMessage: async () => undefined,
  });
  return { sock: socket, saveCreds, pareado: () => Boolean(state.creds.me) };
}

async function abrir() {
  if (abrindo) return;
  abrindo = true;
  const minha = ++geracao;
  fecharSocket();
  mudar({ fase: 'conectando', qr: null });
  try {
    const criado = await fabrica();
    if (minha !== geracao) { try { criado.sock.end?.(undefined); } catch { /* ignorado */ } return; }
    sock = criado.sock;
    ouvir(criado, minha);
  } catch (err) {
    if (minha === geracao) { log(`não abriu: ${err.message}`); mudar({ fase: 'desligado', erro: `Não foi possível abrir a conexão: ${err.message}` }); }
  } finally { abrindo = false; }
}

function ouvir({ sock: s, saveCreds, pareado }, minha) {
  s.ev.on('creds.update', saveCreds);
  s.ev.on('connection.update', u => {
    if (minha !== geracao) return;
    aoAtualizar(u, s, pareado).catch(err => log(`erro na conexão: ${err.message}`));
  });
  s.ev.on('messages.upsert', ({ messages, type }) => {
    if (minha !== geracao) return;
    for (const m of messages || []) { try { receber(m, type); } catch (err) { log(`mensagem ignorada: ${err.message}`); } }
  });
  s.ev.on('groups.update', () => { gruposCache = null; });
  s.ev.on('group-participants.update', ev => {
    if (minha !== geracao || settings.get('whatsapp_provider') !== 'proprio') return;
    gruposCache = null;
    try { require('./membros-grupo').receber(null, { event: 'group-participants.update', data: ev }); } catch (err) { log(`membros: ${err.message}`); }
  });
}

async function aoAtualizar({ connection, qr, lastDisconnect }, s, pareado) {
  if (qr) {
    pareando = true;
    mudar({ fase: 'qr', qr: await QRCode.toDataURL(qr, { width: 320, margin: 2 }), erro: null });
  }
  if (connection === 'open') {
    tentativas = 0;
    const id = String(s.user?.id || '');
    mudar({ fase: 'conectado', qr: null, erro: null, numero: id.split(/[:@]/)[0] || null, nome: s.user?.name || null, desde: new Date().toISOString() });
    log('conectado');
    // Acabou de ler o QR code: é esta a conexão que deve enviar as postagens daqui em diante
    if (pareando) { pareando = false; settings.set('whatsapp_provider', 'proprio'); }
  }
  if (connection === 'close') aoFechar(lastDisconnect?.error?.output?.statusCode, pareado);
}

function aoFechar(codigo, pareado) {
  sock = null;
  gruposCache = null;
  const parar = erro => { pareando = false; mudar({ fase: 'desligado', qr: null, erro }); log(`parado (${codigo}): ${erro}`); };
  if (codigo === 401) {
    apagarSessao();
    mudar({ numero: null, nome: null });
    return parar('O WhatsApp desconectou este aparelho. Clique em Conectar e leia o QR code de novo.');
  }
  if (codigo === 403) return parar('O WhatsApp recusou este número (pode ter sido bloqueado). Confira o aplicativo no celular antes de tentar de novo.');
  if (codigo === 440) return parar('Esta sessão foi aberta em outro lugar. Feche a outra conexão e clique em Conectar.');
  if (!pareado()) return parar('O QR code venceu. Clique em Conectar para gerar outro.');
  if (codigo === 515) return void abrir(); // pedido normal do WhatsApp logo depois de ler o QR code
  tentativas++;
  const espera = Math.min(5000 * 2 ** (tentativas - 1), 300000);
  mudar({ fase: 'reconectando', erro: `Conexão caiu (${codigo || 'sem código'}). Tentando de novo em ${Math.round(espera / 1000)} s.` });
  log(`caiu (${codigo}); nova tentativa em ${espera / 1000} s`);
  timerVolta = setTimeout(abrir, espera);
  timerVolta.unref?.();
}

// ── Mensagens recebidas ─────────────────────────────────────────────────────
function salvar(m, nomeChat = null) {
  const r = db.run(`INSERT OR IGNORE INTO whatsapp_mensagens (wa_id, chat, chat_nome, de_mim, autor, tipo, texto, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    m.wa_id, m.chat, nomeChat, m.de_mim, m.autor, m.tipo, m.texto, dataSql(m.segundos));
  return Number(r?.changes ?? 1) > 0;
}
function nomeDoChat(m) {
  if (m.chat.endsWith('@g.us')) return gruposCache?.mapa.get(m.chat) || null;
  return m.de_mim ? null : m.autor;
}
function receber(bruta, tipoEvento) {
  const m = lerMensagem(bruta);
  if (!m) return;
  const nova = salvar(m, nomeDoChat(m));
  if (!nova || tipoEvento !== 'notify' || settings.get('whatsapp_provider') !== 'proprio') return;
  if (m.segundos && Date.now() / 1000 - m.segundos > IDADE_MAX_COMANDO_S) return;
  const ga = require('./grupo-automacao');
  ga.processar({ cid: null, s: settings.getAll() }, { grupo: m.chat, texto: m.texto, deMim: Boolean(m.de_mim), autor: m.autor || '' })
    .catch(err => log(`grupo de automação: ${err.message}`));
}

// ── Grupos ──────────────────────────────────────────────────────────────────
function exigirConexao() {
  if (estado.fase !== 'conectado' || !sock) throw falhou('O WhatsApp não está conectado: abra o painel e leia o QR code.', 409);
  return sock;
}
async function carregarGrupos() {
  const s = exigirConexao();
  if (gruposCache && Date.now() - gruposCache.em < 300000) return gruposCache.lista;
  const todos = await s.groupFetchAllParticipating();
  const lista = Object.values(todos || {}).map(g => ({ id: g.id, nome: g.subject || g.id, membros: Number.isInteger(g.size) ? g.size : (g.participants?.length ?? null) }));
  lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  gruposCache = { em: Date.now(), lista, mapa: new Map(lista.map(g => [g.id, g.nome])) };
  return lista;
}

// ── Envio: uma mensagem por vez ─────────────────────────────────────────────
async function prepararImagem(imagem) {
  let bruto = imagem;
  if (!Buffer.isBuffer(bruto)) {
    const r = await net.safeGet(String(imagem), { responseType: 'arraybuffer', timeout: 30000 });
    if (r.status !== 200) throw falhou(`Não consegui baixar a foto (erro ${r.status}).`);
    bruto = Buffer.from(r.data);
  }
  // Lojas costumam entregar WebP; o WhatsApp espera JPEG em mensagem de foto
  return require('sharp')(bruto).rotate().resize({ width: 1280, withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
}
let filaEnvio = Promise.resolve();
let ultimoEnvio = 0;
function naFila(tarefa) {
  const vez = filaEnvio.then(async () => {
    const espera = ultimoEnvio + intervaloEnvio - Date.now();
    if (espera > 0) await new Promise(r => setTimeout(r, espera));
    try { return await tarefa(); } finally { ultimoEnvio = Date.now(); }
  });
  filaEnvio = vez.catch(() => {});
  return vez;
}
async function enviar(para, { imagem, texto }) {
  let jid = paraJid(para);
  if (!imagem && !String(texto || '').trim()) throw falhou('Informe o texto ou a foto da mensagem.');
  exigirConexao();
  const foto = imagem ? await prepararImagem(imagem) : null;
  return naFila(async () => {
    const s = exigirConexao();
    if (jid.endsWith('@s.whatsapp.net')) { // celular: confere o número (no Brasil, o cadastro pode ser com ou sem o 9)
      const [achado] = await s.onWhatsApp(jid);
      if (!achado?.exists) throw falhou('Esse número não tem WhatsApp.');
      jid = achado.jid;
    }
    const conteudo = foto ? { image: foto, caption: texto || '' } : { text: String(texto) };
    let limite;
    const r = await Promise.race([
      s.sendMessage(jid, conteudo),
      new Promise((_, nao) => { limite = setTimeout(() => nao(falhou('O WhatsApp não confirmou o envio a tempo.', 504)), LIMITE_ENVIO_MS); }),
    ]).finally(() => clearTimeout(limite));
    const m = lerMensagem(r);
    if (m) salvar(m, nomeDoChat(m));
    return r?.key?.id || 'enviado';
  });
}

// ── O que o painel e a API usam ─────────────────────────────────────────────
function status() {
  return { ...estado, conectado: estado.fase === 'conectado', sessao_salva: temSessao() };
}
async function conectar() {
  if (['conectado', 'qr', 'conectando'].includes(estado.fase) && (sock || abrindo)) return status();
  tentativas = 0;
  mudar({ erro: null });
  await abrir();
  return status();
}
// Sai da conta neste aparelho e apaga a sessão do servidor. As mensagens guardadas também são apagadas.
async function desconectar() {
  geracao++;
  const s = sock;
  clearTimeout(timerVolta);
  if (s) await Promise.race([s.logout().catch(() => {}), new Promise(r => setTimeout(r, 8000))]);
  fecharSocket();
  pareando = false;
  apagarSessao();
  db.run('DELETE FROM whatsapp_mensagens');
  estado = { fase: 'desligado', qr: null, numero: null, nome: null, erro: null, desde: null };
  return status();
}
function conversas() {
  return db.all(`SELECT m.chat, m.texto, m.tipo, m.de_mim, m.criado_em, m.id,
      (SELECT n.chat_nome FROM whatsapp_mensagens n WHERE n.chat = m.chat AND n.chat_nome IS NOT NULL ORDER BY n.id DESC LIMIT 1) AS nome
    FROM whatsapp_mensagens m
    WHERE m.id IN (SELECT MAX(id) FROM whatsapp_mensagens GROUP BY chat)
    ORDER BY m.id DESC LIMIT 100`);
}
// Lista as mensagens em ordem de chegada. depois: só as mais novas que esse id (para buscar as que chegaram).
function mensagens({ chat, limite, depois } = {}) {
  const lim = Math.min(Math.max(Number(limite) || 50, 1), 200);
  const onde = [], args = [];
  if (chat) { onde.push('chat = ?'); args.push(paraJid(chat)); }
  if (Number(depois) > 0) { onde.push('id > ?'); args.push(Number(depois)); }
  const sql = `SELECT id, wa_id, chat, chat_nome, de_mim, autor, tipo, texto, criado_em FROM whatsapp_mensagens ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''}`;
  if (Number(depois) > 0) return db.all(`${sql} ORDER BY id ASC LIMIT ?`, ...args, lim);
  return db.all(`${sql} ORDER BY id DESC LIMIT ?`, ...args, lim).reverse();
}
function limpar() {
  db.run(`DELETE FROM whatsapp_mensagens WHERE criado_em < datetime('now', ?)`, `-${DIAS_GUARDADOS} days`);
}
// Ao ligar o site: limpa as mensagens antigas e volta a conectar se já havia um número
function iniciar() {
  limpar();
  setInterval(limpar, 6 * 3600000).unref();
  if (temSessao()) conectar().catch(err => log(`não reconectou: ${err.message}`));
}

// Só para os testes: troca o WhatsApp de verdade por um simulado
function _paraTestes({ criar, intervalo } = {}) {
  if (criar) fabrica = criar;
  if (intervalo !== undefined) intervaloEnvio = intervalo;
}

module.exports = { paraJid, lerMensagem, status, conectar, desconectar, carregarGrupos, enviar, conversas, mensagens, iniciar, limpar, PASTA, _paraTestes };
