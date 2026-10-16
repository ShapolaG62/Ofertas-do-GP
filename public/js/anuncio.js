/* Ofertou! — página pública de um anúncio de loja parceira */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDay = s => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR') : '');
  const slugOf = o => `${String(o.produto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}-${o.id}`;
  const okImg = src => /^(\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)|https:\/\/)/.test(src || '');

  let toastTimer;
  function toast(t) {
    const el = $('#toast');
    el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function notFound() {
    $('#ad-root').innerHTML = `<div class="empty"><img src="/images/pet-capi.png" alt="" width="120">
      <h3>Anúncio encerrado</h3><p>Este anúncio não existe ou não está mais no ar.</p>
      <a class="btn btn-primary" href="/">Ver ofertas válidas</a></div>`;
  }

  function render(a) {
    document.title = `${a.produto} — Ofertou!`;
    const imgs = (a.imagens || []).filter(okImg);
    const buy = `/oferta/${slugOf(a)}`;
    const specs = [
      ['Marca', a.marca], ['Modelo', a.modelo], ['Condição', a.condicao], ['Garantia', a.garantia],
      ['Estoque', a.estoque != null ? `${a.estoque} unidade(s)` : null], ['Código (SKU)', a.sku], ['Código de barras', a.ean],
    ].filter(([, v]) => v);
    const frete = a.frete ? `${a.frete}${a.frete_valor != null ? `: R$ ${brl(a.frete_valor)}` : ''}` : null;
    const wa = a.whatsapp ? `https://wa.me/55${a.whatsapp}?text=${encodeURIComponent(`Olá! Vi o anúncio "${a.produto}" no Ofertou! e tenho uma dúvida.`)}` : null;

    $('#ad-root').innerHTML = `
      <nav class="crumbs"><a href="/">Ofertas</a> › <a href="/loja/${esc(a.loja_slug)}">${esc(a.loja_nome)}</a></nav>
      <div class="ad-page">
        <div class="gallery">
          <div class="gallery-main">
            ${imgs[0] ? `<img id="main-img" src="${esc(imgs[0])}" alt="${esc(a.produto)}" referrerpolicy="no-referrer">` : '<img src="/images/pet-capi-head.png" alt="" style="opacity:.35">'}
            <span class="card-off">-${Math.round(a.desconto_pct)}%</span>
          </div>
          ${imgs.length > 1 ? `<div class="gallery-thumbs">${imgs.map((src, i) =>
            `<button type="button" data-img="${esc(src)}" aria-label="Foto ${i + 1}" ${i === 0 ? 'aria-current="true"' : ''}><img src="${esc(src)}" alt="" referrerpolicy="no-referrer"></button>`).join('')}</div>` : ''}
        </div>

        <div class="ad-info">
          <a class="ad-store" href="/loja/${esc(a.loja_slug)}"><span class="store-dot" style="background:var(--brand)"></span>Loja parceira · ${esc(a.loja_nome)}</a>
          <h1>${esc(a.produto)}</h1>
          ${a.condicao ? `<span class="status-pill">${esc(a.condicao)}</span>` : ''}
          <div class="ad-price">
            <div class="card-old num">De R$ ${brl(a.preco_anterior)}</div>
            <div class="ad-price-now num"><small>R$</small>${brl(a.preco_atual)} <span class="ad-off">${Math.round(a.desconto_pct)}% OFF</span></div>
            ${a.parcelamento ? `<div class="ad-line">${esc(a.parcelamento)}</div>` : ''}
          </div>
          ${a.cupom_codigo ? `<div class="coupon"><div><span class="filter-title" style="margin:0">Cupom</span>
            <strong>${esc(a.cupom_codigo)}</strong>${a.cupom_descricao ? `<span>${esc(a.cupom_descricao)}</span>` : ''}</div>
            <button class="btn btn-sm" type="button" id="copy-coupon">Copiar</button></div>` : ''}
          <ul class="ad-facts">
            ${frete ? `<li><b>Entrega:</b> ${esc(frete)}${a.prazo_entrega ? ` — ${esc(a.prazo_entrega)}` : ''}</li>` : ''}
            ${a.garantia ? `<li><b>Garantia:</b> ${esc(a.garantia)}</li>` : ''}
            <li><b>Oferta válida até:</b> ${fmtDay(a.expires_at)}</li>
          </ul>
          <div class="ad-cta">
            <a class="btn btn-primary btn-block" href="${buy}" target="_blank" rel="noopener sponsored">Comprar na loja</a>
            ${wa ? `<a class="btn btn-block btn-wa" href="${esc(wa)}" target="_blank" rel="noopener">Tirar dúvida no WhatsApp</a>` : ''}
          </div>
          <p class="partner-note">Anúncio publicado pela própria loja. Confira preço, frete e condições finais no site da loja antes de comprar.</p>
        </div>
      </div>

      <section class="panel-card ad-desc">
        <h2>Descrição</h2>
        <div class="ad-desc-text">${esc(a.descricao || '').replace(/\n/g, '<br>')}</div>
        ${specs.length ? `<h2 style="margin-top:24px">Ficha técnica</h2>
          <dl class="spec-list">${specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      </section>`;

    $('#ad-root').addEventListener('click', e => {
      const t = e.target.closest('[data-img]');
      if (t) {
        $('#main-img').src = t.dataset.img;
        document.querySelectorAll('[data-img]').forEach(b => b.removeAttribute('aria-current'));
        t.setAttribute('aria-current', 'true');
      }
      if (e.target.closest('#copy-coupon')) {
        navigator.clipboard.writeText(a.cupom_codigo).then(() => toast('Cupom copiado!'));
      }
    });
  }

  const id = Number(location.pathname.split('/').filter(Boolean)[1]);
  fetch(`/api/anuncios/${id}`).then(r => (r.ok ? r.json() : null)).then(a => (a ? render(a) : notFound())).catch(notFound);
  fetch('/api/conta/me').then(r => r.json()).then(d => { if (d.user) $('#account-link').textContent = 'Minha conta'; }).catch(() => {});
})();
