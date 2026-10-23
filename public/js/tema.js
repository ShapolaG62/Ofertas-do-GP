/* Ofertou! — tema do site: Claro, Escuro ou Automático (segue o aparelho). A escolha fica salva neste navegador.
   Carregado no <head> sem "defer", para a página já abrir com o tema certo (sem piscar).
   - <html data-theme="light|dark"> quando a pessoa escolhe; sem o atributo, vale o tema do aparelho (site.css).
   - Qualquer elemento com [data-tema-controle] vira o seletor de tema (3 botões).
   OfertouTema.definir('claro' | 'escuro' | 'auto') · OfertouTema.atual() · OfertouTema.escuro() */
(() => {
  'use strict';
  if (window.OfertouTema) return;
  const CHAVE = 'ofertou-tema';
  const raiz = document.documentElement;
  const sistemaEscuro = window.matchMedia('(prefers-color-scheme: dark)');
  const ler = () => { try { const t = localStorage.getItem(CHAVE); return t === 'claro' || t === 'escuro' ? t : 'auto'; } catch { return 'auto'; } };
  const escuro = () => { const t = ler(); return t === 'escuro' || (t === 'auto' && sistemaEscuro.matches); };

  function aplicar() {
    const t = ler();
    if (t === 'claro') raiz.dataset.theme = 'light';
    else if (t === 'escuro') raiz.dataset.theme = 'dark';
    else delete raiz.dataset.theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = escuro() ? '#0e1210' : '#ffffff'; });
    // Cor da barra de baixo do app instalado: o arquivo de instalação (site.webmanifest, pedido com
    // crossorigin="use-credentials") leva este cookie; no automático, já com o tema do aparelho resolvido
    try { document.cookie = `ofertou_tema=${escuro() ? 'escuro' : 'claro'}; path=/; max-age=31536000; SameSite=Lax`; } catch { /* sem cookies */ }
    document.querySelectorAll('[data-tema-controle] [data-tema]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tema === t)));
    document.dispatchEvent(new CustomEvent('ofertou:tema', { detail: { tema: t, escuro: escuro() } }));
  }
  aplicar();

  const ICONES = {
    claro: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    escuro: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    auto: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
  };
  const NOMES = { claro: 'Claro', escuro: 'Escuro', auto: 'Automático' };
  const css = document.createElement('style');
  css.textContent = `
  .tema-ctl { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; border: 1px solid var(--line-strong, var(--border-strong, #cfd5cf));
    background: var(--surface-2, #f7f8f6); vertical-align: middle; }
  .tema-ctl button { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border: 0; border-radius: 999px; background: none;
    color: var(--ink-2, var(--muted, #48514c)); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
  .tema-ctl button:hover { color: var(--ink, var(--text, #161b18)); }
  .tema-ctl button[aria-pressed="true"] { background: var(--surface, #fff); color: var(--brand, var(--green, #0c8f4f)); box-shadow: 0 1px 3px rgba(0, 0, 0, .15); }
  .tema-ctl svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  .tema-ctl.so-icones button { padding: 0 9px; }
  .tema-ctl.so-icones button span { display: none; }`;
  (document.head || raiz).appendChild(css);

  function montar(el) {
    if (el.dataset.temaPronto) return;
    el.dataset.temaPronto = '1';
    const t = ler();
    el.classList.add('tema-ctl');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Tema do site');
    el.innerHTML = ['claro', 'escuro', 'auto'].map(k => `<button type="button" data-tema="${k}" aria-pressed="${k === t}" title="Tema ${NOMES[k].toLowerCase()}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[k]}</svg><span>${NOMES[k]}</span></button>`).join('');
  }
  const montarTodos = () => document.querySelectorAll('[data-tema-controle]').forEach(montar);
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tema-controle] [data-tema]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    window.OfertouTema.definir(b.dataset.tema);
  });
  // Controles criados depois (menus montados por JavaScript)
  let pendente = false;
  new MutationObserver(() => {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(() => { pendente = false; montarTodos(); });
  }).observe(raiz, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarTodos); else montarTodos();

  sistemaEscuro.addEventListener?.('change', () => { if (ler() === 'auto') aplicar(); });
  window.addEventListener('storage', e => { if (e.key === CHAVE) aplicar(); }); // outra aba mudou

  window.OfertouTema = {
    atual: ler,
    escuro,
    definir(t) { try { if (t === 'auto') localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, t); } catch { /* sem armazenamento */ } aplicar(); },
  };
})();
