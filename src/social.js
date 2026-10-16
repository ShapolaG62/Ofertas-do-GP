// Postagem automática de ofertas nas redes sociais, pelas APIs oficiais:
//  Telegram (bot), Facebook (página), Instagram (conta profissional ligada à página) e X/Twitter.
// WhatsApp não tem API oficial para grupos: lá a postagem é manual (botão de compartilhar).
const crypto = require('crypto');
const axios = require('axios');
const db = require('./db');
const settings = require('./settings');
const whatsapp = require('./whatsapp');
const watermark = require('./watermark');

const GRAPH = 'https://graph.facebook.com/v23.0';
const TIMEOUT = 25000;
const LOCAL_IMAGE = /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;

const REDES = {
  telegram: {
    nome: 'Telegram',
    pronta: s => (s.telegram_bot_token && s.telegram_chat_id ? null : 'Informe o token do bot e o canal/grupo no painel.'),
    publicar: postTelegram,
  },
  facebook: {
    nome: 'Facebook',
    pronta: s => (s.facebook_page_id && s.facebook_page_token ? null : 'Informe o ID e o token da página no painel.'),
    publicar: postFacebook,
  },
  instagram: {
    nome: 'Instagram',
    pronta: s => (s.instagram_business_id && s.facebook_page_token ? null : 'Informe o ID da conta do Instagram e o token da página no painel.'),
    publicar: postInstagram,
  },
  whatsapp: {
    nome: 'WhatsApp',
    pronta: s => {
      const c = whatsapp.config(s);
      if (c.erro) return c.erro;
      return whatsapp.gruposEscolhidos(s).length ? null : 'Escolha os grupos de destino no painel.';
    },
    publicar: postWhatsApp,
  },
  x: {
    nome: 'X (Twitter)',
    pronta: s => (s.x_api_key && s.x_api_secret && s.x_access_token && s.x_access_secret ? null : 'Informe as 4 chaves da API do X no painel.'),
    publicar: postX,
  },
};

function listarRedes(s = settings.getAll()) {
  return Object.entries(REDES).map(([id, r]) => {
    const motivo = r.pronta(s);
    return { id, nome: r.nome, pronta: !motivo, motivo };
  });
}

// ── Texto ────────────────────────────────────────────────────────────────────
const slugOf = o => `${String(o.produto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}-${o.id}`;

// Link publicado: passa pelo site (conta o clique) quando ele tem endereço público; senão vai direto à loja.
function postLink(o, s = settings.getAll()) {
  if (o.__link) return o.__link; // postagem de cliente: link de afiliado dele
  const site = String(s.site_url || '').replace(/\/+$/, '');
  return /^https:\/\//i.test(site) ? `${site}/oferta/${slugOf(o)}` : (o.affiliate_url || o.original_url);
}

// Imagem que as redes conseguem baixar: a da loja (https) ou a enviada pela empresa, se o site for público.
function postImage(o, s = settings.getAll()) {
  if (/^https:\/\//i.test(o.imagem || '')) return o.imagem;
  const site = String(s.site_url || '').replace(/\/+$/, '');
  return LOCAL_IMAGE.test(o.imagem || '') && /^https:\/\//i.test(site) ? `${site}${o.imagem}` : null;
}

// Foto com a marca d'água do site (null se desligada ou se a foto não puder ser baixada: aí vai a foto da loja).
async function fotoMarcada(o, s) {
  if (!watermark.ativa(s)) return null;
  try { return await watermark.paraOferta(o, s); } catch { return null; }
}
const jpegBlob = buf => new Blob([buf], { type: 'image/jpeg' });

// O texto editado na tela usa a marcação do WhatsApp (*negrito*, _itálico_, ~riscado~).
const plain = t => String(t).replace(/(^|\s)[*_~]([^*_~\n]+)[*_~](?=\s|$|[.,!?)])/g, '$1$2');
const escHtml = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toTelegramHtml = t => escHtml(t)
  .replace(/(^|\s)\*([^*\n]+)\*/g, '$1<b>$2</b>')
  .replace(/(^|\s)_([^_\n]+)_/g, '$1<i>$2</i>')
  .replace(/(^|\s)~([^~\n]+)~/g, '$1<s>$2</s>');

const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// X: até 280 caracteres (todo link conta 23).
function textoCurto(o, link) {
  const linha2 = `De R$ ${brl(o.preco_anterior)} por R$ ${brl(o.preco_atual)} (-${Math.round(o.desconto_pct)}%)`;
  const espaco = 280 - 23 - linha2.length - 6;
  const nome = o.produto.length > espaco ? `${o.produto.slice(0, espaco - 1).trimEnd()}…` : o.produto;
  return `${nome}\n${linha2}\n\n${link}`;
}

// ── Redes ────────────────────────────────────────────────────────────────────
// Erro da API em português, com o que fazer nos casos mais comuns (o nome da rede é mostrado pela tela).
const apiError = (err, rede) => {
  const d = err.response?.data;
  const status = err.response?.status;
  const msg = d?.description || d?.error?.message || d?.detail || d?.title || (d?.errors && d.errors[0]?.message) || err.message;
  if (rede === 'Telegram') {
    if (status === 401 || status === 404) return new Error('Token do bot inválido. Confira em Painel → Redes sociais.');
    if (/chat not found/i.test(msg)) return new Error('Canal ou grupo não encontrado. Confira o @ ou o ID e se o bot foi adicionado.');
    if (status === 403 || /not enough rights|not a member|kicked/i.test(msg)) return new Error('O bot não tem permissão para postar nesse canal/grupo (torne-o administrador).');
  }
  if ((rede === 'Facebook' || rede === 'Instagram') && (d?.error?.code === 190 || status === 401)) {
    return new Error('Token da página inválido ou vencido. Gere um novo em Painel → Redes sociais.');
  }
  if (rede === 'Facebook' || rede === 'Instagram') {
    if (d?.error?.code === 10 || d?.error?.code === 200) return new Error(`Permissão faltando no token (${msg}).`);
  }
  if (rede === 'X') {
    if (status === 401) return new Error('Chaves do X inválidas. Confira as 4 chaves em Painel → Redes sociais.');
    if (status === 403) return new Error(`O X recusou a publicação (permissão "Read and write" ativa? texto repetido?): ${msg}`);
    if (status === 429) return new Error('Limite de publicações do X atingido. Tente mais tarde.');
  }
  return new Error(String(msg));
};

async function postTelegram(o, texto, s) {
  const base = `https://api.telegram.org/bot${s.telegram_bot_token}`;
  const html = toTelegramHtml(texto);
  const img = postImage(o, s);
  const marcada = html.length <= 1024 ? await fotoMarcada(o, s) : null;
  try {
    if (marcada) { // envia o arquivo da foto com marca d'água
      const form = new FormData();
      form.append('chat_id', s.telegram_chat_id);
      form.append('caption', html);
      form.append('parse_mode', 'HTML');
      form.append('photo', jpegBlob(marcada), 'oferta.jpg');
      const r = await axios.post(`${base}/sendPhoto`, form, { timeout: TIMEOUT });
      return `mensagem ${r.data.result.message_id}`;
    }
    if (img && html.length <= 1024) {
      const r = await axios.post(`${base}/sendPhoto`, { chat_id: s.telegram_chat_id, photo: img, caption: html, parse_mode: 'HTML' }, { timeout: TIMEOUT });
      return `mensagem ${r.data.result.message_id}`;
    }
    const r = await axios.post(`${base}/sendMessage`, { chat_id: s.telegram_chat_id, text: html, parse_mode: 'HTML' }, { timeout: TIMEOUT });
    return `mensagem ${r.data.result.message_id}`;
  } catch (err) {
    // Foto recusada (formato/tamanho): manda só o texto, com a prévia do link.
    if (img && err.response?.status === 400 && /photo|image|file|wrong type/i.test(err.response.data?.description || '')) {
      const r = await axios.post(`${base}/sendMessage`, { chat_id: s.telegram_chat_id, text: html, parse_mode: 'HTML' }, { timeout: TIMEOUT })
        .catch(e => { throw apiError(e, 'Telegram'); });
      return `mensagem ${r.data.result.message_id} (sem foto)`;
    }
    throw apiError(err, 'Telegram');
  }
}

async function postFacebook(o, texto, s) {
  const img = postImage(o, s);
  const message = plain(texto);
  const marcada = await fotoMarcada(o, s);
  try {
    if (marcada) { // envia o arquivo da foto com marca d'água
      const form = new FormData();
      form.append('caption', message);
      form.append('access_token', s.facebook_page_token);
      form.append('source', jpegBlob(marcada), 'oferta.jpg');
      const r = await axios.post(`${GRAPH}/${s.facebook_page_id}/photos`, form, { timeout: TIMEOUT });
      return `post ${r.data.post_id || r.data.id}`;
    }
    if (img) {
      const r = await axios.post(`${GRAPH}/${s.facebook_page_id}/photos`, null,
        { params: { url: img, caption: message, access_token: s.facebook_page_token }, timeout: TIMEOUT });
      return `post ${r.data.post_id || r.data.id}`;
    }
    const r = await axios.post(`${GRAPH}/${s.facebook_page_id}/feed`, null,
      { params: { message, link: postLink(o, s), access_token: s.facebook_page_token }, timeout: TIMEOUT });
    return `post ${r.data.id}`;
  } catch (err) { throw apiError(err, 'Facebook'); }
}

async function postInstagram(o, texto, s) {
  // O Instagram só baixa a foto de um endereço público: com o site publicado, usa a versão com marca d'água.
  const site = String(s.site_url || '').replace(/\/+$/, '');
  const img = watermark.ativa(s) && /^https:\/\//i.test(site) && postImage(o, s) ? `${site}/img/marca/${o.id}.jpg` : postImage(o, s);
  if (!img) throw new Error('A oferta não tem imagem pública (o Instagram só publica com foto).');
  try {
    const media = await axios.post(`${GRAPH}/${s.instagram_business_id}/media`, null,
      { params: { image_url: img, caption: plain(texto).slice(0, 2200), access_token: s.facebook_page_token }, timeout: TIMEOUT });
    // O Instagram processa a foto antes de permitir publicar.
    for (let i = 0; i < 10; i++) {
      const st = await axios.get(`${GRAPH}/${media.data.id}`, { params: { fields: 'status_code', access_token: s.facebook_page_token }, timeout: TIMEOUT });
      if (st.data.status_code === 'FINISHED') break;
      if (st.data.status_code === 'ERROR') throw new Error('o Instagram não aceitou a imagem (use JPG)');
      await new Promise(r => setTimeout(r, 2000));
    }
    const pub = await axios.post(`${GRAPH}/${s.instagram_business_id}/media_publish`, null,
      { params: { creation_id: media.data.id, access_token: s.facebook_page_token }, timeout: TIMEOUT });
    return `post ${pub.data.id}`;
  } catch (err) { throw err.response ? apiError(err, 'Instagram') : new Error(err.message); }
}

// OAuth 1.0a (contexto de usuário), exigido pelo X para publicar.
// extra: parâmetros de query/formulário que entram na assinatura (o corpo JSON não entra).
function oauthHeader(method, url, s, extra = {}, fixed = {}) {
  const enc = v => encodeURIComponent(v).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const params = {
    oauth_consumer_key: s.x_api_key,
    oauth_nonce: fixed.nonce || crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: fixed.timestamp || String(Math.floor(Date.now() / 1000)),
    oauth_token: s.x_access_token,
    oauth_version: '1.0',
  };
  const all = { ...params, ...extra };
  const paramStr = Object.keys(all).map(k => [enc(k), enc(all[k])]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const base = [method.toUpperCase(), enc(url), enc(paramStr)].join('&');
  const key = `${enc(s.x_api_secret)}&${enc(s.x_access_secret)}`;
  params.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.keys(params).sort().map(k => `${enc(k)}="${enc(params[k])}"`).join(', ');
}

async function postX(o, _texto, s) {
  const url = 'https://api.x.com/2/tweets';
  try {
    const r = await axios.post(url, { text: textoCurto(o, postLink(o, s)) },
      { headers: { Authorization: oauthHeader('POST', url, s), 'Content-Type': 'application/json' }, timeout: TIMEOUT });
    return `post ${r.data.data.id}`;
  } catch (err) { throw apiError(err, 'X'); }
}

// WhatsApp: foto + texto em cada grupo escolhido, com uma pausa aleatória entre grupos (parece menos robô).
async function postWhatsApp(o, texto, s) {
  const grupos = whatsapp.gruposEscolhidos(s);
  const imagem = (await fotoMarcada(o, s)) || postImage(o, s); // arquivo com marca d'água ou endereço da foto da loja
  const ok = [], erros = [];
  for (let i = 0; i < grupos.length; i++) {
    try {
      await whatsapp.enviar(s, grupos[i].id, { imagem, texto });
      ok.push(grupos[i].nome);
    } catch (err) {
      erros.push(`${grupos[i].nome}: ${err.message}`);
    }
    if (i < grupos.length - 1) await new Promise(r => setTimeout(r, 6000 + Math.random() * 6000));
  }
  if (!ok.length) throw new Error(erros.join(' | '));
  return `enviado para ${ok.length} grupo(s)${erros.length ? `; falhou em ${erros.join(' | ')}` : ''}`;
}

// Texto padrão de uma oferta (mesmo modelo da tela de postagens), usado nas postagens agendadas.
function textoPadrao(o, s = settings.getAll()) {
  const LOJAS = { mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee', magalu: 'Magalu', shein: 'Shein', aliexpress: 'AliExpress', kabum: 'KaBuM!', temu: 'Temu' };
  const lines = [
    `*${o.produto}*`, '',
    `De ~R$ ${brl(o.preco_anterior)}~`,
    `*Por R$ ${brl(o.preco_atual)}* (${Math.round(o.desconto_pct)}% off)`,
    `Loja: ${LOJAS[o.store_id] || o.plataforma}`, '',
    postLink(o, s),
  ];
  const seen = o.last_seen_at && new Date(String(o.last_seen_at).replace(' ', 'T') + 'Z');
  if (seen && !isNaN(seen)) {
    const quando = seen.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    lines.push('', `_Preço conferido em ${quando}. Pode mudar a qualquer momento._`);
  }
  return lines.join('\n');
}

// Publica uma oferta nas redes pedidas; cada rede responde independentemente.
// ctx (postagem de cliente da ferramenta): { s: configurações do cliente, clienteId, link: link de afiliado dele }.
async function publicar(offerId, redes, texto, autor, ctx = {}) {
  const s = ctx.s || settings.getAll();
  const o = db.get('SELECT * FROM offers WHERE id = ?', offerId);
  if (!o) throw Object.assign(new Error('Oferta não encontrada.'), { status: 404 });
  if (ctx.link) o.__link = ctx.link;
  const msg = String(texto || '').trim().slice(0, 4000);
  if (!msg) throw Object.assign(new Error('O texto da postagem está vazio.'), { status: 400 });

  const resultados = [];
  for (const id of [...new Set(redes)]) {
    const rede = REDES[id];
    if (!rede) continue;
    const motivo = rede.pronta(s);
    let r;
    if (motivo) r = { rede: id, ok: false, mensagem: motivo };
    else {
      try { r = { rede: id, ok: true, mensagem: await rede.publicar(o, msg, s) }; }
      catch (err) { r = { rede: id, ok: false, mensagem: err.message.slice(0, 300) }; }
    }
    db.run('INSERT INTO social_posts (offer_id, produto, rede, ok, mensagem, autor, cliente_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      o.id, o.produto, id, r.ok ? 1 : 0, r.mensagem, autor, ctx.clienteId || null);
    resultados.push(r);
  }
  return resultados;
}

// clienteId: só as postagens daquele cliente; null = as do site (admin e usuários liberados).
function historico(offerIds, clienteId = null) {
  if (!offerIds.length) return {};
  const rows = db.all(
    `SELECT offer_id, rede, MAX(created_at) AS em FROM social_posts
     WHERE ok = 1 AND cliente_id IS ? AND offer_id IN (${offerIds.map(() => '?').join(',')}) GROUP BY offer_id, rede`, clienteId, ...offerIds);
  const out = {};
  for (const r of rows) (out[r.offer_id] ||= {})[r.rede] = r.em;
  return out;
}

module.exports = { REDES, listarRedes, publicar, historico, postLink, postImage, slugOf, textoPadrao, oauthHeader, toTelegramHtml, plain, textoCurto };
