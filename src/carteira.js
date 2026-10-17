// Carteira das empresas parceiras: os pedidos pagos pelo site caem no Mercado Pago do dono do Ofertou! e o valor
// dos produtos (menos a tarifa do Mercado Pago daquela venda) vira saldo da empresa.
//  • "A liberar": o valor de cada venda é liberado 7 dias depois de o pedido ser concluído ou 14 dias depois de pago
//    (o que vier primeiro) — prazo para devoluções e contestações de cartão. Os prazos ficam no painel.
//  • "Disponível": pode ser sacado a partir do mínimo (padrão R$ 50). O saque é pedido pela empresa (para a chave Pix
//    dela) e pago pelo admin pelo app do Mercado Pago; depois o admin marca como pago (ou recusa, e o valor volta).
//  • Cancelamento de pedido pago: o cliente recebe o dinheiro de volta pelo Mercado Pago e a venda sai da carteira.
const db = require('./db');
const settings = require('./settings');
const notificacoes = require('./notificacoes');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const r2 = v => Math.round(v * 100) / 100;
const brl = v => `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const msSql = s => new Date(String(s).replace(' ', 'T') + 'Z').getTime();
const sqlMs = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

db.db.exec(`
  CREATE TABLE IF NOT EXISTS carteira_movimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,                 -- venda | tarifa_mp | estorno | saque | saque_devolvido | ajuste
    valor REAL NOT NULL,                -- positivo entra, negativo sai
    pedido_id INTEGER,
    saque_id INTEGER,
    descricao TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_carteira_loja ON carteira_movimentos(loja_id, id);
  CREATE TABLE IF NOT EXISTS carteira_saques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER NOT NULL,
    valor REAL NOT NULL,
    pix_tipo TEXT,
    pix_chave TEXT,
    pix_nome TEXT,
    status TEXT NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado', 'pago', 'recusado')),
    observacao TEXT,
    solicitado_em TEXT NOT NULL DEFAULT (datetime('now')),
    resolvido_em TEXT
  );
`);

const regras = () => ({
  minimo: Math.max(1, Number(String(settings.get('saque_minimo') || '50').replace(',', '.')) || 50),
  diasConcluido: Math.max(0, parseInt(settings.get('liberar_dias_concluido') ?? '7', 10) || 0),
  diasPago: Math.max(1, parseInt(settings.get('liberar_dias_pago') ?? '14', 10) || 14),
});

// Data em que o valor de um pedido fica disponível
function liberaEm(pedido, r = regras()) {
  if (!pedido?.pago_em) return null;
  const pelosPago = msSql(pedido.pago_em) + r.diasPago * 86400000;
  const pelaConclusao = pedido.concluido_em ? msSql(pedido.concluido_em) + r.diasConcluido * 86400000 : Infinity;
  return Math.min(pelosPago, pelaConclusao);
}

// ── Lançamentos ─────────────────────────────────────────────────────────────
function creditarVenda(pedido, tarifaMp) {
  if (db.get(`SELECT 1 FROM carteira_movimentos WHERE pedido_id = ? AND tipo = 'venda'`, pedido.id)) return; // uma vez só
  const codigo = `PD-${String(pedido.id).padStart(6, '0')}`;
  db.run(`INSERT INTO carteira_movimentos (loja_id, tipo, valor, pedido_id, descricao) VALUES (?, 'venda', ?, ?, ?)`,
    pedido.loja_id, r2(pedido.subtotal ?? pedido.total), pedido.id, `Venda ${codigo}: ${pedido.quantidade}x ${pedido.produto}`.slice(0, 200));
  if (tarifaMp > 0) {
    db.run(`INSERT INTO carteira_movimentos (loja_id, tipo, valor, pedido_id, descricao) VALUES (?, 'tarifa_mp', ?, ?, ?)`,
      pedido.loja_id, -r2(tarifaMp), pedido.id, `Tarifa do Mercado Pago — ${codigo}`);
  }
}

function estornarVenda(pedido) {
  const saldoPedido = db.get('SELECT COALESCE(SUM(valor), 0) v FROM carteira_movimentos WHERE pedido_id = ?', pedido.id).v;
  if (Math.abs(saldoPedido) < 0.005) return;
  db.run(`INSERT INTO carteira_movimentos (loja_id, tipo, valor, pedido_id, descricao) VALUES (?, 'estorno', ?, ?, ?)`,
    pedido.loja_id, -r2(saldoPedido), pedido.id, `Pedido PD-${String(pedido.id).padStart(6, '0')} cancelado e devolvido ao cliente`);
}

// ── Saldo e extrato ─────────────────────────────────────────────────────────
function saldo(lojaId) {
  const r = regras();
  const agora = Date.now();
  let disponivel = 0, aLiberar = 0, proxima = null;
  const pedidos = new Map();
  for (const m of db.all('SELECT * FROM carteira_movimentos WHERE loja_id = ?', lojaId)) {
    if (!m.pedido_id) { disponivel += m.valor; continue; }
    if (!pedidos.has(m.pedido_id)) pedidos.set(m.pedido_id, db.get('SELECT pago_em, concluido_em, status FROM pedidos_loja WHERE id = ?', m.pedido_id));
    const pedido = pedidos.get(m.pedido_id);
    const libera = liberaEm(pedido, r);
    if (libera !== null && libera <= agora) disponivel += m.valor;
    else { aLiberar += m.valor; if (libera && pedido?.status !== 'cancelado' && (!proxima || libera < proxima)) proxima = libera; }
  }
  const soma = (sql, ...p) => r2(db.get(sql, lojaId, ...p).v);
  // Pedidos cancelados (devolvidos ao cliente) não contam no vendido nem nas tarifas
  const semCancelados = `AND (pedido_id IS NULL OR pedido_id NOT IN (SELECT id FROM pedidos_loja WHERE status = 'cancelado'))`;
  return {
    disponivel: r2(disponivel), a_liberar: r2(aLiberar), proxima_liberacao: proxima ? sqlMs(proxima) : null,
    vendido: soma(`SELECT COALESCE(SUM(valor), 0) v FROM carteira_movimentos WHERE loja_id = ? AND tipo = 'venda' ${semCancelados}`),
    tarifas: -soma(`SELECT COALESCE(SUM(valor), 0) v FROM carteira_movimentos WHERE loja_id = ? AND tipo = 'tarifa_mp' ${semCancelados}`),
    sacado: soma(`SELECT COALESCE(SUM(valor), 0) v FROM carteira_saques WHERE loja_id = ? AND status = 'pago'`),
    saque_pendente: soma(`SELECT COALESCE(SUM(valor), 0) v FROM carteira_saques WHERE loja_id = ? AND status = 'solicitado'`),
    minimo: r.minimo, dias_concluido: r.diasConcluido, dias_pago: r.diasPago,
  };
}

function extrato(lojaId, limite = 200) {
  const r = regras();
  return db.all('SELECT * FROM carteira_movimentos WHERE loja_id = ? ORDER BY id DESC LIMIT ?', lojaId, limite).map(m => {
    const p = m.pedido_id ? db.get('SELECT pago_em, concluido_em, status FROM pedidos_loja WHERE id = ?', m.pedido_id) : null;
    const libera = p ? liberaEm(p, r) : null;
    return { id: m.id, tipo: m.tipo, valor: m.valor, descricao: m.descricao, pedido_id: m.pedido_id, saque_id: m.saque_id, created_at: m.created_at,
      libera_em: libera ? sqlMs(libera) : null, liberado: !m.pedido_id || (libera !== null && libera <= Date.now()), cancelado: p?.status === 'cancelado' };
  });
}

const saques = lojaId => db.all('SELECT * FROM carteira_saques WHERE loja_id = ? ORDER BY id DESC LIMIT 100', lojaId);

// ── Saques ──────────────────────────────────────────────────────────────────
function solicitarSaque(user, b) {
  const loja = db.get('SELECT * FROM lojas WHERE user_id = ?', user.id);
  if (!loja) throw fail('Loja não encontrada.', 404);
  if (!loja.pag_pix_chave || !loja.pag_pix_tipo) throw fail('Cadastre a sua chave Pix para receber os saques (em "Recebimento dos saques").');
  if (db.get(`SELECT 1 FROM carteira_saques WHERE loja_id = ? AND status = 'solicitado'`, loja.id)) throw fail('Você já tem um saque aguardando pagamento.');
  const s = saldo(loja.id);
  const valor = r2(Number(String(b.valor ?? s.disponivel).replace(',', '.')));
  if (!(valor > 0)) throw fail('Informe o valor do saque.');
  if (valor < s.minimo) throw fail(`O saque mínimo é ${brl(s.minimo)}.`);
  if (valor > s.disponivel + 0.001) throw fail(`Saldo disponível insuficiente (${brl(s.disponivel)}).`);
  let id;
  db.transaction(() => {
    id = Number(db.run('INSERT INTO carteira_saques (loja_id, valor, pix_tipo, pix_chave, pix_nome) VALUES (?, ?, ?, ?, ?)',
      loja.id, valor, loja.pag_pix_tipo, loja.pag_pix_chave, loja.pag_pix_nome || loja.nome).lastInsertRowid);
    db.run(`INSERT INTO carteira_movimentos (loja_id, tipo, valor, saque_id, descricao) VALUES (?, 'saque', ?, ?, ?)`,
      loja.id, -valor, id, `Saque solicitado para a chave Pix ${loja.pag_pix_chave}`);
  });
  try {
    require('./ganhos').notificar({ chave: `saque:${id}`, tipo: 'saque', titulo: `${loja.nome} pediu um saque de ${brl(valor)}`,
      texto: `Pague pelo app do Mercado Pago para a chave Pix ${loja.pag_pix_chave} (${loja.pag_pix_nome || loja.nome}) e marque como pago em Painel → Atendimento → Carteiras.`, link: '/admin' });
  } catch { /* sem aviso */ }
  return painel(user);
}

function resolverSaque(id, pago, observacao = '') {
  const sq = db.get('SELECT * FROM carteira_saques WHERE id = ?', Number(id));
  if (!sq) throw fail('Saque não encontrado.', 404);
  if (sq.status !== 'solicitado') throw fail('Este saque já foi resolvido.');
  const obs = String(observacao || '').trim().slice(0, 300) || null;
  const loja = db.get('SELECT * FROM lojas WHERE id = ?', sq.loja_id);
  db.transaction(() => {
    db.run(`UPDATE carteira_saques SET status = ?, observacao = ?, resolvido_em = datetime('now') WHERE id = ?`, pago ? 'pago' : 'recusado', obs, sq.id);
    if (!pago) {
      db.run(`INSERT INTO carteira_movimentos (loja_id, tipo, valor, saque_id, descricao) VALUES (?, 'saque_devolvido', ?, ?, ?)`,
        sq.loja_id, sq.valor, sq.id, `Saque recusado — valor devolvido ao saldo${obs ? ` (${obs})` : ''}`);
    }
  });
  const dono = `u:${loja.user_id}`;
  const titulo = pago ? `Saque de ${brl(sq.valor)} pago` : `Saque de ${brl(sq.valor)} recusado`;
  const texto = pago ? `O Ofertou! enviou ${brl(sq.valor)} para a sua chave Pix ${sq.pix_chave}.${obs ? ` ${obs}` : ''}`
    : `O valor voltou para o seu saldo disponível.${obs ? ` Motivo: ${obs}` : ''}`;
  notificacoes.criar(dono, { tipo: 'saque', titulo, texto, link: '/conta?aba=vendas' });
  try { require('./chat').avisarPorEmail(dono, `${titulo} — Ofertou!`, texto); } catch { /* sem e-mail */ }
  return db.get('SELECT * FROM carteira_saques WHERE id = ?', sq.id);
}

// ── Telas ───────────────────────────────────────────────────────────────────
function painel(user) {
  const loja = db.get('SELECT id FROM lojas WHERE user_id = ?', user.id);
  if (!loja) return null;
  return { saldo: saldo(loja.id), extrato: extrato(loja.id), saques: saques(loja.id) };
}

function visaoAdmin() {
  return {
    regras: regras(),
    lojas: db.all('SELECT id, nome, slug, pag_pix_tipo, pag_pix_chave, pag_pix_nome FROM lojas ORDER BY nome').map(l => ({ ...l, saldo: saldo(l.id) }))
      .filter(l => l.saldo.vendido > 0 || l.saldo.saque_pendente > 0 || l.saldo.disponivel !== 0),
    saques: db.all(`SELECT s.*, l.nome AS loja_nome FROM carteira_saques s JOIN lojas l ON l.id = s.loja_id ORDER BY (s.status = 'solicitado') DESC, s.id DESC LIMIT 200`),
  };
}

module.exports = { regras, liberaEm, creditarVenda, estornarVenda, saldo, extrato, saques, solicitarSaque, resolverSaque, painel, visaoAdmin };
