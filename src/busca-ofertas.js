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

// ── Lista em memória (refeita quando as ofertas mudam, no máximo a cada 60 s) ──
let CACHE = { sig: null, at: 0, lista: [], ordenadas: {}, resumo: null };
let HIST = { at: 0, m: new Map() };
let NOMES = new Map(); // id → { p: nome, n: nome normalizado }
// Respostas prontas das buscas sem login (a página inicial é igual para todos): valem até a lista mudar
const RESPOSTAS = new Map();
const assinatura = () => {
  const r = db.get('SELECT COUNT(*) AS n, MAX(updated_at) AS u, MAX(last_seen_at) AS s, SUM(oculto) AS h, COUNT(comissao_pct) AS c, MAX(comissao_em) AS ce FROM offers');
  return `${r.n}|${r.u}|${r.s}|${r.h}|${r.c}|${r.ce}`;
};
// Quem visita nunca espera a lista ser refeita: recebe a lista pronta e a atualização roda logo depois, em segundo plano.
let refazendo = false;
function lista() {
  if (!CACHE.sig) return montar(); // primeira vez (servidor acabou de ligar)
  if (Date.now() - CACHE.at >= 60000 && !refazendo) {
    refazendo = true;
    setImmediate(() => { try { montar(); } catch (e) { console.error('[BUSCA]', e.message); } finally { refazendo = false; } });
  }
  return CACHE;
}
function montar() {
  const sig = assinatura();
  if (sig === CACHE.sig) { CACHE.at = Date.now(); return CACHE; }
  // Duas consultas simples juntadas aqui (a junção no SQL levava ~1,3 s com 100 mil ofertas e travava o servidor)
  const active = offers.activeClause();
  const brutas = db.all(
    `SELECT o.id, o.store_id, o.plataforma, o.produto, o.preco_atual, o.preco_anterior, o.desconto_pct, o.categoria,
       o.subcategoria, o.link_clicks, o.fonte, o.created_at, o.last_seen_at, o.comissao_pct, o.comissao_extra_pct, l.slug AS loja_slug
     FROM offers o LEFT JOIN lojas l ON l.id = o.loja_id WHERE ${active.sql}`, ...active.params);
  // Menor preço dos últimos 30 dias: refeito a cada 10 min (o selo não precisa ser ao segundo)
  if (Date.now() - HIST.at > 10 * 60 * 1000) {
    const m = new Map();
    for (const h of db.all(`SELECT offer_id, MIN(price) AS min30, COUNT(*) AS n FROM price_history
                            WHERE checked_at >= datetime('now', '-30 days') GROUP BY offer_id`)) m.set(h.offer_id, h);
    HIST = { at: Date.now(), m };
  }
  const hist = HIST.m;
  const seteDias = Date.now() - 7 * 86400000;
  const memo = new Map();
  const rows = brutas.map(o => {
    const h = hist.get(o.id);
    // O que depende só do nome e da data de entrada (nome normalizado, "em alta", acessório) é guardado e só
    // refeito quando o nome muda: era ~1 s de cada montagem
    let m = NOMES.get(o.id);
    if (!m || m.p !== o.produto || m.ca !== o.created_at) {
      const n = normalizar(o.produto);
      // k: chave das ordens por nome (só letras e números; nome só com símbolos ou letras decoradas vai para o fim)
      m = { p: o.produto, ca: o.created_at, n, k: n.replace(/[^a-z0-9 ]+/g, '').trim(), c: quando(o.created_at),
        alta: EM_ALTA.some(k => n.includes(k)), acess: ACESSORIO.test(n.slice(0, 40)) };
    }
    memo.set(o.id, m);
    const n = m.n, c = m.c;
    return {
      id: o.id, store_id: o.store_id, plataforma: o.plataforma, produto: o.produto, preco_atual: o.preco_atual,
      preco_anterior: o.preco_anterior, desconto_pct: o.desconto_pct, categoria: o.categoria, subcategoria: o.subcategoria,
      link_clicks: o.link_clicks || 0, fonte: o.fonte, created_at: o.created_at, last_seen_at: o.last_seen_at,
      loja_slug: o.loja_slug || null,
      menor_preco_30d: h && h.n >= 2 && c <= seteDias && o.preco_atual <= h.min30 ? 1 : 0,
      comissao_pct: o.comissao_pct ?? null, comissao_extra_pct: o.comissao_extra_pct > 0 ? o.comissao_extra_pct : 0,
      _n: n, _k: m.k, _c: c, _alta: m.alta, _acess: m.acess,
    };
  });
  NOMES = memo;
  rows.sort((a, b) => (b._c - a._c) || b.id - a.id); // mais novas primeiro (ordem base, como antes)
  for (const o of rows) o._s = atratividade(o);
  // Resumo do topo da página: total, lojas, maior desconto, última conferência e a oferta de maior desconto
  let maior = 0, ultima = '', melhor = null;
  const lojas = new Set();
  for (const o of rows) {
    lojas.add(o.store_id);
    if (o.desconto_pct > maior) maior = o.desconto_pct;
    if (o.last_seen_at > ultima) ultima = o.last_seen_at; // mesmo formato de texto: compara direto
    if (o.desconto_pct >= 30 && (!melhor || o.desconto_pct > melhor.desconto_pct)) melhor = o;
  }
  RESPOSTAS.clear();
  CACHE = { sig, at: Date.now(), lista: rows, ordenadas: {}, resumo: {
    total: rows.length, lojas: lojas.size, maior_desconto: maior,
    ultima_conferencia: ultima || null,
    destaque: melhor ? semComissao(melhor) : null,
  } };
  return CACHE;
}
const publico = o => { const { _n, _k, _c, _s, _alta, _acess, ...r } = o; return r; };
// Quem visita não vê a comissão de afiliado (só o admin e os afiliados com a ferramenta de postagem)
const semComissao = o => { const { comissao_pct, comissao_extra_pct, ...r } = publico(o); return r; };

// ── Filtros ──
function ler(q) {
  const num = v => (v === undefined || v === '' || v === null || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    loja: String(q.loja || ''), cat: String(q.cat || ''), tipo: String(q.tipo || ''), q: String(q.q || '').slice(0, 120),
    min: num(q.min), max: num(q.max), desc: Number(q.desc) || 0, extra: q.com === 'extra', ordem: String(q.ordem || 'destaques'),
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
    if (pular !== 'extra' && f.extra && !(o.comissao_extra_pct > 0)) return false;
    return true;
  };
}
function ordemSub(a, b) {
  if (a === b) return 0;
  if (a === 'Outros') return 1;
  if (b === 'Outros') return -1;
  return collator.compare(a || '', b || '');
}
const cmpTexto = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const semNome = (a, b) => (!a._k && b._k ? 1 : a._k && !b._k ? -1 : 0); // nome sem letras comuns: sempre no fim
// Posição de cada categoria em ordem alfabética do nome (calculada uma vez)
const RANK_CAT = Object.fromEntries(Object.keys(CATEGORIAS).sort((a, b) => collator.compare(CATEGORIAS[a], CATEGORIAS[b])).map((k, i) => [k, i + 1]));
const rankCat = c => RANK_CAT[c] || 0;
// Posição de cada tipo de produto ("Outros" por último), refeita quando aparece um tipo novo
let RANK_SUB = new Map();
function rankSub(s) {
  let r = RANK_SUB.get(s);
  if (r !== undefined) return r;
  const nomes = [...new Set([...RANK_SUB.keys(), ...CACHE.lista.map(o => o.subcategoria), s])].sort(ordemSub);
  RANK_SUB = new Map(nomes.map((n, i) => [n, i]));
  return RANK_SUB.get(s);
}
const ORDENS = {
  destaques: (a, b) => (b._s - a._s) || (b._c - a._c),
  recentes: (a, b) => (b._c - a._c) || b.id - a.id,
  desconto: (a, b) => b.desconto_pct - a.desconto_pct,
  'menor-preco': (a, b) => a.preco_atual - b.preco_atual,
  'maior-preco': (a, b) => b.preco_atual - a.preco_atual,
  // Nome: compara o nome já normalizado (sem acento, minúsculo); o comparador de idioma levava ~1 s com 100 mil ofertas
  nome: (a, b) => semNome(a, b) || cmpTexto(a._k, b._k) || a.id - b.id,
  'nome-desc': (a, b) => semNome(a, b) || cmpTexto(b._k, a._k) || b.id - a.id,
  comissao: (a, b) => (b.comissao_extra_pct - a.comissao_extra_pct) || ((b.comissao_pct || 0) - (a.comissao_pct || 0)) || (b._s - a._s),
  populares: (a, b) => (b.link_clicks || 0) - (a.link_clicks || 0),
  tipo: (a, b) => (rankCat(a.categoria) - rankCat(b.categoria)) || (rankSub(a.subcategoria) - rankSub(b.subcategoria)) || cmpTexto(a._k, b._k) || a.id - b.id,
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

// Lista inteira já ordenada (feita uma vez por montagem): filtrar uma lista ordenada mantém a ordem, então cada
// busca só filtra, sem ordenar 100 mil ofertas de novo.
function ordenada(nome, cmp) {
  const c = CACHE.ordenadas;
  if (!c[nome]) c[nome] = CACHE.lista.slice().sort(cmp);
  return c[nome];
}
const porComissao = (a, b) => (notaComissao(b) - notaComissao(a)) || (b._c - a._c);

// comissao: true para o admin e os afiliados (veem a comissão e podem filtrar pela comissão extra)
function buscar(query, { comissao = false } = {}) {
  const f = ler(query);
  if (!comissao) { f.extra = false; if (f.ordem === 'comissao') f.ordem = 'destaques'; }
  const { lista: todas, resumo } = lista();
  // Mesma busca de antes (ex.: a página inicial, igual para todos): devolve a resposta pronta
  const chaveResp = comissao ? null : JSON.stringify(f);
  if (chaveResp && RESPOSTAS.has(chaveResp)) return RESPOSTAS.get(chaveResp);

  let l;
  if (f.q && (f.ordem === 'recentes' || f.ordem === 'destaques')) {
    // Busca: primeiro o que mais combina com o termo; empate → a mais atrativa (ou a mais nova)
    l = todas.filter(filtro(f));
    const frase = normalizar(f.q).trim().replace(/\s+/g, ' ');
    const palavras = frase.split(' ');
    const nota = new Map(l.map(o => [o.id, relevancia(o, frase, palavras)]));
    l.sort((a, b) => nota.get(b.id) - nota.get(a.id) || ORDENS[f.ordem](a, b));
  } else if (comissao && f.ordem === 'destaques') {
    // Admin, equipe e afiliados: as de comissão extra vêm primeiro, junto das mais atrativas
    l = variar(ordenada('comissao-destaques', porComissao).filter(filtro(f)), f.por);
  } else {
    const ordem = ORDENS[f.ordem] ? f.ordem : 'destaques';
    l = ordenada(ordem, ORDENS[ordem]).filter(filtro(f));
    if (ordem === 'destaques') l = variar(l, f.por);
  }

  const paginas = Math.max(1, Math.ceil(l.length / f.por));
  const pagina = Math.min(f.pagina, paginas);
  const itens = l.slice((pagina - 1) * f.por, pagina * f.por);

  // Números dos filtros (cada um ignora o próprio filtro), numa passada só pela lista
  const lojas = {}, categorias = {}, subcategorias = {};
  let parceiros = 0, categoriasTotal = 0, comissaoExtra = 0;
  const palavras = f.q ? normalizar(f.q).split(/\s+/).filter(Boolean) : [];
  for (const o of todas) {
    // Filtros comuns a todas as contagens
    if (palavras.length && !palavras.every(w => o._n.includes(w))) continue;
    if (f.min != null && o.preco_atual < f.min) continue;
    if (f.max != null && o.preco_atual > f.max) continue;
    if (f.desc && o.desconto_pct < f.desc) continue;
    const okLoja = !f.loja || (f.loja === 'parceiros' ? Boolean(o.loja_slug) : o.store_id === f.loja);
    const okCat = !f.cat || o.categoria === f.cat;
    const okTipo = !f.tipo || o.subcategoria === f.tipo;
    const okExtra = !f.extra || o.comissao_extra_pct > 0;
    if (okCat && okTipo && okExtra) { lojas[o.store_id] = (lojas[o.store_id] || 0) + 1; if (o.loja_slug) parceiros++; }
    if (okLoja && okTipo && okExtra) { categorias[o.categoria] = (categorias[o.categoria] || 0) + 1; categoriasTotal++; }
    if (f.cat && okLoja && okCat && okExtra) subcategorias[o.subcategoria] = (subcategorias[o.subcategoria] || 0) + 1;
    if (comissao && okLoja && okCat && okTipo && o.comissao_extra_pct > 0) comissaoExtra++;
  }
  const contagens = { lojas, parceiros, categorias, categorias_total: categoriasTotal, subcategorias };
  if (comissao) contagens.comissao_extra = comissaoExtra;
  // Ordem "por tipo": quantas ofertas cada grupo tem na lista inteira
  let grupos = null;
  if (f.ordem === 'tipo') {
    grupos = {};
    for (const o of l) { const k = `${o.categoria}|${o.subcategoria}`; grupos[k] = (grupos[k] || 0) + 1; }
  }
  const resp = { total: l.length, pagina, paginas, por: f.por, itens: itens.map(comissao ? publico : semComissao), contagens, grupos, resumo };
  if (chaveResp) {
    if (RESPOSTAS.size >= 300) RESPOSTAS.delete(RESPOSTAS.keys().next().value);
    RESPOSTAS.set(chaveResp, resp);
  }
  return resp;
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
const notaComissao = o => o._s + (o.comissao_extra_pct > 0 ? 45 + 2 * Math.min(o.comissao_extra_pct, 15) : 0);
function atratividade(o) {
  let s = pontuacao(o);
  const n = o._n;
  if (o._alta ?? EM_ALTA.some(k => n.includes(k))) s += 18; // procurado/viral
  s += LOJA_CONFIANCA[o.store_id] ?? 2;                      // loja conhecida pesa de novo (confiança de quem compra)
  if (o._acess ?? ACESSORIO.test(n.slice(0, 40))) s -= 12;               // acessório no começo do nome chama menos atenção
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
  const chave = `mix|${loja}`;
  if (RESPOSTAS.has(chave)) return RESPOSTAS.get(chave); // pronto até a lista mudar
  const melhor = {};
  for (const o of lista().lista) {
    if (o.categoria === 'outros' || o.desconto_pct > 85) continue;
    if (loja && (loja === 'parceiros' ? !o.loja_slug : o.store_id !== loja)) continue;
    const sc = pontuacao(o);
    if (!melhor[o.categoria] || sc > melhor[o.categoria].sc) melhor[o.categoria] = { o, sc };
  }
  const ids = Object.values(melhor).map(b => b.o.id);
  RESPOSTAS.set(chave, ids);
  return ids;
}

// Deixa a lista pronta assim que o servidor liga
function aquecer() { setTimeout(() => { try { montar(); } catch (e) { console.error('[BUSCA]', e.message); } }, 3000); }

// Ofertas no ar (lista em memória), para outras partes do site que precisam varrer todas (ex.: a vitrine)
const ativas = () => lista().lista;

module.exports = { buscar, mix, aquecer, montar, ativas, POR_PAGINA };
