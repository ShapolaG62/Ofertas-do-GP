// Postagens agendadas: nos horários do painel (padrão 09:00, 14:00 e 20:00, horário de Brasília) publica
// algumas ofertas (padrão 5) nas redes escolhidas — primeiro as da fila, depois as melhores do momento.
const db = require('./db');
const settings = require('./settings');
const offers = require('./offers');
const social = require('./social');

let timer = null;
let rodando = false;
let ultimaExecucao = null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = msg => console.log(`[AGENDA] ${msg}`);

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

// ── Fila ─────────────────────────────────────────────────────────────────────
function enfileirar(itens, autor) {
  let n = 0;
  for (const it of itens.slice(0, 200)) {
    const id = Number(it.offer_id);
    if (!Number.isInteger(id) || id <= 0 || !db.get('SELECT 1 FROM offers WHERE id = ?', id)) continue;
    // Não duplica uma oferta que já está esperando: atualiza o texto.
    const ja = db.get(`SELECT id FROM post_queue WHERE offer_id = ? AND status = 'pendente'`, id);
    const texto = String(it.texto || '').trim().slice(0, 4000) || null;
    if (ja) db.run('UPDATE post_queue SET texto = ?, autor = ? WHERE id = ?', texto, autor, ja.id);
    else db.run('INSERT INTO post_queue (offer_id, texto, autor) VALUES (?, ?, ?)', id, texto, autor);
    n++;
  }
  return n;
}

function listarFila(limit = 200) {
  return db.all(
    `SELECT q.*, o.produto, o.preco_atual, o.desconto_pct FROM post_queue q LEFT JOIN offers o ON o.id = q.offer_id
     ORDER BY CASE q.status WHEN 'pendente' THEN 0 ELSE 1 END, CASE q.status WHEN 'pendente' THEN q.id ELSE -q.id END LIMIT ?`, limit);
}
const removerDaFila = id => db.run(`DELETE FROM post_queue WHERE id = ? AND status = 'pendente'`, id);
const limparFila = () => db.run(`DELETE FROM post_queue WHERE status = 'pendente'`).changes;
const pendentes = () => db.get(`SELECT COUNT(*) AS n FROM post_queue WHERE status = 'pendente'`).n;

// Melhores ofertas do momento: maior desconto (até 80% — acima disso costuma ser erro de preço da loja),
// categorias variadas, nada postado nos últimos 7 dias.
function melhoresOfertas(qtd, excluir) {
  const rows = db.all(
    `SELECT o.id, o.categoria FROM offers o
     WHERE o.oculto = 0 AND o.fonte = 'auto' AND o.desconto_pct BETWEEN 15 AND 80 AND o.last_seen_at > datetime('now', '-12 hours')
       AND o.imagem LIKE 'https://%'
       AND NOT EXISTS (SELECT 1 FROM social_posts p WHERE p.offer_id = o.id AND p.ok = 1 AND p.created_at > datetime('now', '-7 days'))
     ORDER BY o.desconto_pct DESC, o.link_clicks DESC LIMIT 400`);
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
async function executar(motivo = 'agendado') {
  if (rodando) return { erro: 'Já existe uma postagem agendada em andamento.' };
  const s = settings.getAll();
  const redes = redesAgenda(s);
  const prontas = redes.filter(id => !social.REDES[id].pronta(s));
  if (!prontas.length) return { erro: 'Nenhuma rede do agendamento está configurada.' };
  rodando = true;
  const qtd = Math.min(Math.max(parseInt(s.agenda_qtd, 10) || 5, 1), 20);
  const intervalo = prontas.includes('whatsapp') ? Math.min(Math.max(Number(s.whatsapp_intervalo_s) || 90, 20), 900) * 1000 : 5000;
  const feitos = [];
  try {
    // 1) fila (pula ofertas que saíram do ar)
    const lote = [];
    for (const q of db.all(`SELECT * FROM post_queue WHERE status = 'pendente' ORDER BY id`)) {
      if (lote.length >= qtd) break;
      if (!offers.isActive(q.offer_id)) {
        db.run(`UPDATE post_queue SET status = 'expirado', resultado = 'Oferta saiu do ar antes de ser postada.' WHERE id = ?`, q.id);
        continue;
      }
      lote.push({ fila: q.id, offer_id: q.offer_id, texto: q.texto });
    }
    // 2) completa com as melhores ofertas do momento
    if (lote.length < qtd && s.agenda_completar !== '0') {
      const ids = melhoresOfertas(qtd - lote.length, new Set(lote.map(l => l.offer_id)));
      lote.push(...ids.map(id => ({ offer_id: id, texto: null })));
    }
    log(`${motivo}: ${lote.length} oferta(s) em ${prontas.join(', ')}`);

    for (let i = 0; i < lote.length; i++) {
      const it = lote[i];
      const o = db.get('SELECT * FROM offers WHERE id = ?', it.offer_id);
      const texto = it.texto || social.textoPadrao(o, s);
      let resultados;
      try { resultados = await social.publicar(it.offer_id, prontas, texto, `agenda (${motivo})`); }
      catch (err) { resultados = [{ rede: '-', ok: false, mensagem: err.message }]; }
      const ok = resultados.some(r => r.ok);
      const resumo = resultados.map(r => `${social.REDES[r.rede]?.nome || r.rede}: ${r.ok ? 'ok' : r.mensagem}`).join(' | ');
      if (it.fila) db.run(`UPDATE post_queue SET status = ?, resultado = ?, posted_at = datetime('now') WHERE id = ?`, ok ? 'postado' : 'erro', resumo, it.fila);
      feitos.push({ offer_id: it.offer_id, produto: o.produto, ok, resumo });
      if (i < lote.length - 1) await sleep(intervalo);
    }
  } finally {
    rodando = false;
  }
  ultimaExecucao = { em: new Date().toISOString(), motivo, feitos };
  log(`concluído: ${feitos.filter(f => f.ok).length} de ${feitos.length} publicadas`);
  return ultimaExecucao;
}

// Confere a cada minuto se chegou a hora; cada horário roda uma vez por dia
// (até 2 horas de atraso, caso o computador estivesse desligado na hora).
function verificar() {
  const s = settings.getAll();
  if (s.agenda_ativa !== '1' || rodando) return;
  const { dia, minutos } = agoraBrasilia();
  let feitas;
  try { feitas = JSON.parse(settings.get('agenda_ultimas') || '{}'); } catch { feitas = {}; }
  for (const h of horarios(s)) {
    const [hh, mm] = h.split(':').map(Number);
    const alvo = hh * 60 + mm;
    if (minutos < alvo || minutos > alvo + 120 || feitas[h] === dia) continue;
    feitas[h] = dia;
    settings.set('agenda_ultimas', JSON.stringify(feitas));
    executar(`horário ${h}`).catch(err => log(`erro: ${err.message}`));
    break;
  }
}

function iniciar() {
  clearInterval(timer);
  timer = setInterval(verificar, 60 * 1000);
  setTimeout(verificar, 15 * 1000);
}

function estado() {
  const s = settings.getAll();
  const { dia, minutos } = agoraBrasilia();
  let feitas;
  try { feitas = JSON.parse(settings.get('agenda_ultimas') || '{}'); } catch { feitas = {}; }
  const lista = horarios(s);
  const proximo = lista.find(h => { const [a, b] = h.split(':').map(Number); return a * 60 + b > minutos && feitas[h] !== dia; }) || lista[0] || null;
  return { ativa: s.agenda_ativa === '1', horarios: lista, proximo, rodando, pendentes: pendentes(), ultimaExecucao, redes: redesAgenda(s) };
}

module.exports = { enfileirar, listarFila, removerDaFila, limparFila, pendentes, executar, iniciar, estado, horarios, melhoresOfertas };
