// Botão "‹ Voltar" no topo das páginas secundárias (loja, anúncio, perfil, mensagens, SAC, assinatura…).
// Volta para a página anterior do Ofertou!; se a pessoa chegou por um link de fora (WhatsApp, Google…)
// ou abriu direto, vai para a página indicada em data-padrao no <script> (padrão: a página inicial).
// Importante no app do iPhone, que não tem o botão de voltar do sistema.
(() => {
  if (window.top !== window) return; // dentro de um quadro (ex.: SAC no painel) não precisa
  const script = document.currentScript;
  const padrao = script?.dataset.padrao || '/';
  const veioDoSite = () => {
    try { return Boolean(document.referrer) && new URL(document.referrer).origin === location.origin && history.length > 1; } catch { return false; }
  };
  function voltar() {
    if (veioDoSite()) {
      const antes = location.href;
      history.back();
      // se não voltou (ex.: o histórico era de outra aba), vai para a página padrão
      setTimeout(() => { if (location.href === antes) location.href = padrao; }, 600);
    } else location.href = padrao;
  }
  const css = document.createElement('style');
  css.textContent = `
  .btn-voltar { display: inline-flex; align-items: center; gap: 4px; flex: none; }
  .btn-voltar svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  @media (max-width: 520px) { .btn-voltar span { display: none; } .btn-voltar { padding-left: 9px; padding-right: 9px; } }`;
  document.head.appendChild(css);
  function montar() {
    const linha = document.querySelector('.site-header .header-row');
    if (!linha || linha.querySelector('.btn-voltar')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm btn-voltar';
    b.setAttribute('aria-label', 'Voltar');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><span>Voltar</span>';
    b.addEventListener('click', voltar);
    linha.insertBefore(b, linha.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
