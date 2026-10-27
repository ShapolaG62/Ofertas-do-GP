// Comissão normal por loja e categoria (Painel → Mineração → "Comissão normal por categoria").
// Mercado Livre, Amazon, Magalu e KaBuM! não informam a comissão de cada produto por API, mas pagam uma porcentagem
// fixa por categoria. Com esta tabela o selo amarelo das ofertas mostra "Comissão X%" também nessas lojas.
// Quando a loja informa a comissão do produto (Shopee e AliExpress pela API, Mercado Livre pela importação da
// comissão extra), vale a informada. Valores iniciais (out/2026, venda direta) — confira no painel de cada programa:
//  • Mercado Livre: tabela publicada do Afiliados e Criadores (16% beleza/moda/esportes, 12% casa/bebês/brinquedos,
//    5% eletrônicos/celulares/informática, 0% alimentos);
//  • Amazon: tabela de comissão padrão do Associados (13% beleza/saúde/bebê/alimentos, 11% roupas/pet,
//    8% casa/cozinha/eletrônicos, 7% demais);
//  • Magalu: estimativa do nível inicial (Bronze) — a Magalu não publica a tabela;
//  • KaBuM! (Awin): sem tabela pública (preencha pelo painel da Awin).
const settings = require('./settings');

const PADRAO = {
  mercadolivre: { beleza: 16, moda: 16, esporte: 16, casa: 12, brinquedos: 12, informatica: 5, celulares: 5, audio_tv: 5, games: 5, alimentos: 0 },
  amazon: { beleza: 13, saude: 13, alimentos: 13, brinquedos: 13, moda: 11, pets: 11, casa: 8, cozinha: 8, eletrodomesticos: 8,
    informatica: 8, celulares: 8, audio_tv: 8, '*': 7 },
  magalu: { moda: 7, beleza: 6, casa: 4, cozinha: 4, eletrodomesticos: 4, brinquedos: 3, games: 3, informatica: 2, celulares: 2, audio_tv: 2 },
  kabum: {},
};
const LOJAS = Object.keys(PADRAO);

let cache = { texto: null, tabela: PADRAO };
// Tabela atual: a salva no Painel (só as lojas/categorias válidas) ou a inicial
function tabela() {
  const texto = settings.get('comissao_padrao') || '';
  if (texto === cache.texto) return cache.tabela;
  let t = PADRAO;
  try {
    const salva = JSON.parse(texto || 'null');
    if (salva && typeof salva === 'object') {
      t = {};
      for (const loja of LOJAS) {
        t[loja] = {};
        for (const [cat, v] of Object.entries(salva[loja] || {})) {
          const n = Number(String(v).replace(',', '.'));
          if (v !== '' && v !== null && Number.isFinite(n) && n >= 0 && n <= 50) t[loja][cat] = Math.round(n * 100) / 100;
        }
      }
    }
  } catch { t = PADRAO; }
  cache = { texto, tabela: t };
  return t;
}

// % da comissão normal de uma oferta pela tabela (null = sem valor para essa loja/categoria)
function de(storeId, categoria) {
  const t = tabela()[storeId];
  if (!t) return null;
  const v = t[categoria] ?? t['*'];
  return v === undefined ? null : v;
}

module.exports = { de, tabela, PADRAO, LOJAS };
