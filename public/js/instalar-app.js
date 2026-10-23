/* Ofertou! — instalar o site como aplicativo no celular (e no computador, no Chrome/Edge).
   - Botão "Baixar app" no topo, no menu da conta e no rodapé, só enquanto o site não está instalado.
   - No celular, um aviso aparece 3 segundos depois de abrir (no lugar do aviso do navegador, que demora): se a pessoa
     disser "Agora não", ele volta só depois de 3 dias.
   - Android/Chrome: abre a instalação de verdade. iPhone (Safari) e outros navegadores: mostra o passo a passo. */
(() => {
  'use strict';
  if (window.OfertouInstalar || window.top !== window) return;
  const nav = navigator;
  const instalado = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches
    || nav.standalone === true || document.documentElement.classList.contains('is-app') || /OfertouApp/.test(nav.userAgent);
  if (instalado()) { document.documentElement.classList.add('is-pwa'); window.OfertouInstalar = { instalado: true }; return; }

  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const celular = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) || matchMedia('(max-width: 720px)').matches;
  const CHAVE = 'ofertou-app-aviso-ate';
  let pedido = null; // evento beforeinstallprompt guardado

  const ICONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7M9 11.5l3 3 3-3M10 18.5h4"/></svg>';
  const css = document.createElement('style');
  css.textContent = `
  .app-btn { display: inline-flex; align-items: center; gap: 6px; }
  .app-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .header-actions .app-btn { color: var(--brand); }
  @media (max-width: 720px) { .header-actions .app-btn { width: 36px; padding: 0; justify-content: center; } .header-actions .app-btn span { display: none; } }
  .app-aviso { position: fixed; z-index: 2147483050; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); margin: 0 auto; max-width: 520px;
    display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 16px; background: var(--surface, #161b18); color: var(--ink, #edf1ee);
    border: 1px solid var(--line-strong, #343c36); box-shadow: 0 16px 44px -12px rgba(0, 0, 0, .55); font-family: Figtree, system-ui, sans-serif;
    animation: app-sobe .25s ease-out; }
  .app-aviso img { width: 46px; height: 46px; border-radius: 12px; flex: none; }
  .app-aviso div { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .app-aviso b { font-size: 14.5px; }
  .app-aviso span { font-size: 12.5px; color: var(--ink-3, #87918b); line-height: 1.35; }
  .app-aviso .app-sim { flex: none; height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--brand, #2bb673); color: #fff; font: inherit; font-weight: 800; font-size: 13.5px; cursor: pointer; }
  .app-aviso .app-x { flex: none; width: 30px; height: 30px; border: 0; border-radius: 50%; background: var(--surface-2, #1b211d); color: inherit; font-size: 17px; cursor: pointer; }
  @keyframes app-sobe { from { transform: translateY(30px); } }
  @media (prefers-reduced-motion: reduce) { .app-aviso { animation: none; } }`;
  document.head.appendChild(css);

  function passoAPasso() {
    const texto = ios
      ? 'No iPhone, o app é instalado pelo Safari:\n\n1. Toque no botão Compartilhar (o quadrado com a seta para cima, embaixo da tela).\n2. Role e toque em "Adicionar à Tela de Início".\n3. Toque em "Adicionar".\n\nO Ofertou! aparece na tela do celular como um aplicativo.'
      : 'Para instalar o app:\n\n1. Toque no menu do navegador (os três pontinhos ⋮).\n2. Toque em "Instalar app" ou "Adicionar à tela inicial".\n3. Confirme em "Instalar".\n\nSe não aparecer, abra o site pelo Google Chrome.';
    (window.OfertouUI?.avisar || alert)(texto, { titulo: 'Instalar o app do Ofertou!' });
  }
  async function instalar() {
    fecharAviso();
    if (!pedido) return passoAPasso();
    pedido.prompt();
    const { outcome } = await pedido.userChoice.catch(() => ({ outcome: 'dismissed' }));
    pedido = null;
    if (outcome === 'accepted') esconderTudo();
  }

  // Botões
  const podeMostrar = () => Boolean(pedido) || ios || celular;
  function botoes() {
    if (!podeMostrar() || instalado()) return;
    const topo = document.querySelector('.header-actions');
    if (topo && !topo.querySelector('.app-btn')) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-sm app-btn'; b.title = 'Baixar o app do Ofertou!';
      b.innerHTML = `${ICONE}<span>Baixar app</span>`;
      b.addEventListener('click', instalar);
      topo.insertBefore(b, topo.firstChild);
    }
    const menu = document.querySelector('#conta-pop');
    if (menu && !menu.querySelector('.app-btn')) {
      const i = document.createElement('button');
      i.type = 'button'; i.setAttribute('role', 'menuitem'); i.className = 'app-btn';
      i.innerHTML = `${ICONE}<span><b>Baixar o app</b><small>Ofertas na tela inicial do celular</small></span>`;
      i.addEventListener('click', () => { menu.hidden = true; instalar(); });
      menu.insertBefore(i, menu.querySelector('.conta-tema') || menu.querySelector('#logout-site'));
    }
    const rodape = document.querySelector('.rodape-legal');
    if (rodape && !rodape.querySelector('.app-btn')) {
      const s = document.createElement('span');
      s.innerHTML = '<a href="#" class="app-btn">Baixar o app</a>';
      s.querySelector('a').addEventListener('click', e => { e.preventDefault(); instalar(); });
      rodape.appendChild(s);
    }
  }
  function esconderTudo() { document.querySelectorAll('.app-btn').forEach(b => (b.closest('.rodape-legal > span') || b).remove()); fecharAviso(); }

  // Aviso no celular
  let aviso = null;
  function fecharAviso() { aviso?.remove(); aviso = null; }
  function mostrarAviso() {
    if (aviso || instalado() || !celular || !podeMostrar()) return;
    let ate = 0; try { ate = Number(localStorage.getItem(CHAVE)) || 0; } catch { /* */ }
    if (Date.now() < ate) return;
    if (document.querySelector('.ck-aviso, .avs-fundo, dialog[open], .oap')) return setTimeout(mostrarAviso, 4000); // espera o aviso de cookies e outras janelas
    aviso = document.createElement('div');
    aviso.className = 'app-aviso';
    aviso.setAttribute('role', 'dialog');
    aviso.setAttribute('aria-label', 'Instalar o app');
    aviso.innerHTML = `<img src="/images/icon-192.png" alt=""><div><b>Baixe o app do Ofertou!</b><span>Ofertas na tela inicial do celular, abrindo mais rápido.</span></div>
      <button type="button" class="app-sim">Instalar</button><button type="button" class="app-x" aria-label="Agora não">×</button>`;
    aviso.querySelector('.app-sim').addEventListener('click', instalar);
    aviso.querySelector('.app-x').addEventListener('click', () => {
      try { localStorage.setItem(CHAVE, String(Date.now() + 3 * 24 * 3600 * 1000)); } catch { /* */ }
      fecharAviso();
    });
    document.body.appendChild(aviso);
  }

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedido = e; botoes(); });
  window.addEventListener('appinstalled', () => { pedido = null; esconderTudo(); });
  const iniciar = () => { botoes(); setTimeout(mostrarAviso, 3000); setTimeout(botoes, 2500); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  window.OfertouInstalar = { instalar, instalado: false };
})();
