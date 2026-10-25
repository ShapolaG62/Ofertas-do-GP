// Busca da página de ofertas feita no servidor: o navegador recebe só a página que está vendo (24 ofertas) e os
// números dos filtros, em vez de baixar todas as ~50 mil ofertas. As regras são as mesmas que a página usava:
// filtros por loja, categoria, tipo, preço e desconto; busca por palavras (sem acento e sem hífen); relevância;
// ordenações; agrupamento por tipo; contagens de cada loja/categoria/tipo ignorando o próprio filtro.
const offers = require('./offers');
const db = require('./db');

const CATEGORIAS = {
  informatica: 'Informática', celulares: 'Celulares, tablets e relógios', games: 'Games',
  audio_tv: 'TV, áudio e casa inteligente', eletrodomesticos: 'Eletrodomésticos', cozinha: 'Cozinha e eletroportáteis',
  casa: 'Casa, móveis e decoração', ferramentas: 'Ferramentas e construção', beleza: 'Beleza e cuidados pessoais',
  saude: 'Saúde e bem-estar', esporte: 'Esporte e fitness', moda: 'Moda e acessórios', brinquedos: 'Bebês e brinquedos',
  automotivo: 'Automotivo', pets: 'Pet shop', limpeza: 'Limpeza', alimentos: 'Alimentos e bebidas', outros: 'Outros',
};
const POR_PAGINA = 24;
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ');
const quando = s => (s ? Date.parse(`${String(s).replace(' ', 'T')}Z`) || 0 : 0);

// ── Lista em memória (refeita quando as ofertas mudam, no máximo a cada 30 s) ──
let CACHE = { sig: null, at: 0, lista: [], resumo: null };
const assinatura = () => {
  const r = db.get('SELECT COUNT(*) AS n, MAX(updated_at) AS u, MAX(last_seen_at) AS s, SUM(oculto) AS h FROM offers');
  return `${r.n}|${r.u}|${r.s}|${r.h}`;
};
// Quem visita nunca espera a lista ser refeita: recebe a lista pronta e a atualização roda logo depois, em segundo plano.
let refazendo = false;
function lista() {
  if (!CACHE.sig) return montar(); // primeira vez (servidor acabou de ligar)
  if (Date.now() - CACHE.at >= 30000 && !refazendo) {
    refazendo = true;
    setImmediate(() => { try { montar(); } catch (e) { console.error('[BUSCA]', e.message); } finally { refazendo = false; } });
  }
  return CACHE;
}
function montar() {
  const sig = assinatura();
  if (sig === CACHE.sig) { CACHE.at = Date.now(); return CACHE; }
  const rows = offers.listActive(100000).map(o => ({
    id: o.id, store_id: o.store_id, plataforma: o.plataforma, produto: o.produto, preco_atual: o.preco_atual,
    preco_anterior: o.preco_anterior, desconto_pct: o.desconto_pct, categoria: o.categoria, subcategoria: o.subcategoria,
    link_clicks: o.link_clicks || 0, fonte: o.fonte, created_at: o.created_at, last_seen_at: o.last_seen_at,
    loja_slug: o.loja_slug || null, menor_preco_30d: o.menor_preco_30d || 0,
    _n: normalizar(o.produto), _c: quando(o.created_at),
  }));
  for (const o of rows) o._s = atratividade(o);
  // Resumo do topo da página: total, lojas, maior desconto, última conferência e a oferta de maior desconto
  let maior = 0, ultima = 0, melhor = null;
  const lojas = new Set();
  for (const o of rows) {
    lojas.add(o.store_id);
    if (o.desconto_pct > maior) maior = o.desconto_pct;
    const v = quando(o.last_seen_at); if (v > ultima) ultima = v;
    if (o.desconto_pct >= 30 && (!melhor || o.desconto_pct > melhor.desconto_pct)) melhor = o;
  }
  CACHE = { sig, at: Date.now(), lista: rows, resumo: {
    total: rows.length, lojas: lojas.size, maior_desconto: maior,
    ultima_conferencia: ultima ? new Date(ultima).toISOString().replace('T', ' ').slice(0, 19) : null,
    destaque: melhor ? publico(melhor) : null,
  } };
  return CACHE;
}
const publico = o => { const { _n, _c, ...r } = o; return r; };

// ── Filtros ──
function ler(q) {
  const num = v => (v === undefined || v === '' || v === null || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    loja: String(q.loja || ''), cat: String(q.cat || ''), tipo: String(q.tipo || ''), q: String(q.q || '').slice(0, 120),
    min: num(q.min), max: num(q.max), desc: Number(q.desc) || 0, ordem: String(q.ordem || 'destaques'),
    pagina: Math.max(1, parseInt(q.pagina, 10) || 1), por: Math.min(Math.max(parseInt(q.por, 10) || POR_PAGINA, 1), 96),
  };
}
function filtro(f, pular = '') {
  const palavras = f.q ? normalizar(f.q).split(/\s+/).filter(Boolean) : [];
  return o => {
    if (pular !== 'loja' && f.loja && (f.loja === 'parceiros' ? !o.loja_slug : o.store_id !== f.loja)) return false;
    if (pular !== 'cat' && f.cat && o.categoria !== f.cat) return false;
    if (pular !== 'tipo' && f.tipo && o.subcategoria !== f.tipo) return false;
    if (palavras.length && !palavras.every(w => o._n.includes(w))) return false;
    if (f.min != null && o.preco_atual < f.min) return false;
    if (f.max != null && o.preco_atual > f.max) return false;
    if (f.desc && o.desconto_pct < f.desc) return false;
    return true;
  };
}
const contar = (l, k) => { const c = {}; for (const o of l) c[o[k]] = (c[o[k]] || 0) + 1; return c; };
function ordemSub(a, b) {
  if (a === b) return 0;
  if (a === 'Outros') return 1;
  if (b === 'Outros') return -1;
  return collator.compare(a || '', b || '');
}
const ORDENS = {
  destaques: (a, b) => (b._s - a._s) || (b._c - a._c),
  recentes: (a, b) => (b._c - a._c) || b.id - a.id,
  desconto: (a, b) => b.desconto_pct - a.desconto_pct,
  'menor-preco': (a, b) => a.preco_atual - b.preco_atual,
  'maior-preco': (a, b) => b.preco_atual - a.preco_atual,
  nome: (a, b) => collator.compare(a.produto, b.produto),
  'nome-desc': (a, b) => collator.compare(b.produto, a.produto),
  populares: (a, b) => (b.link_clicks || 0) - (a.link_clicks || 0),
  tipo: (a, b) => collator.compare(CATEGORIAS[a.categoria] || '', CATEGORIAS[b.categoria] || '')
    || ordemSub(a.subcategoria, b.subcategoria) || collator.compare(a.produto, b.produto),
};
// Relevância na busca: primeiro o produto cujo nome começa com o termo, depois quem traz o termo logo no início,
// por último acessórios ("Organizador de geladeira").
function relevancia(o, frase, palavras) {
  const t = o._n;
  const i = t.indexOf(frase);
  let s = i === 0 ? 100 : i > 0 && i <= 30 ? 60 : i > 0 ? 30 : 10;
  if (i > 0 && /\b(para|de|do|da|p\/)\s$/.test(t.slice(Math.max(0, i - 5), i))) s -= 25;
  if (t.split(' ')[0] === palavras[0]) s += 20;
  return s;
}

function buscar(query) {
  const f = ler(query);
  const { lista: todas, resumo } = lista();
  let l = todas.filter(filtro(f));
  if (f.q && (f.ordem === 'recentes' || f.ordem === 'destaques')) {
    // Busca: primeiro o que mais combina com o termo; empate → a mais atrativa (ou a mais nova)
    const frase = normalizar(f.q).trim().replace(/\s+/g, ' ');
    const palavras = frase.split(' ');
    const nota = new Map(l.map(o => [o.id, relevancia(o, frase, palavras)]));
    l.sort((a, b) => nota.get(b.id) - nota.get(a.id) || ORDENS[f.ordem](a, b));
  } else {
    l.sort(ORDENS[f.ordem] || ORDENS.destaques);
    if (f.ordem === 'destaques') l = variar(l, f.por);
  }

  const paginas = Math.max(1, Math.ceil(l.length / f.por));
  const pagina = Math.min(f.pagina, paginas);
  const itens = l.slice((pagina - 1) * f.por, pagina * f.por);

  // Números dos filtros (cada um ignora o próprio filtro, como antes)
  const semLoja = todas.filter(filtro(f, 'loja'));
  const semCat = todas.filter(filtro(f, 'cat'));
  const contagens = {
    lojas: contar(semLoja, 'store_id'),
    parceiros: semLoja.filter(o => o.loja_slug).length,
    categorias: contar(semCat, 'categoria'),
    categorias_total: semCat.length,
    subcategorias: f.cat ? contar(todas.filter(filtro(f, 'tipo')), 'subcategoria') : {},
  };
  // Ordem "por tipo": quantas ofertas cada grupo tem na lista inteira
  let grupos = null;
  if (f.ordem === 'tipo') {
    grupos = {};
    for (const o of l) { const k = `${o.categoria}|${o.subcategoria}`; grupos[k] = (grupos[k] || 0) + 1; }
  }
  return { total: l.length, pagina, paginas, por: f.por, itens: itens.map(publico), contagens, grupos, resumo };
}

// ── "Mais atrativas" (ordem padrão da página de ofertas) ──
// Nota de cada oferta: a chance de venda (pontuacao, abaixo) + produto muito procurado/viral + interesse no site
// (cliques) + novidade. Assim a 1ª página mostra o que mais chama atenção, e não só o que entrou por último.
// Produtos em alta no Brasil (muita busca e muita venda): sobem na lista
const EM_ALTA = [
  'iphone', 'galaxy', 'redmi', 'xiaomi', 'poco ', 'motorola', 'airpods', 'fone bluetooth', 'fone de ouvido', 'jbl', 'caixa de som',
  'smart tv', 'televisao', 'tv 4k', 'tv 50', 'tv 55', 'fire tv', 'chromecast', 'echo dot', 'alexa', 'kindle', 'smartwatch', 'apple watch',
  'notebook', 'macbook', 'ssd', 'monitor', 'mouse gamer', 'teclado mecanico', 'headset', 'playstation', 'ps5', 'xbox', 'nintendo switch',
  'air fryer', 'airfryer', 'fritadeira', 'cafeteira', 'nespresso', 'dolce gusto', 'liquidificador', 'robo aspirador', 'aspirador',
  'geladeira', 'micro-ondas', 'microondas', 'maquina de lavar', 'lava e seca', 'ar condicionado', 'ventilador', 'climatizador',
  'perfume', 'protetor solar', 'secador', 'chapinha', 'barbeador', 'tenis', 'nike', 'adidas', 'whey', 'creatina',
  'mochila', 'colchao', 'jogo de panelas', 'panela eletrica', 'lego', 'boneca', 'carrinho de bebe', 'fralda',
];
const ACESSORIO = /\b(capa|capinha|pelicula|suporte|cabo|adesivo|organizador|refil|peca|reposicao|kit \d+ pecas de reposicao)\b/;
function atratividade(o) {
  let s = pontuacao(o);
  const n = o._n;
  if (EM_ALTA.some(k => n.includes(k))) s += 18;            // procurado/viral
  s += LOJA_CONFIANCA[o.store_id] ?? 2;                      // loja conhecida pesa de novo (confiança de quem compra)
  if (ACESSORIO.test(n.slice(0, 40))) s -= 12;               // acessório no começo do nome chama menos atenção
  if (o.desconto_pct > 85 || o.desconto_pct < 5) s -= 20;    // desconto suspeito ou pequeno demais
  else if (o.desconto_pct >= 30) s += 6;
  const idadeH = (Date.now() - (o._c || 0)) / 3600000;
  s += idadeH < 24 ? 8 : idadeH < 72 ? 4 : 0;                // novidade
  if (o.loja_slug) s += 4;                                   // loja parceira do site
  return Math.round(s * 10) / 10;
}
// Não deixa uma página inteira de uma categoria só: nas primeiras páginas, no máximo 1/4 da página por categoria,
// metade por loja e um só de cada produto (variações de cor/tamanho do mesmo item). O resto vem logo depois.
function variar(l, por) {
  const LIMITE = por * 5;
  const topo = l.slice(0, LIMITE), resto = l.slice(LIMITE);
  const saida = [];
  let fila = topo;
  while (fila.length) {
    const cat = {}, loja = {}, vistos = new Set(), adiadas = [];
    const pagina = [];
    for (const o of fila) {
      const chave = o._n.slice(0, 28);
      if (pagina.length < por && !vistos.has(chave) && (cat[o.categoria] || 0) < Math.ceil(por / 4) && (loja[o.store_id] || 0) < Math.ceil(por / 2)) {
        pagina.push(o); vistos.add(chave); cat[o.categoria] = (cat[o.categoria] || 0) + 1; loja[o.store_id] = (loja[o.store_id] || 0) + 1;
      } else adiadas.push(o);
    }
    if (!pagina.length) { saida.push(...adiadas); break; }
    if (pagina.length < por) { // poucas categorias/lojas: completa a página com as melhores que sobraram
      const falta = por - pagina.length;
      pagina.push(...adiadas.splice(0, falta));
    }
    saida.push(...pagina);
    fila = adiadas;
  }
  return saida.concat(resto);
}

// "Mix" das postagens: a oferta com mais chance de venda de cada categoria (mesma pontuação de antes)
const LOJA_CONFIANCA = { amazon: 10, mercadolivre: 10, kabum: 9, magalu: 8, shopee: 6, aliexpress: 4, shein: 4, temu: 3 };
function pontuacao(o) {
  const d = o.desconto_pct;
  const p = o.preco_atual;
  let s = Math.min(d, 70);
  s += 12 * Math.log2(1 + (o.link_clicks || 0));
  if (o.menor_preco_30d) s += 15;
  s += LOJA_CONFIANCA[o.store_id] ?? 2;
  s += p >= 40 && p <= 800 ? 10 : p > 800 && p <= 2500 ? 5 : p < 15 ? -10 : p > 5000 ? -5 : 0;
  s += Math.min(15, (o.preco_anterior - p) / 20);
  const visto = quando(o.last_seen_at);
  if (visto && Date.now() - visto < 6 * 3600 * 1000) s += 5;
  if (o.subcategoria && o.subcategoria !== 'Outros') s += 3;
  return s;
}
function mix(loja = '') {
  const melhor = {};
  for (const o of lista().lista) {
    if (o.categoria === 'outros' || o.desconto_pct > 85) continue;
    if (loja && (loja === 'parceiros' ? !o.loja_slug : o.store_id !== loja)) continue;
    const sc = pontuacao(o);
    if (!melhor[o.categoria] || sc > melhor[o.categoria].sc) melhor[o.categoria] = { o, sc };
  }
  return Object.values(melhor).map(b => b.o.id);
}

// Deixa a lista pronta assim que o servidor liga
function aquecer() { setTimeout(() => { try { montar(); } catch (e) { console.error('[BUSCA]', e.message); } }, 3000); }

module.exports = { buscar, mix, aquecer, POR_PAGINA };
