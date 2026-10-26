// Ganhos dos programas de afiliados (Amazon, Mercado Livre, Shopee, Magalu, AliExpress, KaBuM!…):
// registro das vendas (à mão ou importando a planilha exportada de cada portal), saldo disponível por
// plataforma respeitando o prazo de liberação e o valor mínimo de saque, registro dos saques/recebimentos e
// avisos para o admin quando uma plataforma já tem saldo para sacar.
// Nenhum programa permite pedir saque por API: o dinheiro sempre sai pelo próprio programa, para a conta cadastrada lá.
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const STATUS = ['pendente', 'confirmada', 'cancelada', 'paga'];

db.db.exec(`
  CREATE TABLE IF NOT EXISTS ganhos_plataformas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    moeda TEXT NOT NULL DEFAULT 'BRL',
    minimo REAL NOT NULL DEFAULT 0,          -- valor mínimo para saque/pagamento
    dias_liberacao INTEGER NOT NULL DEFAULT 30, -- dias depois da venda até a comissão ficar disponível
    pagamento TEXT,                           -- como o dinheiro chega (automático, saque no app…)
    portal TEXT,                              -- link do painel do programa
    ativo INTEGER NOT NULL DEFAULT 1,
    ordem INTEGER NOT NULL DEFAULT 99
  );
  CREATE TABLE IF NOT EXISTS ganhos_vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plataforma TEXT NOT NULL,
    externo TEXT NOT NULL,                    -- identificador para não importar a mesma venda duas vezes
    data_venda TEXT NOT NULL,
    pedido TEXT,
    produto TEXT,
    valor_venda REAL,
    comissao REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmada', 'cancelada', 'paga')),
    liberada_em TEXT,                         -- quando a comissão fica disponível para saque
    origem TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (plataforma, externo)
  );
  CREATE INDEX IF NOT EXISTS idx_ganhos_vendas_plat ON ganhos_vendas (plataforma, status);
  CREATE TABLE IF NOT EXISTS ganhos_saques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plataforma TEXT NOT NULL,
    valor REAL NOT NULL,
    data TEXT NOT NULL DEFAULT (datetime('now')),
    observacao TEXT
  );
  -- Saldo lido no próprio portal do programa pela extensão do Chrome (extensao-ganhos/): vale mais que a soma das vendas
  CREATE TABLE IF NOT EXISTS ganhos_portal (
    plataforma TEXT PRIMARY KEY,
    disponivel REAL,
    a_liberar REAL,
    total REAL,
    url TEXT,
    em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS admin_notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT UNIQUE,                        -- evita repetir o mesmo aviso
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    texto TEXT,
    link TEXT,
    lida INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Regras iniciais (pesquisadas em out/2026 em guias de afiliados — confira no portal de cada programa e ajuste
// no painel: os valores mínimos e prazos mudam com o tempo).
const PADRAO = [
  ['amazon', 'Amazon Associados', 'BRL', 20, 60, 'Automático: a Amazon deposita na conta bancária cadastrada, cerca de 60 dias após o fim do mês.', 'https://associados.amazon.com.br', 1],
  ['mercadolivre', 'Mercado Livre Afiliados', 'BRL', 0, 45, 'Crédito na conta Mercado Pago / conta cadastrada (confira o mínimo no painel).', 'https://www.mercadolivre.com.br/afiliados', 2],
  ['shopee', 'Shopee Afiliados', 'BRL', 30, 30, 'Saque no portal/app para a conta bancária ou ShopeePay.', 'https://affiliate.shopee.com.br', 3],
  ['magalu', 'Parceiro Magalu', 'BRL', 20, 45, 'Saque pelo app, por Pix.', 'https://www.parceiromagalu.com.br', 4],
  ['aliexpress', 'AliExpress Portals', 'USD', 16, 60, 'Transferência internacional (pode haver tarifa bancária por saque).', 'https://portals.aliexpress.com', 5],
  ['kabum', 'KaBuM! (Awin)', 'BRL', 0, 60, 'Pagamento pela Awin na conta cadastrada (confira o mínimo na Awin).', 'https://ui.awin.com', 6],
];
for (const [id, nome, moeda, minimo, dias, pagamento, portal, ordem] of PADRAO) {
  db.run(`INSERT OR IGNORE INTO ganhos_plataformas (id, nome, moeda, minimo, dias_liberacao, pagamento, portal, ordem)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, nome, moeda, minimo, dias, pagamento, portal, ordem);
}

const plataforma = id => db.get('SELECT * FROM ganhos_plataformas WHERE id = ?', String(id || ''));
const r2 = n => Math.round(Number(n || 0) * 100) / 100;
const somaDias = (dataSql, dias) => new Date(new Date(dataSql.replace(' ', 'T') + 'Z').getTime() + dias * 86400000)
  .toISOString().replace('T', ' ').slice(0, 19);

// ── Valores e datas vindos de planilhas brasileiras ou estrangeiras ─────────
function numero(v) {
  if (typeof v === 'number') return v;
  let t = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function data(v) {
  const t = String(v ?? '').trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')} ${(m[4] || '12').padStart(2, '0')}:${m[5] || '00'}:${m[6] || '00'}`;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4] || '12'}:${m[5] || '00'}:${m[6] || '00'}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace('T', ' ').slice(0, 19);
}
// Status dos portais → status do site
function statusDe(v) {
  const t = String(v ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (!t) return 'pendente';
  if (/cancel|devol|recus|rejeit|invalid|estorn|reemb|refund|reject|void/.test(t)) return 'cancelada';
  if (/\bpag[oa]\b|paid|pagament|transferid|sacad/.test(t)) return 'paga';
  if (/confirm|aprov|conclu|complet|valid|liberad|aceit|approved|settled|disponivel/.test(t)) return 'confirmada';
  return 'pendente';
}

// ── Saldos ───────────────────────────────────────────────────────────────────
function resumo(id) {
  const p = plataforma(id);
  const agora = nowSql();
  const v = db.get(`SELECT
      COALESCE(SUM(CASE WHEN status = 'confirmada' AND liberada_em <= ? THEN comissao END), 0) liberado,
      COALESCE(SUM(CASE WHEN status = 'pendente' OR (status = 'confirmada' AND liberada_em > ?) THEN comissao END), 0) a_liberar,
      COALESCE(SUM(CASE WHEN status = 'paga' THEN comissao END), 0) pago,
      COUNT(CASE WHEN status <> 'cancelada' THEN 1 END) vendas,
      MIN(CASE WHEN status = 'confirmada' AND liberada_em > ? THEN liberada_em END) proxima_liberacao
    FROM ganhos_vendas WHERE plataforma = ?`, agora, agora, agora, p.id);
  const sacado = db.get('SELECT COALESCE(SUM(valor), 0) n FROM ganhos_saques WHERE plataforma = ?', p.id).n;
  // Saldo lido no portal (extensão do Chrome): é o número oficial do programa, então substitui a soma das vendas
  // (leitura_portal, e não "portal": esse nome já é o endereço do portal do programa)
  const lido = db.get('SELECT * FROM ganhos_portal WHERE plataforma = ?', p.id) || null;
  const disponivel = lido?.disponivel != null ? r2(lido.disponivel) : r2(Math.max(0, v.liberado - sacado));
  const aLiberar = lido?.a_liberar != null ? r2(lido.a_liberar) : r2(v.a_liberar);
  return {
    ...p, ativo: Boolean(p.ativo), leitura_portal: lido,
    disponivel, a_liberar: aLiberar, recebido: r2(v.pago + sacado), vendas: v.vendas,
    proxima_liberacao: v.proxima_liberacao,
    pode_sacar: disponivel > 0 && disponivel >= p.minimo,
    falta: r2(Math.max(0, p.minimo - disponivel)),
  };
}
const painel = () => db.all('SELECT id FROM ganhos_plataformas ORDER BY ordem, nome').map(p => resumo(p.id));

// ── Avisos ───────────────────────────────────────────────────────────────────
const fmt = (n, moeda) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: moeda || 'BRL' });

function notificar({ chave, tipo, titulo, texto, link }) {
  const r = db.run('INSERT OR IGNORE INTO admin_notificacoes (chave, tipo, titulo, texto, link) VALUES (?, ?, ?, ?, ?)',
    chave, tipo, titulo, texto || null, link || null);
  if (!r.changes) return false;
  // Também por e-mail, se o SMTP estiver configurado (vai para o e-mail do remetente configurado no painel).
  try {
    const email = require('./email');
    const s = settings.getAll();
    const para = String(s.smtp_user || '').includes('@') ? s.smtp_user : null;
    if (para && email.configurado(s)) email.enviar({ para, assunto: `Ofertou!: ${titulo}`, texto: `${titulo}\n\n${texto || ''}` }).catch(() => {});
  } catch { /* sem e-mail */ }
  return true;
}

// Confere todas as plataformas: saldo disponível acima do mínimo vira aviso (um por "ciclo": depois de registrar
// um saque, o próximo saldo que passar do mínimo gera um aviso novo).
function verificar() {
  for (const p of painel()) {
    if (!p.ativo || !p.pode_sacar) {
      // Aviso que deixou de valer (mínimo aumentou, venda cancelada…) sai da lista
      db.run(`UPDATE admin_notificacoes SET lida = 1 WHERE tipo = 'saldo' AND chave LIKE ? AND lida = 0`, `saldo:${p.id}:%`);
      continue;
    }
    const ultimo = db.get('SELECT MAX(id) id FROM ganhos_saques WHERE plataforma = ?', p.id).id || 0;
    notificar({
      chave: `saldo:${p.id}:${ultimo}`, tipo: 'saldo',
      titulo: `Saldo disponível para sacar na ${p.nome}`,
      texto: `${fmt(p.disponivel, p.moeda)} já liberados${p.minimo ? ` (mínimo ${fmt(p.minimo, p.moeda)})` : ''}. ${p.pagamento || ''}`.trim(),
      link: p.portal,
    });
  }
}

function notificacoes({ todas = false } = {}) {
  return db.all(`SELECT * FROM admin_notificacoes ${todas ? '' : 'WHERE lida = 0'} ORDER BY id DESC LIMIT 50`)
    .map(n => ({ ...n, lida: Boolean(n.lida) }));
}
const marcarLida = id => db.run('UPDATE admin_notificacoes SET lida = 1 WHERE id = ?', Number(id));
const marcarTodasLidas = () => db.run('UPDATE admin_notificacoes SET lida = 1 WHERE lida = 0');

// ── Vendas ───────────────────────────────────────────────────────────────────
function registrar(b, origem = 'manual') {
  const p = plataforma(b.plataforma);
  if (!p) throw fail('Plataforma inválida.');
  const quando = data(b.data_venda) || nowSql();
  const comissao = numero(b.comissao);
  if (comissao === null || comissao < 0) throw fail('Informe a comissão (valor que você ganha).');
  const status = STATUS.includes(b.status) ? b.status : statusDe(b.status);
  const pedido = String(b.pedido || '').trim().slice(0, 80) || null;
  const produto = String(b.produto || '').trim().slice(0, 200) || null;
  const externo = String(b.externo || '').trim().slice(0, 120)
    || crypto.createHash('sha1').update([pedido || '', produto || '', quando.slice(0, 10), comissao].join('|')).digest('hex').slice(0, 20);
  const liberada = data(b.liberada_em) || somaDias(quando, p.dias_liberacao);
  const valorVenda = numero(b.valor_venda);
  const existente = db.get('SELECT id FROM ganhos_vendas WHERE plataforma = ? AND externo = ?', p.id, externo);
  if (existente) {
    db.run(`UPDATE ganhos_vendas SET data_venda = ?, pedido = ?, produto = ?, valor_venda = ?, comissao = ?, status = ?,
            liberada_em = ?, updated_at = ? WHERE id = ?`, quando, pedido, produto, valorVenda, r2(comissao), status, liberada, nowSql(), existente.id);
    return { id: existente.id, novo: false };
  }
  const r = db.run(`INSERT INTO ganhos_vendas (plataforma, externo, data_venda, pedido, produto, valor_venda, comissao, status, liberada_em, origem)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, p.id, externo, quando, pedido, produto, valorVenda, r2(comissao), status, liberada, origem);
  return { id: Number(r.lastInsertRowid), novo: true };
}

function atualizarStatus(id, status) {
  if (!STATUS.includes(status)) throw fail('Situação inválida.');
  db.run('UPDATE ganhos_vendas SET status = ?, updated_at = ? WHERE id = ?', status, nowSql(), Number(id));
  verificar();
}
const excluir = id => db.run('DELETE FROM ganhos_vendas WHERE id = ?', Number(id));

function listar({ plataforma: plat = '', status = '', limite = 300 } = {}) {
  const where = [], params = [];
  if (plat) { where.push('plataforma = ?'); params.push(plat); }
  if (STATUS.includes(status)) { where.push('status = ?'); params.push(status); }
  return db.all(`SELECT * FROM ganhos_vendas ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY data_venda DESC, id DESC LIMIT ?`, ...params, Math.min(Number(limite) || 300, 1000));
}

// ── Saques / pagamentos recebidos ───────────────────────────────────────────
function registrarSaque(b) {
  const p = plataforma(b.plataforma);
  if (!p) throw fail('Plataforma inválida.');
  const valor = numero(b.valor);
  if (!valor || valor <= 0) throw fail('Informe o valor sacado ou recebido.');
  db.run('INSERT INTO ganhos_saques (plataforma, valor, data, observacao) VALUES (?, ?, ?, ?)',
    p.id, r2(valor), data(b.data) || nowSql(), String(b.observacao || '').slice(0, 200) || null);
  // Marca como lido o aviso de saldo desta plataforma
  db.run(`UPDATE admin_notificacoes SET lida = 1 WHERE tipo = 'saldo' AND chave LIKE ? AND lida = 0`, `saldo:${p.id}:%`);
  return resumo(p.id);
}
const saques = () => db.all('SELECT * FROM ganhos_saques ORDER BY data DESC, id DESC LIMIT 100');
const excluirSaque = id => db.run('DELETE FROM ganhos_saques WHERE id = ?', Number(id));

function editarPlataforma(id, b) {
  const p = plataforma(id);
  if (!p) throw fail('Plataforma inválida.', 404);
  const minimo = numero(b.minimo);
  const dias = parseInt(b.dias_liberacao, 10);
  db.run(`UPDATE ganhos_plataformas SET minimo = ?, dias_liberacao = ?, pagamento = ?, portal = ?, ativo = ? WHERE id = ?`,
    minimo !== null && minimo >= 0 ? r2(minimo) : p.minimo,
    Number.isFinite(dias) && dias >= 0 && dias <= 365 ? dias : p.dias_liberacao,
    b.pagamento !== undefined ? String(b.pagamento).slice(0, 300) : p.pagamento,
    b.portal !== undefined && /^https:\/\//i.test(String(b.portal)) ? String(b.portal).slice(0, 300) : p.portal,
    b.ativo === undefined ? p.ativo : (b.ativo ? 1 : 0), p.id);
  // Novo prazo de liberação vale também para as vendas já registradas dessa plataforma
  if (Number.isFinite(dias) && dias !== p.dias_liberacao) {
    db.run('UPDATE ganhos_vendas SET liberada_em = datetime(data_venda, ?) WHERE plataforma = ?', `+${dias} days`, p.id);
  }
  verificar();
  return resumo(p.id);
}

// ── Importação da planilha (CSV) exportada do portal ────────────────────────
function lerCsv(texto) {
  const t = String(texto || '').replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] || '';
  const sep = [';', ',', '\t'].map(c => [c, primeira.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"' && campo === '') aspas = true; // aspas só abrem no começo do campo (50" no meio é texto)
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some(x => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some(x => x.trim())) linhas.push(linha);
  if (linhas.length < 2) throw fail('A planilha precisa ter o cabeçalho e pelo menos uma linha.');
  if (linhas.length > 20001) throw fail('Planilha grande demais (máx. 20.000 linhas por vez).');
  const cab = linhas[0].map(h => h.trim());
  return { cabecalho: cab, linhas: linhas.slice(1) };
}

// Sugere qual coluna é qual pelo nome (português e inglês).
const PALAVRAS = {
  data_venda: /data|date|dia|criad|order time|purchase/i,
  pedido: /pedido|order|n[ºo°]|id|c[oó]digo|conversion/i,
  produto: /produto|item|t[ií]tulo|title|nome|product/i,
  valor_venda: /valor.*(venda|pedido|compra)|pre[cç]o|price|venda|order amount|gmv|total/i,
  comissao: /comiss|commission|ganho|earning|receita|payout/i,
  status: /status|situa|estado/i,
};
function sugerir(cabecalho) {
  const usado = new Set();
  const map = {};
  for (const campo of ['comissao', 'data_venda', 'status', 'pedido', 'valor_venda', 'produto']) {
    const i = cabecalho.findIndex((h, j) => !usado.has(j) && PALAVRAS[campo].test(h));
    if (i >= 0) { map[campo] = i; usado.add(i); }
  }
  return map;
}

function previa(texto) {
  const { cabecalho, linhas } = lerCsv(texto);
  return { cabecalho, exemplos: linhas.slice(0, 5), total: linhas.length, sugestao: sugerir(cabecalho) };
}

function importar(texto, plat, mapa) {
  if (!plataforma(plat)) throw fail('Escolha a plataforma.');
  const { linhas } = lerCsv(texto);
  const col = k => (Number.isInteger(mapa?.[k]) && mapa[k] >= 0 ? mapa[k] : null);
  if (col('comissao') === null || col('data_venda') === null) throw fail('Indique pelo menos as colunas de data e de comissão.');
  let novas = 0, atualizadas = 0, ignoradas = 0;
  db.transaction(() => {
    for (const l of linhas) {
      const v = k => (col(k) === null ? '' : l[col(k)]);
      if (numero(v('comissao')) === null || !data(v('data_venda'))) { ignoradas++; continue; }
      try {
        const r = registrar({ plataforma: plat, data_venda: v('data_venda'), pedido: v('pedido'), produto: v('produto'),
          valor_venda: v('valor_venda'), comissao: v('comissao'), status: statusDe(v('status')) }, 'csv');
        if (r.novo) novas++; else atualizadas++;
      } catch { ignoradas++; }
    }
  });
  verificar();
  return { novas, atualizadas, ignoradas };
}

// Vendas confirmadas do site (para as conquistas do perfil do admin)
const vendasConfirmadas = () => db.get(`SELECT COUNT(*) n FROM ganhos_vendas WHERE status IN ('confirmada', 'paga')`).n;

let timer = null;
function iniciar() {
  verificar();
  clearInterval(timer);
  timer = setInterval(() => { try { verificar(); } catch (err) { console.error('[GANHOS]', err.message); } }, 60 * 60 * 1000);
}

// Valores enviados pela extensão do Chrome a partir da página do portal (null = não encontrado na página)
function registrarPortal(b = {}) {
  const p = plataforma(String(b.plataforma || ''));
  if (!p) throw fail('Plataforma desconhecida.');
  const n = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 1e7 ? null : r2(v));
  const disponivel = n(b.disponivel), aLiberar = n(b.a_liberar), total = n(b.total);
  if (disponivel == null && aLiberar == null && total == null) throw fail('Nenhum valor enviado.');
  const url = /^https:\/\//i.test(String(b.url || '')) ? String(b.url).slice(0, 500) : null;
  db.run(`INSERT INTO ganhos_portal (plataforma, disponivel, a_liberar, total, url, em) VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(plataforma) DO UPDATE SET disponivel = excluded.disponivel, a_liberar = excluded.a_liberar,
          total = excluded.total, url = excluded.url, em = excluded.em`, p.id, disponivel, aLiberar, total, url);
  verificar();
  return resumo(p.id);
}
function limparPortal(id) { db.run('DELETE FROM ganhos_portal WHERE plataforma = ?', String(id)); verificar(); }

module.exports = {
  registrarPortal, limparPortal,
  notificar, painel, resumo, verificar, iniciar, notificacoes, marcarLida, marcarTodasLidas,
  registrar, atualizarStatus, excluir, listar, registrarSaque, saques, excluirSaque, editarPlataforma,
  previa, importar, vendasConfirmadas, statusDe, numero, data, STATUS,
};
