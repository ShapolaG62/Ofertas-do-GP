// Confere o preço na loja logo antes de postar, nas lojas que têm API oficial para isso (Mercado Livre e Shopee).
// Nas outras, ou se a API não responder, a postagem segue com a regra de sempre (preço visto pela mineração nas últimas horas).
const db = require('./db');
const settings = require('./settings');

const DESCONTO_MINIMO = 15; // igual ao das ofertas automáticas (busca-ofertas.paraPostar)
const SUBIDA_MAXIMA = 0.1;  // subiu mais que isso: a oferta deixou de ser a que foi escolhida
const TOLERANCIA = 0.01;    // diferença de até 1% é arredondamento
const LIMITE_MS = 15000;

const log = m => console.log(`[PREÇO NA HORA] ${m}`);
const r2 = v => Math.round(v * 100) / 100;

// Preço agora: { preco, anterior } | { disponivel: false } | null (não deu para conferir)
async function consultar(o, s) {
  const { getStore } = require('./stores');
  if (o.store_id === 'mercadolivre') return getStore('mercadolivre').anuncioAgora(o.store_product_id, s);
  if (o.store_id === 'shopee') {
    if (!s.shopee_app_id || !s.shopee_app_secret) return null;
    const r = await getStore('shopee').porLink(o.original_url, s);
    if (r.status !== 'ok') return null;
    if (!r.deals.length) return { disponivel: false };
    return { preco: Number(r.deals[0].preco_atual), anterior: Number(r.deals[0].preco_anterior) };
  }
  return null;
}
function comLimite(promessa) {
  let t;
  return Promise.race([promessa, new Promise(res => { t = setTimeout(() => res(null), LIMITE_MS); })]).finally(() => clearTimeout(t));
}
const postar = (situacao, extra = {}) => ({ acao: 'postar', situacao, ...extra });
const pular = (situacao, motivo) => ({ acao: 'pular', situacao, motivo });

async function conferir(offerId, s = settings.getAll()) {
  const o = db.get('SELECT * FROM offers WHERE id = ?', offerId);
  if (!o || o.fonte !== 'auto') return postar('sem_checagem');
  let agora;
  try { agora = await comLimite(consultar(o, s)); } catch (err) { log(`oferta ${o.id}: ${err.message}`); return postar('sem_checagem'); }
  if (!agora) return postar('sem_checagem');
  if (agora.disponivel === false) {
    db.run(`UPDATE offers SET last_seen_at = datetime('now', '-2 days') WHERE id = ?`, o.id); // sai do ar até a mineração ver de novo
    return pular('saiu', 'A loja informou que o produto não está mais disponível ou sem desconto.');
  }
  const preco = Number(agora.preco);
  if (!(preco > 0)) return postar('sem_checagem');

  // Preço com cupom: a loja informa o preço sem o cupom
  const referencia = o.cupom_codigo ? Number(o.preco_sem_cupom) : Number(o.preco_atual);
  if (o.cupom_codigo && !(referencia > 0)) return postar('sem_checagem');
  const diferenca = (preco - referencia) / referencia;
  if (Math.abs(diferenca) <= TOLERANCIA) {
    db.run(`UPDATE offers SET last_seen_at = datetime('now') WHERE id = ?`, o.id);
    return postar('igual');
  }
  if (o.cupom_codigo) return pular('mudou', `O preço mudou na loja (R$ ${preco.toFixed(2)}): o cupom pode não valer mais.`);

  const anterior = Number(agora.anterior) > preco ? Number(agora.anterior) : Number(o.preco_anterior);
  const desconto = anterior > preco ? Math.round((1 - preco / anterior) * 100) : 0;
  db.run(`UPDATE offers SET preco_atual = ?, preco_anterior = ?, desconto_pct = ?, updated_at = datetime('now'), last_seen_at = datetime('now') WHERE id = ?`,
    r2(preco), r2(anterior), desconto, o.id);
  db.run('INSERT INTO price_history (offer_id, price) VALUES (?, ?)', o.id, r2(preco));
  if (diferenca > SUBIDA_MAXIMA) return pular('subiu', `O preço subiu de R$ ${referencia.toFixed(2)} para R$ ${preco.toFixed(2)} na loja.`);
  if (desconto < DESCONTO_MINIMO) return pular('subiu', `Na loja, o desconto agora é de ${desconto}%.`);
  return postar(diferenca < 0 ? 'baixou' : 'subiu_pouco', { precoAntigo: referencia });
}

module.exports = { conferir };
