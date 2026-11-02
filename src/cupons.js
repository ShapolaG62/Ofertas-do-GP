// Cupons de desconto lidos na mineração (KaBuM! e Magalu informam o cupom de cada produto na própria busca).
// A oferta passa a valer pelo preço COM o cupom (como a loja mostra: "R$ 62,02 com cupom"); o preço sem cupom fica
// guardado à parte. Produto sem preço riscado, cujo desconto só existe com o cupom, também vira oferta.
const { round2 } = require('./util');

const CODIGO = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

// cupom: { codigo, tipo: 'pct' | 'valor', valor, minimo?, limite?, texto? }
// minimo: compra mínima (abaixo dela o cupom não vale); limite: desconto máximo em R$ do cupom.
// Mercado Livre: o cupom não tem código (é "Aplicar" na central de cupons): codigo = "ML" + nº da campanha.
function aplicar(deal, cupom) {
  const codigo = String(cupom?.codigo || '').trim().toUpperCase();
  if (!deal || !CODIGO.test(codigo)) return deal;
  const valor = Number(cupom.valor);
  const atual = Number(deal.preco_atual);
  if (!(atual > 0) || !(valor > 0)) return deal;
  if (Number(cupom.minimo) > atual) return deal;
  let desconto = cupom.tipo === 'pct' ? atual * Math.min(valor, 90) / 100 : valor;
  if (Number(cupom.limite) > 0) desconto = Math.min(desconto, Number(cupom.limite));
  const comCupom = round2(atual - desconto);
  if (!(comCupom > 0) || comCupom >= atual) return deal;
  const texto = cupom.texto ? String(cupom.texto).slice(0, 80) : cupom.tipo === 'pct'
    ? `${String(round2(valor)).replace('.', ',')}% OFF`
    : `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: valor % 1 ? 2 : 0, maximumFractionDigits: 2 })} OFF`;
  return {
    ...deal,
    preco_atual: comCupom,
    preco_anterior: Math.max(Number(deal.preco_anterior) || 0, atual),
    preco_sem_cupom: atual,
    cupom_codigo: codigo,
    cupom_texto: texto,
  };
}

// Cupons encontrados nas ofertas no ar (Painel → Mineração e filtro do site)
function resumo() {
  const db = require('./db');
  const active = require('./offers').activeClause();
  return db.all(
    `SELECT o.store_id, o.cupom_codigo AS codigo, MAX(o.cupom_texto) AS texto, COUNT(*) AS ofertas, MAX(o.last_seen_at) AS visto
     FROM offers o WHERE o.cupom_codigo IS NOT NULL AND ${active.sql}
     GROUP BY o.store_id, o.cupom_codigo ORDER BY ofertas DESC`, ...active.params);
}

// Cupom do Mercado Livre (sem código: é ativado na central de cupons)
const ehMl = codigo => /^ML\d+$/.test(String(codigo || ''));
const CENTRAL_ML = 'https://www.mercadolivre.com.br/cupons';
// Valor de {{cupom}} nas postagens
const paraPost = (codigo, texto) => (!codigo ? '' : ehMl(codigo) ? `${texto || 'cupom'} (ative em Cupons no Mercado Livre)` : codigo);

module.exports = { aplicar, resumo, ehMl, paraPost, CENTRAL_ML };
