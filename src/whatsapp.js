// WhatsApp por um serviço que conecta um número ao WhatsApp Web (não é API oficial do WhatsApp):
//  • Z-API (z-api.io, pago, na nuvem)      • Evolution API v2 (código aberto, roda no seu servidor)
// Use um número separado só para as postagens: o WhatsApp pode banir números automatizados.
const axios = require('axios');

const TIMEOUT = 30000;
const PROVEDORES = { zapi: 'Z-API', evolution: 'Evolution API' };

function config(s) {
  if (s.whatsapp_provider === 'zapi') {
    if (!s.zapi_instance || !s.zapi_token) return { erro: 'Informe o ID da instância e o token da Z-API.' };
    return {
      tipo: 'zapi',
      base: `https://api.z-api.io/instances/${encodeURIComponent(s.zapi_instance.trim())}/token/${encodeURIComponent(s.zapi_token.trim())}`,
      headers: s.zapi_client_token ? { 'Client-Token': s.zapi_client_token.trim() } : {},
    };
  }
  if (s.whatsapp_provider === 'evolution') {
    const url = String(s.evolution_url || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url) || !s.evolution_api_key || !s.evolution_instance) {
      return { erro: 'Informe o endereço, a chave (apikey) e o nome da instância da Evolution API.' };
    }
    return { tipo: 'evolution', base: url, instancia: encodeURIComponent(s.evolution_instance.trim()), headers: { apikey: s.evolution_api_key.trim() } };
  }
  return { erro: 'Escolha o serviço de WhatsApp (Z-API ou Evolution API) no painel.' };
}

const falha = (err, servico) => {
  const d = err.response?.data;
  const msg = d?.error?.message || d?.message || (typeof d?.error === 'string' ? d.error : '') || d?.response?.message
    || (typeof d === 'string' ? d.slice(0, 200) : '') || err.message;
  if (/null not allowed/i.test(msg)) return new Error('A Z-API exige o "token de segurança da conta" (Client-Token): informe no painel.');
  if (err.response?.status === 401 || err.response?.status === 403) return new Error(`${servico} recusou a chave/token (confira no painel).`);
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') return new Error(`Não foi possível acessar a ${servico} (endereço certo? serviço ligado?).`);
  return new Error(`${servico}: ${Array.isArray(msg) ? msg.join(', ') : msg}`);
};

// Conectado? (número lido pelo QR code e online)
async function status(s) {
  const c = config(s);
  if (c.erro) return { conectado: false, mensagem: c.erro };
  try {
    if (c.tipo === 'zapi') {
      const r = await axios.get(`${c.base}/status`, { headers: c.headers, timeout: TIMEOUT });
      return { conectado: Boolean(r.data.connected), mensagem: r.data.connected ? 'Número conectado.' : (r.data.error || 'Número desconectado: leia o QR code no painel da Z-API.') };
    }
    const r = await axios.get(`${c.base}/instance/connectionState/${c.instancia}`, { headers: c.headers, timeout: TIMEOUT });
    const state = r.data?.instance?.state || r.data?.state;
    return { conectado: state === 'open', mensagem: state === 'open' ? 'Número conectado.' : `Instância "${state || 'desconhecida'}": leia o QR code no painel da Evolution API.` };
  } catch (err) {
    return { conectado: false, mensagem: falha(err, PROVEDORES[c.tipo]).message };
  }
}

// Grupos de que o número participa: [{ id, nome }]
async function listarGrupos(s) {
  const c = config(s);
  if (c.erro) throw new Error(c.erro);
  try {
    if (c.tipo === 'zapi') {
      const out = [];
      for (let page = 1; page <= 20; page++) {
        const r = await axios.get(`${c.base}/groups`, { params: { page, pageSize: 100 }, headers: c.headers, timeout: TIMEOUT });
        const list = Array.isArray(r.data) ? r.data : [];
        out.push(...list.map(g => ({ id: String(g.phone), nome: g.name || g.phone })));
        if (list.length < 100) break;
      }
      return out;
    }
    const r = await axios.get(`${c.base}/group/fetchAllGroups/${c.instancia}`, { params: { getParticipants: 'false' }, headers: c.headers, timeout: 60000 });
    const list = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.groups) ? r.data.groups : [];
    return list.map(g => ({ id: String(g.id || g.jid), nome: g.subject || g.name || g.id }));
  } catch (err) {
    throw falha(err, PROVEDORES[c.tipo]);
  }
}

// Envia foto com legenda (ou só texto, sem foto) para um grupo.
// imagem: endereço https da foto ou o arquivo (Buffer JPEG).
// Número de contingência: outra instância do mesmo serviço (Z-API: ID e token; Evolution: outra instância no mesmo
// servidor), nos mesmos grupos. Os dois números se revezam a cada mensagem (cada oferta sai uma vez só, por um deles;
// o revezamento deixa o envio menos previsível e diminui o risco de bloqueio). Se um falhar (desconectado, banido,
// fora do ar), a mensagem sai pelo outro.
function configReserva(s) {
  if (s.whatsapp_provider === 'zapi' && s.zapi2_instance && s.zapi2_token) {
    return config({ ...s, zapi_instance: s.zapi2_instance, zapi_token: s.zapi2_token });
  }
  if (s.whatsapp_provider === 'evolution' && s.evolution2_instance) return config({ ...s, evolution_instance: s.evolution2_instance });
  return null;
}
const vez = new Map(); // dono (site ou cliente) → quantas mensagens já saíram (para revezar os números)
async function enviar(s, grupoId, msg) {
  const principal = config(s), reserva = configReserva(s);
  if (!reserva || reserva.erro) return enviarPor(principal, grupoId, msg);
  const dono = s.cliente_id || 'site';
  const n = (vez.get(dono) || 0) + 1;
  vez.set(dono, n);
  const [primeiro, segundo] = n % 2 ? [principal, reserva] : [reserva, principal];
  try { return await enviarPor(primeiro, grupoId, msg); } catch (err) {
    console.warn(`[WHATSAPP] um dos números falhou (${err.message}); enviando pelo outro`);
    return enviarPor(segundo, grupoId, msg);
  }
}
async function enviarPor(c, grupoId, { imagem, texto }) {
  if (c.erro) throw new Error(c.erro);
  if (Buffer.isBuffer(imagem)) {
    const b64 = imagem.toString('base64');
    imagem = c.tipo === 'zapi' ? `data:image/jpeg;base64,${b64}` : b64; // Z-API pede o prefixo; Evolution, só o base64
  }
  try {
    if (c.tipo === 'zapi') {
      const r = imagem
        ? await axios.post(`${c.base}/send-image`, { phone: grupoId, image: imagem, caption: texto }, { headers: c.headers, timeout: TIMEOUT })
        : await axios.post(`${c.base}/send-text`, { phone: grupoId, message: texto }, { headers: c.headers, timeout: TIMEOUT });
      return r.data?.messageId || r.data?.zaapId || 'enviado';
    }
    // Evolution v2 aceita o corpo "plano"; a v1 usa mediaMessage/textMessage. Tenta a v2 e, se recusar o formato, a v1.
    const url = `${c.base}/message/${imagem ? 'sendMedia' : 'sendText'}/${c.instancia}`;
    const v2 = imagem
      ? { number: grupoId, mediatype: 'image', mimetype: 'image/jpeg', media: imagem, caption: texto, fileName: 'oferta.jpg' }
      : { number: grupoId, text: texto };
    const v1 = imagem
      ? { number: grupoId, mediaMessage: { mediatype: 'image', media: imagem, caption: texto, fileName: 'oferta.jpg' } }
      : { number: grupoId, textMessage: { text: texto } };
    let r;
    try {
      r = await axios.post(url, v2, { headers: c.headers, timeout: TIMEOUT });
    } catch (err) {
      if (err.response?.status !== 400) throw err;
      r = await axios.post(url, v1, { headers: c.headers, timeout: TIMEOUT });
    }
    return r.data?.key?.id || 'enviado';
  } catch (err) {
    throw falha(err, PROVEDORES[c.tipo]);
  }
}

function gruposEscolhidos(s) {
  try {
    const g = JSON.parse(s.whatsapp_groups || '[]');
    return Array.isArray(g) ? g.filter(x => x && x.id) : [];
  } catch { return []; }
}

module.exports = { PROVEDORES, config, configReserva, status, listarGrupos, enviar, gruposEscolhidos };
