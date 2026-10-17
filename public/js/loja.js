/* Ofertou! — página pública de uma loja parceira: catálogo com prévia dos produtos, conversa com a loja e pedidos */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let LOJA = null;
  let OFERTAS = [];

  // Cada produto abre a prévia (fotos, preço, conversa com a loja e pedido)
  function card(o) {
    return `<button class="card card-btn" type="button" data-oferta="${o.id}">
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
    </button>`;
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
    const d = await res.json();
    const { loja, ofertas } = d;
    LOJA = { ...loja, pedidos: d.pedidos };
    OFERTAS = ofertas;
    window.OfertouLoja.visita(loja.id, 'pagina');
    document.title = `${loja.nome} — Ofertou!`;
    const site = /^https:\/\//i.test(loja.site_url || '') ? loja.site_url : '';
    const logo = /^https:\/\//i.test(loja.logo_url || '')
      ? `<img class="store-logo" src="${esc(loja.logo_url)}" alt="" referrerpolicy="no-referrer">`
      : `<div class="store-logo">${esc(loja.nome.charAt(0).toUpperCase())}</div>`;
    $('#store-hero').innerHTML = `${logo}<div>
      <h1>${esc(loja.nome)}</h1>
      ${loja.descricao ? `<p>${esc(loja.descricao)}</p>` : ''}
      <div class="store-acoes">
        <button class="btn btn-primary btn-sm" type="button" id="falar-loja">💬 Conversar com a loja</button>
        ${d.perfil_slug ? `<a class="btn btn-sm" href="/perfil/${esc(d.perfil_slug)}">Perfil da empresa</a>` : ''}
        ${site ? `<a class="btn btn-sm" href="${esc(site)}" target="_blank" rel="noopener nofollow" id="site-loja">Site oficial ↗</a>` : ''}
      </div>
      ${d.pedidos?.aceita_pedidos ? `<p class="muted store-pag">Pedidos pelo site · pagamento direto à loja: ${d.pedidos.metodos.map(m => esc(m.nome)).join(', ')}</p>` : ''}
    </div>`;
    $('#falar-loja').addEventListener('click', e => window.OfertouLoja.conversar(loja.id, null, e.currentTarget));
    $('#site-loja')?.addEventListener('click', () => window.OfertouLoja.visita(loja.id, 'site'));
    $('#results-count').textContent = `${ofertas.length} produto${ofertas.length === 1 ? '' : 's'} no catálogo`;
    $('#grid').innerHTML = ofertas.length ? ofertas.map(card).join('')
      : '<div class="empty"><img src="/images/pet-capi.png" alt="" width="120"><h3>Nenhum produto no ar</h3><p>Esta loja ainda não tem produtos publicados.</p></div>';
    // Link direto para um produto: /loja/slug?produto=123
    const pedido = Number(new URLSearchParams(location.search).get('produto'));
    const o = pedido && OFERTAS.find(x => x.id === pedido);
    if (o) window.OfertouLoja.abrir(o, LOJA);
  }

  $('#grid').addEventListener('click', e => {
    const b = e.target.closest('[data-oferta]');
    if (!b || !LOJA) return;
    const o = OFERTAS.find(x => x.id === Number(b.dataset.oferta));
    if (o) window.OfertouLoja.abrir(o, LOJA);
  });

  fetch('/api/conta/me').then(r => r.json()).then(d => {
    if (d.user) $('#account-link').textContent = 'Minha conta';
  }).catch(() => {});

  load();
})();
