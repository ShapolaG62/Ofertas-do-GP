// Postagens agendadas: nos horários do painel (padrão 09:00, 14:00 e 20:00, horário de Brasília) publica
// algumas ofertas (padrão 5) nas redes escolhidas — primeiro as da fila, depois as melhores do momento.
// Cada dono tem a sua agenda: o site (admin, cid = null) e cada cliente da ferramenta (cid = id do cliente),
// com a própria fila, os próprios canais e os próprios links de afiliado.
const db = require('./db');
const settings = require('./settings');
const offers = require('./offers');
const social = require('./social');
const clientes = require('./clientes');

let timer = null;
const rodando = new Set();          // donos com rodada em andamento ('site' ou id do cliente)
const ultimaExecucao = new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = msg => console.log(`[AGENDA] ${msg}`);
const dono = cid => (cid ? Number(cid) : 'site');
const configDe = cid => (cid ? clientes.config(cid) : settings.getAll());

// Data e hora em Brasília (UTC-3, sem horário de verão desde 2019).
function agoraBrasilia() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return { dia: d.toISOString().slice(0, 10), minutos: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function horarios(s = settings.getAll()) {
  return String(s.agenda_horarios || '')
    .split(/[,;\s]+/)
    .map(h => h.match(/^(\d{1,2}):(\d{2})$/))
    .filter(m => m && Number(m[1]) < 24 && Number(m[2]) < 60)
    .map(m => `${m[1].padStart(2, '0')}:${m[2]}`)
    .filter((h, i, a) => a.indexOf(h) === i)
    .sort();
}

function redesAgenda(s = settings.getAll()) {
  try { const r = JSON.parse(s.agenda_redes || '[]'); return Array.isArray(r) ? r.filter(id => social.REDES[id]) : []; } catch { return []; }
}

// Horários que já rodaram hoje (do site em settings; de cada cliente em cliente_config).
function lerFeitas(cid) {
  const raw = cid ? db.get(`SELECT value FROM cliente_config WHERE cliente_id = ? AND key = 'agenda_ultimas'`, cid)?.value : settings.get('agenda_ultimas');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
function gravarFeitas(cid, feitas) {
  if (!cid) return settings.set('agenda_ultimas', JSON.stringify(feitas));
  db.run(`INSERT INTO cliente_config (cliente_id, key, value) VALUES (?, 'agenda_ultimas', ?)
          ON CONFLICT(cliente_id, key) DO UPDATE SET value = excluded.value`, cid, JSON.stringify(feitas));
}

// ── Fila ─────────────────────────────────────────────────────────────────────
function enfileirar(itens, autor, cid = null) {
  let n = 0;
  for (const it of itens.slice(0, 200)) {
    const id = Number(it.offer_id);
    if (!Number.isInteger(id) || id <= 0 || !db.get('SELECT 1 FROM offers WHERE id = ?', id)) continue;
    // Não duplica uma oferta que já está esperando: atualiza o texto.
    const ja = db.get(`SELECT id FROM post_queue WHERE offer_id = ? AND status = 'pendente' AND cliente_id IS ?`, id, cid);
    const texto = String(it.texto || '').trim().slice(0, 4000) || null;
    if (ja) db.run('UPDATE post_queue SET texto = ?, autor = ? WHERE id = ?', texto, autor, ja.id);
    else db.run('INSERT INTO post_queue (offer_id, texto, autor, cliente_id) VALUES (?, ?, ?, ?)', id, texto, autor, cid);
    n++;
  }
  return n;
}

function listarFila(cid = null, limit = 200) {
  return db.all(
    `SELECT q.*, o.produto, o.preco_atual, o.desconto_pct FROM post_queue q LEFT JOIN offers o ON o.id = q.offer_id
     WHERE q.cliente_id IS ?
     ORDER BY CASE q.status WHEN 'pendente' THEN 0 ELSE 1 END, CASE q.status WHEN 'pendente' THEN q.id ELSE -q.id END LIMIT ?`, cid, limit);
}
const removerDaFila = (id, cid = null) => db.run(`DELETE FROM post_queue WHERE id = ? AND status = 'pendente' AND cliente_id IS ?`, id, cid);
const limparFila = (cid = null) => db.run(`DELETE FROM post_queue WHERE status = 'pendente' AND cliente_id IS ?`, cid).changes;
const pendentes = (cid = null) => db.get(`SELECT COUNT(*) AS n FROM post_queue WHERE status = 'pendente' AND cliente_id IS ?`, cid).n;

// Filtros das ofertas automáticas (Painel → Redes sociais → Agendamento): lojas escolhidas, palavras que nunca
// entram (ex.: capinha, película) e, se preenchidas, palavras obrigatórias (só entra o que tiver pelo menos uma).
const semAcento = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const listaPalavras = v => String(v || '').split(/[,;\n]+/).map(semAcento).map(x => x.trim()).filter(Boolean);
function filtroDoDono(s) {
  const lojas = String(s.agenda_lojas || '').split(/[,;\s]+/).filter(Boolean);
  const bloqueadas = listaPalavras(s.agenda_palavras_bloqueadas);
  const permitidas = listaPalavras(s.agenda_palavras_permitidas);
  return o => {
    if (lojas.length && !lojas.includes(o.store_id)) return false;
    const nome = semAcento(o.produto);
    if (bloqueadas.some(w => nome.includes(w))) return false;
    if (permitidas.length && !permitidas.some(w => nome.includes(w))) return false;
    return true;
  };
}

// Melhores ofertas do momento: maior desconto (até 80% — acima disso costuma ser erro de preço da loja),
// categorias variadas, nada que o mesmo dono tenha postado nos últimos 7 dias, respeitando os filtros do dono.
function melhoresOfertas(qtd, excluir, cid = null, s = configDe(cid)) {
  const passa = filtroDoDono(s);
  const rows = db.all(
    `SELECT o.id, o.categoria, o.store_id, o.produto FROM offers o
     WHERE o.oculto = 0 AND o.fonte = 'auto' AND o.desconto_pct BETWEEN 15 AND 80 AND o.last_seen_at > datetime('now', '-12 hours')
       AND o.imagem LIKE 'https://%'
       AND NOT EXISTS (SELECT 1 FROM social_posts p WHERE p.offer_id = o.id AND p.ok = 1 AND p.cliente_id IS ?
                       AND p.created_at > datetime('now', '-7 days'))
     ORDER BY o.desconto_pct DESC, o.link_clicks DESC LIMIT 1500`, cid).filter(passa);
  const out = [], cats = new Set();
  for (const r of rows) {           // primeiro uma por categoria
    if (out.length >= qtd) break;
    if (excluir.has(r.id) || cats.has(r.categoria) || !offers.isActive(r.id)) continue;
    cats.add(r.categoria); out.push(r.id);
  }
  for (const r of rows) {           // completa se faltar
    if (out.length >= qtd) break;
    if (!excluir.has(r.id) && !out.includes(r.id) && offers.isActive(r.id)) out.push(r.id);
  }
  return out;
}

// ── Execução ─────────────────────────────────────────────────────────────────
async function executar(motivo = 'agendado', cid = null, qtdForcada = null) {
  const d = dono(cid);
  if (rodando.has(d)) return { erro: 'Já existe uma postagem agendada em andamento.' };
  const s = configDe(cid);
  const prontas = redesAgenda(s).filter(id => !social.REDES[id].pronta(s));
  if (!prontas.length) return { erro: 'Nenhuma rede do agendamento está configurada.' };
  rodando.add(d);
  const qtd = qtdForcada || Math.min(Math.max(parseInt(s.agenda_qtd, 10) || 5, 1), 20);
  const intervalo = prontas.includes('whatsapp') ? Math.min(Math.max(Number(s.whatsapp_intervalo_s) || 90, 20), 900) * 1000 : 5000;
  const feitos = [];
  const quem = cid ? `cliente ${cid}` : 'site';
  try {
    // 1) fila (pula ofertas que saíram do ar)
    const lote = [];
    for (const q of db.all(`SELECT * FROM post_queue WHERE status = 'pendente' AND cliente_id IS ? ORDER BY id`, cid)) {
      if (lote.length >= qtd) break;
      if (!offers.isActive(q.offer_id)) {
        db.run(`UPDATE post_queue SET status = 'expirado', resultado = 'Oferta saiu do ar antes de ser postada.' WHERE id = ?`, q.id);
        continue;
      }
      lote.push({ fila: q.id, offer_id: q.offer_id, texto: q.texto });
    }
    // 2) completa com as melhores ofertas do momento
    if (lote.length < qtd && s.agenda_completar !== '0') {
      const ids = melhoresOfertas(qtd - lote.length, new Set(lote.map(l => l.offer_id)), cid, s);
      lote.push(...ids.map(id => ({ offer_id: id, texto: null })));
    }
    log(`${quem} — ${motivo}: ${lote.length} oferta(s) em ${prontas.join(', ')}`);

    for (let i = 0; i < lote.length; i++) {
      const it = lote[i];
      const o = db.get('SELECT * FROM offers WHERE id = ?', it.offer_id);
      const link = cid ? await clientes.linkParaPostar(cid, o, s) : null; // cliente: link de afiliado dele
      if (link) o.__link = link;
      if (!it.texto) o.__link = await require('./encurtador').curto(social.postLink(o, s)); // link curto no post
      const texto = it.texto || social.textoPadrao(o, s);
      let resultados;
      try { resultados = await social.publicar(it.offer_id, prontas, texto, `agenda (${motivo})`, cid ? { s, clienteId: cid, link } : {}); }
      catch (err) { resultados = [{ rede: '-', ok: false, mensagem: err.message }]; }
      const ok = resultados.some(r => r.ok);
      const resumo = resultados.map(r => `${social.REDES[r.rede]?.nome || r.rede}: ${r.ok ? 'ok' : r.mensagem}`).join(' | ');
      if (it.fila) db.run(`UPDATE post_queue SET status = ?, resultado = ?, posted_at = datetime('now') WHERE id = ?`, ok ? 'postado' : 'erro', resumo, it.fila);
      feitos.push({ offer_id: it.offer_id, produto: o.produto, ok, resumo });
      if (i < lote.length - 1) await sleep(intervalo);
    }
  } finally {
    rodando.delete(d);
  }
  const r = { em: new Date().toISOString(), motivo, feitos };
  ultimaExecucao.set(d, r);
  log(`${quem} — concluído: ${feitos.filter(f => f.ok).length} de ${feitos.length} publicadas`);
  return r;
}

// Confere a cada minuto se chegou a hora de cada dono (site e clientes com acesso válido); cada horário roda
// uma vez por dia (até 2 horas de atraso, caso o computador estivesse desligado na hora).
// Modo contínuo: entre o início e o fim do dia, uma rodada pequena (agenda_por_vez) a cada X a Y minutos, com
// intervalo sorteado a cada vez (ritmo de gente, não de robô).
const proximoContinuo = new Map(); // dono → hora (ms) do próximo envio
const hhmm = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function sortearIntervalo(s) {
  const a = Math.min(Math.max(parseInt(s.agenda_intervalo_min, 10) || 20, 5), 720);
  const b = Math.max(a, Math.min(parseInt(s.agenda_intervalo_max, 10) || a, 720));
  return (a + Math.random() * (b - a)) * 60000;
}
function verificarContinuo(cid, s) {
  const { minutos } = agoraBrasilia();
  const ini = hhmm(s.agenda_inicio) ?? 8 * 60, fim = hhmm(s.agenda_fim) ?? 22 * 60;
  const dentro = ini <= fim ? minutos >= ini && minutos < fim : minutos >= ini || minutos < fim; // fim depois da meia-noite
  const d = dono(cid);
  if (!dentro) { proximoContinuo.delete(d); return; }
  const prox = proximoContinuo.get(d);
  if (prox === undefined) { proximoContinuo.set(d, Date.now() + Math.random() * 60000); return; } // começa no 1º minuto
  if (Date.now() < prox) return;
  proximoContinuo.set(d, Date.now() + sortearIntervalo(s));
  const porVez = Math.min(Math.max(parseInt(s.agenda_por_vez, 10) || 1, 1), 5);
  executar('modo contínuo', cid, porVez).catch(err => log(`erro: ${err.message}`));
}

function verificarDono(cid) {
  const s = configDe(cid);
  if (s.agenda_ativa !== '1' || rodando.has(dono(cid))) return;
  if (s.agenda_modo === 'continuo') return verificarContinuo(cid, s);
  const { dia, minutos } = agoraBrasilia();
  const feitas = lerFeitas(cid);
  for (const h of horarios(s)) {
    const [hh, mm] = h.split(':').map(Number);
    const alvo = hh * 60 + mm;
    if (minutos < alvo || minutos > alvo + 120 || feitas[h] === dia) continue;
    feitas[h] = dia;
    gravarFeitas(cid, feitas);
    executar(`horário ${h}`, cid).catch(err => log(`erro: ${err.message}`));
    break;
  }
}

function verificar() {
  verificarDono(null);
  for (const c of db.all(`SELECT id FROM clientes WHERE status = 'ativo' AND validade >= datetime('now')`)) verificarDono(c.id);
}

function iniciar() {
  clearInterval(timer);
  timer = setInterval(verificar, 60 * 1000);
  setTimeout(verificar, 15 * 1000);
}

function estado(cid = null) {
  const s = configDe(cid);
  const { dia, minutos } = agoraBrasilia();
  const feitas = lerFeitas(cid);
  const lista = horarios(s);
  const proximo = lista.find(h => { const [a, b] = h.split(':').map(Number); return a * 60 + b > minutos && feitas[h] !== dia; }) || lista[0] || null;
  const continuo = s.agenda_modo === 'continuo';
  const prox = proximoContinuo.get(dono(cid));
  const proxTxt = prox ? new Date(prox - 3 * 3600 * 1000).toISOString().slice(11, 16) : null;
  return {
    ativa: s.agenda_ativa === '1', modo: continuo ? 'continuo' : 'horarios',
    horarios: continuo ? [`${s.agenda_inicio || '08:00'}–${s.agenda_fim || '22:00'}, a cada ${s.agenda_intervalo_min || 20}–${s.agenda_intervalo_max || 40} min`] : lista,
    proximo: continuo ? proxTxt : proximo, rodando: rodando.has(dono(cid)), pendentes: pendentes(cid),
    ultimaExecucao: ultimaExecucao.get(dono(cid)) || null, redes: redesAgenda(s),
  };
}

module.exports = { enfileirar, listarFila, removerDaFila, limparFila, pendentes, executar, iniciar, estado, horarios, melhoresOfertas, filtroDoDono };
