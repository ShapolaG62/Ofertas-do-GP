// Grupo de automação: um grupo de WhatsApp seu (com o número das postagens como administrador) vira o controle remoto
// das postagens. Quem está no grupo manda um link (ou encaminha a oferta de outro grupo) e a Capi posta nos grupos de
// envio, com o seu link de afiliado e o seu modelo de mensagem. Comandos: ajuda, preview, converter, fila, cupom,
// envio (comunicado), status, pausar e ligar.
// O WhatsApp avisa o site de cada mensagem pelo webhook da Z-API ou da Evolution API (POST /api/whatsapp/webhook/<segredo>).
// Vale para o site (admin) e para cada cliente da ferramenta, cada um com o próprio grupo, segredo e configuração.
const crypto = require('crypto');
const axios = require('axios');
const db = require('./db');
const settings = require('./settings');
const whatsapp = require('./whatsapp');

const semAcento = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const soDigitos = v => String(v || '').replace(/@.*$/, '').replace(/-group$/, '').replace(/\D/g, '');
const log = m => console.log(`[GRUPO AUTOMAÇÃO] ${m}`);

// ── Dono do webhook (site ou cliente) pelo segredo do endereço ──────────────
function segredoDe(cid = null) {
  const atual = cid
    ? db.get(`SELECT value FROM cliente_config WHERE cliente_id = ? AND key = 'wa_webhook_segredo'`, cid)?.value
    : settings.get('wa_webhook_segredo');
  return atual || novoSegredo(cid);
}
function novoSegredo(cid = null) {
  const s = crypto.randomBytes(18).toString('hex');
  if (cid) db.run(`INSERT INTO cliente_config (cliente_id, key, value) VALUES (?, 'wa_webhook_segredo', ?)
                   ON CONFLICT(cliente_id, key) DO UPDATE SET value = excluded.value`, cid, s);
  else settings.set('wa_webhook_segredo', s);
  return s;
}
function donoDoSegredo(segredo) {
  const s = String(segredo || '');
  if (s.length < 20) return null;
  const site = settings.get('wa_webhook_segredo');
  if (site && site.length === s.length && crypto.timingSafeEqual(Buffer.from(site), Buffer.from(s))) return { cid: null };
  const c = db.get(`SELECT cliente_id FROM cliente_config WHERE key = 'wa_webhook_segredo' AND value = ?`, s);
  if (!c) return null;
  const ok = db.get(`SELECT 1 FROM clientes WHERE id = ? AND status = 'ativo' AND validade >= datetime('now')`, c.cliente_id);
  return ok ? { cid: c.cliente_id } : null;
}
const configDe = cid => (cid ? require('./clientes').config(cid) : settings.getAll());
const baseSite = () => String(settings.get('site_url') || '').trim().replace(/\/+$/, '');
const enderecoWebhook = (cid = null) => `${baseSite() || 'https://SEU-SITE'}/api/whatsapp/webhook/${segredoDe(cid)}`;

// ── Mensagem recebida (Z-API ou Evolution) → { grupo, texto, deMim, autor } ──
function lerWebhook(b) {
  if (!b || typeof b !== 'object') return null;
  // Evolution API (v1 e v2): evento messages.upsert
  if (b.data && (b.event || '').toLowerCase().replace('_', '.').includes('messages.upsert')) {
    const d = Array.isArray(b.data) ? b.data[0] : b.data;
    const m = d?.message || {};
    const texto = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '';
    return { grupo: d?.key?.remoteJid || '', texto, deMim: Boolean(d?.key?.fromMe), autor: d?.pushName || '' };
  }
  // Z-API: "ao receber"
  if ('phone' in b && ('text' in b || 'image' in b || 'isGroup' in b)) {
    const texto = b.text?.message || b.image?.caption || b.video?.caption || '';
    return { grupo: b.isGroup ? String(b.phone) : '', texto, deMim: Boolean(b.fromMe), autor: b.senderName || b.chatName || '' };
  }
  return null;
}

// ── Comandos ────────────────────────────────────────────────────────────────
const AJUDA = `🦫 *Capi · grupo de automação*
Mande aqui e eu cuido do resto:

🔗 *Um link de produto* (ou encaminhe a oferta de outro grupo) → posto agora em todos os seus grupos, com o seu link de afiliado e o seu modelo.
👀 *preview* + link → mostro a mensagem aqui, sem postar.
🔁 *converter* + link → devolvo o link com o seu código de afiliado.
📥 *fila* + link → guardo na fila das postagens agendadas.
🎟️ *cupom CODIGO* + link, na 1ª linha → a mensagem sai com o seu cupom (cupom de oferta encaminhada de outro grupo é descartado).
📢 *envio:* seu texto → mando o texto para todos os grupos.
📊 *status* → como estão as postagens agendadas.
⏸️ *pausar* / ▶️ *ligar* → desliga ou liga o agendamento.`;

const PRECO = v => { const n = Number(String(v || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
// Lê título e preços de uma oferta encaminhada ("De R$ 229,99 ❌ / Por: R$ 126,75 🔥")
function lerOfertaDoTexto(texto) {
  const linhas = String(texto).split('\n').map(l => l.replace(/[*_~]/g, '').trim()).filter(Boolean);
  const de = /\bde:?\s*r\$\s*([\d.]+,\d{2}|[\d.]+)/i.exec(texto);
  const por = /\bpor:?\s*r\$\s*([\d.]+,\d{2}|[\d.]+)/i.exec(texto);
  const todos = [...String(texto).matchAll(/r\$\s*([\d.]+,\d{2})/gi)].map(m => PRECO(m[1])).filter(Boolean);
  let anterior = de ? PRECO(de[1]) : null, atual = por ? PRECO(por[1]) : null;
  if ((!anterior || !atual) && todos.length >= 2) { anterior = Math.max(...todos); atual = Math.min(...todos); }
  const titulo = linhas.find(l => !/https?:\/\//i.test(l) && !/r\$/i.test(l) && !/^(de|por|cupom|use o cupom|compre|link|⚠)/i.test(semAcento(l).replace(/^[^a-z0-9]+/, ''))
    && /[a-z]{3,}/i.test(semAcento(l)) && l.length >= 8);
  return { titulo: titulo ? titulo.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 200) : null, anterior, atual };
}

// Acha a oferta do link no site ou cria uma oferta manual (com os preços da mensagem encaminhada)
async function ofertaDoLink(url, texto) {
  const { storeFromUrl } = require('./stores');
  let final = url, store = storeFromUrl(url);
  if (!store) { try { final = await require('./net').resolverLink(url); store = storeFromUrl(final); } catch { /* não abriu */ } }
  if (!store) return { erro: 'Esse link não é de uma loja com programa de afiliados ligado (Mercado Livre, Amazon, Shopee, Magalu, KaBuM!, AliExpress).' };
  const pid = store.productIdFromUrl ? store.productIdFromUrl(final) : null;
  let o = pid && db.get(`SELECT * FROM offers WHERE store_id = ? AND store_product_id = ? AND oculto = 0 ORDER BY last_seen_at DESC LIMIT 1`, store.id, pid);
  if (o && require('./offers').isActive(o.id)) return { o, store };
  const lido = lerOfertaDoTexto(texto);
  if (!lido.titulo || !lido.anterior || !lido.atual || lido.anterior <= lido.atual) {
    return { erro: `Não achei esse produto da ${store.name} no site e não encontrei os preços na mensagem. Encaminhe a oferta completa (com "De R$ … Por R$ …" e o nome) ou mande só ofertas que estão no site.` };
  }
  const offers = require('./offers');
  const expira = new Date(Date.now() + 2 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const id = offers.saveDeal(store, { store_product_id: pid || crypto.createHash('sha1').update(final).digest('hex').slice(0, 16), produto: lido.titulo,
    preco_atual: lido.atual, preco_anterior: lido.anterior, imagem: null, original_url: final.split('#')[0] }, { fonte: 'manual', expiresAt: expira });
  if (!id) return { erro: 'Não consegui criar a oferta com esses dados (confira os preços: o desconto precisa ficar entre 1% e 95%).' };
  return { o: db.get('SELECT * FROM offers WHERE id = ?', id), store, criada: true };
}

async function processar({ cid, s }, m) {
  const controle = String(s.wa_grupo_controle || '').trim();
  if (!controle || !m || m.deMim || !m.texto || soDigitos(m.grupo) !== soDigitos(controle)) return;
  const texto = String(m.texto).trim();
  const t = semAcento(texto);
  const responder = msg => whatsapp.enviar(s, controle, { texto: msg }).catch(err => log(`resposta falhou: ${err.message}`));
  const agenda = require('./agenda');
  const salvar = (k, v) => (cid ? require('./clientes').salvarConfig(cid, { [k]: v }) : settings.set(k, v));
  try {
    if (/^(ajuda|comandos|menu|\?|oi capi|capi)\b/.test(t)) return responder(AJUDA);
    if (/^status\b/.test(t)) {
      const e = agenda.estado(cid);
      return responder(`📊 Agendamento *${e.ativa ? 'ligado' : 'desligado'}*${e.ativa ? ` (${e.horarios.join(', ')})` : ''}\n📥 Na fila: ${e.pendentes}\n${e.proximo ? `⏭️ Próximo envio: ${e.proximo}` : ''}`);
    }
    if (/^(pausar|parar|desligar)\b/.test(t)) { salvar('agenda_ativa', '0'); return responder('⏸️ Agendamento desligado. Mande *ligar* para voltar.'); }
    if (/^(ligar|retomar|ativar)\b/.test(t)) { salvar('agenda_ativa', '1'); return responder('▶️ Agendamento ligado.'); }
    const comunicado = /^(envio|aviso|comunicado)\s*:\s*([\s\S]+)/i.exec(texto);
    if (comunicado) {
      const grupos = whatsapp.gruposEscolhidos(s).filter(g => soDigitos(g.id) !== soDigitos(controle));
      let ok = 0;
      for (const g of grupos) { try { await whatsapp.enviar(s, g.id, { texto: comunicado[2].trim() }); ok++; } catch { /* segue */ } await new Promise(r => setTimeout(r, 3000)); }
      return responder(`📢 Comunicado enviado para ${ok} de ${grupos.length} grupo(s).`);
    }
    const url = (/(https?:\/\/[^\s<>"']+)/i.exec(texto) || [])[1];
    if (!url) return; // conversa normal do grupo: a Capi fica quieta
    // Cupom: só o que VOCÊ escreve na 1ª linha (ex.: "cupom MEU10" e o link). O cupom que vem numa oferta encaminhada
    // de outro grupo é ignorado: cupom nominal de outro afiliado daria a venda para ele.
    const cupom = (/\bcupom:?\s*([A-Z0-9_-]{3,30})\b/i.exec(texto.split('\n')[0]) || [])[1] || null;

    if (/^(converter|converte|link)\b/.test(t)) {
      const r = await ofertaDoLink(url, texto);
      if (r.erro && !r.store) return responder(`⚠️ ${r.erro}`);
      const { storeFromUrl } = require('./stores');
      const store = r.store || storeFromUrl(url);
      const o = r.o || { store_id: store.id, original_url: url };
      const link = cid ? await require('./clientes').linkAfiliado(cid, o, s) : (store.affiliateLink(o, s) || url);
      return responder(`🔁 Seu link (${store.name}):\n${require('./encurtador').curto(link)}`);
    }

    const r = await ofertaDoLink(url, texto);
    if (r.erro) return responder(`⚠️ ${r.erro}`);
    const o = r.o;
    if (cupom) o.cupom = cupom.toUpperCase();
    const social = require('./social');
    const link = cid ? await require('./clientes').linkParaPostar(cid, o, s) : null;
    if (link) o.__link = link;
    o.__link = require('./encurtador').curto(social.postLink(o, s));
    const mensagem = social.textoPadrao(o, s);

    if (/^(preview|previa|prévia|ver)\b/.test(t)) return responder(`👀 *Prévia* (não foi postado):\n\n${mensagem}`);
    if (/^(fila|salvar|guardar|agendar)\b/.test(t)) {
      agenda.enfileirar([{ offer_id: o.id, texto: mensagem }], 'grupo de automação', cid);
      return responder(`📥 Na fila das postagens agendadas (${agenda.pendentes(cid)} esperando).${r.criada ? ' Criei a oferta a partir da mensagem encaminhada.' : ''}`);
    }
    // Padrão: posta agora nas redes do agendamento (ou só no WhatsApp)
    let redes = [];
    try { redes = JSON.parse(s.agenda_redes || '[]'); } catch { /* vazio */ }
    redes = (redes.length ? redes : ['whatsapp']).filter(id => social.REDES[id] && !social.REDES[id].pronta(s));
    if (!redes.length) return responder('⚠️ Nenhuma rede de postagem está configurada.');
    const resultados = await social.publicar(o.id, redes, mensagem, `grupo de automação${m.autor ? ` (${m.autor})` : ''}`, cid ? { s, clienteId: cid, link } : {});
    const resumo = resultados.map(x => `${x.ok ? '✅' : '❌'} ${social.REDES[x.rede]?.nome || x.rede}: ${x.ok ? x.mensagem : x.mensagem.slice(0, 120)}`).join('\n');
    return responder(`${r.criada ? '🆕 Oferta criada a partir da mensagem.\n' : ''}${resumo}`);
  } catch (err) {
    log(`erro: ${err.message}`);
    return responder(`⚠️ Não consegui fazer isso: ${err.message.slice(0, 200)}`);
  }
}

// ── Liga o webhook no serviço do WhatsApp (Z-API ou Evolution) ──────────────
async function ativarWebhook(cid = null) {
  const s = configDe(cid);
  const c = whatsapp.config(s);
  if (c.erro) throw new Error(c.erro);
  if (!/^https:\/\//i.test(baseSite())) throw new Error('Preencha o "Endereço público do site" (https://…) em Painel → Site antes de ativar.');
  const url = enderecoWebhook(cid);
  if (c.tipo === 'zapi') {
    await axios.put(`${c.base}/update-webhook-received`, { value: url }, { headers: c.headers, timeout: 20000 });
    return url;
  }
  const v2 = { webhook: { enabled: true, url, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] } };
  try { await axios.post(`${c.base}/webhook/set/${c.instancia}`, v2, { headers: c.headers, timeout: 20000 }); }
  catch (err) {
    if (err.response?.status !== 400) throw err;
    await axios.post(`${c.base}/webhook/set/${c.instancia}`, { url, enabled: true, events: ['MESSAGES_UPSERT'] }, { headers: c.headers, timeout: 20000 });
  }
  return url;
}

module.exports = { lerWebhook, processar, donoDoSegredo, configDe, enderecoWebhook, novoSegredo, segredoDe, ativarWebhook, lerOfertaDoTexto, AJUDA };
