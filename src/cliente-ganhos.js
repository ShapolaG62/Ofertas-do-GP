// Comissões do cliente da ferramenta (painel do afiliado): as vendas de cada cliente ficam separadas das do site.
//  • Shopee: sincroniza sozinha pela Open API, com o App ID e a Senha da API do próprio cliente;
//  • As outras lojas não têm API de relatório para afiliados: as vendas entram pela planilha exportada do portal.
const crypto = require('crypto');
const db = require('./db');
const clientes = require('./clientes');
const ganhos = require('./ganhos');

db.db.exec(`
  CREATE TABLE IF NOT EXISTS cliente_vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    plataforma TEXT NOT NULL,
    externo TEXT NOT NULL,
    data_venda TEXT NOT NULL,
    pedido TEXT,
    produto TEXT,
    valor_venda REAL,
    comissao REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendente',
    origem TEXT NOT NULL DEFAULT 'csv',
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (cliente_id, plataforma, externo)
  );
  CREATE INDEX IF NOT EXISTS idx_cliente_vendas_data ON cliente_vendas (cliente_id, data_venda);
  CREATE TABLE IF NOT EXISTS cliente_saques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    plataforma TEXT NOT NULL,
    valor REAL NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const LOJAS = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon', magalu: 'Magalu', aliexpress: 'AliExpress', kabum: 'KaBuM!' };
const VALIDAS = `status IN ('pendente', 'confirmada', 'paga')`;

// Grava a venda uma vez só; se ela voltar (nova sincronização ou planilha), atualiza a situação e os valores
function registrar(cid, b, origem = 'csv') {
  if (!LOJAS[b.plataforma]) throw fail('Escolha a loja.');
  const comissao = ganhos.numero(b.comissao);
  const quando = ganhos.data(b.data_venda);
  if (comissao === null || !quando) throw fail('Venda sem data ou sem comissão.');
  const pedido = String(b.pedido || '').slice(0, 80);
  const externo = String(b.externo || '') || crypto.createHash('sha1')
    .update(`${pedido || quando}|${String(b.produto || '').slice(0, 120)}`).digest('hex');
  const existia = db.get('SELECT id FROM cliente_vendas WHERE cliente_id = ? AND plataforma = ? AND externo = ?', cid, b.plataforma, externo);
  const venda = ganhos.numero(b.valor_venda);
  db.run(`INSERT INTO cliente_vendas (cliente_id, plataforma, externo, data_venda, pedido, produto, valor_venda, comissao, status, origem)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (cliente_id, plataforma, externo) DO UPDATE SET data_venda = excluded.data_venda, pedido = excluded.pedido,
            produto = excluded.produto, valor_venda = excluded.valor_venda, comissao = excluded.comissao, status = excluded.status,
            atualizado_em = datetime('now')`,
  cid, b.plataforma, externo, quando, pedido, String(b.produto || '').slice(0, 200), venda, comissao, ganhos.statusDe(b.status), origem);
  return { novo: !existia };
}

// ── Saldos: a receber e disponível para saque, com o prazo e o mínimo de cada programa (Painel → Ganhos) ──
const r2 = v => Math.round(Number(v || 0) * 100) / 100;
function estimadoMl(cid) {
  try {
    const e = JSON.parse(db.get(`SELECT value FROM cliente_config WHERE cliente_id = ? AND key = 'ml_ganho_estimado'`, cid)?.value || 'null');
    return e && Number.isFinite(e.valor) ? e : null;
  } catch { return null; }
}
function salvarEstimadoMl(cid, valor) {
  const v = Number(valor);
  if (!Number.isFinite(v) || v < 0 || v > 1e7) throw fail('Valor inválido.');
  db.run(`INSERT INTO cliente_config (cliente_id, key, value) VALUES (?, 'ml_ganho_estimado', ?)
          ON CONFLICT (cliente_id, key) DO UPDATE SET value = excluded.value`, cid, JSON.stringify({ valor: r2(v), em: new Date().toISOString() }));
  return estimadoMl(cid);
}
function saldos(cid) {
  const regras = Object.fromEntries(db.all('SELECT id, moeda, minimo, dias_liberacao FROM ganhos_plataformas').map(p => [p.id, p]));
  const lojas = [];
  for (const id of Object.keys(LOJAS)) {
    const p = regras[id] || { moeda: 'BRL', minimo: 0, dias_liberacao: 30 };
    const prazo = `+${Math.max(0, Number(p.dias_liberacao) || 0)} days`;
    const v = db.get(`SELECT
        COALESCE(SUM(CASE WHEN status = 'confirmada' AND datetime(data_venda, ?) <= datetime('now') THEN comissao END), 0) AS liberado,
        COALESCE(SUM(CASE WHEN status = 'pendente' OR (status = 'confirmada' AND datetime(data_venda, ?) > datetime('now')) THEN comissao END), 0) AS a_liberar,
        COALESCE(SUM(CASE WHEN status = 'paga' THEN comissao END), 0) AS pago,
        MIN(CASE WHEN status = 'confirmada' AND datetime(data_venda, ?) > datetime('now') THEN date(data_venda, ?) END) AS proxima,
        COUNT(*) AS n
      FROM cliente_vendas WHERE cliente_id = ? AND plataforma = ?`, prazo, prazo, prazo, prazo, cid, id);
    const sacado = db.get('SELECT COALESCE(SUM(valor), 0) AS s FROM cliente_saques WHERE cliente_id = ? AND plataforma = ?', cid, id).s;
    const estimado = id === 'mercadolivre' ? estimadoMl(cid) : null;
    if (!v.n && !sacado && !estimado) continue;
    const disponivel = estimado ? estimado.valor : r2(Math.max(0, v.liberado - sacado));
    lojas.push({
      plataforma: id, nome: LOJAS[id], moeda: p.moeda, minimo: p.minimo, prazo_dias: p.dias_liberacao, estimado,
      disponivel, a_liberar: r2(v.a_liberar), recebido: r2(v.pago + sacado), proxima_liberacao: v.proxima,
      pode_sacar: disponivel > 0 && disponivel >= p.minimo, falta: r2(Math.max(0, p.minimo - disponivel)),
    });
  }
  const soma = (k, moeda) => r2(lojas.filter(l => l.moeda === moeda).reduce((a, l) => a + l[k], 0));
  const totais = m => ({ disponivel: soma('disponivel', m), a_liberar: soma('a_liberar', m), recebido: soma('recebido', m) });
  return { lojas, brl: totais('BRL'), usd: totais('USD') };
}
function registrarSaque(cid, b) {
  if (!LOJAS[b?.plataforma]) throw fail('Escolha a loja.');
  const v = ganhos.numero(b.valor);
  if (!(v > 0) || v > 1e7) throw fail('Informe o valor sacado.');
  db.run('INSERT INTO cliente_saques (cliente_id, plataforma, valor) VALUES (?, ?, ?)', cid, b.plataforma, r2(v));
  return { ok: true };
}
const listarSaques = cid => db.all('SELECT id, plataforma, valor, criado_em FROM cliente_saques WHERE cliente_id = ? ORDER BY id DESC LIMIT 20', cid);
function excluirSaque(cid, id) {
  const r = db.run('DELETE FROM cliente_saques WHERE id = ? AND cliente_id = ?', Number(id), cid);
  if (!r.changes) throw fail('Saque não encontrado.', 404);
  return { ok: true };
}

// Lojas em que a pessoa tem link de afiliado e cujas vendas só chegam por planilha: avisa se faz tempo que não envia
const LEMBRETE_DIAS = 7;
function lembretePlanilha(cid) {
  const s = clientes.config(cid);
  const faltam = clientes.lojasSemAfiliado(s);
  const out = [];
  for (const [id, nome] of Object.entries(LOJAS)) {
    if (faltam.includes(nome)) continue;
    if (id === 'shopee' && s.shopee_app_id && s.shopee_app_secret) continue; // atualiza sozinha
    const ult = db.get(`SELECT MAX(atualizado_em) AS em FROM cliente_vendas WHERE cliente_id = ? AND plataforma = ? AND origem = 'csv'`, cid, id).em;
    const dias = ult ? Math.floor((Date.now() - new Date(`${String(ult).replace(' ', 'T')}Z`).getTime()) / 86400000) : null;
    if (dias === null || dias >= LEMBRETE_DIAS) out.push({ plataforma: id, nome, dias });
  }
  return out;
}

function resumo(cid, dias = 30) {
  const d = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30;
  const desde = `-${d - 1} days`;
  const noPeriodo = `cliente_id = ? AND date(data_venda) >= date('now', '-3 hours', ?)`;
  const t = db.get(`SELECT
      COALESCE(SUM(CASE WHEN ${VALIDAS} THEN comissao END), 0) AS comissao,
      COALESCE(SUM(CASE WHEN status IN ('confirmada', 'paga') THEN comissao END), 0) AS confirmada,
      COALESCE(SUM(CASE WHEN status = 'pendente' THEN comissao END), 0) AS pendente,
      COALESCE(SUM(CASE WHEN ${VALIDAS} THEN valor_venda END), 0) AS vendido,
      COALESCE(SUM(CASE WHEN ${VALIDAS} THEN 1 END), 0) AS pedidos,
      COALESCE(SUM(CASE WHEN status = 'cancelada' THEN 1 END), 0) AS cancelados
    FROM cliente_vendas WHERE ${noPeriodo}`, cid, desde);
  const porLoja = db.all(`SELECT plataforma, SUM(comissao) AS comissao, COUNT(*) AS pedidos FROM cliente_vendas
    WHERE ${noPeriodo} AND ${VALIDAS} GROUP BY plataforma ORDER BY comissao DESC`, cid, desde)
    .map(l => ({ ...l, nome: LOJAS[l.plataforma] || l.plataforma }));
  const top = db.all(`SELECT produto, plataforma, SUM(comissao) AS comissao, COUNT(*) AS pedidos FROM cliente_vendas
    WHERE ${noPeriodo} AND ${VALIDAS} AND produto <> '' GROUP BY produto, plataforma ORDER BY comissao DESC LIMIT 8`, cid, desde);
  const porDia = db.all(`SELECT date(data_venda) AS dia, SUM(comissao) AS comissao FROM cliente_vendas
    WHERE ${noPeriodo} AND ${VALIDAS} GROUP BY dia`, cid, desde);
  const mapa = Object.fromEntries(porDia.map(r => [r.dia, r.comissao]));
  const serie = [];
  for (let i = d - 1; i >= 0; i--) {
    const dia = new Date(Date.now() - 3 * 3600000 - i * 86400000).toISOString().slice(0, 10);
    serie.push({ dia, comissao: mapa[dia] || 0 });
  }
  const recentes = db.all(`SELECT data_venda, plataforma, produto, comissao, status FROM cliente_vendas
    WHERE cliente_id = ? ORDER BY data_venda DESC, id DESC LIMIT 30`, cid);
  const s = clientes.config(cid);
  return {
    dias: d, ...t, ticket: t.pedidos ? t.vendido / t.pedidos : 0, por_loja: porLoja, top, serie, recentes,
    shopee_ligada: Boolean(s.shopee_app_id && s.shopee_app_secret), sync: estado(cid), lojas: LOJAS,
    saldos: saldos(cid), saques: listarSaques(cid), lembrete: lembretePlanilha(cid),
  };
}

// ── Planilha exportada do portal de afiliados ──
const previa = texto => ganhos.previa(texto);
function importar(cid, texto, plataforma, mapa) {
  if (!LOJAS[plataforma]) throw fail('Escolha a loja.');
  const { linhas } = ganhos.lerCsv(texto);
  const col = k => (Number.isInteger(mapa?.[k]) && mapa[k] >= 0 ? mapa[k] : null);
  if (col('comissao') === null || col('data_venda') === null) throw fail('Indique pelo menos as colunas de data e de comissão.');
  let novas = 0, atualizadas = 0, ignoradas = 0;
  db.transaction(() => {
    for (const l of linhas) {
      const v = k => (col(k) === null ? '' : l[col(k)]);
      try {
        const r = registrar(cid, { plataforma, data_venda: v('data_venda'), pedido: v('pedido'), produto: v('produto'),
          valor_venda: v('valor_venda'), comissao: v('comissao'), status: v('status') }, 'csv');
        if (r.novo) novas++; else atualizadas++;
      } catch { ignoradas++; }
    }
  });
  return { novas, atualizadas, ignoradas };
}

// ── Sincronização da Shopee ──
function estado(cid) {
  try { return JSON.parse(db.get(`SELECT value FROM cliente_config WHERE cliente_id = ? AND key = 'ganhos_sync_estado'`, cid)?.value || 'null'); }
  catch { return null; }
}
function gravarEstado(cid, dados) {
  db.run(`INSERT INTO cliente_config (cliente_id, key, value) VALUES (?, 'ganhos_sync_estado', ?)
          ON CONFLICT (cliente_id, key) DO UPDATE SET value = excluded.value`, cid, JSON.stringify({ em: new Date().toISOString(), ...dados }));
}
const ultimoPedido = new Map(); // cliente → quando pediu pela última vez (o botão não dispara a API sem parar)
async function sincronizar(cid, { manual = false, dias = 90 } = {}) {
  if (manual) {
    const antes = ultimoPedido.get(cid) || 0;
    if (Date.now() - antes < 5 * 60000) throw fail('Espere alguns minutos para sincronizar de novo.', 429);
    ultimoPedido.set(cid, Date.now());
  }
  const s = clientes.config(cid);
  if (!s.shopee_app_id || !s.shopee_app_secret) throw fail('Preencha o App ID e a Senha da API da Shopee em Links de afiliado.');
  try {
    const r = await require('./ganhos-sync').shopee(s, dias, b => registrar(cid, b, 'api'));
    gravarEstado(cid, { ok: true, novas: r.novas || 0, atualizadas: r.atualizadas || 0 });
    return r;
  } catch (err) {
    gravarEstado(cid, { ok: false, mensagem: err.message });
    throw err;
  }
}
async function sincronizarTodos() {
  const lista = db.all(`SELECT c.id FROM clientes c
    JOIN cliente_config a ON a.cliente_id = c.id AND a.key = 'shopee_app_id' AND a.value <> ''
    JOIN cliente_config b ON b.cliente_id = c.id AND b.key = 'shopee_app_secret' AND b.value <> ''
    WHERE c.status = 'ativo' AND c.validade >= datetime('now')`);
  for (const { id } of lista) await sincronizar(id, { dias: 30 }).catch(err => console.warn(`[COMISSÃO] cliente ${id}: ${err.message}`));
}
let timer = null;
function iniciar() {
  if (timer) return;
  setTimeout(() => sincronizarTodos().catch(() => {}), 5 * 60000);
  timer = setInterval(() => sincronizarTodos().catch(() => {}), 6 * 3600000);
  timer.unref?.();
}

module.exports = { saldos, salvarEstimadoMl, registrarSaque, excluirSaque, lembretePlanilha, registrar, resumo, previa, importar, sincronizar, sincronizarTodos, iniciar, LOJAS };
