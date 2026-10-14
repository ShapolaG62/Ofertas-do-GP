/* Ofertas do GP — espaços de publicidade (banners de empresas anunciantes).
   Cada lugar da página marcado com data-espaco="..." recebe a campanha no ar daquele espaço,
   ou um convite "Anuncie aqui" quando o espaço está livre. */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const okImg = src => /^(\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)|https:\/\/)/.test(src || '');
  // Espaços que mostram o convite quando estão livres (o do meio da lista some para não poluir).
  const CONVITE = { topo: true, lateral: true, paginas: true };

  const espacos = (document.currentScript?.dataset.espacos || '').split(',').filter(Boolean);
  let cache = null;
  const ready = espacos.length
    ? fetch(`/api/publicidade?espacos=${espacos.join(',')}`).then(r => r.json()).then(d => { cache = d || {}; })
      .catch(() => { cache = {}; })
    : Promise.resolve((cache = {}));

  function bannerHtml(b) {
    const img = okImg(b.imagem) ? b.imagem : '';
    if (!img) return '';
    const mobile = okImg(b.imagem_mobile) ? `<source media="(max-width: 640px)" srcset="${esc(b.imagem_mobile)}">` : '';
    return `<a class="ad-banner" href="/publicidade/${Number(b.id)}" target="_blank" rel="sponsored noopener"
        aria-label="Publicidade de ${esc(b.anunciante)}">
      <picture>${mobile}<img src="${esc(img)}" alt="${esc(b.texto_alt || b.anunciante)}" loading="lazy"></picture>
      <span class="ad-tag">Patrocinado</span></a>`;
  }

  function conviteHtml(espaco) {
    return `<a class="ad-invite" href="/anuncie?espaco=${espaco}">
      <span class="ad-invite-tag">Espaço publicitário</span>
      <strong>Sua marca aqui</strong>
      <span>Anuncie para quem está procurando desconto →</span></a>`;
  }

  function fillSlot(el) {
    const espaco = el.dataset.espaco;
    const b = cache[espaco];
    const html = b ? bannerHtml(b) : CONVITE[espaco] ? conviteHtml(espaco) : '';
    el.innerHTML = html;
    el.hidden = !html;
    el.classList.toggle('is-filled', Boolean(b));
  }

  // Preenche (ou repreenche, depois que a lista de ofertas é redesenhada) os espaços dentro de root.
  function fill(root = document) {
    const slots = root.querySelectorAll('[data-espaco]');
    if (!slots.length) return;
    if (cache) slots.forEach(fillSlot);
    else ready.then(() => slots.forEach(el => el.isConnected && fillSlot(el)));
  }

  window.GPAds = { fill };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fill());
  else fill();
})();
