// Páginas de categoria, tipo de produto e marca para o Google: /ofertas/celulares, /ofertas/celulares/iphone,
// /ofertas/marca/samsung. É a própria página inicial com título, descrição, endereço canônico, dados estruturados e as
// ofertas já no HTML (o Google lê sem precisar rodar o JavaScript); no navegador, site.js assume dali em diante.
const fs = require('fs');
const path = require('path');
const busca = require('../busca-ofertas');
const settings = require('../settings');

const INDEX = path.join(__dirname, '..', '..', 'public', 'index.html');
const NOMES = {
  informatica: 'Informática', celulares: 'Celulares, tablets e relógios', games: 'Games', audio_tv: 'TV, áudio e casa inteligente',
  eletrodomesticos: 'Eletrodomésticos', cozinha: 'Cozinha', casa: 'Casa, móveis e decoração', ferramentas: 'Ferramentas e construção',
  beleza: 'Beleza e perfumaria', saude: 'Saúde e bem-estar', esporte: 'Esporte e fitness', moda: 'Moda e acessórios',
  brinquedos: 'Brinquedos e bebês', automotivo: 'Automotivo', pets: 'Pet shop', limpeza: 'Limpeza', alimentos: 'Alimentos e bebidas',
};
const SLUG_CAT = { audio_tv: 'tv-e-audio' };
const slugCat = c => SLUG_CAT[c] || c;
const CAT_POR_SLUG = Object.fromEntries(Object.keys(NOMES).map(c => [slugCat(c), c]));
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Marcas com página própria (entram no sitemap só com ofertas suficientes)
const MARCAS = ['Samsung', 'Apple', 'Xiaomi', 'Motorola', 'LG', 'Philips', 'Sony', 'JBL', 'Lenovo', 'Dell', 'Acer', 'Asus', 'HP', 'Positivo',
  'Electrolux', 'Brastemp', 'Consul', 'Britânia', 'Philco', 'Mondial', 'Arno', 'Oster', 'Tramontina', 'Midea', 'Nike', 'Adidas', 'Puma',
  'Olympikus', 'Mizuno', 'Natura', 'Boticário', 'Bosch', 'Makita', 'Dewalt', 'Logitech', 'Redragon', 'Kingston', 'Nintendo', 'PlayStation', 'Xbox'];
const MARCA_POR_SLUG = Object.fromEntries(MARCAS.map(m => [slug(m), m]));

const h = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LOJAS = { mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee', magalu: 'Magalu', aliexpress: 'AliExpress', kabum: 'KaBuM!' };
const slugOferta = o => `${slug(o.produto).slice(0, 80)}-${o.id}`;

// Tipos de produto no ar por categoria (só os com ofertas suficientes viram página)
function tiposNoAr() {
  const t = {};
  for (const o of busca.ativas()) {
    if (!NOMES[o.categoria] || !o.subcategoria || o.subcategoria === 'Outros') continue;
    const m = t[o.categoria] || (t[o.categoria] = {});
    m[o.subcategoria] = (m[o.subcategoria] || 0) + 1;
  }
  return t;
}

// Endereço → o que mostrar. null = essa página não existe.
function resolver(partes) {
  const [a, b] = partes;
  if (a === 'marca') {
    const marca = MARCA_POR_SLUG[b];
    return marca && partes.length === 2 ? { filtro: { q: marca }, nome: `Ofertas ${marca}`, caminho: `/ofertas/marca/${b}`, marca } : null;
  }
  const cat = CAT_POR_SLUG[a];
  if (!cat || partes.length > 2) return null;
  const base = `/ofertas/${a}`;
  if (partes.length === 1) return { filtro: { cat }, nome: NOMES[cat], caminho: base, cat };
  const tipo = Object.keys(tiposNoAr()[cat] || {}).find(n => slug(n) === b);
  return tipo ? { filtro: { cat, tipo }, nome: `${tipo} em ${NOMES[cat]}`, curto: tipo, caminho: `${base}/${b}`, cat, tipo } : null;
}

// Logo da loja, sem fundo; as de texto escuro têm também a versão para o tema escuro
const LOGOS = { mercadolivre: 'webp', amazon: 'webp', shopee: 'svg', magalu: 'svg', aliexpress: 'webp', kabum: 'svg' };
function marcaLoja(o) {
  const ext = LOGOS[o.store_id], nome = h(LOJAS[o.store_id] || o.plataforma);
  if (!ext) return nome;
  const img = (arq, cl) => `<img class="store-marca marca-${o.store_id}${cl}" src="/images/lojas/${arq}.${ext}" alt="${nome}">`;
  return ['mercadolivre', 'amazon', 'kabum'].includes(o.store_id) ? img(o.store_id, ' tema-claro') + img(`${o.store_id}-escuro`, ' tema-escuro') : img(o.store_id, '');
}

function cartao(o) {
  return `<a class="card" href="/oferta/${h(slugOferta(o))}" target="_blank" rel="noopener sponsored nofollow" data-id="${o.id}">
      <div class="card-media"><img src="/img/o/${o.id}.jpg" alt="" loading="lazy" decoding="async" width="300" height="300">
        <div class="card-tags"><span class="card-off">-${Math.round(o.desconto_pct)}%</span></div></div>
      <div class="card-body"><div class="card-store">${marcaLoja(o)}</div>
        <h3 class="card-title">${h(o.produto)}</h3>
        <div class="card-prices"><div class="card-old num">R$ ${brl(o.preco_anterior)}</div><div class="card-price num"><small>R$</small>${brl(o.preco_atual)}</div></div>
        <span class="card-ver">Ver oferta</span>
      </div></a>`;
}

const CACHE = new Map();
function pagina(partes, base) {
  const chave = partes.join('/');
  const guardada = CACHE.get(chave);
  if (guardada && Date.now() - guardada.em < 5 * 60 * 1000) return guardada;
  const p = resolver(partes);
  if (!p) return null;
  const r = busca.buscar({ ...p.filtro, por: 24 }, { comissao: false });
  const lojas = Object.keys(r.contagens?.lojas || {}).map(k => LOJAS[k]).filter(Boolean);
  const menor = r.itens.reduce((m, o) => Math.min(m, o.preco_atual), Infinity);
  const maiorDesc = r.itens.reduce((m, o) => Math.max(m, o.desconto_pct), 0);
  const curto = p.curto || p.nome;
  const titulo = `${p.marca ? p.nome : `Ofertas de ${curto}`}: até ${maiorDesc}% de desconto | Ofertou!`;
  const descricao = `${r.total.toLocaleString('pt-BR')} ofertas de ${curto} com preços conferidos várias vezes por dia${lojas.length ? ` em ${lojas.slice(0, 4).join(', ')}` : ''}. Compare e vá direto para a loja.`;
  const url = `${base}${p.caminho}`;
  const migalhas = [{ nome: 'Ofertas', url: `${base}/` }];
  if (p.cat) migalhas.push({ nome: NOMES[p.cat], url: `${base}/ofertas/${slugCat(p.cat)}` });
  if (p.tipo || p.marca) migalhas.push({ nome: p.tipo || p.marca, url });
  const ld = [{
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: migalhas.map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: m.nome, item: m.url })),
  }, {
    '@context': 'https://schema.org', '@type': 'ItemList', name: titulo, numberOfItems: r.itens.length,
    itemListElement: r.itens.slice(0, 24).map((o, i) => ({ '@type': 'ListItem', position: i + 1, name: o.produto })),
  }];
  // Links para o Google (e para quem navega): tipos da categoria ou as outras categorias
  const tipos = p.cat ? Object.entries(tiposNoAr()[p.cat] || {}).filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).slice(0, 24) : [];
  const ligacoes = tipos.length
    ? tipos.map(([n, q]) => `<a href="/ofertas/${slugCat(p.cat)}/${slug(n)}">${h(n)} <span>${q}</span></a>`).join('')
    : Object.entries(NOMES).map(([c, n]) => `<a href="/ofertas/${slugCat(c)}">${h(n)}</a>`).join('');
  const intro = r.total
    ? `${r.total.toLocaleString('pt-BR')} ofertas${lojas.length ? ` de ${lojas.join(', ')}` : ''}${Number.isFinite(menor) ? `, a partir de R$ ${brl(menor)}` : ''}. Só entra aqui desconto que a própria loja exibe, e os preços são conferidos várias vezes por dia.`
    : 'No momento não há ofertas nesta seção. Veja as outras categorias abaixo.';

  let html = fs.readFileSync(INDEX, 'utf8');
  const troca = (re, novo) => { html = html.replace(re, () => novo); };
  troca(/<title>[^<]*<\/title>/, `<title>${h(titulo)}</title>`);
  troca(/<meta name="description"[^>]*>/, `<meta name="description" content="${h(descricao)}">`);
  // Seção sem ofertas não vai para o Google
  if (r.total < 3) troca(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, follow">');
  troca(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${h(url)}">`);
  troca(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${h(titulo)}">`);
  troca(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${h(descricao)}">`);
  troca(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${h(url)}">`);
  html = html.replace('</head>', () => `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<script>window.OFERTOU_PAGINA=${JSON.stringify({ caminho: p.caminho, cat: p.filtro.cat || '', tipo: p.filtro.tipo || '', q: p.filtro.q || '' }).replace(/</g, '\\u003c')}</script>
</head>`);
  troca(/<main>/, '<main class="pagina-seo">');
  troca(/<h1>[\s\S]*?<\/h1>/, `<h1>${h(p.marca ? p.nome : `Ofertas de ${curto}`)}</h1>`);
  troca(/<p class="lead">[\s\S]*?<\/p>/, `<p class="lead">${h(intro)}</p>`);
  troca(/<div class="grid" id="grid" aria-live="polite"><\/div>/, `<div class="grid" id="grid" aria-live="polite">${r.itens.map(cartao).join('')}</div>`);
  troca(/<nav class="explore-links"[^>]*>[\s\S]*?<\/nav>/, `<nav class="explore-links" aria-label="Explore"><h2>${tipos.length ? `Tipos de ${h(NOMES[p.cat])}` : 'Categorias'}</h2><div>${ligacoes}</div></nav>`);
  const pronta = { em: Date.now(), html, vazia: !r.total };
  CACHE.set(chave, pronta);
  if (CACHE.size > 500) CACHE.delete(CACHE.keys().next().value);
  return pronta;
}

// Endereços para o sitemap
function enderecos() {
  const urls = Object.keys(NOMES).map(c => ({ p: `/ofertas/${slugCat(c)}`, pri: '0.8' }));
  for (const [cat, tipos] of Object.entries(tiposNoAr())) {
    for (const [nome, n] of Object.entries(tipos)) if (n >= 10) urls.push({ p: `/ofertas/${slugCat(cat)}/${slug(nome)}`, pri: '0.6' });
  }
  for (const m of MARCAS) {
    if (busca.buscar({ q: m, por: 1 }, { comissao: false }).total >= 10) urls.push({ p: `/ofertas/marca/${slug(m)}`, pri: '0.6' });
  }
  return urls;
}

const baseDe = req => String(settings.get('site_url') || '').replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;

module.exports = { pagina, enderecos, baseDe };
