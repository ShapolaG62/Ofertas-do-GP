/* Ofertou! — comunidade na tela de ofertas: lista de perfis, busca por #nome, seguir e miniatura flutuante */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = n => Number(n || 0).toLocaleString('pt-BR');

  // Mesmas cores do perfil (para a moldura/fundo do avatar e a faixa da miniatura)
  const CORES = {
    verde: ['#0c8f4f', '#2bd37f'], azul: ['#1d5fd6', '#5b9bff'], roxo: ['#6b3fd4', '#a27bff'], laranja: ['#d9661a', '#ffa24d'],
    vermelho: ['#c62f2f', '#ff6464'], grafite: ['#3b4047', '#7d858f'], rosa: ['#cf3a85', '#ff7bbd'], dourado: ['#a77a0c', '#f2c94c'],
    ciano: ['#0b8f9c', '#41d9e6'], vinho: ['#6e1c38', '#b8456c'],
    aurora: ['#13c26b', '#4d8cff', '#9a6bff'], 'por-do-sol': ['#ff7a45', '#ff3d77', '#8f2bd1'], oceano: ['#0b4f8a', '#0e9fae', '#3fd6e3'],
    neon: ['#00e092', '#00c8f0', '#a259ff'], galaxia: ['#241a5e', '#6b3fd4', '#d63c8a'],
  };
  const tema = cor => { const c = CORES[cor] || CORES.verde; return `--pf-a:${c[0]};--pf-b:${c[c.length - 1]};--pf-grad:linear-gradient(120deg, ${c.join(', ')})`; };
  const avatar = (p, tam) => `
    <span class="pf-avatar pf-moldura-${esc(p.moldura || 'nenhuma')}" style="--tam:${tam}px;${tema(p.cor)}">
      ${p.avatar ? `<img src="${esc(p.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="pf-avatar-letra">${esc((p.nome || '?').trim()[0] || '?').toUpperCase()}</span>`}
    </span>`;

  async function api(url, opts = {}) {
    const r = await fetch(url, { cache: 'no-store', ...opts });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || `Erro ${r.status}`), { status: r.status });
    return d;
  }

  const botaoSeguir = p => (p.eu ? '<span class="comu-eu">Você</span>'
    : `<button class="comu-seguir${p.eu_sigo ? ' is-on' : ''}" type="button" data-seguir="${esc(p.slug)}">${p.eu_sigo ? 'Seguindo' : 'Seguir'}</button>`);
  const item = p => `
    <li class="comu-item">
      <a class="comu-link" href="/perfil/${esc(p.slug)}" data-mini="${esc(p.slug)}">
        ${avatar(p, 40)}
        <span class="comu-info"><b>${esc(p.nome)}</b>
          <small>${esc(p.papel_rotulo)} · Nível ${p.nivel} · 🏅 ${num(p.conquistas)}</small></span>
      </a>
      ${botaoSeguir(p)}
    </li>`;

  // ── Cartão na lateral ──────────────────────────────────────────────────────
  let buscaCardTimer;
  let grupoCard = 'consumidores'; // categoria do quadro: consumidores ou empresas
  async function carregarCard(q = '') {
    try {
      const d = await api(`/api/perfis?grupo=${grupoCard}&q=${encodeURIComponent(q)}`);
      $('#comu-card').hidden = false;
      $('#comu-abrir').hidden = false;
      $('#comu-lista-card').innerHTML = d.itens.slice(0, 6).map(item).join('')
        || `<li class="comu-vazio">${q ? 'Nenhum perfil com esse nome.' : grupoCard === 'empresas' ? 'Ainda não há empresas.' : 'Ainda não há perfis.'}</li>`;
    } catch { /* sem login: a comunidade não aparece */ }
  }
  $('#comu-busca-card').addEventListener('input', e => {
    clearTimeout(buscaCardTimer);
    buscaCardTimer = setTimeout(() => carregarCard(e.target.value), 250);
  });
  $('#comu-grupos-card').addEventListener('click', e => {
    const b = e.target.closest('[data-grupo]');
    if (!b) return;
    grupoCard = b.dataset.grupo;
    $('#comu-grupos-card').querySelectorAll('[data-grupo]').forEach(x => x.setAttribute('aria-selected', x === b));
    carregarCard($('#comu-busca-card').value);
  });
  $('#comu-ver-todos').addEventListener('click', () => abrir($('#comu-busca-card').value, grupoCard));
  $('#comu-abrir').addEventListener('click', () => abrir(''));

  // ── Gaveta com todos os perfis ─────────────────────────────────────────────
  const estado = { filtro: 'todos', q: '', pagina: 1, grupo: '' };
  async function listar(acrescentar = false) {
    const d = await api(`/api/perfis?filtro=${estado.filtro}&grupo=${estado.grupo}&q=${encodeURIComponent(estado.q)}&pagina=${estado.pagina}`).catch(() => null);
    if (!d) return;
    const html = d.itens.map(item).join('');
    $('#comu-lista').innerHTML = acrescentar ? $('#comu-lista').innerHTML + html
      : html || `<li class="comu-vazio">${{ seguindo: 'Você ainda não segue ninguém.', seguidores: 'Ninguém te segue ainda.' }[estado.filtro] || 'Nenhum perfil encontrado.'}</li>`;
    $('#comu-total').textContent = `${num(d.total)} perfil${d.total === 1 ? '' : 's'}${estado.q ? ` para "#${estado.q.replace(/^#+/, '')}"` : ''}`;
    $('#comu-mais').hidden = !d.mais;
  }
  function abrir(q = '', grupo = '') {
    estado.grupo = grupo;
    $('#comu-grupos').querySelectorAll('[data-grupo]').forEach(x => x.setAttribute('aria-selected', x.dataset.grupo === grupo));
    estado.q = String(q || '').replace(/^#+/, '');
    estado.pagina = 1;
    $('#comu-busca').value = estado.q ? `#${estado.q}` : '';
    $('#comu-dialog').showModal();
    listar();
  }
  let buscaTimer;
  $('#comu-busca').addEventListener('input', e => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(() => { estado.q = e.target.value.replace(/^#+/, ''); estado.pagina = 1; listar(); }, 250);
  });
  $('#comu-abas').addEventListener('click', e => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    estado.filtro = b.dataset.filtro; estado.pagina = 1;
    $('#comu-abas').querySelectorAll('[data-filtro]').forEach(x => x.setAttribute('aria-selected', x === b));
    listar();
  });
  $('#comu-grupos').addEventListener('click', e => {
    const b = e.target.closest('[data-grupo]');
    if (!b) return;
    estado.grupo = b.dataset.grupo; estado.pagina = 1;
    $('#comu-grupos').querySelectorAll('[data-grupo]').forEach(x => x.setAttribute('aria-selected', x === b));
    listar();
  });
  $('#comu-mais').addEventListener('click', () => { estado.pagina++; listar(true); });
  document.querySelectorAll('[data-comu-fechar]').forEach(b => b.addEventListener('click', () => $('#comu-dialog').close()));
  $('#comu-dialog').addEventListener('click', e => { if (e.target === $('#comu-dialog')) $('#comu-dialog').close(); });
  $('#comu-dialog').addEventListener('close', () => { esconderPop(); carregarCard($('#comu-busca-card').value); });

  // ── Seguir / deixar de seguir (em qualquer lista) ──────────────────────────
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-seguir]');
    if (!b) return;
    e.preventDefault();
    const ligar = !b.classList.contains('is-on');
    b.disabled = true;
    try {
      const r = await api(`/api/perfis/${encodeURIComponent(b.dataset.seguir)}/seguir`, { method: ligar ? 'POST' : 'DELETE' });
      document.querySelectorAll(`[data-seguir="${CSS.escape(b.dataset.seguir)}"]`).forEach(x => {
        x.classList.toggle('is-on', r.eu_sigo);
        x.textContent = r.eu_sigo ? 'Seguindo' : 'Seguir';
      });
      const m = miniCache.get(b.dataset.seguir);
      if (m) { m.eu_sigo = r.eu_sigo; m.seguidores = r.seguidores; }
      const seg = $('#comu-pop [data-pop-seguidores]');
      if (seg && $('#comu-pop').dataset.slug === b.dataset.seguir) seg.textContent = num(r.seguidores);
    } catch (err) { alert(err.message); } finally { b.disabled = false; }
  });

  // ── Miniatura flutuante ao passar o mouse ─────────────────────────────────
  const miniCache = new Map();
  const temHover = window.matchMedia('(hover: hover)').matches;
  let popTimer; let fecharTimer;
  const pop = $('#comu-pop');
  function esconderPop() { clearTimeout(popTimer); pop.hidden = true; pop.dataset.slug = ''; }

  function renderPop(m, ancora) {
    pop.style.cssText = tema(m.cor);
    pop.dataset.slug = m.slug;
    pop.innerHTML = `
      <div class="comu-pop-capa" style="${m.capa ? `background-image:url('${esc(m.capa)}')` : ''}"></div>
      <div class="comu-pop-corpo">
        <div class="comu-pop-topo">
          ${avatar(m, 64)}
          <div class="comu-pop-id">
            <b>${esc(m.nome)}</b>
            ${m.titulo ? `<small>${esc(m.titulo)}</small>` : ''}
            <span class="comu-pop-selos"><span class="pf-papel">${esc(m.papel_rotulo)}</span>${m.selos.map(s => `<span class="pf-selo pf-selo-${esc(s.id)}">${esc(s.nome)}</span>`).join('')}</span>
          </div>
          <div class="pf-nivel-selo is-pequeno" title="Nível"><b>${m.nivel}</b></div>
        </div>
        ${m.bio ? `<p class="comu-pop-bio">${esc(m.bio)}</p>` : ''}
        <p class="comu-pop-nums"><b data-pop-seguidores>${num(m.seguidores)}</b> seguidores · <b>${num(m.seguindo)}</b> seguindo · <b>${num(m.conquistas.length)}</b> conquistas</p>
        <div class="comu-pop-conqs">${m.conquistas.length
    ? m.conquistas.map(c => `<span class="comu-pop-conq pf-tier-${c.tier}" title="${esc(`${c.nome} — ${c.descricao}`)}">${c.icone}</span>`).join('')
    : '<small class="comu-pop-vazio">Nenhuma conquista ainda.</small>'}</div>
      </div>`;
    pop.hidden = false;
    // Posição: à direita do item (ou à esquerda se não couber), dentro da tela
    const r = ancora.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = r.right + 12;
    if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - 12);
    let top = Math.min(Math.max(8, r.top - 20), window.innerHeight - h - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, top)}px`;
  }

  if (temHover) {
    document.addEventListener('mouseover', e => {
      const a = e.target.closest('[data-mini]');
      if (!a) return;
      clearTimeout(fecharTimer); clearTimeout(popTimer);
      popTimer = setTimeout(async () => {
        const slug = a.dataset.mini;
        let m = miniCache.get(slug);
        if (!m) {
          try { m = await api(`/api/perfis/${encodeURIComponent(slug)}/mini`); miniCache.set(slug, m); } catch { return; }
        }
        if (a.matches(':hover')) renderPop(m, a);
      }, 280);
    });
    document.addEventListener('mouseout', e => {
      const a = e.target.closest('[data-mini], #comu-pop');
      if (!a) return;
      const para = e.relatedTarget;
      if (para && (para.closest('#comu-pop') || para.closest(`[data-mini="${a.dataset?.mini}"]`))) return;
      clearTimeout(popTimer);
      fecharTimer = setTimeout(() => { if (!pop.matches(':hover')) esconderPop(); }, 180);
    });
    window.addEventListener('scroll', esconderPop, { passive: true });
  }

  // ── Busca com # na barra principal ────────────────────────────────────────
  let sugTimer;
  async function sugerir(valor) {
    const q = valor.replace(/^#+/, '').trim();
    const box = $('#comu-sug');
    const d = await api(`/api/perfis?q=${encodeURIComponent(q)}`).catch(() => null);
    if (!d) { box.hidden = true; return; }
    box.innerHTML = `<p class="comu-sug-tit">Perfis${q ? ` com "#${esc(q)}"` : ''}</p>
      <ul class="comu-lista">${d.itens.slice(0, 6).map(item).join('') || '<li class="comu-vazio">Nenhum perfil encontrado.</li>'}</ul>
      ${d.total > 6 ? `<button class="link-btn comu-sug-todos" type="button">Ver todos os ${num(d.total)} perfis</button>` : ''}`;
    box.hidden = false;
    box.querySelector('.comu-sug-todos')?.addEventListener('click', () => { box.hidden = true; abrir(q); });
  }
  window.Comunidade = {
    // Chamado pela busca principal quando o texto começa com #
    buscar(valor, abrirTudo = false) {
      clearTimeout(sugTimer);
      if (abrirTudo) { $('#comu-sug').hidden = true; abrir(valor); return; }
      sugTimer = setTimeout(() => sugerir(valor), 200);
    },
    fecharSugestoes() { $('#comu-sug').hidden = true; },
  };
  document.addEventListener('click', e => { if (!e.target.closest('#comu-sug, #q')) $('#comu-sug').hidden = true; });

  carregarCard();
})();
