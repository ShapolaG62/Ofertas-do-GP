// Painel da loja (dashboard da empresa em Minha conta): resumo de vendas, recebimento, pendências, acessos,
// funil de conversão, produtos, avaliações e o que falta configurar — tudo de uma vez.
const db = require('./db');
const pedidos = require('./pedidos-loja');
const mpLojas = require('./mp-lojas');
const chat = require('./chat');

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const FIN = `status IN ('pago', 'enviado', 'concluido')`;
const variacao = (agora, antes) => (antes ? Math.round(((agora - antes) / antes) * 100) : agora ? null : 0);

function painel(user) {
  const loja = db.get('SELECT * FROM lojas WHERE user_id = ?', user.id);
  if (!loja) return { loja: null };
  const L = loja.id, dono = `u:${user.id}`;

  // Vendas: últimos 30 dias contra os 30 anteriores
  const periodo = (de, ate) => db.get(`SELECT COUNT(*) n, COALESCE(SUM(subtotal), 0) v, COALESCE(SUM(quantidade), 0) q FROM pedidos_loja
    WHERE loja_id = ? AND ${FIN} AND pago_em >= datetime('now', ?) AND pago_em < datetime('now', ?)`, L, de, ate);
  const v30 = periodo('-30 days', '+1 day'), vAnt = periodo('-60 days', '-30 days');
  const metrica = (tipo, de, ate) => db.get(`SELECT COALESCE(SUM(n), 0) n FROM loja_metricas WHERE loja_id = ? AND tipo = ? AND dia >= date('now', ?) AND dia < date('now', ?)`,
    L, tipo, de, ate).n;
  const acessos30 = metrica('pagina', '-29 days', '+1 day'), acessosAnt = metrica('pagina', '-59 days', '-29 days');
  const produtos30 = metrica('produto', '-29 days', '+1 day');
  const pedidosCriados30 = db.get(`SELECT COUNT(*) n FROM pedidos_loja WHERE loja_id = ? AND created_at >= datetime('now', '-30 days')`, L).n;

  // Série diária (30 dias): vendas pagas e acessos
  const vendasDia = Object.fromEntries(db.all(`SELECT date(pago_em) dia, COUNT(*) n, SUM(subtotal) v FROM pedidos_loja
    WHERE loja_id = ? AND ${FIN} AND pago_em >= date('now', '-29 days') GROUP BY date(pago_em)`, L).map(r => [r.dia, r]));
  const acessosDia = {};
  for (const r of db.all(`SELECT dia, tipo, SUM(n) n FROM loja_metricas WHERE loja_id = ? AND dia >= date('now', '-29 days') GROUP BY dia, tipo`, L)) {
    (acessosDia[r.dia] ||= {})[r.tipo] = r.n;
  }
  const serie = [];
  for (let i = 29; i >= 0; i--) {
    const dia = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    serie.push({ dia, vendas: vendasDia[dia]?.n || 0, valor: r2(vendasDia[dia]?.v), pagina: acessosDia[dia]?.pagina || 0, produto: acessosDia[dia]?.produto || 0 });
  }

  // Pendências (o que a loja precisa fazer agora)
  const aEnviar = db.all(`SELECT id, produto, quantidade, subtotal, pago_em, conversa_id FROM pedidos_loja WHERE loja_id = ? AND status = 'pago' ORDER BY pago_em LIMIT 20`, L)
    .map(p => ({ ...p, codigo: pedidos.codigo(p.id), atrasado: Date.now() - new Date(String(p.pago_em).replace(' ', 'T') + 'Z').getTime() > 3 * 86400000 }));
  const conversas = chat.resumo(dono);
  const semResposta = db.get(`SELECT COUNT(*) n FROM loja_avaliacoes WHERE loja_id = ? AND oculta = 0 AND (resposta IS NULL OR resposta = '')`, L).n;
  const anuncios = db.get(`SELECT COUNT(*) total,
      SUM(oculto = 0 AND expires_at > datetime('now')) ativos,
      SUM(oculto = 0 AND expires_at > datetime('now') AND expires_at < datetime('now', '+3 days')) expirando,
      SUM(oculto = 0 AND expires_at <= datetime('now') AND expires_at > datetime('now', '-15 days')) vencidos
    FROM offers WHERE loja_id = ?`, L);

  // Avaliações
  const av = db.get(`SELECT COUNT(*) n, AVG(nota) media FROM loja_avaliacoes WHERE loja_id = ? AND oculta = 0`, L);
  const estrelas = Object.fromEntries(db.all(`SELECT nota, COUNT(*) n FROM loja_avaliacoes WHERE loja_id = ? AND oculta = 0 GROUP BY nota`, L).map(r => [r.nota, r.n]));
  const recentes = db.all(`SELECT id, autor, nota, texto, resposta, created_at FROM loja_avaliacoes WHERE loja_id = ? AND oculta = 0 ORDER BY id DESC LIMIT 3`, L)
    .map(a => ({ ...a, autor: chat.pessoa(a.autor).nome }));

  // Produtos: mais vistos e mais vendidos (30 dias)
  const maisVistos = db.all(`SELECT m.oferta_id id, SUM(m.n) n, o.produto FROM loja_metricas m JOIN offers o ON o.id = m.oferta_id
    WHERE m.loja_id = ? AND m.tipo = 'produto' AND m.dia >= date('now', '-29 days') GROUP BY m.oferta_id ORDER BY n DESC LIMIT 5`, L);
  const maisVendidos = db.all(`SELECT oferta_id id, produto, SUM(quantidade) q, SUM(subtotal) v FROM pedidos_loja
    WHERE loja_id = ? AND ${FIN} AND pago_em >= datetime('now', '-30 days') GROUP BY oferta_id ORDER BY q DESC LIMIT 5`, L).map(p => ({ ...p, v: r2(p.v) }));

  // Últimos pedidos pagos
  const ultimos = db.all(`SELECT id, produto, quantidade, subtotal, status, pago_em, conversa_id FROM pedidos_loja
    WHERE loja_id = ? AND (pago_em IS NOT NULL OR gateway IS NULL) ORDER BY COALESCE(pago_em, created_at) DESC LIMIT 6`, L)
    .map(p => ({ ...p, codigo: pedidos.codigo(p.id), status_nome: pedidos.STATUS[p.status] }));

  // O que falta para a loja vender bem
  const pub = pedidos.publicoLoja(loja);
  const checklist = [
    { id: 'logo', ok: Boolean(loja.logo_url), texto: 'Colocar o logo da loja', aba: 'loja' },
    { id: 'descricao', ok: Boolean(loja.descricao), texto: 'Escrever a apresentação da loja', aba: 'loja' },
    { id: 'contato', ok: Boolean(loja.whatsapp || loja.telefone || loja.email_contato), texto: 'Informar um contato (WhatsApp, telefone ou e-mail)', aba: 'loja' },
    { id: 'entrega', ok: Boolean(loja.politica_entrega), texto: 'Explicar como funciona a entrega', aba: 'loja' },
    { id: 'anuncios', ok: (anuncios.ativos || 0) > 0, texto: 'Ter pelo menos um anúncio ativo', aba: 'anuncios' },
    { id: 'pedidos', ok: pub.aceita_pedidos, texto: 'Receber pedidos pelo site (Pix e cartão)', aba: 'vendas' },
    { id: 'mercadopago', ok: mpLojas.conectada(loja), texto: 'Conectar a conta do Mercado Pago da loja para receber os pagamentos', aba: 'vendas' },
  ];

  return {
    loja: { id: L, nome: loja.nome, slug: loja.slug, logo: loja.logo_url || null, aceita_pedidos: pub.aceita_pedidos, metodos: pub.metodos.map(m => m.nome) },
    kpis: {
      vendas: { n: v30.n, valor: r2(v30.v), itens: v30.q, var_valor: variacao(v30.v, vAnt.v), var_n: variacao(v30.n, vAnt.n) },
      ticket_medio: v30.n ? r2(v30.v / v30.n) : 0,
      acessos: { n: acessos30, var: variacao(acessos30, acessosAnt) },
      conversao: produtos30 ? Math.round((v30.n / produtos30) * 1000) / 10 : null,
      mp: mpLojas.situacao(loja),
      avaliacao: { media: av.n ? Math.round(av.media * 10) / 10 : null, total: av.n, estrelas },
    },
    pendencias: {
      a_enviar: aEnviar, mensagens: conversas.nao_lidas, pedidos_mensagem: conversas.pedidos, avaliacoes_sem_resposta: semResposta,
      anuncios_expirando: anuncios.expirando || 0, anuncios_vencidos: anuncios.vencidos || 0,
    },
    funil: { pagina: acessos30, produto: produtos30, pedidos: pedidosCriados30, pagos: v30.n },
    serie, mais_vistos: maisVistos, mais_vendidos: maisVendidos, ultimos, avaliacoes: recentes,
    anuncios: { ativos: anuncios.ativos || 0, total: anuncios.total || 0 },
    checklist,
  };
}

module.exports = { painel };
