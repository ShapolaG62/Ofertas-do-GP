/* Ofertas do GP — site público */
(() => {
  'use strict';

  const STORES = [
    { id: 'mercadolivre', name: 'Mercado Livre', color: '#ffe600' },
    { id: 'amazon', name: 'Amazon', color: '#ff9900' },
    { id: 'shopee', name: 'Shopee', color: '#ee4d2d' },
    { id: 'magalu', name: 'Magalu', color: '#0086ff' },
    { id: 'shein', name: 'Shein', color: '#222222' },
    { id: 'aliexpress', name: 'AliExpress', color: '#e62e04' },
    { id: 'temu', name: 'Temu', color: '#fb7701' },
  ];
  const STORE_BY_ID = Object.fromEntries(STORES.map(s => [s.id, s]));

  const CATEGORIES = {
    celulares: 'Celulares e tablets', informatica: 'Informática', games: 'Games', audio_tv: 'Áudio e TV',
    cozinha: 'Cozinha', eletrodomesticos: 'Eletrodomésticos', casa: 'Casa', moda: 'Moda e calçados',
    beleza: 'Beleza', saude: 'Saúde e suplementos', ferramentas: 'Ferramentas', limpeza: 'Limpeza',
    alimentos: 'Alimentos e bebidas', pets: 'Pets', automotivo: 'Automotivo', brinquedos: 'Brinquedos', outros: 'Outros',
  };
  const DISCOUNTS = [10, 20, 30, 50];
  const PRICE_PRESETS = [[0, 100], [100, 500], [500, 2000], [2000, null]];
  const PER_PAGE = 24;

  const $ = s => document.querySelector(s);
  const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const brl = v => fmt.format(Number(v) || 0);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
  const parseDate = s => (s ? new Date(String(s).replace(' ', 'T') + 'Z') : null);

  function timeAgo(s) {
    const d = parseDate(s);
    if (!d || isNaN(d)) return '';
    const min = Math.max(0, Math.round((Date.now() - d) / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const days = Math.round(h / 24);
    return `há ${days} dia${days > 1 ? 's' : ''}`;
  }

  const slug = o => `${String(o.produto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}-${o.id}`;

  // ── Estado (espelhado na URL para links compartilháveis) ─────────────────
  const state = { loja: '', cat: '', tipo: '', q: '', min: null, max: null, desc: 0, ordem: 'recentes', pagina: 1 };
  let ALL = [];
  let isAdmin = false;
  const selected = new Set();

  function readUrl() {
    const p = new URLSearchParams(location.search);
    state.loja = p.get('loja') || '';
    state.cat = p.get('cat') || '';
    state.tipo = p.get('tipo') || '';
    state.q = p.get('q') || '';
    state.min = p.has('min') ? Number(p.get('min')) : null;
    state.max = p.has('max') ? Number(p.get('max')) : null;
    state.desc = Number(p.get('desc')) || 0;
    state.ordem = p.get('ordem') || 'recentes';
    state.pagina = Math.max(1, Number(p.get('pagina')) || 1);
  }

  function writeUrl() {
    const p = new URLSearchParams();
    for (const k of ['loja', 'cat', 'tipo', 'q']) if (state[k]) p.set(k, state[k]);
    if (state.min != null) p.set('min', state.min);
    if (state.max != null) p.set('max', state.max);
    if (state.desc) p.set('desc', state.desc);
    if (state.ordem !== 'recentes') p.set('ordem', state.ordem);
    if (state.pagina > 1) p.set('pagina', state.pagina);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  function setFilter(changes, { keepPage = false } = {}) {
    Object.assign(state, changes);
    if ('cat' in changes && !('tipo' in changes)) state.tipo = '';
    if (!keepPage) state.pagina = 1;
    writeUrl();
    render();
  }

  // ── Filtragem e ordenação ────────────────────────────────────────────────
  const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function matches(o, skip = '') {
    if (skip !== 'loja' && state.loja) {
      if (state.loja === 'parceiros' ? !o.loja_slug : o.store_id !== state.loja) return false;
    }
    if (skip !== 'cat' && state.cat && o.categoria !== state.cat) return false;
    if (skip !== 'tipo' && state.tipo && o.subcategoria !== state.tipo) return false;
    if (state.q) {
      const words = normalize(state.q).split(/\s+/).filter(Boolean);
      const title = normalize(o.produto);
      if (!words.every(w => title.includes(w))) return false;
    }
    if (state.min != null && o.preco_atual < state.min) return false;
    if (state.max != null && o.preco_atual > state.max) return false;
    if (state.desc && o.desconto_pct < state.desc) return false;
    return true;
  }

  const SORTS = {
    recentes: (a, b) => (parseDate(b.created_at) - parseDate(a.created_at)) || b.id - a.id,
    desconto: (a, b) => b.desconto_pct - a.desconto_pct,
    'menor-preco': (a, b) => a.preco_atual - b.preco_atual,
    'maior-preco': (a, b) => b.preco_atual - a.preco_atual,
    nome: (a, b) => collator.compare(a.produto, b.produto),
    'nome-desc': (a, b) => collator.compare(b.produto, a.produto),
    populares: (a, b) => (b.link_clicks || 0) - (a.link_clicks || 0),
    tipo: (a, b) => collator.compare(CATEGORIES[a.categoria] || '', CATEGORIES[b.categoria] || '')
      || subOrder(a.subcategoria, b.subcategoria) || collator.compare(a.produto, b.produto),
  };
  function subOrder(a, b) {
    if (a === b) return 0;
    if (a === 'Outros') return 1;
    if (b === 'Outros') return -1;
    return collator.compare(a || '', b || '');
  }

  const filtered = () => ALL.filter(o => matches(o)).sort(SORTS[state.ordem] || SORTS.recentes);
  const countBy = (list, key) => list.reduce((acc, o) => ((acc[o[key]] = (acc[o[key]] || 0) + 1), acc), {});

  // ── Renderização ─────────────────────────────────────────────────────────
  function storeLabel(id, name, lojaSlug) {
    if (lojaSlug) return `<span class="store-dot" style="background:var(--brand)"></span>Loja parceira · ${esc(name)}`;
    const s = STORE_BY_ID[id];
    return `<span class="store-dot" style="background:${s ? s.color : '#999'}"></span>${esc(s ? s.name : name)}`;
  }

  let STORES_EXTRA = '';
  function renderStoreTabs() {
    const counts = countBy(ALL.filter(o => matches(o, 'loja')), 'store_id');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const tabs = [`<button class="store-tab" type="button" data-loja="" aria-pressed="${!state.loja}">Todas as lojas <span class="count">${total}</span></button>`];
    const partners = ALL.filter(o => o.loja_slug && matches(o, 'loja')).length;
    if (partners || state.loja === 'parceiros') {
      STORES_EXTRA = `<button class="store-tab" type="button" data-loja="parceiros" aria-pressed="${state.loja === 'parceiros'}">
        <span class="store-dot" style="background:var(--brand)"></span>Lojas parceiras <span class="count">${partners}</span></button>`;
    } else STORES_EXTRA = '';
    for (const s of STORES) {
      const n = counts[s.id] || 0;
      tabs.push(`<button class="store-tab" type="button" data-loja="${s.id}" aria-pressed="${state.loja === s.id}" ${n || state.loja === s.id ? '' : 'disabled'}>
        <span class="store-dot" style="background:${s.color}"></span>${esc(s.name)} <span class="count">${n}</span></button>`);
    }
    $('#store-tabs').innerHTML = tabs.join('') + STORES_EXTRA;
  }

  function filtersHtml() {
    const base = ALL.filter(o => matches(o, 'cat'));
    const cats = countBy(base, 'categoria');
    const catItems = Object.keys(CATEGORIES).filter(c => cats[c] || state.cat === c)
      .sort((a, b) => (cats[b] || 0) - (cats[a] || 0))
      .map(c => `<li><button class="filter-option" type="button" data-cat="${c}" aria-pressed="${state.cat === c}">
          <span>${esc(CATEGORIES[c])}</span><span class="count">${cats[c] || 0}</span></button></li>`).join('');

    let subGroup = '';
    if (state.cat) {
      const subs = countBy(ALL.filter(o => matches(o, 'tipo')), 'subcategoria');
      const names = Object.keys(subs).sort(subOrder);
      if (names.length > 1 || state.tipo) {
        subGroup = `<div class="filter-group"><h3 class="filter-title">Tipo de produto</h3><ul class="filter-list">
          <li><button class="filter-option" type="button" data-tipo="" aria-pressed="${!state.tipo}"><span>Todos</span></button></li>
          ${names.map(n => `<li><button class="filter-option" type="button" data-tipo="${esc(n)}" aria-pressed="${state.tipo === n}">
            <span>${esc(n)}</span><span class="count">${subs[n]}</span></button></li>`).join('')}</ul></div>`;
      }
    }

    const presets = PRICE_PRESETS.map(([a, b]) => {
      const label = b == null ? `Acima de R$ ${a}` : a === 0 ? `Até R$ ${b}` : `R$ ${a} a ${b}`;
      const on = state.min === (a || null) && state.max === b;
      return `<button class="chip" type="button" data-min="${a}" data-max="${b ?? ''}" aria-pressed="${on}">${label}</button>`;
    }).join('');

    const discounts = DISCOUNTS.map(d => `<li><button class="filter-option" type="button" data-desc="${d}" aria-pressed="${state.desc === d}">
      <span>${d}% ou mais</span></button></li>`).join('');

    return `
      <div class="filter-group"><h3 class="filter-title">Categorias</h3><ul class="filter-list">
        <li><button class="filter-option" type="button" data-cat="" aria-pressed="${!state.cat}"><span>Todas</span><span class="count">${base.length}</span></button></li>
        ${catItems}</ul></div>
      ${subGroup}
      <div class="filter-group"><h3 class="filter-title">Preço (R$)</h3>
        <form class="price-inputs" data-price-form>
          <label class="sr-only">Mínimo</label><input type="number" inputmode="numeric" min="0" placeholder="Mín." name="min" value="${state.min ?? ''}">
          <span>–</span>
          <label class="sr-only">Máximo</label><input type="number" inputmode="numeric" min="0" placeholder="Máx." name="max" value="${state.max ?? ''}">
          <button class="sr-only" type="submit">Aplicar</button>
        </form>
        <div class="price-presets">${presets}</div></div>
      <div class="filter-group"><h3 class="filter-title">Desconto</h3><ul class="filter-list">
        <li><button class="filter-option" type="button" data-desc="0" aria-pressed="${!state.desc}"><span>Qualquer desconto</span></button></li>
        ${discounts}</ul></div>`;
  }

  function renderFilters() {
    const html = filtersHtml();
    $('#filters').innerHTML = html;
    if ($('#filters-dialog').open) $('#filters-mobile').innerHTML = html;
  }

  function renderSubChips() {
    const box = $('#sub-chips');
    if (!state.cat) { box.hidden = true; return; }
    const subs = countBy(ALL.filter(o => matches(o, 'tipo')), 'subcategoria');
    const names = Object.keys(subs).sort(subOrder);
    if (names.length < 2 && !state.tipo) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = [`<button class="chip" type="button" data-tipo="" aria-pressed="${!state.tipo}">Todos</button>`,
      ...names.map(n => `<button class="chip" type="button" data-tipo="${esc(n)}" aria-pressed="${state.tipo === n}">${esc(n)} <span class="count">${subs[n]}</span></button>`)].join('');
  }

  function renderActiveFilters() {
    const items = [];
    if (state.q) items.push(['q', `Busca: “${state.q}”`]);
    if (state.min != null || state.max != null) {
      items.push(['preco', state.max == null ? `Acima de R$ ${state.min}` : `R$ ${state.min ?? 0} a ${state.max}`]);
    }
    if (state.desc) items.push(['desc', `${state.desc}% ou mais`]);
    const any = items.length || state.loja || state.cat;
    $('#active-filters').innerHTML = items.map(([k, label]) =>
      `<button class="chip" type="button" data-remove="${k}">${esc(label)}<svg><use href="#i-x"/></svg></button>`).join('')
      + (any ? '<button class="link-btn" type="button" data-clear>Limpar filtros</button>' : '');
  }

  function cardHtml(o) {
    const isSel = selected.has(o.id);
    return `<a class="card${isSel ? ' is-selected' : ''}" href="/oferta/${slug(o)}" target="_blank" rel="noopener sponsored" data-id="${o.id}">
      <div class="card-media">
        <img src="/api/img/${o.id}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/images/pet-capi-head.png';this.style.opacity='.35'">
        <span class="card-off">-${Math.round(o.desconto_pct)}%</span>
        <button class="card-select admin-only" type="button" data-select="${o.id}" aria-label="Selecionar oferta"><svg><use href="#i-check"/></svg></button>
      </div>
      <div class="card-body">
        <div class="card-store">${storeLabel(o.store_id, o.plataforma, o.loja_slug)}</div>
        <h3 class="card-title" title="${esc(o.produto)}">${esc(o.produto)}</h3>
        ${Number(o.menor_preco_30d) === 1 ? '<span class="badge-low">Menor preço em 30 dias</span>' : ''}
        <div class="card-prices">
          <div class="card-old num">R$ ${brl(o.preco_anterior)}</div>
          <div class="card-price num"><small>R$</small>${brl(o.preco_atual)}</div>
        </div>
        <div class="card-foot"><span>${o.loja_slug ? 'Publicado pela loja' : o.fonte === 'manual' ? 'Oferta selecionada' : `Conferido ${timeAgo(o.last_seen_at)}`}</span></div>
      </div>
    </a>`;
  }

  function emptyHtml() {
    const hasFilters = state.q || state.loja || state.cat || state.min != null || state.max != null || state.desc;
    return `<div class="empty"><img src="/images/pet-capi.png" alt="" width="120">
      <h3>${ALL.length ? 'Nenhuma oferta com esses filtros' : 'Ainda não há ofertas no ar'}</h3>
      <p>${ALL.length ? 'Tente outra busca ou remova alguns filtros.' : 'O minerador está procurando descontos reais nas lojas. Volte em alguns minutos.'}</p>
      ${hasFilters ? '<button class="btn" type="button" data-clear>Limpar filtros</button>' : ''}</div>`;
  }

  function renderGrid() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    state.pagina = Math.min(state.pagina, pages);
    const pageItems = list.slice((state.pagina - 1) * PER_PAGE, state.pagina * PER_PAGE);

    const title = state.tipo || (state.cat ? CATEGORIES[state.cat] : state.loja === 'parceiros' ? 'Lojas parceiras' : state.loja ? STORE_BY_ID[state.loja]?.name : 'Todas as ofertas');
    $('#results-title').textContent = state.q ? `Resultados para “${state.q}”` : title;
    $('#results-count').textContent = `${list.length.toLocaleString('pt-BR')} oferta${list.length === 1 ? '' : 's'}`;

    if (!pageItems.length) {
      $('#grid').innerHTML = emptyHtml();
    } else if (state.ordem === 'tipo') {
      // Agrupa pelo tipo de produto, com título de seção
      const html = [];
      let lastKey = null;
      const groupCount = countBy(list.map(o => ({ k: `${o.categoria}|${o.subcategoria}` })), 'k');
      for (const o of pageItems) {
        const key = `${o.categoria}|${o.subcategoria}`;
        if (key !== lastKey) {
          const label = state.cat ? o.subcategoria : `${CATEGORIES[o.categoria] || 'Outros'} · ${o.subcategoria}`;
          html.push(`<div class="group-title">${esc(label)} <span>${groupCount[key]} oferta${groupCount[key] === 1 ? '' : 's'}</span></div>`);
          lastKey = key;
        }
        html.push(cardHtml(o));
      }
      $('#grid').innerHTML = html.join('');
    } else {
      $('#grid').innerHTML = pageItems.map(cardHtml).join('');
    }
    renderPagination(pages);
  }

  function renderPagination(pages) {
    const cur = state.pagina;
    if (pages <= 1) { $('#pagination').innerHTML = ''; return; }
    const nums = new Set([1, pages, cur - 1, cur, cur + 1].filter(n => n >= 1 && n <= pages));
    const sorted = [...nums].sort((a, b) => a - b);
    const parts = [`<button class="page-btn" type="button" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>`];
    sorted.forEach((n, i) => {
      if (i && n - sorted[i - 1] > 1) parts.push('<span class="page-gap">…</span>');
      parts.push(`<button class="page-btn" type="button" data-page="${n}" ${n === cur ? 'aria-current="page"' : ''}>${n}</button>`);
    });
    parts.push(`<button class="page-btn" type="button" data-page="${cur + 1}" ${cur === pages ? 'disabled' : ''} aria-label="Próxima página">›</button>`);
    $('#pagination').innerHTML = parts.join('');
  }

  function renderHero() {
    const stores = new Set(ALL.map(o => o.store_id)).size;
    const maxDisc = ALL.reduce((m, o) => Math.max(m, o.desconto_pct || 0), 0);
    const last = ALL.reduce((m, o) => (parseDate(o.last_seen_at) > m ? parseDate(o.last_seen_at) : m), new Date(0));
    $('#updated-at').textContent = ALL.length ? `Preços conferidos ${timeAgo(last.toISOString().replace('T', ' ').slice(0, 19))}` : 'Buscando ofertas nas lojas';
    $('#hero-stats').innerHTML = `
      <div class="hero-stat"><strong class="num">${ALL.length.toLocaleString('pt-BR')}</strong><span>ofertas no ar</span></div>
      <div class="hero-stat"><strong class="num">${stores}</strong><span>${stores === 1 ? 'loja' : 'lojas'} com ofertas</span></div>
      <div class="hero-stat"><strong class="num">${maxDisc ? `${Math.round(maxDisc)}%` : '—'}</strong><span>maior desconto</span></div>`;

    const best = ALL.filter(o => o.desconto_pct >= 30).sort((a, b) => b.desconto_pct - a.desconto_pct)[0];
    const el = $('#featured');
    if (!best) { el.hidden = true; return; }
    el.href = `/oferta/${slug(best)}`;
    el.innerHTML = `<img src="/api/img/${best.id}" alt="">
      <div class="featured-body">
        <div class="featured-label">Maior desconto agora · -${Math.round(best.desconto_pct)}%</div>
        <div class="featured-title">${esc(best.produto)}</div>
        <div class="featured-price num">de <s>R$ ${brl(best.preco_anterior)}</s> por <b>R$ ${brl(best.preco_atual)}</b> · ${esc(STORE_BY_ID[best.store_id]?.name || best.plataforma)}</div>
      </div><svg width="20" height="20"><use href="#i-arrow"/></svg>`;
    el.hidden = false;
  }

  function render() {
    $('#q').value = state.q;
    $('#sort').value = state.ordem;
    renderStoreTabs();
    renderFilters();
    renderSubChips();
    renderActiveFilters();
    renderGrid();
    updateSelection();
  }

  // ── Eventos ──────────────────────────────────────────────────────────────
  function handleFilterClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.loja !== undefined) return setFilter({ loja: t.dataset.loja });
    if (t.dataset.cat !== undefined) return setFilter({ cat: t.dataset.cat });
    if (t.dataset.tipo !== undefined) return setFilter({ tipo: t.dataset.tipo });
    if (t.dataset.desc !== undefined) return setFilter({ desc: Number(t.dataset.desc) });
    if (t.dataset.min !== undefined) {
      const min = Number(t.dataset.min) || null, max = t.dataset.max ? Number(t.dataset.max) : null;
      const on = state.min === min && state.max === max;
      return setFilter(on ? { min: null, max: null } : { min, max });
    }
    if (t.dataset.remove) {
      const k = t.dataset.remove;
      return setFilter(k === 'preco' ? { min: null, max: null } : { [k]: k === 'desc' ? 0 : '' });
    }
    if (t.dataset.clear !== undefined) {
      return setFilter({ loja: '', cat: '', tipo: '', q: '', min: null, max: null, desc: 0 });
    }
  }

  function handlePriceSubmit(e) {
    const form = e.target.closest('[data-price-form]');
    if (!form) return;
    e.preventDefault();
    const val = n => (form[n].value === '' ? null : Math.max(0, Number(form[n].value)));
    setFilter({ min: val('min'), max: val('max') });
  }

  for (const sel of ['#store-tabs', '#filters', '#filters-mobile', '#sub-chips', '#active-filters', '#grid']) {
    $(sel).addEventListener('click', handleFilterClick);
  }
  for (const sel of ['#filters', '#filters-mobile']) {
    $(sel).addEventListener('submit', handlePriceSubmit);
    $(sel).addEventListener('change', e => { if (e.target.closest('[data-price-form]')) handlePriceSubmit(e); });
  }

  $('#pagination').addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if (!b || b.disabled) return;
    setFilter({ pagina: Number(b.dataset.page) }, { keepPage: true });
    $('#ofertas').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#sort').addEventListener('change', e => setFilter({ ordem: e.target.value }));

  let searchTimer;
  $('#q').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setFilter({ q: e.target.value.trim() }), 200);
  });
  $('#search-form').addEventListener('submit', e => {
    e.preventDefault();
    setFilter({ q: $('#q').value.trim() });
    $('#ofertas').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Gaveta de filtros (celular)
  $('#open-filters').addEventListener('click', () => {
    $('#filters-mobile').innerHTML = filtersHtml();
    $('#filters-dialog').showModal();
  });
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  });

  // ── Ferramentas do administrador ─────────────────────────────────────────
  function updateSelection() {
    $('#sel-count').textContent = `${selected.size} selecionada${selected.size === 1 ? '' : 's'}`;
  }

  $('#grid').addEventListener('click', e => {
    const b = e.target.closest('[data-select]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const id = Number(b.dataset.select);
    selected.has(id) ? selected.delete(id) : selected.add(id);
    b.closest('.card').classList.toggle('is-selected', selected.has(id));
    updateSelection();
  });

  $('#sel-page').addEventListener('click', () => {
    filtered().slice((state.pagina - 1) * PER_PAGE, state.pagina * PER_PAGE).forEach(o => selected.add(o.id));
    renderGrid(); updateSelection();
  });
  $('#sel-clear').addEventListener('click', () => { selected.clear(); renderGrid(); updateSelection(); });
  $('#sel-mix').addEventListener('click', () => {
    selected.clear();
    const byCat = {};
    for (const o of filtered()) (byCat[o.categoria] ||= []).push(o);
    for (const list of Object.values(byCat)) {
      const top = list.sort((a, b) => b.desconto_pct - a.desconto_pct).slice(0, 5);
      selected.add(top[Math.floor(Math.random() * top.length)].id);
    }
    renderGrid(); updateSelection();
    toast(`${selected.size} ofertas selecionadas (uma por categoria).`);
  });

  function postText(o) {
    const store = STORE_BY_ID[o.store_id]?.name || o.plataforma;
    const seen = parseDate(o.last_seen_at);
    const lines = [
      `*${o.produto}*`,
      '',
      `De ~R$ ${brl(o.preco_anterior)}~`,
      `*Por R$ ${brl(o.preco_atual)}* (${Math.round(o.desconto_pct)}% off)`,
      `Loja: ${store}`,
      '',
      `${o.affiliate_url || `${location.origin}/oferta/${slug(o)}`}`,
    ];
    if (seen && !isNaN(seen)) {
      lines.push('', `_Preço conferido em ${seen.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Pode mudar a qualquer momento._`);
    }
    return lines.join('\n');
  }

  $('#open-posts').addEventListener('click', () => {
    const list = ALL.filter(o => selected.has(o.id));
    if (!list.length) return toast('Selecione pelo menos uma oferta.');
    $('#posts-title').textContent = `Postagens prontas (${list.length})`;
    $('#posts-body').innerHTML = list.map(o => {
      const text = postText(o);
      return `<article class="post-item">
        <header><img src="/api/img/${o.id}" alt=""><strong>${esc(o.produto)}</strong></header>
        <pre>${esc(text)}</pre>
        <div class="post-actions">
          <button class="btn btn-sm" type="button" data-copy="${o.id}">Copiar texto</button>
          <a class="btn btn-sm" href="/api/img/${o.id}" download="oferta-${o.id}.jpg">Baixar imagem</a>
          <a class="btn btn-sm" href="https://api.whatsapp.com/send?text=${encodeURIComponent(text)}" target="_blank" rel="noopener"><svg><use href="#i-wa"/></svg>WhatsApp</a>
          <a class="btn btn-sm" href="https://t.me/share/url?url=${encodeURIComponent(o.affiliate_url || '')}&text=${encodeURIComponent(text)}" target="_blank" rel="noopener"><svg><use href="#i-tg"/></svg>Telegram</a>
        </div></article>`;
    }).join('');
    $('#posts-dialog').showModal();
  });
  $('#posts-body').addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const o = ALL.find(x => x.id === Number(b.dataset.copy));
    navigator.clipboard.writeText(postText(o)).then(() => toast('Texto copiado.'));
  });
  $('#copy-all').addEventListener('click', () => {
    const text = ALL.filter(o => selected.has(o.id)).map(postText).join('\n\n———\n\n');
    navigator.clipboard.writeText(text).then(() => toast('Todas as postagens foram copiadas.'));
  });

  $('#mine-term').addEventListener('click', async () => {
    const q = $('#q').value.trim();
    if (!q) return toast('Digite um termo na busca primeiro.');
    toast(`Minerando “${q}” nas lojas… pode levar até 1 minuto.`);
    try {
      const res = await fetch('/api/admin/mine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
      }).then(r => r.json());
      if (res.error) return toast(res.error);
      const saved = (res.results || []).reduce((a, r) => a + (r.saved || 0), 0);
      toast(saved ? `${saved} ofertas reais encontradas.` : 'Nenhuma oferta nova com desconto real.');
      loadOffers();
    } catch { toast('Erro de conexão com o minerador.'); }
  });

  // ── Utilidades ───────────────────────────────────────────────────────────
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  function applySettings(s) {
    const https = u => (/^https:\/\//i.test(u || '') ? u : '');
    const wa = https(s.whatsapp_link);
    const tgRaw = (s.telegram_link || '').trim();
    const tg = tgRaw ? https(tgRaw.startsWith('http') ? tgRaw : `https://t.me/${tgRaw.replace('@', '')}`) : '';
    const ig = (s.instagram_user || '').replace(/^@/, '').replace(/[^\w.]/g, '');
    if (wa) {
      $('#wa-header').href = wa; $('#wa-header').hidden = false;
      $('#wa-community').href = wa; $('#community').hidden = false;
    }
    const links = [];
    if (wa) links.push(`<a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>`);
    if (tg) links.push(`<a href="${esc(tg)}" target="_blank" rel="noopener">Telegram</a>`);
    if (ig) links.push(`<a href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener">Instagram</a>`);
    $('#footer-links').innerHTML = links.join('');

    if (/^ca-pub-\d{10,20}$/.test(s.adsense_client || '')) {
      const sc = document.createElement('script');
      sc.async = true; sc.crossOrigin = 'anonymous';
      sc.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${s.adsense_client}`;
      document.head.appendChild(sc);
    }
    if (/^G-[A-Z0-9]{4,20}$/.test(s.ga_id || '')) {
      const sc = document.createElement('script');
      sc.async = true; sc.src = `https://www.googletagmanager.com/gtag/js?id=${s.ga_id}`;
      document.head.appendChild(sc);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date()); window.gtag('config', s.ga_id);
    }
  }

  async function loadOffers() {
    try {
      ALL = await fetch('/api/offers?limit=5000').then(r => r.json());
    } catch {
      ALL = [];
    }
    renderHero();
    render();
  }

  // ── Início ───────────────────────────────────────────────────────────────
  $('#year').textContent = new Date().getFullYear();
  readUrl();
  if (new URLSearchParams(location.search).has('expirada')) {
    $('#expired-notice').hidden = false;
    history.replaceState(null, '', location.pathname);
  }
  $('#grid').innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join('');

  fetch('/api/settings/public').then(r => r.json()).then(applySettings).catch(() => {});
  fetch('/api/conta/me').then(r => r.json()).then(d => {
    if (d.user) $('#account-link').textContent = 'Minha conta';
  }).catch(() => {});
  fetch('/api/admin/session').then(r => r.json()).then(s => {
    isAdmin = Boolean(s.loggedIn);
    document.body.classList.toggle('is-admin', isAdmin);
  }).catch(() => {});

  loadOffers();
  setInterval(loadOffers, 5 * 60 * 1000);
})();
