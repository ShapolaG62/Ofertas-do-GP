// Aviso de cookies (LGPD): os cookies de estatística (Google Analytics) e de publicidade (Google AdSense) só são
// usados depois que a pessoa aceita. Os essenciais (manter conectado, segurança) funcionam sempre.
// A escolha fica guardada no navegador por 6 meses e pode ser mudada em "Preferências de cookies", no rodapé.
// Outras partes do site perguntam: window.OfertouCookies.aceitou() → true | false | null (ainda não escolheu)
// e escutam o evento "ofertou:cookies" quando a pessoa escolhe.
(() => {
  if (window.OfertouCookies) return;
  const CHAVE = 'ofertou_cookies';
  const ler = () => {
    try { const v = localStorage.getItem(CHAVE); if (v === 'sim' || v === 'nao') return v === 'sim'; } catch { /* sem armazenamento */ }
    const m = document.cookie.match(/(?:^|;\s*)ofertou_cookies=(sim|nao)/);
    return m ? m[1] === 'sim' : null;
  };
  function gravar(sim) {
    const v = sim ? 'sim' : 'nao';
    try { localStorage.setItem(CHAVE, v); } catch { /* usa só o cookie */ }
    document.cookie = `${CHAVE}=${v}; Max-Age=${180 * 86400}; Path=/; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent('ofertou:cookies', { detail: { aceitou: sim } }));
  }
  window.OfertouCookies = { aceitou: ler, abrir: () => mostrar(true) };
  if (window.top !== window) return; // dentro de quadros (SAC, Moderação…) não mostra o aviso

  const css = document.createElement('style');
  css.textContent = `
  .ck-aviso { position: fixed; z-index: 2147483100; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); margin: 0 auto; max-width: 720px;
    background: var(--surface, #fff); color: var(--ink, #161b18); border: 1px solid var(--line-strong, #cfd5cf); border-radius: 16px;
    box-shadow: 0 12px 40px -12px rgba(0,0,0,.45); padding: 14px 16px; display: grid; gap: 10px; font-size: 14px; line-height: 1.5; }
  .ck-aviso p { margin: 0; }
  .ck-aviso a { color: var(--brand, #0c8f4f); }
  .ck-botoes { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .ck-botoes button { font: inherit; font-size: 14px; font-weight: 700; padding: 9px 16px; border-radius: 999px; cursor: pointer; border: 1px solid var(--line-strong, #cfd5cf); background: var(--surface, #fff); color: var(--ink, #161b18); }
  .ck-botoes button.ck-sim { background: var(--brand, #0c8f4f); border-color: var(--brand, #0c8f4f); color: #fff; }
  .ck-botoes button:focus-visible { outline: 3px solid var(--brand, #0c8f4f); outline-offset: 2px; }
  @media (max-width: 720px) {
    .ck-aviso { left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); padding: 10px 12px; gap: 8px; font-size: 12.5px; line-height: 1.45; border-radius: 14px; }
    .ck-botoes { flex-wrap: nowrap; }
    .ck-botoes button { flex: 1; font-size: 13px; padding: 8px 10px; }
  }`;
  document.head.appendChild(css);

  let aviso = null;
  function mostrar(forcar = false) {
    if (aviso || (!forcar && ler() !== null)) return;
    aviso = document.createElement('div');
    aviso.className = 'ck-aviso';
    aviso.setAttribute('role', 'dialog');
    aviso.setAttribute('aria-label', 'Aviso de cookies');
    aviso.innerHTML = `<p><b>Cookies.</b> Usamos cookies essenciais para manter você conectado e o site seguro. Com a sua permissão, também usamos cookies de <b>estatísticas</b> (Google Analytics) e de <b>publicidade</b> (Google AdSense). Você pode mudar a escolha quando quiser em "Preferências de cookies", no rodapé. <a href="/privacidade#cookies">Saiba mais</a>.</p>
      <div class="ck-botoes"><button type="button" class="ck-nao">Só os essenciais</button><button type="button" class="ck-sim">Aceitar todos</button></div>`;
    document.body.appendChild(aviso);
    const fechar = sim => { gravar(sim); aviso.remove(); aviso = null; };
    aviso.querySelector('.ck-sim').addEventListener('click', () => fechar(true));
    aviso.querySelector('.ck-nao').addEventListener('click', () => fechar(false));
  }
  // Link "Preferências de cookies" em qualquer lugar da página
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-cookies-preferencias]');
    if (a) { e.preventDefault(); mostrar(true); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mostrar()); else mostrar();
})();
