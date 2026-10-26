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
// Devolve { ok, mensagem } para a página do portal mostrar (quando foi aberta pelo botão "Portal" do painel)
const brl = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
async function recebido(msg) {
  // Produtos com comissão extra que estavam na página (Mercado Livre)
  let extras = '';
  if (Array.isArray(msg.comissoes) && msg.comissoes.length) {
    try {
      const c = await chamarSite('/api/ganhos/extensao/ml-comissoes', { method: 'POST', body: JSON.stringify({ itens: msg.comissoes }) });
      extras = ` ${msg.comissoes.length} produto(s) com comissão lidos (${c.extras} com extra no site).`;
    } catch { /* segue com o saldo */ }
  }
  const v = msg.valores || {};
  if (!Object.keys(v).length) {
    const mensagem = (msg.login ? 'Faça login no portal neste Chrome.' : 'Não encontrei o saldo nesta página: abra a página de ganhos/saldo do portal e toque em "Ler de novo".') + extras;
    await guardarEstado(msg.plataforma, { ok: false, mensagem });
    return { ok: false, mensagem };
  }
  const r = await postar({ plataforma: msg.plataforma, ...v, url: msg.url });
  await guardarEstado(msg.plataforma, r.ok
    ? { ok: true, mensagem: 'Sincronizado.', disponivel: r.disponivel, a_liberar: r.a_liberar }
    : { ok: false, mensagem: r.erro });
  return r.ok
    ? { ok: true, mensagem: `Saldo enviado: disponível ${brl(r.disponivel)}, a liberar ${brl(r.a_liberar)}.${extras}` }
    : { ok: false, mensagem: r.erro };
}

// Botão "Portal" do painel: guarda, por guia, para onde voltar depois de ler (vale 15 min)
async function guardarVolta(tabId, plataforma, voltar) {
  const { voltas = {} } = await chrome.storage.local.get('voltas');
  for (const [k, v] of Object.entries(voltas)) if (Date.now() - v.em > 15 * 60 * 1000) delete voltas[k];
  voltas[tabId] = { plataforma, voltar, em: Date.now() };
  await chrome.storage.local.set({ voltas });
}
async function pegarVolta(tabId, plataforma) {
  const { voltas = {} } = await chrome.storage.local.get('voltas');
  const v = voltas[tabId];
  if (!v || v.plataforma !== plataforma || Date.now() - v.em > 15 * 60 * 1000) return null;
  return v.voltar;
}
async function soltarVolta(tabId) {
  const { voltas = {} } = await chrome.storage.local.get('voltas');
  delete voltas[tabId];
  await chrome.storage.local.set({ voltas });
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
    const { janelaMl } = await chrome.storage.local.get('janelaMl');
    if (janelaMl) { try { await chrome.windows.remove(janelaMl); } catch { /* já fechada */ } }
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
    if (ativos.includes('mercadolivre')) await conferirComissoesMl();
  })().finally(() => { rodando = null; });
  return rodando;
}
let pendentes = null;

// ── Comissão dos produtos do Mercado Livre ──
// O Mercado Livre só mostra a comissão (e a comissão extra das campanhas) na página do produto, para quem está
// logado como afiliado. A cada sincronização, confere um lote dos produtos do Ofertou! (os mais atrativos primeiro):
// abre as páginas numa janela minimizada, 4 de cada vez, lê o ganho (content-ml.js) e manda ao site.
const LOTE_ML = 24, JUNTAS = 4, ESPERA_ML_MS = 4 * 60 * 1000;
let conferindo = null; // { janela, abas: Map(tabId → item), resultados: [] , proxima }

async function chamarSite(caminho, opcoes = {}) {
  const { site, chave } = await config();
  const r = await fetch(`${site}${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `O site respondeu ${r.status}.`);
  return j;
}

async function conferirComissoesMl() {
  let lista;
  try { lista = (await chamarSite(`/api/ganhos/extensao/ml-pendentes?n=${LOTE_ML}`)).itens || []; }
  catch (err) { await guardarEstado('ml_comissao', { ok: false, mensagem: err.message }); return; }
  if (!lista.length) { await guardarEstado('ml_comissao', { ok: true, mensagem: 'Todos os produtos do Mercado Livre já foram conferidos.' }); return; }
  const fila = lista.slice();
  const janela = await chrome.windows.create({ url: 'about:blank', state: 'minimized', focused: false })
    .catch(() => chrome.windows.create({ url: 'about:blank', focused: false }));
  await chrome.storage.local.set({ janelaMl: janela.id });
  const resultados = [];
  const manter = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  await new Promise(resolve => {
    const fim = setTimeout(resolve, ESPERA_ML_MS);
    const abas = new Map();
    const abrir = async () => {
      while (abas.size < JUNTAS && fila.length) {
        const it = fila.shift();
        try { const aba = await chrome.tabs.create({ windowId: janela.id, url: it.url, active: false }); abas.set(aba.id, it); } catch { /* segue */ }
      }
      if (!abas.size && !fila.length) { clearTimeout(fim); resolve(); }
    };
    conferindo = {
      janela: janela.id,
      receber: async (tabId, msg) => {
        const it = abas.get(tabId);
        if (!it) return;
        abas.delete(tabId);
        resultados.push({ id: it.id, item: it.item, comissao: msg.comissao, extra: msg.extra || 0 });
        try { await chrome.tabs.remove(tabId); } catch { /* já fechada */ }
        abrir();
      },
    };
    abrir();
  });
  clearInterval(manter);
  conferindo = null;
  try { await chrome.windows.remove(janela.id); } catch { /* já fechada */ }
  await chrome.storage.local.set({ janelaMl: null });
  const lidos = resultados.filter(r => r.comissao != null);
  if (!lidos.length) {
    await guardarEstado('ml_comissao', { ok: false, mensagem: `Abri ${resultados.length} produto(s), mas não achei o ganho de afiliado na página. Entre no Mercado Livre com a sua conta de afiliado neste Chrome.` });
    return;
  }
  try {
    const r = await chamarSite('/api/ganhos/extensao/ml-comissoes', { method: 'POST', body: JSON.stringify({ itens: lidos }) });
    await guardarEstado('ml_comissao', { ok: true, mensagem: `${lidos.length} produto(s) conferido(s), ${r.extras} com comissão extra.` });
  } catch (err) { await guardarEstado('ml_comissao', { ok: false, mensagem: err.message }); }
}

// Produto do Mercado Livre que VOCÊ abriu: manda a comissão lida na hora
async function comissaoAvulsa(msg) {
  if (msg.comissao == null || !msg.item) return;
  try { await chamarSite('/api/ganhos/extensao/ml-comissoes', { method: 'POST', body: JSON.stringify({ itens: [{ item: msg.item, comissao: msg.comissao, extra: msg.extra || 0 }] }) }); }
  catch { /* sem chave ou site fora: tenta na próxima */ }
}

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  if (msg?.tipo === 'ir-portal') {
    if (remetente.tab?.id != null) guardarVolta(remetente.tab.id, msg.plataforma, msg.voltar).then(() => responder({ ok: true }));
    else responder({ ok: false });
    return true;
  }
  if (msg?.tipo === 'lido') {
    (async () => {
      const r = await recebido(msg).catch(err => ({ ok: false, mensagem: err.message }));
      const tabId = remetente.tab?.id;
      const voltar = tabId != null ? await pegarVolta(tabId, msg.plataforma) : null;
      if (voltar && r.ok) await soltarVolta(tabId);
      responder({ ...r, voltar });
      const { janelaSync } = await chrome.storage.local.get('janelaSync');
      if (!janelaSync || remetente.tab?.windowId !== janelaSync) return; // você abriu o portal: não fecha nada
      if (pendentes) { pendentes.faltam.delete(msg.plataforma); pendentes.pronto(); }
      // Aba da sincronização: fecha assim que leu (a janela some quando a última aba fecha)
      try { await chrome.tabs.remove(tabId); } catch { /* já fechada */ }
    })();
    return true; // resposta assíncrona
  }
  if (msg?.tipo === 'comissao-ml') {
    if (conferindo && remetente.tab?.windowId === conferindo.janela) conferindo.receber(remetente.tab.id, msg);
    else comissaoAvulsa(msg);
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
