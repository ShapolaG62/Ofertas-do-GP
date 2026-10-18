// Orquestra a mineração: percorre as lojas automáticas, grava as ofertas e registra o status de cada loja.
const db = require('./db');
const settings = require('./settings');
const offers = require('./offers');
const { STORES } = require('./stores');
const { sleep } = require('./util');

const DELAY_BETWEEN_QUERIES_MS = 2500;

let running = null;
let runningSince = null; // quando a mineração em andamento começou (para a animação da Capi no site)
let lastRun = null;
let timer = null;

function setStatus(storeId, fields) {
  const cur = db.get('SELECT * FROM store_status WHERE store_id = ?', storeId) || {};
  const next = { ...cur, ...fields };
  db.run(
    `INSERT INTO store_status (store_id, status, message, found, saved, last_run_at, last_success_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_id) DO UPDATE SET status = excluded.status, message = excluded.message, found = excluded.found,
       saved = excluded.saved, last_run_at = excluded.last_run_at, last_success_at = excluded.last_success_at`,
    storeId, next.status || null, next.message || null, next.found || 0, next.saved || 0,
    next.last_run_at || null, next.last_success_at || null
  );
}

async function mineStore(store, terms, s, log) {
  const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  const ready = store.isReady(s);
  if (!ready.ready) {
    setStatus(store.id, { status: store.automatic ? 'not_configured' : 'manual', message: ready.reason, found: 0, saved: 0 });
    return { store: store.id, found: 0, saved: 0, status: 'skipped' };
  }

  setStatus(store.id, { status: 'running', message: 'Minerando...', last_run_at: now() });
  let found = 0, saved = 0, lastStatus = 'ok', lastMessage = '';
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    let result;
    try {
      result = await store.search(term.query, s);
    } catch (err) {
      result = { status: 'error', message: err.message, deals: [] };
    }
    lastMessage = result.message || '';
    if (result.status === 'blocked') {
      lastStatus = 'blocked';
      log(`[${store.name}] bloqueado: ${result.message}`);
      break; // não insiste numa loja que está bloqueando
    }
    if (result.status === 'error') {
      lastStatus = 'error';
      log(`[${store.name}] "${term.query}": erro ${result.message}`);
    }
    for (const deal of result.deals) {
      found++;
      try {
        if (offers.saveDeal(store, deal, { settings: s, catHint: term.cat })) saved++;
      } catch (err) {
        log(`[${store.name}] falha ao gravar: ${err.message}`);
      }
    }
    if (i < terms.length - 1) await sleep(DELAY_BETWEEN_QUERIES_MS);
  }

  const ok = lastStatus === 'ok' || saved > 0;
  setStatus(store.id, {
    status: ok && lastStatus !== 'blocked' ? 'ok' : lastStatus,
    message: lastMessage || (ok ? '' : 'Nenhuma oferta encontrada'),
    found, saved,
    ...(saved > 0 ? { last_success_at: now() } : {}),
  });
  log(`[${store.name}] ${found} encontradas, ${saved} gravadas (${lastStatus})`);
  return { store: store.id, found, saved, status: lastStatus };
}

// Com centenas de termos, cada rodada busca só um lote e a próxima continua de onde esta parou.
// Assim a lista inteira é percorrida várias vezes por dia sem disparar centenas de buscas de uma vez.
function nextBatch(all) {
  const size = Math.min(Math.max(Math.round(settings.getNumber('mining_terms_per_run', 60)), 5), 500);
  if (all.length <= size) return all;
  const start = (Number(settings.get('mining_cursor')) || 0) % all.length;
  const batch = Array.from({ length: size }, (_, i) => all[(start + i) % all.length]);
  settings.set('mining_cursor', String((start + size) % all.length));
  return batch;
}

// options.query: busca um termo específico; options.storeIds: limita às lojas indicadas.
async function runMining(options = {}) {
  if (running) return { alreadyRunning: true };
  const s = settings.getAll();
  const enabled = settings.getEnabledStores();
  const terms = options.query ? [{ query: options.query, cat: null }] : nextBatch(settings.getSearchTerms());
  const stores = STORES.filter(st => !options.storeIds || options.storeIds.includes(st.id));
  const log = msg => console.log(`[MINER] ${msg}`);

  runningSince = new Date().toISOString();
  running = (async () => {
    const startedAt = runningSince;
    log(`Iniciando mineração (${options.query ? `termo "${options.query}"` : `${terms.length} termos`})`);
    const results = await Promise.all(stores.map(store => {
      if (store.automatic && enabled[store.id] === false) {
        setStatus(store.id, { status: 'disabled', message: 'Desativada no painel', found: 0, saved: 0 });
        return { store: store.id, status: 'disabled', found: 0, saved: 0 };
      }
      return mineStore(store, terms, s, log);
    }));
    const purged = offers.purgeOld();
    lastRun = { startedAt, finishedAt: new Date().toISOString(), results, purged, query: options.query || null };
    log(`Mineração concluída. ${results.reduce((a, r) => a + r.saved, 0)} ofertas gravadas.`);
    return lastRun;
  })();

  try {
    return await running;
  } finally {
    running = null;
    runningSince = null;
  }
}

// Situação resumida e pública: só diz se está minerando agora (usada pela animação da Capi)
const statusPublico = () => ({ minerando: Boolean(running), desde: runningSince });

function getState() {
  return {
    running: Boolean(running),
    lastRun,
    stores: STORES.map(st => ({
      id: st.id,
      name: st.name,
      method: st.method,
      automatic: st.automatic,
      ...(db.get('SELECT status, message, found, saved, last_run_at, last_success_at FROM store_status WHERE store_id = ?', st.id) || {}),
    })),
  };
}

// Agenda execuções periódicas; o intervalo é relido do painel a cada ciclo.
function startScheduler() {
  const schedule = delayMs => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await runMining(); } catch (err) { console.error('[MINER] erro inesperado:', err); }
      try { await require('./lojas').syncAllFeeds(); } catch (err) { console.error('[LOJAS] erro ao sincronizar feeds:', err); }
      schedule(Math.max(15, settings.getNumber('mining_interval_min', 120)) * 60 * 1000);
    }, delayMs);
  };
  schedule(10 * 1000);
}

module.exports = { statusPublico, runMining, getState, startScheduler };
