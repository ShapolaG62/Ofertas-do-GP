/* Ofertas do GP — espaços de publicidade (banners de empresas anunciantes).
   Cada lugar da página marcado com data-espaco="..." recebe a campanha no ar daquele espaço,
   ou o cartão "Anuncie sua marca aqui" quando o espaço está livre. */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const okImg = src => /^(\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)|https:\/\/)/.test(src || '');

  const espacos = (document.currentScript?.dataset.espacos || '').split(',').filter(Boolean);
  let cache = null;
  const ready = espacos.length
    ? fetch(`/api/publicidade?espacos=${espacos.join(',')}`).then(r => r.json()).then(d => { cache = d || {}; })
      .catch(() => { cache = {}; })
    : Promise.resolve((cache = {}));

  const okVideo = src => /^\/uploads\/[a-f0-9]{32}\.(mp4|webm)$/.test(src || '');
  const celular = () => window.matchMedia('(max-width: 640px)').matches;
  // Vídeo só toca quando faz sentido: quem pediu menos movimento ou economia de dados vê a imagem de capa.
  const semVideo = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData === true;

  function bannerHtml(b) {
    const img = okImg(b.imagem) ? b.imagem : '';
    if (!img) return '';
    const alt = esc(b.texto_alt || b.anunciante);
    const capa = celular() && okImg(b.imagem_mobile) ? b.imagem_mobile : img;
    const video = celular() && okVideo(b.video_mobile) ? b.video_mobile : okVideo(b.video) ? b.video : '';
    const mobile = okImg(b.imagem_mobile) ? `<source media="(max-width: 640px)" srcset="${esc(b.imagem_mobile)}">` : '';
    const midia = video && !semVideo()
      ? `<video src="${esc(video)}" poster="${esc(capa)}" autoplay muted loop playsinline preload="metadata"
          disablepictureinpicture aria-label="${alt}"></video>`
      : `<picture>${mobile}<img src="${esc(img)}" alt="${alt}" loading="lazy"></picture>`;
    return `<a class="ad-banner" href="/publicidade/${Number(b.id)}" target="_blank" rel="sponsored noopener"
        aria-label="Publicidade de ${esc(b.anunciante)}">
      ${midia}
      <span class="ad-tag">Patrocinado</span></a>`;
  }

  const MEGAFONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

  // Espaço sem campanha: convite para empresas anunciarem.
  function conviteHtml(espaco) {
    const wa = /^https:\/\/wa\.me\//.test(cache.whatsapp?.[espaco] || '') ? cache.whatsapp[espaco] : '';
    const destino = wa ? `href="${esc(wa)}" target="_blank" rel="noopener"` : `href="/anuncie?espaco=${esc(espaco)}"`;
    return `<a class="ad-invite" ${destino}>
      <span class="ad-invite-icon">${MEGAFONE}</span>
      <span class="ad-invite-text">
        <span class="ad-invite-tag">Espaço publicitário</span>
        <strong>Anuncie sua marca aqui</strong>
        <span class="ad-invite-sub">Apareça para quem está procurando desconto.</span>
      </span>
      <span class="ad-invite-cta">Quero anunciar</span></a>`;
  }

  function fillSlot(el) {
    const espaco = el.dataset.espaco;
    const b = cache[espaco];
    const html = (b && bannerHtml(b)) || conviteHtml(espaco);
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
