const axios = require('axios');
const cheerio = require('cheerio');
const db = require('./db');

const BOT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

// Buscas otimizadas e limpas para trazer ofertas reais com desconto em TODAS as categorias da Amazon e Mercado Livre
const MINING_QUERIES = [
  // 📱 Celulares & Tablets
  { query: 'iphone', cat: 'celulares' },
  { query: 'samsung galaxy', cat: 'celulares' },
  { query: 'celular xiaomi', cat: 'celulares' },
  { query: 'ipad apple', cat: 'celulares' },
  { query: 'motorola edge', cat: 'celulares' },

  // 💻 Informática & PC Gamer
  { query: 'notebook', cat: 'informatica' },
  { query: 'macbook', cat: 'informatica' },
  { query: 'monitor gamer', cat: 'informatica' },
  { query: 'teclado mecanico', cat: 'informatica' },
  { query: 'mouse sem fio logitech', cat: 'informatica' },
  { query: 'ssd 1tb nvme', cat: 'informatica' },

  // 🎮 Games & Consoles
  { query: 'playstation 5', cat: 'games' },
  { query: 'nintendo switch', cat: 'games' },
  { query: 'xbox series', cat: 'games' },
  { query: 'controle ps5 dualsense', cat: 'games' },
  { query: 'headset gamer', cat: 'games' },

  // 📺 Áudio & TV
  { query: 'smart tv', cat: 'audio_tv' },
  { query: 'fone jbl', cat: 'audio_tv' },
  { query: 'caixa de som jbl', cat: 'audio_tv' },
  { query: 'soundbar samsung', cat: 'audio_tv' },

  // 🍳 Cozinha & Utensílios
  { query: 'air fryer', cat: 'cozinha' },
  { query: 'cafeteira nespresso', cat: 'cozinha' },
  { query: 'liquidificador', cat: 'cozinha' },

  // ❄️ Eletrodomésticos
  { query: 'geladeira frost free', cat: 'eletrodomesticos' },
  { query: 'maquina de lavar', cat: 'eletrodomesticos' },
  { query: 'robo aspirador', cat: 'eletrodomesticos' },
  { query: 'ar condicionado inverter', cat: 'eletrodomesticos' },

  // 👟 Moda, Saúde & Ferramentas
  { query: 'tenis nike', cat: 'moda' },
  { query: 'smartwatch', cat: 'moda' },
  { query: 'perfume importado', cat: 'beleza' },
  { query: 'whey protein', cat: 'saude' },
  { query: 'creatina monohidratada', cat: 'saude' },
  { query: 'parafusadeira bosch', cat: 'ferramentas' }
];

function classifyCategory(title) {
  const t = (title || '').toLowerCase();
  if (/sabão|sabao|omo|amaciante|downy|detergente|ypê|ype|desinfetante|lysoform|papel higiênico|papel higienico|veja|limpeza|multiuso/i.test(t)) return 'limpeza';
  if (/café|cafe|cápsula|capsula|azeite|chocolate|milka|nestlé|nestle|cerveja|heineken|stella|vinho|red bull|monster|energético|energetico|leite|ninho|alimento|comida/i.test(t)) return 'alimentos';
  if (/torneira|banheiro|chuveiro|cama|toalha|pia|dreno|sifão/i.test(t)) return 'casa_banheiro';
  if (/playstation|xbox|nintendo|game|joystick|controle|switch|gamer|headset/i.test(t)) return 'games';
  if (/fritadeira|airfryer|air fryer|panela|grill|cafeteira|liquidificador|batedeira|cozinha/i.test(t)) return 'cozinha';
  if (/notebook|laptop|macbook|mouse|teclado|monitor|ssd|hd|hub|gpu|placa|impressora/i.test(t)) return 'informatica';
  if (/iphone|smartphone|celular|galaxy|xiaomi|motorola|ipad|tablet/i.test(t)) return 'celulares';
  if (/fone|headphone|earbuds|speaker|caixa de som|jbl|tv|televisão|soundbar|camera|projetor/i.test(t)) return 'audio_tv';
  if (/tênis|tenis|sapato|camisa|calça|jaqueta|moletom|roupa|relógio|relogio|smartwatch/i.test(t)) return 'moda';
  if (/perfume|maquiagem|skincare|batom|shampoo|creme|sérum|escova|barbeador/i.test(t)) return 'beleza';
  if (/ração|racao|pet|cachorro|gato|aquário|arranhador/i.test(t)) return 'pets';
  if (/whey|creatina|suplemento|vitamina|proteína|saúde|saude/i.test(t)) return 'saude';
  if (/geladeira|fogão|fogao|lavadora|ar condicionado|ventilador|microondas|eletrodoméstico/i.test(t)) return 'eletrodomesticos';
  if (/furadeira|parafusadeira|ferramenta|maleta|alicate|chave/i.test(t)) return 'ferramentas';
  if (/pneu|som automotivo|carro|veículo|suporte celular/i.test(t)) return 'automotivo';
  if (/lego|brinquedo|bebê|bebe|carrinho de bebê/i.test(t)) return 'brinquedos';
  return 'outros';
}

function parseBRL(str) {
  if (!str) return null;
  let clean = String(str).replace(/[^\d.,]/g, '').trim();
  if (!clean) return null;

  if (clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Formato decimal com ponto (ex: 28.99 ou 1299.90)
    } else {
      // Separador de milhar (ex: 1.000)
      clean = clean.replace(/\./g, '');
    }
  }

  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}

// Categorias com Ofertas do Mercado Livre (MLB Category IDs)
const ML_CATEGORIES = [
  { name: 'Celulares', catId: 'MLB1051' },
  { name: 'Informática', catId: 'MLB1648' },
  { name: 'Games', catId: 'MLB1144' },
  { name: 'Áudio & TV', catId: 'MLB1000' },
  { name: 'Eletrodomésticos', catId: 'MLB5726' },
  { name: 'Cozinha & Casa', catId: 'MLB1574' },
  { name: 'Moda', catId: 'MLB1430' },
  { name: 'Beleza', catId: 'MLB1246' },
  { name: 'Saúde & Esportes', catId: 'MLB1276' },
  { name: 'Ferramentas', catId: 'MLB1499' },
  { name: 'Alimentos', catId: 'MLB1403' },
  { name: 'Automotivo', catId: 'MLB5672' }
];

const QUERY_TO_ML_CAT = {
  'iphone': 'MLB1051',
  'samsung galaxy': 'MLB1051',
  'celular xiaomi': 'MLB1051',
  'ipad apple': 'MLB1051',
  'motorola edge': 'MLB1051',
  'notebook': 'MLB1648',
  'macbook': 'MLB1648',
  'monitor gamer': 'MLB1648',
  'teclado mecanico': 'MLB1648',
  'mouse sem fio logitech': 'MLB1648',
  'ssd 1tb nvme': 'MLB1648',
  'playstation 5': 'MLB1144',
  'nintendo switch': 'MLB1144',
  'xbox series': 'MLB1144',
  'controle ps5 dualsense': 'MLB1144',
  'headset gamer': 'MLB1144',
  'smart tv': 'MLB1000',
  'fone jbl': 'MLB1000',
  'caixa de som jbl': 'MLB1000',
  'soundbar samsung': 'MLB1000',
  'air fryer': 'MLB1574',
  'cafeteira nespresso': 'MLB1574',
  'liquidificador': 'MLB1574',
  'geladeira frost free': 'MLB5726',
  'maquina de lavar': 'MLB5726',
  'robo aspirador': 'MLB5726',
  'ar condicionado inverter': 'MLB5726',
  'tenis nike': 'MLB1430',
  'smartwatch': 'MLB1430',
  'perfume importado': 'MLB1246',
  'whey protein': 'MLB1276',
  'creatina monohidratada': 'MLB1276',
  'parafusadeira bosch': 'MLB1499'
};

// 1. Mineração Mercado Livre BR (Reais com Desconto Autêntico em Todas as Categorias)
async function mineMercadoLivre(searchQuery, categoryId = null, maxPages = 2) {
  const deals = [];
  const urlsToFetch = [];

  let targetCat = categoryId;
  if (!targetCat && searchQuery) {
    const qLower = searchQuery.toLowerCase().trim();
    if (QUERY_TO_ML_CAT[qLower]) {
      targetCat = QUERY_TO_ML_CAT[qLower];
    }
  }

  if (targetCat) {
    for (let p = 1; p <= maxPages; p++) {
      urlsToFetch.push(`https://www.mercadolivre.com.br/ofertas?category=${targetCat}&page=${p}`);
    }
  } else if (!searchQuery) {
    for (const cat of ML_CATEGORIES) {
      for (let p = 1; p <= maxPages; p++) {
        urlsToFetch.push(`https://www.mercadolivre.com.br/ofertas?category=${cat.catId}&page=${p}`);
      }
    }
  } else {
    for (let p = 1; p <= maxPages; p++) {
      urlsToFetch.push(`https://www.mercadolivre.com.br/ofertas?page=${p}`);
    }
  }

  for (const url of urlsToFetch) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': BOT_USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache'
        },
        timeout: 9000
      });

      const $ = cheerio.load(res.data);
      $('.poly-card, .promotion-item, .ui-search-layout__item, .ui-search-result').each((i, el) => {
        const title = $(el).find('.poly-component__title, .promotion-item__title, .ui-search-item__title, h2, .poly-card__title, a.poly-component__title').first().text().trim();

        // Preço Original Cortado Estrito (Captura preços anteriores autênticos do Mercado Livre em todas as páginas)
        const origText = $(el).find('.poly-price__labels s .andes-money-amount__fraction, .andes-money-amount--previous .andes-money-amount__fraction, .poly-price__original .andes-money-amount__fraction, .ui-search-price__part--original .andes-money-amount__fraction, .promotion-item__old-price .andes-money-amount__fraction').first().text();

        // Preço Atual Promocional
        let currPriceEl = $(el).find('.poly-price__current .andes-money-amount__fraction, .promotion-item__price .andes-money-amount__fraction, .ui-search-price__part--current .andes-money-amount__fraction').first();
        if (!currPriceEl.length) {
          currPriceEl = $(el).find('.andes-money-amount:not(.poly-price__original *):not(.ui-search-price__part--original *):not(.andes-money-amount--previous *) .andes-money-amount__fraction').first();
        }

        const priceText = currPriceEl.text();
        const priceCentsText = $(el).find('.poly-price__current .andes-money-amount__cents, .promotion-item__price .andes-money-amount__cents').first().text() || '00';
        const fullPriceText = priceCentsText !== '00' ? `${priceText},${priceCentsText}` : priceText;

        let link = $(el).find('a[href*="mercadolivre.com.br"], a[href*="MLB"], a.poly-component__title, a.ui-search-link, a').first().attr('href');
        let img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');

        const precoAtual = parseBRL(fullPriceText);
        const precoAnterior = parseBRL(origText);

        // O minerador aceita APENAS ofertas com preço original cortado maior e desconto autêntico de 5% a 75%!
        if (title && precoAtual && link && precoAnterior && precoAnterior > precoAtual) {
          const diff = precoAnterior - precoAtual;
          const descontoPct = Math.round((diff / precoAnterior) * 100);

          if (diff >= 5 && descontoPct >= 5 && descontoPct <= 75) {
            if (img && img.startsWith('http://')) img = img.replace('http://', 'https://');
            if (link.startsWith('/')) link = `https://www.mercadolivre.com.br${link}`;

            deals.push({
              produto: title,
              preco_atual: precoAtual,
              preco_anterior: precoAnterior,
              desconto_pct: descontoPct,
              plataforma: 'Mercado Livre',
              categoria: classifyCategory(title),
              imagem: img || '/images/logo_completo.png',
              original_url: link,
              affiliate_url: link
            });
          }
        }
      });
    } catch (err) {
      // Silenciosamente ignora falhas individuais de URL
    }
  }
  return deals;
}

// 2. Mineração Amazon BR (Reais com Desconto Autêntico em TODAS as categorias)
async function mineAmazon(searchQuery) {
  const deals = [];
  try {
    const url = searchQuery
      ? `https://www.amazon.com.br/s?k=${encodeURIComponent(searchQuery)}&pct-off=5-`
      : `https://www.amazon.com.br/gp/goldbox`;

    const res = await axios.get(url, {
      headers: {
        'User-Agent': BOT_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 9000
    });

    const $ = cheerio.load(res.data);
    $('[data-component-type="s-search-result"]').each((i, el) => {
      const title = $(el).find('h2 a span, h2 span, .a-size-medium, .a-size-base-plus').first().text().trim();

      // Preço Atual com Desconto (IGNORA o .a-text-price que é o preço antigo/riscado!)
      const currentPriceEl = $(el).find('.a-price:not(.a-text-price)').first();
      const whole = currentPriceEl.find('.a-price-whole').first().text().replace(/[^\d]/g, '');
      const frac = currentPriceEl.find('.a-price-fraction').first().text().replace(/[^\d]/g, '') || '00';

      // Preço Original Cortado Estrito (De: R$ XXX / Preço de Lista)
      const origText = $(el).find('.a-price.a-text-price span.a-offscreen, span.a-text-price span.a-offscreen, .a-price[data-a-strike="true"] span.a-offscreen').first().text();

      const link = $(el).find('h2 a, a.a-link-normal').first().attr('href');
      const img = $(el).find('img.s-image').attr('src');

      if (title && whole && link) {
        const precoAtual = parseFloat(`${whole}.${frac}`);
        const precoAnterior = parseBRL(origText);

        if (!isNaN(precoAtual) && precoAtual > 0 && precoAnterior && precoAnterior > precoAtual) {
          const diff = precoAnterior - precoAtual;
          const descontoPct = Math.round((diff / precoAnterior) * 100);

          if (diff >= 5 && descontoPct >= 5 && descontoPct <= 80) {
            const fullLink = link.startsWith('http') ? link : `https://www.amazon.com.br${link}`;

            deals.push({
              produto: title,
              preco_atual: precoAtual,
              preco_anterior: precoAnterior,
              desconto_pct: descontoPct,
              plataforma: 'Amazon',
              categoria: classifyCategory(title),
              imagem: img || '/images/logo_completo.png',
              original_url: fullLink,
              affiliate_url: fullLink
            });
          }
        }
      }
    });
  } catch (err) {
    console.error(`Erro ao minerar Amazon (${searchQuery}):`, err.message);
  }
  return deals;
}

async function getSettingsMap() {
  try {
    const rows = await db.all(`SELECT * FROM settings`);
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    return map;
  } catch {
    return {};
  }
}

async function shortenUrl(url) {
  return url;
}

function convertToAffiliateUrl(originalUrl, platform, settings) {
  if (!originalUrl) return originalUrl;

  let [baseUrl] = originalUrl.split('#');

  // 1. Amazon BR
  if (platform === 'Amazon') {
    let cleanBase = baseUrl;
    const dpMatch = baseUrl.match(/(\/dp\/[A-Z0-9]{10})/i) || baseUrl.match(/(\/gp\/product\/[A-Z0-9]{10})/i);
    if (dpMatch) {
      cleanBase = `https://www.amazon.com.br${dpMatch[1]}`;
    }
    if (settings.amazon_tag) {
      const tag = settings.amazon_tag.trim();
      if (tag) {
        return `${cleanBase}?tag=${tag}`;
      }
    }
    return cleanBase;
  }

  // 2. Mercado Livre
  if (platform === 'Mercado Livre') {
    let cleanBase = baseUrl.split('?')[0];
    if (cleanBase.startsWith('/')) {
      cleanBase = `https://www.mercadolivre.com.br${cleanBase}`;
    }

    // Se for URL de catálogo /p/MLB...
    if (cleanBase.includes('/p/MLB')) {
      const pMatch = cleanBase.match(/(https?:\/\/[^\/]+)?(\/p\/MLB\d+)/i);
      if (pMatch) {
        cleanBase = `https://www.mercadolivre.com.br${pMatch[2]}`;
      }
    }

    if (settings.ml_affiliate_id) {
      const mlId = settings.ml_affiliate_id.trim();
      if (mlId) {
        return `${cleanBase}?matt_tool=${mlId}&p_id=${mlId}`;
      }
    }
    return cleanBase;
  }

  // 3. Shopee
  if (platform === 'Shopee' && settings.shopee_affiliate_id) {
    const shpId = settings.shopee_affiliate_id.trim();
    if (shpId) {
      const sep = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${sep}utm_source=${shpId}`;
    }
  }

  return baseUrl;
}

// Salvar/Atualizar no Banco SQLite
async function saveOffer(deal, settings = {}) {
  try {
    // Rejeita estritamente qualquer produto que não tenha desconto real
    if (!deal || !deal.preco_anterior || !deal.desconto_pct || deal.desconto_pct <= 0 || deal.preco_anterior <= deal.preco_atual) {
      return null;
    }

    if (!settings || Object.keys(settings).length === 0) {
      settings = await getSettingsMap();
    }
    let affiliateUrl = convertToAffiliateUrl(deal.original_url, deal.plataforma, settings);
    affiliateUrl = await shortenUrl(affiliateUrl);
    deal.affiliate_url = affiliateUrl;

    const existing = await db.get(
      `SELECT * FROM offers WHERE original_url = ? OR produto = ?`,
      [deal.original_url, deal.produto]
    );

    if (existing) {
      const priceChanged = Number(existing.preco_atual) !== Number(deal.preco_atual);
      const minPrice = existing.min_price_30d ? Math.min(existing.min_price_30d, deal.preco_atual) : deal.preco_atual;

      await db.run(
        `UPDATE offers SET preco_atual = ?, preco_anterior = ?, desconto_pct = ?, affiliate_url = ?, min_price_30d = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [deal.preco_atual, deal.preco_anterior, deal.desconto_pct, deal.affiliate_url, minPrice, existing.id]
      );

      if (priceChanged) {
        await db.run(`INSERT INTO price_history (offer_id, price) VALUES (?, ?)`, [existing.id, deal.preco_atual]);
      }
      return existing.id;
    } else {
      const res = await db.run(
        `INSERT INTO offers (produto, preco_atual, preco_anterior, desconto_pct, plataforma, categoria, imagem, original_url, affiliate_url, min_price_30d) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          deal.produto,
          deal.preco_atual,
          deal.preco_anterior,
          deal.desconto_pct,
          deal.plataforma,
          deal.categoria,
          deal.imagem,
          deal.original_url,
          deal.affiliate_url,
          deal.preco_atual
        ]
      );

      const offerId = res.lastID;
      // Insere apenas o registro de preço real minerado no momento
      await db.run(`INSERT INTO price_history (offer_id, price, checked_at) VALUES (?, ?, datetime('now'))`, [offerId, deal.preco_atual]);

      return offerId;
    }
  } catch (err) {
    console.error('Erro ao salvar oferta:', err.message);
    return null;
  }
}

// Mineração On-Demand por termo de busca
async function mineQuery(query) {
  console.log(`[MINER] ⛏️ Minerando ofertas para: "${query}"...`);
  const [ml, amz] = await Promise.all([
    mineMercadoLivre(query),
    mineAmazon(query)
  ]);

  const allDeals = [...ml, ...amz];
  let savedCount = 0;

  for (const deal of allDeals) {
    const id = await saveOffer(deal);
    if (id) savedCount++;
  }

  console.log(`[MINER] ✅ "${query}": ${allDeals.length} encontradas, ${savedCount} salvas no DB.`);
  return allDeals;
}

// Mineração Geral Agendada
async function mineAll() {
  console.log(`[MINER] 🚀 Iniciando Varredura Geral de Ofertas em todas as categorias (Amazon + Mercado Livre)...`);
  let totalMined = 0;

  // 1. Mineração por Termos de Busca (Amazon + Mercado Livre)
  for (const item of MINING_QUERIES) {
    const deals = await mineQuery(item.query);
    totalMined += deals.length;
    await new Promise(r => setTimeout(r, 400));
  }

  // 2. Mineração Direta pelas Categorias do Mercado Livre (/ofertas?category=MLBXXXX)
  console.log(`[MINER] 🟡 Minerando Categorias Oficiais do Mercado Livre...`);
  for (const cat of ML_CATEGORIES) {
    const mlDeals = await mineMercadoLivre(null, cat.catId, 3);
    let saved = 0;
    for (const d of mlDeals) {
      const id = await saveOffer(d);
      if (id) saved++;
    }
    totalMined += mlDeals.length;
    console.log(`[MINER] ✅ ML Categoria "${cat.name}": ${mlDeals.length} encontradas, ${saved} salvas no DB.`);
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`[MINER] 🎉 Varredura Geral Concluída! Total de ${totalMined} ofertas mineradas.`);
}

async function updateAllAffiliateUrls() {
  const settings = await getSettingsMap();
  const offers = await db.all(`SELECT id, original_url, plataforma FROM offers`);
  let count = 0;
  for (const o of offers) {
    let newAffUrl = convertToAffiliateUrl(o.original_url, o.plataforma, settings);
    newAffUrl = await shortenUrl(newAffUrl);
    if (newAffUrl) {
      await db.run(`UPDATE offers SET affiliate_url = ? WHERE id = ?`, [newAffUrl, o.id]);
      count++;
    }
  }
  console.log(`[MINER] 🔄 ${count} ofertas encurtadas e atualizadas com as tags de afiliado.`);
  return count;
}

module.exports = {
  mineMercadoLivre,
  mineAmazon,
  mineQuery,
  mineAll,
  saveOffer,
  classifyCategory,
  convertToAffiliateUrl,
  shortenUrl,
  updateAllAffiliateUrls
};
