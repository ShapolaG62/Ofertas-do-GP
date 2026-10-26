// Ofertou! Ganhos — sincroniza sozinha, em segundo plano: a cada 3 horas (e ao salvar a chave) abre os portais
// escolhidos numa janela minimizada, cada página lê o saldo (content.js), a extensão manda ao painel do Ofertou! e
// fecha a janela. Usa a sua conta já logada no Chrome; não digita senha nem clica em nada.
const PORTAIS = {
  mercadolivre: { nome: 'Mercado Livre', url: 'https://www.mercadolivre.com.br/afiliados/dashboard' },
  amazon: { nome: 'Amazon', url: 'https://associados.amazon.com.br/home' },
  magalu: { nome: 'Magalu', url: 'https://www.parceiromagalu.com.br/' },
  shopee: { nome: 'Shopee', url: 'https://affiliate.shopee.com.br/dashboard' },
  aliexpress: { nome: 'AliExpress', url: 'https://portals.aliexpress.com/' },
  kabum: { nome: 'KaBuM! (Awin)', url: 'https://ui.awin.com/' },
};
const ATIVOS_PADRAO = ['mercadolivre', 'amazon', 'magalu']; // os que não têm API (Shopee e Awin já sincronizam pelo site)
const INTERVALO_MIN = 180;
const ESPERA_MS = 70 * 1000; // tempo máximo para os portais carregarem

async function config() {
  const c = await chrome.storage.local.get(['site', 'chave', 'ativos']);
  return {
    site: String(c.site || 'https://tanoofertou.com.br').replace(/\/+$/, ''),
    chave: String(c.chave || ''),
    ativos: Array.isArray(c.ativos) ? c.ativos : ATIVOS_PADRAO,
  };
}

async function postar(corpo) {
  const { site, chave } = await config();
  if (!chave) return { ok: false, erro: 'Cole a chave gerada no painel (clique no ícone do Ofertou!).' };
  try {
    const r = await fetch(`${site}/api/ganhos/extensao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, ...j } : { ok: false, erro: j.error || `O site respondeu ${r.status}.` };
  } catch (err) {
    return { ok: false, erro: `Não consegui falar com ${site} (${err.message}).` };
  }
}

async function guardarEstado(plataforma, dados) {
  const { estado = {} } = await chrome.storage.local.get('estado');
  estado[plataforma] = { em: Date.now(), ...dados };
  await chrome.storage.local.set({ estado });
}

// Uma página de portal terminou de ler
async function recebido(msg) {
  const v = msg.valores || {};
  if (!Object.keys(v).length) {
    await guardarEstado(msg.plataforma, { ok: false, mensagem: msg.login ? 'Faça login no portal neste Chrome.' : 'Não encontrei o saldo na página.' });
    return;
  }
  const r = await postar({ plataforma: msg.plataforma, ...v, url: msg.url });
  await guardarEstado(msg.plataforma, r.ok
    ? { ok: true, mensagem: 'Sincronizado.', disponivel: r.disponivel, a_liberar: r.a_liberar }
    : { ok: false, mensagem: r.erro });
}

let rodando = null;
async function sincronizar() {
  if (rodando) return rodando;
  rodando = (async () => {
    const { chave, ativos } = await config();
    if (!chave || !ativos.length) return;
    const urls = ativos.filter(id => PORTAIS[id]).map(id => PORTAIS[id].url);
    // Janela de uma sincronização anterior que ficou aberta (o Chrome pode ter pausado a extensão no meio)
    const { janelaSync } = await chrome.storage.local.get('janelaSync');
    if (janelaSync) { try { await chrome.windows.remove(janelaSync); } catch { /* já fechada */ } }
    let janela;
    try {
      janela = await chrome.windows.create({ url: urls, state: 'minimized', focused: false });
    } catch {
      janela = await chrome.windows.create({ url: urls, focused: false });
      try { await chrome.windows.update(janela.id, { state: 'minimized' }); } catch { /* segue assim */ }
    }
    await chrome.storage.local.set({ janelaSync: janela.id });
    const faltam = new Set(ativos);
    const manter = setInterval(() => chrome.runtime.getPlatformInfo(), 20000); // mantém a extensão acordada na espera
    await new Promise(resolve => {
      const fim = setTimeout(resolve, ESPERA_MS);
      pendentes = { janela: janela.id, faltam, pronto: () => { if (!faltam.size) { clearTimeout(fim); resolve(); } } };
    });
    for (const id of faltam) await guardarEstado(id, { ok: false, mensagem: 'Não abriu a página de ganhos: faça login no portal neste Chrome (ou ele demorou; tenta de novo na próxima vez).' });
    clearInterval(manter);
    pendentes = null;
    try { await chrome.windows.remove(janela.id); } catch { /* já fechada */ }
    await chrome.storage.local.set({ ultima: Date.now(), janelaSync: null });
  })().finally(() => { rodando = null; });
  return rodando;
}
let pendentes = null;

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  if (msg?.tipo === 'lido') {
    recebido(msg).finally(async () => {
      const { janelaSync } = await chrome.storage.local.get('janelaSync');
      if (!janelaSync || remetente.tab?.windowId !== janelaSync) return; // você abriu o portal: não fecha nada
      if (pendentes) { pendentes.faltam.delete(msg.plataforma); pendentes.pronto(); }
      // Aba da sincronização: fecha assim que leu (a janela some quando a última aba fecha)
      try { await chrome.tabs.remove(remetente.tab.id); } catch { /* já fechada */ }
    });
    return false;
  }
  if (msg?.tipo === 'testar') { postar({ teste: true }).then(responder); return true; }
  if (msg?.tipo === 'sincronizar') { sincronizar().then(() => responder({ ok: true })); return true; }
  if (msg?.tipo === 'portais') { responder({ PORTAIS, ATIVOS_PADRAO }); return false; }
  return false;
});

function agendar() { chrome.alarms.create('sincronizar', { delayInMinutes: 1, periodInMinutes: INTERVALO_MIN }); }
chrome.runtime.onInstalled.addListener(agendar);
chrome.runtime.onStartup.addListener(agendar);
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'sincronizar') sincronizar(); });
