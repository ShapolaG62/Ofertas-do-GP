// Monitor de membros dos grupos de WhatsApp (site e clientes da ferramenta): quantos entraram e saíram por dia e o total
// de cada grupo. Guarda só contagens, nunca o número ou o nome de quem entrou ou saiu.
//  • Entradas e saídas: avisos que chegam pela API própria (src/whatsapp-proprio.js);
//  • Total: uma vez por dia o site pergunta o tamanho de cada grupo de envio (funciona mesmo sem o aviso ligado).
const db = require('./db');
const settings = require('./settings');
const whatsapp = require('./whatsapp');

db.db.exec(`
  CREATE TABLE IF NOT EXISTS grupo_membros_dia (
    dono TEXT NOT NULL,
    grupo TEXT NOT NULL,
    dia TEXT NOT NULL,
    nome TEXT,
    entradas INTEGER NOT NULL DEFAULT 0,
    saidas INTEGER NOT NULL DEFAULT 0,
    total INTEGER,
    PRIMARY KEY (dono, grupo, dia)
  );
`);

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const chave = id => String(id || '').replace(/@.*$/, '').replace(/-group$/, '').replace(/\D/g, '');
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const donoDe = cid => (cid ? `c:${cid}` : 'site');
const configDe = cid => (cid ? require('./clientes').config(cid) : settings.getAll());

// Aviso do WhatsApp → { grupo, entradas, saidas } (ou nulo, se não for de entrada ou saída)
function lerEvento(b) {
  if (!b || typeof b !== 'object') return null;
  const evento = String(b.event || '').toLowerCase().replace(/_/g, '-').replace(/\./g, '-');
  if (evento.includes('group-participants')) {
    const d = Array.isArray(b.data) ? b.data[0] : b.data;
    const acao = String(d?.action || '').toLowerCase();
    const n = Array.isArray(d?.participants) ? d.participants.length : 0;
    if (!d?.id || !n) return null;
    if (acao === 'add') return { grupo: chave(d.id), entradas: n, saidas: 0 };
    if (acao === 'remove') return { grupo: chave(d.id), entradas: 0, saidas: n };
    return null;
  }
  return null;
}

// Conta o evento, só para os grupos que a pessoa escolheu como grupos de envio
function receber(cid, corpo) {
  const ev = lerEvento(corpo);
  if (!ev || !ev.grupo) return false;
  const g = whatsapp.gruposEscolhidos(configDe(cid)).find(x => chave(x.id) === ev.grupo);
  if (!g) return false;
  db.run(`INSERT INTO grupo_membros_dia (dono, grupo, dia, nome, entradas, saidas) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (dono, grupo, dia) DO UPDATE SET entradas = entradas + excluded.entradas, saidas = saidas + excluded.saidas, nome = excluded.nome`,
  donoDe(cid), ev.grupo, hoje(), String(g.nome || ''), ev.entradas, ev.saidas);
  return true;
}

// Pergunta o tamanho de cada grupo de envio e guarda o total do dia
async function atualizarTotais(cid) {
  const s = configDe(cid);
  const grupos = whatsapp.gruposEscolhidos(s);
  if (!grupos.length) return { grupos: 0, lidos: 0 };
  const tamanhos = await whatsapp.tamanhoGrupos(s, grupos.map(g => g.id));
  let lidos = 0;
  for (const g of grupos) {
    const total = tamanhos.get(String(g.id));
    if (!Number.isInteger(total)) continue;
    lidos++;
    db.run(`INSERT INTO grupo_membros_dia (dono, grupo, dia, nome, total) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (dono, grupo, dia) DO UPDATE SET total = excluded.total, nome = excluded.nome`,
    donoDe(cid), chave(g.id), hoje(), String(g.nome || ''), total);
  }
  return { grupos: grupos.length, lidos };
}

function resumo(cid, dias = 30) {
  const d = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30;
  const dono = donoDe(cid);
  const desde = new Date(Date.now() - 3 * 3600000 - (d - 1) * 86400000).toISOString().slice(0, 10);
  const linhas = db.all('SELECT * FROM grupo_membros_dia WHERE dono = ? AND dia >= ? ORDER BY dia', dono, desde);
  const porGrupo = new Map();
  const porDia = new Map();
  for (const l of linhas) {
    const g = porGrupo.get(l.grupo) || { grupo: l.grupo, nome: l.nome || l.grupo, entradas: 0, saidas: 0, total: null, total_inicio: null };
    g.entradas += l.entradas; g.saidas += l.saidas;
    if (l.nome) g.nome = l.nome;
    if (l.total !== null) { g.total = l.total; if (g.total_inicio === null) g.total_inicio = l.total; }
    porGrupo.set(l.grupo, g);
    const x = porDia.get(l.dia) || { entradas: 0, saidas: 0 };
    x.entradas += l.entradas; x.saidas += l.saidas;
    porDia.set(l.dia, x);
  }
  const serie = [];
  for (let i = d - 1; i >= 0; i--) {
    const dia = new Date(Date.now() - 3 * 3600000 - i * 86400000).toISOString().slice(0, 10);
    serie.push({ dia, ...(porDia.get(dia) || { entradas: 0, saidas: 0 }) });
  }
  const grupos = [...porGrupo.values()].sort((a, b) => (b.total || 0) - (a.total || 0));
  return {
    dias: d, grupos, serie,
    total: grupos.reduce((a, g) => a + (g.total || 0), 0),
    entradas: grupos.reduce((a, g) => a + g.entradas, 0),
    saidas: grupos.reduce((a, g) => a + g.saidas, 0),
  };
}

const ultimoPedido = new Map();
async function atualizarAgora(cid) {
  const k = donoDe(cid);
  if (Date.now() - (ultimoPedido.get(k) || 0) < 2 * 60000) throw fail('Espere um pouco para atualizar de novo.', 429);
  ultimoPedido.set(k, Date.now());
  return atualizarTotais(cid);
}

// Uma vez por dia, para o site e para cada cliente ativo com grupos escolhidos
async function rodarDiario() {
  await atualizarTotais(null).catch(err => console.warn(`[MEMBROS] site: ${err.message}`));
  const lista = db.all(`SELECT c.id FROM clientes c JOIN cliente_config g ON g.cliente_id = c.id AND g.key = 'whatsapp_groups'
    WHERE c.status = 'ativo' AND c.validade >= datetime('now') AND g.value NOT IN ('', '[]')`);
  for (const { id } of lista) await atualizarTotais(id).catch(err => console.warn(`[MEMBROS] cliente ${id}: ${err.message}`));
}
let timer = null;
function iniciar() {
  if (timer) return;
  setTimeout(() => rodarDiario().catch(() => {}), 10 * 60000);
  timer = setInterval(() => rodarDiario().catch(() => {}), 24 * 3600000);
  timer.unref?.();
}

module.exports = { lerEvento, receber, atualizarTotais, atualizarAgora, resumo, rodarDiario, iniciar };
