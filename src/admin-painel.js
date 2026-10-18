// Dashboard do painel administrativo: números do site, pendências, gráficos de 30 dias, mineração e últimos movimentos.
const db = require('./db');
const offers = require('./offers');
const miner = require('./miner');

// Cliques nas ofertas por dia (para o gráfico; o total por oferta continua em offers.link_clicks)
db.db.exec(`CREATE TABLE IF NOT EXISTS cliques_dia (dia TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)`);
function registrarClique() {
  try { db.run(`INSERT INTO cliques_dia (dia, n) VALUES (date('now'), 1) ON CONFLICT(dia) DO UPDATE SET n = n + 1`); } catch { /* opcional */ }
}

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const um = (sql, ...p) => { try { return db.get(sql, ...p) || {}; } catch { return {}; } };
const todos = (sql, ...p) => { try { return db.all(sql, ...p); } catch { return []; } };
const variacao = (agora, antes) => (antes ? Math.round(((agora - antes) / antes) * 100) : agora ? null : 0);

function porDia(sql, ...p) {
  return Object.fromEntries(todos(sql, ...p).map(r => [r.dia, r]));
}

function dashboard() {
  // Ofertas
  const ativo = offers.activeClause();
  const ofertasNoAr = um(`SELECT COUNT(*) n FROM offers o WHERE ${ativo.sql}`, ...ativo.params).n || 0;
  const ofertasNovas = um(`SELECT SUM(created_at >= datetime('now', '-1 day')) d1, SUM(created_at >= datetime('now', '-7 days')) d7 FROM offers`);
  const cliques7 = um(`SELECT COALESCE(SUM(n), 0) n FROM cliques_dia WHERE dia >= date('now', '-6 days')`).n || 0;
  const cliquesAnt = um(`SELECT COALESCE(SUM(n), 0) n FROM cliques_dia WHERE dia >= date('now', '-13 days') AND dia < date('now', '-6 days')`).n || 0;
  const cliquesTotal = um('SELECT COALESCE(SUM(link_clicks), 0) n FROM offers').n || 0;

  // Pessoas
  const usuarios = um(`SELECT COUNT(*) total, SUM(tipo = 'empresa' AND status = 'active') empresas, SUM(tipo = 'consumidor' AND status = 'active') consumidores,
    SUM(created_at >= datetime('now', '-7 days')) novos7, SUM(created_at >= datetime('now', '-14 days') AND created_at < datetime('now', '-7 days')) novosAnt,
    SUM(status = 'pending') pendentes FROM users`);
  const clientesAtivos = um(`SELECT COUNT(*) n FROM clientes WHERE status = 'ativo' AND validade >= date('now')`).n || 0;

  // Dinheiro
  const assin30 = um(`SELECT COUNT(*) n, COALESCE(SUM(valor), 0) v FROM pagamentos WHERE status = 'aprovado' AND aprovado_em >= datetime('now', '-30 days') AND valor > 0`);
  const assinAnt = um(`SELECT COALESCE(SUM(valor), 0) v FROM pagamentos WHERE status = 'aprovado' AND aprovado_em >= datetime('now', '-60 days') AND aprovado_em < datetime('now', '-30 days') AND valor > 0`);
  const pedidos30 = um(`SELECT COUNT(*) n, COALESCE(SUM(total), 0) v, COALESCE(SUM(taxa_valor), 0) taxa FROM pedidos_loja
    WHERE status IN ('pago', 'enviado', 'concluido') AND pago_em >= datetime('now', '-30 days')`);
  let carteiras = { a_pagar: 0, saques: 0, saques_valor: 0 };
  try {
    const c = require('./carteira');
    const lojas = todos('SELECT DISTINCT loja_id FROM carteira_movimentos');
    const saldoTotal = lojas.reduce((s, l) => { const x = c.saldo(l.loja_id); return s + x.disponivel + x.a_liberar + (x.saque_pendente || 0); }, 0);
    const sq = um(`SELECT COUNT(*) n, COALESCE(SUM(valor), 0) v FROM carteira_saques WHERE status = 'solicitado'`);
    carteiras = { a_pagar: r2(saldoTotal), saques: sq.n || 0, saques_valor: r2(sq.v) };
  } catch { /* sem carteira */ }
  let afiliados = { disponivel: 0, a_liberar: 0 };
  try {
    const g = require('./ganhos').painel().filter(p => p.ativo);
    afiliados = { disponivel: r2(g.reduce((s, p) => s + p.disponivel, 0)), a_liberar: r2(g.reduce((s, p) => s + p.a_liberar, 0)), pode_sacar: g.filter(p => p.pode_sacar).map(p => p.nome) };
  } catch { /* sem ganhos */ }

  // Pendências
  const pend = {
    cadastros: usuarios.pendentes || 0,
    assinaturas: um(`SELECT COUNT(*) n FROM pagamentos WHERE status = 'pendente' AND metodo IN ('pix_manual', 'transferencia', 'link', 'combinar')`).n || 0,
    leads: um(`SELECT COUNT(*) n FROM ad_leads WHERE status = 'novo'`).n || 0,
    saques: carteiras.saques, saques_valor: carteiras.saques_valor,
    avisos: um(`SELECT COUNT(*) n FROM admin_notificacoes WHERE lida = 0`).n || 0,
    postagens_erro: um(`SELECT COUNT(*) n FROM post_queue WHERE status = 'erro' AND created_at >= datetime('now', '-3 days')`).n || 0,
    cartao_sem_chave: Boolean(require('./settings').get('mp_access_token')) && !String(require('./settings').get('mp_public_key') || '').trim(),
    clientes_vencendo: um(`SELECT COUNT(*) n FROM clientes WHERE status = 'ativo' AND validade >= date('now') AND validade <= date('now', '+5 days')`).n || 0,
  };

  // Mineração
  const st = miner.getState();
  const auto = st.stores.filter(s => s.automatic);
  const mineracao = {
    rodando: st.running, ultima: st.lastRun?.finishedAt || null,
    ok: auto.filter(s => s.status === 'ok').length, total: auto.length,
    problemas: auto.filter(s => s.status && !['ok', 'disabled', 'running'].includes(s.status)).map(s => ({ id: s.id, nome: s.name, status: s.status, msg: s.message })),
    lojas: auto.map(s => ({ nome: s.name, status: s.status || 'none', saved: s.saved || 0 })),
  };

  // Série de 30 dias
  const ofDia = porDia(`SELECT date(created_at) dia, COUNT(*) n FROM offers WHERE created_at >= date('now', '-29 days') GROUP BY dia`);
  const usDia = porDia(`SELECT date(created_at) dia, COUNT(*) n FROM users WHERE created_at >= date('now', '-29 days') GROUP BY dia`);
  const clDia = porDia(`SELECT dia, n FROM cliques_dia WHERE dia >= date('now', '-29 days')`);
  const rcDia = {};
  for (const r of todos(`SELECT date(aprovado_em) dia, SUM(valor) v FROM pagamentos WHERE status = 'aprovado' AND valor > 0 AND aprovado_em >= date('now', '-29 days') GROUP BY dia`)) rcDia[r.dia] = (rcDia[r.dia] || 0) + r.v;
  for (const r of todos(`SELECT date(pago_em) dia, SUM(taxa_valor) v FROM pedidos_loja WHERE status IN ('pago', 'enviado', 'concluido') AND pago_em >= date('now', '-29 days') GROUP BY dia`)) rcDia[r.dia] = (rcDia[r.dia] || 0) + r.v;
  const serie = [];
  for (let i = 29; i >= 0; i--) {
    const dia = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    serie.push({ dia, ofertas: ofDia[dia]?.n || 0, cadastros: usDia[dia]?.n || 0, cliques: clDia[dia]?.n || 0, receita: r2(rcDia[dia]) });
  }

  // Listas
  const topOfertas = todos(`SELECT o.id, o.produto, o.store_id, o.link_clicks, o.preco_atual, o.desconto_pct FROM offers o WHERE ${ativo.sql} ORDER BY o.link_clicks DESC LIMIT 6`, ...ativo.params);
  const ultimosCadastros = todos(`SELECT id, nome, email, tipo, status, empresa_nome, created_at FROM users ORDER BY id DESC LIMIT 6`);
  const ultimosPagamentos = todos(`SELECT id, plano, valor, metodo, status, nome, email, created_at FROM pagamentos ORDER BY id DESC LIMIT 5`);
  const ultimosPedidos = todos(`SELECT p.id, p.produto, p.total, p.status, p.pago_em, l.nome loja FROM pedidos_loja p JOIN lojas l ON l.id = p.loja_id
    WHERE p.pago_em IS NOT NULL ORDER BY p.pago_em DESC LIMIT 5`);

  return {
    kpis: {
      ofertas: { no_ar: ofertasNoAr, novas24h: ofertasNovas.d1 || 0, novas7d: ofertasNovas.d7 || 0 },
      cliques: { d7: cliques7, var: variacao(cliques7, cliquesAnt), total: cliquesTotal },
      usuarios: { total: usuarios.total || 0, empresas: usuarios.empresas || 0, consumidores: usuarios.consumidores || 0, novos7: usuarios.novos7 || 0, var: variacao(usuarios.novos7 || 0, usuarios.novosAnt || 0), clientes: clientesAtivos },
      receita: { assinaturas: r2(assin30.v), assinaturas_n: assin30.n || 0, taxa_pedidos: r2(pedidos30.taxa), total: r2(assin30.v + pedidos30.taxa), var: variacao(assin30.v + pedidos30.taxa, assinAnt.v) },
      pedidos: { n: pedidos30.n || 0, valor: r2(pedidos30.v) },
      carteiras, afiliados,
    },
    pendencias: pend, mineracao, serie,
    top_ofertas: topOfertas, ultimos_cadastros: ultimosCadastros, ultimos_pagamentos: ultimosPagamentos, ultimos_pedidos: ultimosPedidos,
  };
}

module.exports = { dashboard, registrarClique };
