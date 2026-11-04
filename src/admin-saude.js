// Painel → resumo: o que está parado ou deixando de render (alertas) e o que dá resultado (cliques por loja e categoria,
// ofertas mais clicadas, o que as pessoas buscam).
const db = require('./db');
const settings = require('./settings');
const { STORES } = require('./stores');
const busca = require('./busca-ofertas');

const horasDesde = s => (s ? (Date.now() - Date.parse(`${String(s).replace(' ', 'T')}Z`)) / 3600000 : Infinity);
const n = v => Number(v || 0).toLocaleString('pt-BR');

function saude() {
  const s = settings.getAll();
  const alertas = [];
  const ligadas = settings.getEnabledStores();
  const noAr = {};
  for (const o of busca.ativas()) noAr[o.store_id] = (noAr[o.store_id] || 0) + 1;
  const estados = Object.fromEntries(db.all('SELECT * FROM store_status').map(r => [r.store_id, r]));
  const lojas = STORES.filter(l => l.automatic && ligadas[l.id] !== false).map(l => ({
    id: l.id, nome: l.name, ofertas: noAr[l.id] || 0, status: estados[l.id]?.status || null, ultimo_sucesso: estados[l.id]?.last_success_at || null,
  }));

  // Mineração parada (loja bloqueada ou com erro já aparece em "loja com problema" no resumo)
  if (process.env.DISABLE_MINER !== '1') {
    for (const l of lojas) {
      const h = horasDesde(l.ultimo_sucesso);
      if (h > 12 && l.status !== 'not_configured') alertas.push({ texto: `<b>${l.nome}</b> sem mineração com sucesso há ${h === Infinity ? 'muito tempo' : `${Math.round(h)} h`}: as ofertas saem do ar em 24 h`, aba: 'mining', forte: true });
    }
  }
  // Ofertas no ar sem comissão (mesma regra usada para os afiliados)
  const SEM = require('./clientes').lojasSemAfiliado(s);
  for (const l of lojas) {
    const nome = l.nome.replace(/^KaBuM$/, 'KaBuM!');
    if (SEM.includes(nome) && l.ofertas) alertas.push({ texto: `<b>${n(l.ofertas)} ofertas de ${nome}</b> saem sem a sua comissão: falta o link de afiliado`, aba: 'aff', forte: true });
  }
  // Backup
  try {
    const b = require('./backup').estado();
    if (b.erro) alertas.push({ texto: `<b>O último backup falhou:</b> ${b.erro.mensagem}`, aba: 'account', forte: true });
    else if (b.atrasado && process.env.DISABLE_AGENDA !== '1') alertas.push({ texto: '<b>Backup atrasado:</b> nenhuma cópia nas últimas 36 h', aba: 'account', forte: true });
    else if (!b.pasta_externa) alertas.push({ texto: '<b>Backup só neste servidor:</b> escolha uma pasta sincronizada com a nuvem', aba: 'account', forte: false });
  } catch { /* sem backup */ }
  const suspeitas = busca.suspeitas(0).total;

  // Cliques dos últimos 7 dias
  const porLoja = db.all(`SELECT store_id, SUM(n) AS n FROM cliques_loja_dia WHERE dia >= date('now', '-6 days') GROUP BY store_id ORDER BY n DESC`);
  const porCategoria = db.all(`SELECT categoria, SUM(n) AS n FROM cliques_loja_dia WHERE dia >= date('now', '-6 days') GROUP BY categoria ORDER BY n DESC LIMIT 10`);
  const top = db.all(`SELECT id, produto, store_id, preco_atual, desconto_pct, link_clicks FROM offers WHERE link_clicks > 0 ORDER BY link_clicks DESC LIMIT 10`);
  return { alertas, lojas, suspeitas, cliques: { por_loja: porLoja, por_categoria: porCategoria, top }, buscas: require('./buscas-termos').resumo() };
}

module.exports = { saude };
