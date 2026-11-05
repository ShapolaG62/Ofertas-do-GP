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

module.exports = { registrar, resumo, previa, importar, sincronizar, sincronizarTodos, iniciar, LOJAS };
