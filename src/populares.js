// Mais pesquisados e mais clicados, para o painel do afiliado (o administrador vê os dele em Painel → Desempenho).
// Só termos com ofertas no ar: qualquer um pode digitar qualquer coisa na busca. Guardado por 10 min.
const db = require('./db');
require('./buscas-termos'); // cria a tabela de termos
let cache = { em: 0, dados: null };
function populares() {
  if (!cache.dados || Date.now() - cache.em > 10 * 60 * 1000) {
    const busca = require('./busca-ofertas');
    const buscados = [];
    for (const b of db.all('SELECT termo, vezes FROM buscas_termos WHERE vezes >= 2 ORDER BY vezes DESC LIMIT 150')) {
      const r = busca.buscar({ q: b.termo, por: 1 }, { comissao: false });
      if (!r.aproximado && r.total >= 3) buscados.push(b);
      if (buscados.length >= 30) break;
    }
    const clicados = busca.ativas().filter(o => o.link_clicks > 0).sort((a, b) => b.link_clicks - a.link_clicks).slice(0, 30)
      .map(o => ({ id: o.id, produto: o.produto, preco_atual: o.preco_atual, desconto_pct: o.desconto_pct, plataforma: o.plataforma, cliques: o.link_clicks }));
    cache = { em: Date.now(), dados: { buscados, clicados } };
  }
  return cache.dados;
}
module.exports = { populares };
