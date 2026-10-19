// Mercado Pago das lojas parceiras (modelo marketplace): cada empresa conecta a PRÓPRIA conta do Mercado Pago ao
// Ofertou! (autorização OAuth, feita pela empresa no site do Mercado Pago). Os pedidos são cobrados na conta da loja:
//  • o dinheiro cai direto no Mercado Pago da empresa — o Ofertou! não guarda nem repassa o dinheiro das vendas;
//  • a taxa de uso do site vai para o Mercado Pago do Ofertou! na mesma hora, separada pelo próprio Mercado Pago
//    (campo application_fee do pagamento);
//  • devoluções e contestações são feitas na conta da loja (a taxa do site volta junto, na proporção).
// Para funcionar, o dono do site cria uma aplicação no Mercado Pago Developers (Painel → Atendimento → Mercado Pago
// das lojas) e cola aqui o Client ID e o Client Secret. O endereço de retorno é <site>/api/mp/oauth/retorno (https).
// A autorização vale 180 dias e é renovada sozinha antes de vencer.
const crypto = require('crypto');
const axios = require('axios');
const db = require('./db');
const settings = require('./settings');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const MP = 'https://api.mercadopago.com';
const AUTH = 'https://auth.mercadopago.com.br/authorization';
const RENOVAR_ANTES_MS = 30 * 86400000; // renova quando faltam menos de 30 dias
const sqlDe = d => d.toISOString().replace('T', ' ').slice(0, 19);
const msDe = s => new Date(String(s).replace(' ', 'T') + 'Z').getTime();

for (const col of ['mp_public_key TEXT', 'mp_live INTEGER', 'mp_erro TEXT']) {
  try { db.db.exec(`ALTER TABLE lojas ADD COLUMN ${col}`); } catch { /* já existe */ }
}

const siteUrl = () => String(settings.get('site_url') || '').replace(/\/+$/, '');
const retornoUrl = () => `${siteUrl()}/api/mp/oauth/retorno`;
const credenciais = () => ({ id: String(settings.get('mp_mkt_client_id') || '').trim(), secret: String(settings.get('mp_mkt_client_secret') || '').trim() });
// Pronto para conectar lojas: aplicação criada e site publicado em https (o Mercado Pago só volta para https)
function configurado() {
  const c = credenciais();
  return Boolean(c.id && c.secret && /^https:\/\//i.test(siteUrl()));
}
const conectada = l => Boolean(l && l.mp_access_token && l.mp_user_id);

// ── Conectar ────────────────────────────────────────────────────────────────
const estados = new Map(); // state → { userId, exp }
function urlConectar(user) {
  if (!configurado()) throw fail('O recebimento pelo Mercado Pago das lojas ainda não foi ativado pelo administrador do site.', 503);
  const loja = db.get('SELECT id FROM lojas WHERE user_id = ?', user.id);
  if (!loja) throw fail('Crie sua loja antes de conectar o Mercado Pago.');
  const agora = Date.now();
  for (const [k, v] of estados) if (v.exp < agora) estados.delete(k);
  const state = crypto.randomBytes(24).toString('hex');
  estados.set(state, { userId: user.id, exp: agora + 15 * 60000 });
  const q = new URLSearchParams({ client_id: credenciais().id, response_type: 'code', platform_id: 'mp', state, redirect_uri: retornoUrl() });
  return `${AUTH}?${q}`;
}

async function oauthToken(corpo) {
  const c = credenciais();
  const r = await axios.post(`${MP}/oauth/token`, { client_id: c.id, client_secret: c.secret, ...corpo },
    { timeout: 20000, validateStatus: () => true, headers: { 'Content-Type': 'application/json' } });
  if (r.status >= 400 || !r.data?.access_token) {
    throw fail(`Mercado Pago: ${r.data?.message || r.data?.error_description || r.data?.error || `HTTP ${r.status}`}`, 502);
  }
  return r.data;
}

function gravarTokens(lojaId, t) {
  const expira = new Date(Date.now() + (Number(t.expires_in) || 15552000) * 1000);
  db.run(`UPDATE lojas SET mp_access_token = ?, mp_refresh_token = ?, mp_user_id = ?, mp_public_key = ?, mp_live = ?, mp_expira = ?, mp_erro = NULL,
          mp_conectado_em = COALESCE(mp_conectado_em, datetime('now')) WHERE id = ?`,
  t.access_token, t.refresh_token || null, String(t.user_id || ''), t.public_key || null, t.live_mode === false ? 0 : 1, sqlDe(expira), lojaId);
}

// Volta do Mercado Pago com o código de autorização
async function retorno(user, { code, state, error } = {}) {
  const e = estados.get(String(state || ''));
  estados.delete(String(state || ''));
  if (!e || e.exp < Date.now() || !user || e.userId !== user.id) throw fail('A autorização expirou ou não é desta conta. Tente conectar de novo.');
  if (error || !code) throw fail('A conexão foi cancelada no Mercado Pago.');
  const loja = db.get('SELECT * FROM lojas WHERE user_id = ?', user.id);
  if (!loja) throw fail('Loja não encontrada.', 404);
  const t = await oauthToken({ grant_type: 'authorization_code', code: String(code), redirect_uri: retornoUrl() });
  // Uma conta do Mercado Pago só pode estar ligada a uma loja
  const outra = db.get('SELECT id FROM lojas WHERE mp_user_id = ? AND id <> ?', String(t.user_id || ''), loja.id);
  if (outra) throw fail('Esta conta do Mercado Pago já está conectada a outra loja do Ofertou!.', 409);
  gravarTokens(loja.id, t);
  return situacao(db.get('SELECT * FROM lojas WHERE id = ?', loja.id));
}

function desconectar(user) {
  const loja = db.get('SELECT id FROM lojas WHERE user_id = ?', user.id);
  if (!loja) throw fail('Loja não encontrada.', 404);
  const abertos = db.get(`SELECT COUNT(*) n FROM pedidos_loja WHERE loja_id = ? AND status = 'aguardando_pagamento' AND gateway = 'mp'`, loja.id).n;
  if (abertos) throw fail('Há pedidos aguardando pagamento. Espere o pagamento ou cancele-os antes de desconectar.', 409);
  db.run(`UPDATE lojas SET mp_access_token = NULL, mp_refresh_token = NULL, mp_user_id = NULL, mp_public_key = NULL, mp_live = NULL,
          mp_expira = NULL, mp_conectado_em = NULL, mp_erro = NULL WHERE id = ?`, loja.id);
  return situacao(db.get('SELECT * FROM lojas WHERE id = ?', loja.id));
}

// ── Uso nos pagamentos ──────────────────────────────────────────────────────
async function renovar(loja) {
  if (!loja.mp_refresh_token) throw fail('A conexão com o Mercado Pago da loja venceu. A loja precisa conectar de novo.', 503);
  try {
    gravarTokens(loja.id, await oauthToken({ grant_type: 'refresh_token', refresh_token: loja.mp_refresh_token }));
  } catch (err) {
    db.run('UPDATE lojas SET mp_erro = ? WHERE id = ?', String(err.message).slice(0, 200), loja.id);
    throw err;
  }
  return db.get('SELECT * FROM lojas WHERE id = ?', loja.id);
}

// Access Token da loja, renovado se estiver perto de vencer
async function tokenDaLoja(lojaOuId) {
  let l = typeof lojaOuId === 'object' ? lojaOuId : db.get('SELECT * FROM lojas WHERE id = ?', Number(lojaOuId));
  if (!conectada(l)) throw fail('Esta loja não está com o Mercado Pago conectado.', 503);
  if (l.mp_expira && msDe(l.mp_expira) - Date.now() < RENOVAR_ANTES_MS) {
    try { l = await renovar(l); } catch (err) { if (msDe(l.mp_expira) <= Date.now()) throw err; /* ainda vale: usa o atual */ }
  }
  return l.mp_access_token;
}

// Todo dia: renova as conexões que vencem em menos de 30 dias
async function renovarTodas() {
  if (!configurado()) return;
  const limite = sqlDe(new Date(Date.now() + RENOVAR_ANTES_MS));
  for (const l of db.all('SELECT * FROM lojas WHERE mp_refresh_token IS NOT NULL AND mp_expira < ?', limite)) {
    try { await renovar(l); } catch (err) { console.error(`[MP LOJAS] renovação da loja ${l.id}:`, err.message); }
  }
}

function situacao(l) {
  return {
    disponivel: configurado(), conectado: conectada(l), conta_id: l?.mp_user_id || null, conectado_em: l?.mp_conectado_em || null,
    expira: l?.mp_expira || null, teste: l?.mp_live === 0, erro: l?.mp_erro || null,
  };
}

module.exports = { configurado, conectada, urlConectar, retorno, desconectar, tokenDaLoja, renovarTodas, situacao, retornoUrl };
