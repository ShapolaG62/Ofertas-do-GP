/* Ofertou! — lista de opções dos campos de escolha (<select>) no visual do site, no lugar da lista nativa do sistema
   (que no Windows abre branca/azul e ignora o tema). A caixa fechada continua sendo o próprio <select> (mesmo estilo,
   mesmo valor no formulário); só a lista que abre é desenhada aqui. Vale para qualquer <select> da página, inclusive
   os criados depois. No celular/toque fica a lista do próprio aparelho, mais prática. Para manter a nativa num
   campo específico: data-nativo. */
(() => {
  'use strict';
  if (window.OfertouSeletor) return;
  const toque = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
  window.OfertouSeletor = { ativo: !toque };
  if (toque) return;

  const css = document.createElement('style');
  css.textContent = `
  .sel-lista { position: fixed; inset: auto; margin: 0; z-index: 2147483300; box-sizing: border-box; overflow: auto; max-height: 280px;
    background: var(--surface, #161b18); color: var(--ink, var(--text, #edf1ee)); border: 1px solid var(--line-strong, var(--border-strong, #343c36));
    border-radius: 12px; padding: 5px; box-shadow: 0 18px 44px -12px rgba(0, 0, 0, .55); font-family: Figtree, system-ui, sans-serif; font-size: 14px;
    scrollbar-width: thin; animation: sel-abre .12s ease-out; }
  .sel-lista[hidden] { display: none; }
  @keyframes sel-abre { from { transform: translateY(-4px); } }
  .sel-op { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-radius: 8px; cursor: pointer;
    white-space: nowrap; line-height: 1.3; user-select: none; }
  .sel-op.ativo { background: var(--surface-3, #222924); }
  .sel-op[aria-selected="true"] { color: var(--brand, var(--green, #2bb673)); font-weight: 700; }
  .sel-op[aria-selected="true"]::after { content: ""; flex: none; width: 14px; height: 14px; background: currentColor;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E") center / contain no-repeat;
            mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E") center / contain no-repeat; }
  .sel-op[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }
  .sel-grupo { padding: 9px 10px 4px; font-size: 11.5px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase;
    color: var(--ink-3, var(--dim, #87918b)); }
  @media (prefers-reduced-motion: reduce) { .sel-lista { animation: none; } }`;
  (document.head || document.documentElement).appendChild(css);

  const lista = document.createElement('div');
  lista.className = 'sel-lista';
  lista.setAttribute('role', 'listbox');
  lista.hidden = true;
  const usaPopover = typeof lista.showPopover === 'function';
  if (usaPopover) lista.setAttribute('popover', 'manual'); // camada de cima: aparece na frente de janelas (dialog) abertas
  let atual = null, ativo = -1, ops = [], busca = '', buscaTimer;

  const serve = s => s && s.tagName === 'SELECT' && !s.multiple && !(s.size > 1) && !s.disabled && !s.hasAttribute('data-nativo');

  function montar(sel) {
    ops = [];
    let html = '';
    let grupoAtual = null;
    [...sel.options].forEach(o => {
      const g = o.parentElement.tagName === 'OPTGROUP' ? o.parentElement : null;
      if (g !== grupoAtual) { grupoAtual = g; if (g) html += `<div class="sel-grupo" role="presentation">${esc(g.label)}</div>`; }
      if (o.hidden) return;
      const i = ops.length;
      ops.push(o);
      html += `<div class="sel-op" role="option" data-i="${i}" aria-selected="${o.selected}"${o.disabled || g?.disabled ? ' aria-disabled="true"' : ''}>${esc(o.textContent.trim())}</div>`;
    });
    lista.innerHTML = html;
  }
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function posicionar() {
    const r = atual.getBoundingClientRect();
    lista.style.minWidth = `${Math.round(r.width)}px`;
    lista.style.maxWidth = `${Math.max(Math.round(r.width), Math.min(420, window.innerWidth - 16))}px`;
    lista.style.left = '0px'; lista.style.top = '0px';
    const h = Math.min(lista.scrollHeight, 280), w = lista.offsetWidth;
    const embaixo = window.innerHeight - r.bottom - 8, emcima = r.top - 8;
    const top = embaixo >= h || embaixo >= emcima ? r.bottom + 4 : Math.max(8, r.top - 4 - h);
    lista.style.top = `${Math.round(top)}px`;
    lista.style.left = `${Math.round(Math.min(Math.max(8, r.left), window.innerWidth - w - 8))}px`;
    lista.style.maxHeight = `${Math.max(120, Math.min(280, top > r.top ? embaixo : emcima))}px`;
  }
  function marcar(i, rolar = true) {
    const els = lista.querySelectorAll('.sel-op');
    els.forEach(e => e.classList.remove('ativo'));
    ativo = i;
    const el = els[i];
    if (el) { el.classList.add('ativo'); if (rolar) el.scrollIntoView({ block: 'nearest' }); }
  }
  function abrir(sel) {
    if (atual === sel && !lista.hidden) return fechar();
    fechar();
    atual = sel;
    montar(sel);
    const dlg = sel.closest('dialog[open]');
    if (!usaPopover) (dlg || document.body).appendChild(lista);
    else if (!lista.isConnected) document.body.appendChild(lista);
    lista.hidden = false;
    if (usaPopover) lista.showPopover();
    posicionar();
    marcar(Math.max(0, ops.findIndex(o => o.selected)));
    sel.setAttribute('aria-expanded', 'true');
  }
  function fechar() {
    if (!atual) return;
    atual.setAttribute('aria-expanded', 'false');
    if (usaPopover && lista.matches(':popover-open')) lista.hidePopover();
    lista.hidden = true;
    atual = null; ativo = -1;
  }
  function escolher(i) {
    const o = ops[i];
    if (!o || o.disabled || o.parentElement.disabled) return;
    const sel = atual;
    const mudou = sel.value !== o.value || sel.selectedIndex !== o.index;
    sel.selectedIndex = o.index;
    fechar();
    sel.focus();
    if (mudou) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  const proxima = (de, passo) => {
    let i = de;
    for (let n = 0; n < ops.length; n++) { i = Math.min(Math.max(i + passo, 0), ops.length - 1); if (!ops[i].disabled) return i; if (i === 0 || i === ops.length - 1) break; }
    return de;
  };

  // Abrir: clique (sem deixar abrir a lista nativa) e teclado
  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (lista.contains(e.target)) { e.preventDefault(); return; }
    const sel = e.target.closest('select');
    if (serve(sel)) { e.preventDefault(); sel.focus(); abrir(sel); return; }
    fechar();
  }, true);
  lista.addEventListener('click', e => { const op = e.target.closest('.sel-op'); if (op) escolher(Number(op.dataset.i)); });
  lista.addEventListener('mousemove', e => { const op = e.target.closest('.sel-op'); if (op && Number(op.dataset.i) !== ativo) marcar(Number(op.dataset.i), false); });
  document.addEventListener('keydown', e => {
    const aberto = atual && !lista.hidden;
    if (!aberto) {
      const sel = e.target;
      if (serve(sel) && (e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')))) { e.preventDefault(); abrir(sel); }
      return;
    }
    const pare = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'ArrowDown') { pare(); marcar(proxima(ativo, 1)); }
    else if (e.key === 'ArrowUp') { pare(); marcar(proxima(ativo, -1)); }
    else if (e.key === 'Home') { pare(); marcar(proxima(-1, 1)); }
    else if (e.key === 'End') { pare(); marcar(proxima(ops.length, -1)); }
    else if (e.key === 'PageDown') { pare(); marcar(Math.min(ops.length - 1, ativo + 8)); }
    else if (e.key === 'PageUp') { pare(); marcar(Math.max(0, ativo - 8)); }
    else if (e.key === 'Enter' || e.key === ' ') { pare(); escolher(ativo); }
    else if (e.key === 'Escape') { pare(); const s = atual; fechar(); s.focus(); }
    else if (e.key === 'Tab') { fechar(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      pare();
      clearTimeout(buscaTimer); busca += e.key.toLowerCase(); buscaTimer = setTimeout(() => { busca = ''; }, 700);
      const norm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const i = ops.findIndex(o => !o.disabled && norm(o.textContent.trim()).startsWith(norm(busca)));
      if (i >= 0) marcar(i);
    }
  }, true);
  // Fecha ao rolar a página (não a própria lista), redimensionar ou trocar de aba
  window.addEventListener('scroll', e => { if (atual && !lista.contains(e.target)) fechar(); }, true);
  window.addEventListener('resize', fechar);
  window.addEventListener('blur', fechar);
  document.addEventListener('focusin', e => { if (atual && e.target !== atual && !lista.contains(e.target)) fechar(); });
})();
