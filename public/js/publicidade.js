/* Ofertou! — espaços de publicidade (banners de empresas anunciantes).
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

  // Anúncio do Google AdSense (bloco responsivo). Dentro do app das lojas não é usado (regra do AdSense).
  const noApp = () => document.documentElement.classList.contains('is-app');
  function googleHtml(espaco) {
    const g = cache.google;
    const slot = g && g.slots && g.slots[espaco];
    if (!slot || noApp()) return '';
    // Anúncio do Google (usa cookies) só com o aceite no aviso de cookies
    if (!window.OfertouCookies || window.OfertouCookies.aceitou() !== true) return '';
    return `<div class="ad-google"><span class="ad-tag ad-tag-google">Publicidade</span>
      <ins class="adsbygoogle" style="display:block" data-ad-client="${esc(g.client)}" data-ad-slot="${esc(slot)}"
        data-ad-format="${espaco === 'lateral' ? 'rectangle' : 'auto'}" data-full-width-responsive="true"></ins></div>`;
  }
  function carregarGoogle(el) {
    const ins = el.querySelector('ins.adsbygoogle');
    if (!ins || ins.dataset.adsbygoogleStatus) return;
    if (!document.querySelector('script[src*="adsbygoogle.js"]')) { // páginas sem o script no <head>
      const sc = document.createElement('script');
      sc.async = true; sc.crossOrigin = 'anonymous';
      sc.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cache.google.client}`;
      document.head.appendChild(sc);
    }
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* bloqueador de anúncios */ }
  }

  function fillSlot(el) {
    const espaco = el.dataset.espaco;
    const b = cache[espaco];
    // Prioridade: campanha de anunciante → anúncio do Google → convite "Anuncie aqui"
    const banner = b && bannerHtml(b);
    const google = !banner && googleHtml(espaco);
    // Espaço já com anúncio do Google carregado: não recria (evita gastar impressões ao redesenhar a lista)
    if (google && el.querySelector('ins.adsbygoogle[data-adsbygoogle-status]')) return;
    const html = banner || google || conviteHtml(espaco);
    el.innerHTML = html;
    el.hidden = !html;
    el.classList.toggle('is-filled', Boolean(banner || google));
    el.classList.toggle('is-google', Boolean(google));
    if (google) carregarGoogle(el);
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
  // Aceitou os cookies depois: os espaços passam a mostrar os anúncios do Google
  window.addEventListener('ofertou:cookies', () => fill());
})();
