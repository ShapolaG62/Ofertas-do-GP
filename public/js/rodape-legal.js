// Identificação de quem mantém o site, no rodapé de todas as páginas (Decreto 7.962/2013, comércio eletrônico):
// nome ou razão social, CPF ou CNPJ, endereço e e-mail de contato — preenchidos em Painel → Site → Responsável pelo site.
(() => {
  if (window.top !== window) return; // dentro de quadros (SAC, Moderação, Equipe no painel) não repete
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const css = document.createElement('style');
  css.textContent = `
  .rodape-legal { border-top: 1px solid var(--line, #e2e6e1); margin-top: 28px; padding: 14px max(16px, env(safe-area-inset-left, 0px)) calc(14px + env(safe-area-inset-bottom, 0px));
    font-size: 12.5px; line-height: 1.6; color: var(--ink-3, #6f7873); text-align: center; }
  .rodape-legal a { color: inherit; text-decoration: underline; }
  .rodape-legal span + span::before { content: " · "; }`;
  document.head.appendChild(css);
  function formatarDoc(d) {
    const n = String(d || '').replace(/\D/g, '');
    if (n.length === 11) return `CPF ${n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`;
    if (n.length === 14) return `CNPJ ${n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}`;
    return d ? String(d) : '';
  }
  async function montar() {
    let s;
    try { s = await fetch('/api/settings/public').then(r => r.json()); } catch { return; }
    if (!s.legal_nome) return;
    const partes = [
      `Ofertou! — mantido por ${esc(s.legal_nome)}`,
      s.legal_documento && esc(formatarDoc(s.legal_documento)),
      s.legal_endereco && esc(s.legal_endereco),
      s.legal_email && `<a href="mailto:${esc(s.legal_email)}">${esc(s.legal_email)}</a>`,
      '<a href="/privacidade">Termos de Uso e Privacidade</a>',
      '<a href="#" data-cookies-preferencias>Preferências de cookies</a>',
    ].filter(Boolean);
    const el = document.createElement('div');
    el.className = 'rodape-legal';
    el.setAttribute('role', 'contentinfo');
    el.innerHTML = partes.map(p => `<span>${p}</span>`).join('');
    // Fica dentro do rodapé da página, quando existe; senão, no fim da página
    (document.querySelector('body > footer, .site-footer') || document.body).appendChild(el);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
