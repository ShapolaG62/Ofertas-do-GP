// Sincronização automática dos ganhos de afiliados com os programas que têm API de relatório:
//  • Shopee Afiliados: relatório de conversões da Open API (as mesmas chaves da mineração: App ID e Senha da API);
//  • KaBuM! (Awin): API de transações da Awin (ID de publisher + chave da API, em Painel → Ganhos de afiliados).
// Mercado Livre, Amazon e Magalu não oferecem API de relatório para afiliados: as vendas deles entram pela
// importação da planilha exportada do portal (Painel → Ganhos de afiliados → Importar vendas).
// Roda a cada 6 horas e pelo botão "Sincronizar agora". Cada venda é gravada uma vez (e atualizada se mudar de situação).
const crypto = require('crypto');
const settings = require('./settings');
const ganhos = require('./ganhos');
const { http } = require('./util');

const ESTADO = 'ganhos_sync_estado'; // { plataforma: { em, ok, mensagem, novas, atualizadas } } (chave interna)
const lerEstado = () => { try { return JSON.parse(settings.get(ESTADO) || '{}') || {}; } catch { return {}; } };
function gravarEstado(id, dados) { const e = lerEstado(); e[id] = { em: new Date().toISOString(), ...dados }; settings.set(ESTADO, JSON.stringify(e)); }
const sqlDe = segundos => new Date(segundos * 1000).toISOString().replace('T', ' ').slice(0, 19);

// ── Shopee ──────────────────────────────────────────────────────────────────
async function shopeeGql(s, query) {
  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const assinatura = crypto.createHash('sha256').update(`${s.shopee_app_id}${ts}${payload}${s.shopee_app_secret}`).digest('hex');
  const r = await http.post('https://open-api.affiliate.shopee.com.br/graphql', payload, {
    headers: { 'Content-Type': 'application/json', Authorization: `SHA256 Credential=${s.shopee_app_id}, Timestamp=${ts}, Signature=${assinatura}` },
    validateStatus: () => true, timeout: 30000,
  });
  if (r.data?.errors?.length) throw new Error(`API Shopee: ${r.data.errors[0].message}`);
  if (r.status !== 200) throw new Error(`API Shopee: HTTP ${r.status}`);
  return r.data.data || {};
}
async function shopee(s, dias = 90) {
  if (!s.shopee_app_id || !s.shopee_app_secret) return { pulada: 'Informe o App ID e a Senha da API da Shopee (Painel → Lojas e afiliados).' };
  let novas = 0, atualizadas = 0;
  const agora = Math.floor(Date.now() / 1000);
  // A Shopee aceita janelas de até 30 dias por consulta
  for (let fim = agora; fim > agora - dias * 86400; fim -= 30 * 86400) {
    const ini = Math.max(agora - dias * 86400, fim - 30 * 86400);
    let scroll = '';
    for (let pagina = 0; pagina < 40; pagina++) {
      const d = await shopeeGql(s, `{ conversionReport(purchaseTimeStart: ${ini}, purchaseTimeEnd: ${fim}, limit: 500${scroll ? `, scrollId: ${JSON.stringify(scroll)}` : ''}) {
        nodes { purchaseTime conversionId orders { orderId orderStatus items { itemName itemPrice qty itemTotalCommission } } }
        pageInfo { hasNextPage scrollId } } }`);
      const rel = d.conversionReport || {};
      for (const n of rel.nodes || []) {
        for (const o of n.orders || []) {
          const itens = o.items || [];
          const comissao = itens.reduce((a, i) => a + (Number(i.itemTotalCommission) || 0), 0);
          const venda = itens.reduce((a, i) => a + (Number(i.itemPrice) || 0) * (Number(i.qty) || 1), 0);
          const r = ganhos.registrar({
            plataforma: 'shopee', externo: `${n.conversionId}-${o.orderId}`, data_venda: sqlDe(Number(n.purchaseTime)),
            pedido: String(o.orderId), produto: itens.map(i => i.itemName).filter(Boolean).join(' + ').slice(0, 200),
            valor_venda: venda || null, comissao, status: o.orderStatus || 'pendente',
          }, 'api');
          r.novo ? novas++ : atualizadas++;
        }
      }
      if (!rel.pageInfo?.hasNextPage || !rel.pageInfo.scrollId) break;
      scroll = rel.pageInfo.scrollId;
    }
  }
  return { novas, atualizadas };
}

// ── KaBuM! pela Awin ────────────────────────────────────────────────────────
async function awin(s, dias = 90) {
  const pub = String(s.ganhos_awin_publisher || '').trim(), token = String(s.ganhos_awin_token || '').trim();
  if (!pub || !token) return { pulada: 'Informe o ID de publisher e a chave da API da Awin (Painel → Ganhos de afiliados → Sincronização).' };
  let novas = 0, atualizadas = 0;
  const agora = Date.now();
  // A Awin aceita até 31 dias por consulta
  for (let fim = agora; fim > agora - dias * 86400000; fim -= 30 * 86400000) {
    const ini = Math.max(agora - dias * 86400000, fim - 30 * 86400000);
    const f = ms => new Date(ms).toISOString().slice(0, 19);
    const r = await http.get(`https://api.awin.com/publishers/${encodeURIComponent(pub)}/transactions/`, {
      params: { startDate: f(ini), endDate: f(fim), timezone: 'UTC' }, headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true, timeout: 30000,
    });
    if (r.status === 401 || r.status === 403) throw new Error('A Awin recusou a chave da API (confira o ID de publisher e a chave).');
    if (r.status !== 200) throw new Error(`API Awin: HTTP ${r.status}`);
    for (const t of Array.isArray(r.data) ? r.data : []) {
      const st = String(t.commissionStatus || '').toLowerCase();
      const x = ganhos.registrar({
        plataforma: 'kabum', externo: String(t.id), data_venda: String(t.transactionDate || '').replace('T', ' ').slice(0, 19),
        pedido: t.orderRef || String(t.id), produto: t.advertiserName || 'KaBuM!',
        valor_venda: Number(t.saleAmount?.amount) || null, comissao: Number(t.commissionAmount?.amount) || 0,
        status: st === 'approved' ? (t.paidToPublisher ? 'paga' : 'confirmada') : st === 'declined' || st === 'deleted' ? 'cancelada' : 'pendente',
      }, 'api');
      x.novo ? novas++ : atualizadas++;
    }
  }
  return { novas, atualizadas };
}

const FONTES = { shopee, kabum: awin };
const SEM_API = {
  mercadolivre: 'O Mercado Livre não tem API de relatório para afiliados: registre a venda em "Adicionar venda" (com a comissão que aparece no portal) ou importe a planilha, se o portal permitir exportar.',
  amazon: 'A Amazon não tem API de ganhos para associados no Brasil: importe o Relatório de ganhos (CSV) abaixo.',
  magalu: 'O Parceiro Magalu não tem API de relatório: registre a venda em "Adicionar venda" ou importe a planilha do portal.',
  aliexpress: 'Importe o relatório de pedidos do AliExpress Portals (CSV) abaixo.',
};

let rodando = false;
async function sincronizar() {
  if (rodando) return { erro: 'Já existe uma sincronização em andamento.' };
  rodando = true;
  const s = settings.getAll();
  const out = {};
  try {
    for (const [id, fn] of Object.entries(FONTES)) {
      try {
        const r = await fn(s);
        if (r.pulada) { gravarEstado(id, { ok: false, mensagem: r.pulada }); out[id] = r; continue; }
        gravarEstado(id, { ok: true, mensagem: `${r.novas} venda(s) nova(s), ${r.atualizadas} atualizada(s)`, ...r });
        out[id] = r;
      } catch (err) {
        gravarEstado(id, { ok: false, mensagem: err.message });
        out[id] = { erro: err.message };
      }
    }
    ganhos.verificar(); // avisa se alguma plataforma passou do mínimo de saque
  } finally { rodando = false; }
  return out;
}
function estado() {
  const e = lerEstado();
  const lista = {};
  for (const id of Object.keys(FONTES)) lista[id] = { automatica: true, ...(e[id] || { ok: null, mensagem: 'Ainda não sincronizou.' }) };
  for (const [id, msg] of Object.entries(SEM_API)) lista[id] = { automatica: false, ok: null, mensagem: msg };
  return { rodando, plataformas: lista };
}

let timer = null;
function iniciar() {
  clearInterval(timer);
  setTimeout(() => sincronizar().catch(err => console.error('[GANHOS SYNC]', err.message)), 60 * 1000);
  timer = setInterval(() => sincronizar().catch(err => console.error('[GANHOS SYNC]', err.message)), 6 * 3600 * 1000);
}

module.exports = { sincronizar, estado, iniciar, shopee, awin };
