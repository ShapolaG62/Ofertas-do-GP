/* Ofertou! — campos de formulário no visual do site, em todas as páginas (inclusive o painel):
   1) Tema dos campos nativos: cor de destaque, barras de rolagem, preenchimento automático, setinhas dos números,
      botão de arquivo e o ícone de calendário das datas.
   2) Calendário das datas (<input type="date">) desenhado aqui, no lugar do calendário do sistema (branco/azul no
      Windows). O campo continua sendo o próprio input (digitação, valor e validação normais).
   3) Lista de opções dos campos de escolha (<select>), no lugar da lista nativa. A caixa fechada continua sendo o
      próprio <select>; só a lista que abre é desenhada aqui.
   Calendário e lista valem para campos criados depois também. No celular/toque ficam os do próprio aparelho, mais
   práticos. Para manter o nativo num campo específico: data-nativo. */
(() => {
  'use strict';
  if (window.OfertouSeletor) return;
  const toque = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
  window.OfertouSeletor = { ativo: !toque };

  // Ícone de calendário na cor da marca (o do sistema some)
  const ICONE_DATA = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232bb673' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3.5' y='5' width='17' height='15.5' rx='2.5'/%3E%3Cpath d='M3.5 10h17M8 3v4M16 3v4'/%3E%3C/svg%3E\")";
  const css = document.createElement('style');
  css.textContent = `
  :root { accent-color: var(--brand, var(--green, #2bb673)); scrollbar-color: var(--line-strong, var(--border-strong, #343c36)) transparent; }
  * { scrollbar-width: thin; }
  ::selection { background: rgba(43, 182, 115, .32); }
  input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, textarea:-webkit-autofill, select:-webkit-autofill {
    -webkit-text-fill-color: var(--ink, var(--text, #edf1ee)); caret-color: var(--ink, var(--text, #edf1ee));
    box-shadow: 0 0 0 1000px var(--surface-2, #1b211d) inset !important; transition: background-color 99999s; }
  input[type=number] { -moz-appearance: textfield; appearance: textfield; }
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=file]::file-selector-button { font: inherit; font-weight: 700; font-size: 13.5px; margin-right: 10px; padding: 7px 14px; border-radius: 999px;
    border: 1px solid var(--line-strong, var(--border-strong, #343c36)); background: var(--surface-2, #1b211d); color: var(--ink, var(--text, #edf1ee)); cursor: pointer; }
  input[type=file]::file-selector-button:hover { border-color: var(--brand, var(--green, #2bb673)); }
  input[type=date]::-webkit-calendar-picker-indicator { display: none; }
  input[type=date] { background-image: ${ICONE_DATA} !important; background-repeat: no-repeat !important; background-position: right 12px center !important;
    background-size: 18px 18px !important; padding-right: 40px !important; cursor: pointer; }
  input[type=date]::-webkit-datetime-edit-fields-wrapper { cursor: text; }
  @supports (-moz-appearance: none) { input[type=date] { background-image: none !important; padding-right: 12px !important; } }

  .sel-lista { position: fixed; inset: auto; margin: 0; z-index: 2147483300; box-sizing: border-box; overflow: auto; max-height: 280px;
    background: var(--surface, #161b18); color: var(--ink, var(--text, #edf1ee)); border: 1px solid var(--line-strong, var(--border-strong, #343c36));
    border-radius: 12px; padding: 5px; box-shadow: 0 18px 44px -12px rgba(0, 0, 0, .55); font-family: Figtree, system-ui, sans-serif; font-size: 14px;
    scrollbar-width: thin; animation: sel-abre .12s ease-out; overflow-x: hidden; }
  .sel-lista[hidden] { display: none; }
  @keyframes sel-abre { from { transform: translateY(-4px); } }
  .sel-op { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-radius: 8px; cursor: pointer;
    line-height: 1.3; user-select: none; }
  .sel-op.ativo { background: var(--surface-3, #222924); }
  .sel-op[aria-selected="true"] { color: var(--brand, var(--green, #2bb673)); font-weight: 700; }
  .sel-op[aria-selected="true"]::after { content: ""; flex: none; width: 14px; height: 14px; background: currentColor;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E") center / contain no-repeat;
            mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E") center / contain no-repeat; }
  .sel-op[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }
  .sel-grupo { padding: 9px 10px 4px; font-size: 11.5px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase;
    color: var(--ink-3, var(--dim, #87918b)); }

  .cal { position: fixed; inset: auto; margin: 0; z-index: 2147483300; box-sizing: border-box; width: 300px; padding: 12px;
    background: var(--surface, #161b18); color: var(--ink, var(--text, #edf1ee)); border: 1px solid var(--line-strong, var(--border-strong, #343c36));
    border-radius: 16px; box-shadow: 0 18px 44px -12px rgba(0, 0, 0, .55); font-family: Figtree, system-ui, sans-serif; font-size: 14px;
    animation: sel-abre .12s ease-out; user-select: none; }
  .cal[hidden] { display: none; }
  .cal button { font: inherit; color: inherit; background: transparent; border: 0; cursor: pointer; }
  .cal-topo { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 8px; }
  .cal-titulo { font-weight: 800 !important; font-size: 15px !important; padding: 6px 10px !important; border-radius: 9px; }
  .cal-titulo:hover { background: var(--surface-3, #222924) !important; }
  .cal-nav { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; }
  .cal-nav:hover { background: var(--surface-3, #222924) !important; }
  .cal-nav svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .cal-grade { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
  .cal-grade.cal-3 { grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .cal-sem { text-align: center; font-size: 11.5px; font-weight: 800; color: var(--ink-3, var(--dim, #87918b)); padding: 4px 0 6px; }
  .cal-celula { height: 36px; border-radius: 10px; font-weight: 600; text-align: center; }
  .cal-3 .cal-celula { height: 46px; text-transform: capitalize; }
  .cal-celula:hover, .cal-celula.ativo { background: var(--surface-3, #222924) !important; }
  .cal-celula.fora { color: var(--ink-3, var(--dim, #87918b)); opacity: .55; }
  .cal-celula.hoje { box-shadow: inset 0 0 0 1.5px var(--brand, var(--green, #2bb673)); }
  .cal-celula[aria-selected="true"] { background: var(--brand, var(--green, #2bb673)) !important; color: #fff !important; font-weight: 800; opacity: 1; }
  .cal-celula:disabled { opacity: .22; cursor: not-allowed; }
  .cal-rodape { display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line, #262d28); }
  .cal-rodape button { font-weight: 700; font-size: 13.5px; padding: 6px 10px; border-radius: 8px; color: var(--brand, var(--green, #2bb673)); }
  .cal-rodape button:hover { background: var(--surface-3, #222924); }
  .cal-rodape button:disabled { opacity: .35; cursor: not-allowed; }
  @media (prefers-reduced-motion: reduce) { .sel-lista, .cal { animation: none; } }`;
  (document.head || document.documentElement).appendChild(css);
  if (toque) return;

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const temPopover = typeof HTMLElement.prototype.showPopover === 'function';
  // Põe a janelinha na camada de cima (na frente de diálogos abertos) e perto do campo, sem sair da tela
  function mostrarPerto(el, campo, alturaMax) {
    // Dentro de uma janela modal aberta, a lista precisa ficar DENTRO dela: o navegador bloqueia os cliques em
    // tudo que está fora da janela modal (a lista aparecia, mas o clique caía no que estava atrás).
    const pai = campo.closest('dialog[open]') || document.body;
    if (el.parentElement !== pai) {
      if (temPopover && el.matches(':popover-open')) el.hidePopover();
      pai.appendChild(el);
    }
    el.hidden = false;
    if (temPopover && !el.matches(':popover-open')) el.showPopover();
    const r = campo.getBoundingClientRect();
    el.style.left = '0px'; el.style.top = '0px';
    const h = Math.min(el.scrollHeight, alturaMax || el.scrollHeight), w = el.offsetWidth;
    const embaixo = window.innerHeight - r.bottom - 8, emcima = r.top - 8;
    const top = embaixo >= h || embaixo >= emcima ? r.bottom + 4 : Math.max(8, r.top - 4 - h);
    el.style.top = `${Math.round(top)}px`;
    el.style.left = `${Math.round(Math.min(Math.max(8, r.left), window.innerWidth - w - 8))}px`;
    return { top, embaixo, emcima, r };
  }
  function esconder(el) {
    if (temPopover && el.matches(':popover-open')) el.hidePopover();
    el.hidden = true;
  }

  // ════════════════ Lista dos campos de escolha (<select>) ════════════════
  const lista = document.createElement('div');
  lista.className = 'sel-lista';
  lista.setAttribute('role', 'listbox');
  lista.hidden = true;
  if (temPopover) lista.setAttribute('popover', 'manual');
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

  function posicionar() {
    const r = atual.getBoundingClientRect();
    lista.style.minWidth = `${Math.round(r.width)}px`;
    lista.style.maxWidth = `${Math.max(Math.round(r.width), Math.min(420, window.innerWidth - 16))}px`;
    const p = mostrarPerto(lista, atual, 280);
    lista.style.maxHeight = `${Math.max(120, Math.min(280, p.top > p.r.top ? p.embaixo : p.emcima))}px`;
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
    fechar(); fecharCal();
    atual = sel;
    montar(sel);
    posicionar();
    marcar(Math.max(0, ops.findIndex(o => o.selected)));
    sel.setAttribute('aria-expanded', 'true');
  }
  function fechar() {
    if (!atual) return;
    atual.setAttribute('aria-expanded', 'false');
    esconder(lista);
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

  // ════════════════ Calendário das datas (<input type="date">) ════════════════
  const cal = document.createElement('div');
  cal.className = 'cal';
  cal.setAttribute('role', 'dialog');
  cal.setAttribute('aria-label', 'Escolher data');
  cal.hidden = true;
  if (temPopover) cal.setAttribute('popover', 'manual');
  const firefox = typeof CSS !== 'undefined' && CSS.supports('-moz-appearance', 'none');
  const MESES = Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2026, m, 1)));
  const SETA = { ant: '<path d="M15 5l-7 7 7 7"/>', prox: '<path d="M9 5l7 7-7 7"/>' };
  let campo = null, modo = 'dias', ver = null, foco = null;

  const serveData = i => i && i.tagName === 'INPUT' && i.type === 'date' && !i.disabled && !i.readOnly && !i.hasAttribute('data-nativo');
  const iso = d => `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const deIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
  const limites = () => ({ min: deIso(campo.min), max: deIso(campo.max) });
  const permitido = d => { const { min, max } = limites(); return (!min || d >= min) && (!max || d <= max); };
  const mesmoDia = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function desenhar() {
    const sel = deIso(campo.value), hoje = new Date();
    const ano = ver.getFullYear(), mes = ver.getMonth();
    let titulo, nav, grade;
    if (modo === 'dias') {
      titulo = `${MESES[mes][0].toUpperCase()}${MESES[mes].slice(1)} de ${ano}`;
      nav = ['mes', -1, 'mes', 1];
      const inicio = new Date(ano, mes, 1 - new Date(ano, mes, 1).getDay());
      grade = `<div class="cal-grade">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => `<span class="cal-sem" aria-hidden="true">${d}</span>`).join('')}
        ${Array.from({ length: 42 }, (_, k) => {
          const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + k);
          const cls = ['cal-celula', d.getMonth() !== mes && 'fora', mesmoDia(d, hoje) && 'hoje', mesmoDia(d, foco) && 'ativo'].filter(Boolean).join(' ');
          return `<button type="button" class="${cls}" data-dia="${iso(d)}" aria-selected="${mesmoDia(d, sel)}" aria-label="${d.toLocaleDateString('pt-BR', { dateStyle: 'full' })}"${permitido(d) ? '' : ' disabled'}>${d.getDate()}</button>`;
        }).join('')}</div>`;
    } else if (modo === 'meses') {
      titulo = String(ano);
      nav = ['ano', -1, 'ano', 1];
      grade = `<div class="cal-grade cal-3">${MESES.map((n, m) => {
        const ok = permitido(new Date(ano, m + 1, 0)) || permitido(new Date(ano, m, 1));
        return `<button type="button" class="cal-celula" data-mes="${m}" aria-selected="${Boolean(sel && sel.getFullYear() === ano && sel.getMonth() === m)}"${ok ? '' : ' disabled'}>${n.slice(0, 3)}</button>`;
      }).join('')}</div>`;
    } else {
      const base = ano - (((ano % 12) + 12) % 12);
      titulo = `${base} – ${base + 11}`;
      nav = ['anos', -12, 'anos', 12];
      grade = `<div class="cal-grade cal-3">${Array.from({ length: 12 }, (_, k) => {
        const a = base + k, ok = permitido(new Date(a, 11, 31)) || permitido(new Date(a, 0, 1));
        return `<button type="button" class="cal-celula" data-ano="${a}" aria-selected="${Boolean(sel && sel.getFullYear() === a)}"${ok ? '' : ' disabled'}>${a}</button>`;
      }).join('')}</div>`;
    }
    const hojeOk = permitido(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
    cal.innerHTML = `<div class="cal-topo">
        <button type="button" class="cal-nav" data-nav="${nav[1]}" aria-label="Anterior"><svg viewBox="0 0 24 24">${SETA.ant}</svg></button>
        <button type="button" class="cal-titulo" data-subir ${modo === 'anos' ? 'disabled style="cursor:default"' : ''} aria-label="${modo === 'dias' ? 'Escolher mês e ano' : 'Escolher ano'}">${titulo}</button>
        <button type="button" class="cal-nav" data-nav="${nav[3]}" aria-label="Próximo"><svg viewBox="0 0 24 24">${SETA.prox}</svg></button>
      </div>${grade}
      <div class="cal-rodape"><button type="button" data-limpar>Limpar</button><button type="button" data-hoje${hojeOk ? '' : ' disabled'}>Hoje</button></div>`;
  }

  function abrirCal(input) {
    if (campo === input && !cal.hidden) return;
    fecharCal(); fechar();
    campo = input;
    const d = deIso(input.value) || deIso(input.max && deIso(input.max) < new Date() ? input.max : '') || new Date();
    ver = new Date(d.getFullYear(), d.getMonth(), 1);
    foco = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // Data de nascimento vazia: começa na escolha do ano (evita voltar mês a mês)
    modo = !input.value && /nasc/i.test(input.name || input.id || '') ? 'anos' : 'dias';
    if (modo === 'anos') { ver = new Date(new Date().getFullYear() - 25, 0, 1); }
    desenhar();
    mostrarPerto(cal, input);
    input.setAttribute('aria-expanded', 'true');
  }
  function fecharCal() {
    if (!campo) return;
    campo.setAttribute('aria-expanded', 'false');
    esconder(cal);
    campo = null;
  }
  function definir(valor) {
    const c = campo;
    const mudou = c.value !== valor;
    c.value = valor;
    fecharCal();
    c.focus();
    if (mudou) {
      c.dispatchEvent(new Event('input', { bubbles: true }));
      c.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function moverFoco(dias) {
    const n = new Date(foco.getFullYear(), foco.getMonth(), foco.getDate() + dias);
    foco = n;
    if (n.getMonth() !== ver.getMonth() || n.getFullYear() !== ver.getFullYear()) ver = new Date(n.getFullYear(), n.getMonth(), 1);
    desenhar();
  }
  function moverMes(meses) {
    ver = new Date(ver.getFullYear(), ver.getMonth() + meses, 1);
    const ult = new Date(ver.getFullYear(), ver.getMonth() + 1, 0).getDate();
    foco = new Date(ver.getFullYear(), ver.getMonth(), Math.min(foco.getDate(), ult));
    desenhar();
  }
  cal.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !campo) return;
    if (b.dataset.dia) return definir(b.dataset.dia);
    if (b.dataset.nav) {
      const n = Number(b.dataset.nav);
      if (modo === 'dias') moverMes(n);
      else { ver = new Date(ver.getFullYear() + n, 0, 1); desenhar(); }
      return;
    }
    if (b.hasAttribute('data-subir')) { modo = modo === 'dias' ? 'meses' : 'anos'; return desenhar(); }
    if (b.dataset.ano) { ver = new Date(Number(b.dataset.ano), ver.getMonth(), 1); modo = 'meses'; return desenhar(); }
    if (b.dataset.mes) {
      ver = new Date(ver.getFullYear(), Number(b.dataset.mes), 1);
      const ult = new Date(ver.getFullYear(), ver.getMonth() + 1, 0).getDate();
      foco = new Date(ver.getFullYear(), ver.getMonth(), Math.min(foco.getDate(), ult));
      modo = 'dias'; return desenhar();
    }
    if (b.hasAttribute('data-limpar')) return definir('');
    if (b.hasAttribute('data-hoje')) return definir(iso(new Date()));
  });
  // Digitou a data no campo: o calendário acompanha
  document.addEventListener('input', e => {
    if (e.target !== campo || cal.hidden) return;
    const d = deIso(campo.value);
    if (d) { ver = new Date(d.getFullYear(), d.getMonth(), 1); foco = d; modo = 'dias'; desenhar(); }
  }, true);

  // ════════════════ Abrir, fechar e teclado (os dois) ════════════════
  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (lista.contains(e.target) || cal.contains(e.target)) { e.preventDefault(); return; }
    const sel = e.target.closest('select');
    if (serve(sel)) { e.preventDefault(); sel.focus(); abrir(sel); return; }
    const data = e.target.closest('input[type=date]');
    if (serveData(data)) {
      if (firefox) { e.preventDefault(); data.focus(); } // no Firefox, o clique abriria o calendário do sistema
      abrirCal(data); return;
    }
    fechar(); fecharCal();
  }, true);
  lista.addEventListener('click', e => { const op = e.target.closest('.sel-op'); if (op) escolher(Number(op.dataset.i)); });
  lista.addEventListener('mousemove', e => { const op = e.target.closest('.sel-op'); if (op && Number(op.dataset.i) !== ativo) marcar(Number(op.dataset.i), false); });
  document.addEventListener('keydown', e => {
    const pare = () => { e.preventDefault(); e.stopPropagation(); };
    // Calendário
    if (campo && !cal.hidden) {
      if (e.key === 'Escape') { pare(); const c = campo; fecharCal(); c.focus(); return; }
      if (e.key === 'Tab') { fecharCal(); return; }
      if (modo === 'dias') {
        const passos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (passos[e.key] && !e.altKey) { pare(); moverFoco(passos[e.key]); return; }
        if (e.key === 'PageUp' || e.key === 'PageDown') { pare(); moverMes((e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1)); return; }
        if (e.key === 'Home') { pare(); moverFoco(-foco.getDay()); return; }
        if (e.key === 'End') { pare(); moverFoco(6 - foco.getDay()); return; }
        if (e.key === 'Enter') { pare(); if (permitido(foco)) definir(iso(foco)); return; }
      }
      return;
    }
    if (serveData(e.target) && (e.key === ' ' || e.key === 'F4' || (e.altKey && e.key === 'ArrowDown'))) { pare(); abrirCal(e.target); return; }
    // Lista de opções
    const aberto = atual && !lista.hidden;
    if (!aberto) {
      const sel = e.target;
      if (serve(sel) && (e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')))) { e.preventDefault(); abrir(sel); }
      return;
    }
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
  // Fecha ao rolar a página (não a própria janelinha), redimensionar ou trocar de aba
  window.addEventListener('scroll', e => { if (atual && !lista.contains(e.target)) fechar(); if (campo && !cal.contains(e.target)) fecharCal(); }, true);
  window.addEventListener('resize', () => { fechar(); fecharCal(); });
  window.addEventListener('blur', () => { fechar(); fecharCal(); });
  document.addEventListener('focusin', e => {
    if (atual && e.target !== atual && !lista.contains(e.target)) fechar();
    if (campo && e.target !== campo && !cal.contains(e.target)) fecharCal();
  });
})();
