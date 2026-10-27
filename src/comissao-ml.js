// Comissão extra do Mercado Livre (Painel → Mineração → "Importar comissão extra do Mercado Livre").
// O Mercado Livre não informa a comissão de afiliado por API: ela só aparece no painel "Afiliados e Criadores", com
// a conta logada. O admin copia a página do painel e cola no Painel; o navegador lê os produtos (código MLB do link,
// nome, preços, foto e as porcentagens de ganho) e manda para cá:
//  • produto que já está no site → recebe a comissão (selo azul/amarelo, filtro e prioridade);
//  • link de produto do catálogo (/p/MLB…) que não está no site → a oferta vem da API oficial (como na mineração);
//  • anúncio que não está no site → entra com o nome, os preços e a foto colados, se tiver desconto (a API do
//    Mercado Livre não deixa consultar anúncios avulsos).
const db = require('./db');
const settings = require('./settings');
const offers = require('./offers');
const ml = require('./stores/mercadolivre');

const pct = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 90 ? null : Math.round(Number(v) * 100) / 100);
const preco = v => (Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) < 1e6 ? Math.round(Number(v) * 100) / 100 : null);
const codigo = v => { const m = String(v || '').toUpperCase().match(/^MLB-?(\d{6,})$/); return m ? `MLB${m[1]}` : null; };

function marcar(id, total, extra) {
  db.run('UPDATE offers SET comissao_pct = ?, comissao_extra_pct = ? WHERE id = ?', total, extra, id);
}

async function importar(lista) {
  const s = settings.getAll();
  const out = { recebidos: 0, marcados: 0, com_extra: 0, novos: 0, fora: [], ids: [] };
  for (const it of (Array.isArray(lista) ? lista : []).slice(0, 300)) {
    const total = pct(it.comissao), extra = pct(it.extra) || 0;
    if (total == null) continue;
    out.recebidos++;
    const item = codigo(it.item), produto = codigo(it.produto);
    let o = item && db.get(`SELECT id FROM offers WHERE store_id = 'mercadolivre' AND store_product_id = ?`, item);
    // Link de catálogo: o anúncio vencedor do produto pela API (o mesmo caminho da mineração)
    if (!o && produto) {
      try {
        const deal = await ml.ofertaDoProduto(produto, s);
        if (deal) {
          o = db.get(`SELECT id FROM offers WHERE store_id = 'mercadolivre' AND store_product_id = ?`, deal.store_product_id);
          if (!o) { const id = offers.saveDeal(ml, deal, { settings: s }); if (id) { o = { id }; out.novos++; } }
        }
      } catch { /* API fora: segue */ }
    }
    // Anúncio avulso: entra com o que veio colado (precisa de preço "de" maior que o "por")
    if (!o && item) {
      const atual = preco(it.preco), anterior = preco(it.preco_anterior);
      const nome = String(it.nome || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (nome && atual && anterior && anterior > atual) {
        const id = offers.saveDeal(ml, {
          store_product_id: item, produto: nome, preco_atual: atual, preco_anterior: anterior,
          imagem: /^https:\/\//.test(it.imagem || '') ? it.imagem : null,
          original_url: `https://produto.mercadolivre.com.br/MLB-${item.slice(3)}`,
        }, { settings: s });
        if (id) { o = { id }; out.novos++; }
      }
    }
    if (!o) { if (out.fora.length < 30) out.fora.push(String(it.nome || item || produto || '?').slice(0, 80)); continue; }
    marcar(o.id, total, extra);
    out.ids.push(o.id);
    out.marcados++;
    if (extra > 0) out.com_extra++;
  }
  return out;
}

// Campanhas acabam: tira a comissão extra dos produtos do ML que não vieram na última importação (ids = os marcados)
function limparExceto(ids) {
  const manter = new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Boolean));
  if (!manter.size) return 0; // lista vazia: não apaga tudo por engano
  const tirar = db.all(`SELECT id FROM offers WHERE store_id = 'mercadolivre' AND comissao_extra_pct > 0`).map(r => r.id).filter(id => !manter.has(id));
  for (const id of tirar) db.run('UPDATE offers SET comissao_extra_pct = 0 WHERE id = ?', id);
  return tirar.length;
}

module.exports = { importar, limparExceto };
