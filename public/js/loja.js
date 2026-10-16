/* Ofertou! — página pública de uma loja parceira */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const slugOf = o => `${String(o.produto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}-${o.id}`;

  function card(o) {
    const link = o.fonte === 'empresa' ? `href="/anuncio/${o.id}"` : `href="/oferta/${slugOf(o)}" target="_blank" rel="noopener"`;
    return `<a class="card" ${link}>
      <div class="card-media">
        <img src="/api/img/${o.id}" alt="" loading="lazy" onerror="this.onerror=null;this.src='/images/pet-capi-head.png';this.style.opacity='.35'">
        <span class="card-off">-${Math.round(o.desconto_pct)}%</span>
      </div>
      <div class="card-body">
        <h3 class="card-title" title="${esc(o.produto)}">${esc(o.produto)}</h3>
        <div class="card-prices">
          <div class="card-old num">R$ ${brl(o.preco_anterior)}</div>
          <div class="card-price num"><small>R$</small>${brl(o.preco_atual)}</div>
        </div>
      </div>
    </a>`;
  }

  async function load() {
    const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
    const res = await fetch(`/api/lojas/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      $('#store-hero').innerHTML = '<div><h1>Loja não encontrada</h1><p>Esta loja não existe ou não está disponível no momento.</p></div>';
      document.querySelector('.partner-note').hidden = true;
      document.querySelector('.results-head').hidden = true;
      return;
    }
    const { loja, ofertas } = await res.json();
    document.title = `${loja.nome} — Ofertou!`;
    const site = /^https:\/\//i.test(loja.site_url || '') ? loja.site_url : '';
    const logo = /^https:\/\//i.test(loja.logo_url || '')
      ? `<img class="store-logo" src="${esc(loja.logo_url)}" alt="" referrerpolicy="no-referrer">`
      : `<div class="store-logo">${esc(loja.nome.charAt(0).toUpperCase())}</div>`;
    $('#store-hero').innerHTML = `${logo}<div>
      <h1>${esc(loja.nome)}</h1>
      ${loja.descricao ? `<p>${esc(loja.descricao)}</p>` : ''}
      ${site ? `<p style="margin-top:6px"><a class="link-btn" href="${esc(site)}" target="_blank" rel="noopener nofollow">Visitar site da loja</a></p>` : ''}
    </div>`;
    $('#results-count').textContent = `${ofertas.length} oferta${ofertas.length === 1 ? '' : 's'} no ar`;
    $('#grid').innerHTML = ofertas.length ? ofertas.map(card).join('')
      : '<div class="empty"><img src="/images/pet-capi.png" alt="" width="120"><h3>Nenhuma oferta no ar</h3><p>Esta loja ainda não tem produtos com desconto publicados.</p></div>';
  }

  fetch('/api/conta/me').then(r => r.json()).then(d => {
    if (d.user) $('#account-link').textContent = 'Minha conta';
  }).catch(() => {});

  load();
})();
