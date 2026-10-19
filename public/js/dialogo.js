/* Ofertou! — janelas de aviso, confirmação e pergunta no visual do site (no lugar do alert/confirm/prompt do navegador).
   OfertouUI.confirmar(texto, { titulo, ok, cancelar, perigo })  → Promise<boolean>
   OfertouUI.perguntar(texto, padrao, { titulo, tipo, ok })        → Promise<string | null>  (null = cancelou)
   OfertouUI.avisar(texto, { titulo })                             → Promise<void>
   OfertouUI.escolher(texto, [{ valor, nome }], { titulo, ok })    → Promise<string | null>  (null = cancelou) */
(() => {
  'use strict';
  if (window.OfertouUI) return;
  const css = `
  .oui-fundo { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 16px;
    background: rgba(5, 8, 7, .62); backdrop-filter: blur(3px); animation: oui-in .15s ease-out; }
  .oui-caixa { width: min(440px, 100%); background: var(--surface, #161b18); color: var(--ink, var(--text, #eef3f0));
    border: 1px solid var(--line-strong, var(--border-strong, #343c36)); border-radius: 18px; box-shadow: 0 24px 70px rgba(0,0,0,.55);
    padding: 22px; display: grid; gap: 14px; font-family: Figtree, system-ui, sans-serif; animation: oui-sobe .18s ease-out; }
  .oui-topo { display: flex; gap: 12px; align-items: flex-start; }
  .oui-ico { flex: none; width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center;
    background: var(--brand-soft, var(--green-soft, rgba(43,212,125,.14))); color: var(--brand, var(--green, #2bd47d)); }
  .oui-ico.perigo { background: rgba(229,72,77,.14); color: #ff6b6f; }
  .oui-ico svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2.1; stroke-linecap: round; stroke-linejoin: round; }
  .oui-titulo { margin: 0; font-size: 17px; font-weight: 800; line-height: 1.3; }
  .oui-texto { margin: 4px 0 0; font-size: 14.5px; line-height: 1.55; color: var(--ink-2, var(--muted, #a3ada7)); white-space: pre-line; overflow-wrap: anywhere; }
  .oui-campo { width: 100%; box-sizing: border-box; padding: 11px 13px; border-radius: 11px; font: inherit; font-size: 15px;
    background: var(--surface-2, #1b211d); color: inherit; border: 1px solid var(--line-strong, var(--border-strong, #343c36)); outline: none; }
  .oui-campo:focus { border-color: var(--brand, var(--green, #2bd47d)); }
  .oui-botoes { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  .oui-btn { min-height: 44px; padding: 0 20px; border-radius: 999px; font: inherit; font-weight: 800; font-size: 14.5px; cursor: pointer;
    border: 1px solid var(--line-strong, var(--border-strong, #343c36)); background: transparent; color: inherit; }
  .oui-btn:hover { background: var(--surface-2, rgba(255,255,255,.05)); }
  .oui-btn.ok { background: var(--brand, var(--green, #2bd47d)); border-color: transparent; color: #fff; }
  .oui-btn.ok.perigo { background: #e5484d; }
  .oui-btn.ok:hover { filter: brightness(1.07); }
  @keyframes oui-in { from { opacity: 0 } }
  @keyframes oui-sobe { from { opacity: 0; transform: translateY(12px) scale(.97) } }
  @media (max-width: 480px) { .oui-botoes { flex-direction: column-reverse; } .oui-btn { width: 100%; } }`;
  const estilo = document.createElement('style');
  estilo.textContent = css;
  (document.head || document.documentElement).appendChild(estilo);

  const ICONES = {
    pergunta: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
    perigo: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  };
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Ações que apagam, bloqueiam ou tiram algo ficam com o botão vermelho
  const ehPerigo = t => /\b(excluir|apagar|banir|bloquear|remover|tirar|recusar|cancelar este|cancelar o pedido|encerrar|desconectar|ocultar)\b/i.test(t);

  function abrir({ texto, titulo, ok = 'OK', cancelar = null, perigo = false, campo = null, icone = 'pergunta' }) {
    return new Promise(resolve => {
      const anterior = document.activeElement;
      const fundo = document.createElement('div');
      fundo.className = 'oui-fundo';
      fundo.innerHTML = `<div class="oui-caixa" role="${cancelar ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="oui-t">
        <div class="oui-topo"><span class="oui-ico${perigo ? ' perigo' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[perigo ? 'perigo' : icone]}</svg></span>
          <div><p class="oui-titulo" id="oui-t">${esc(titulo)}</p>${texto ? `<p class="oui-texto">${esc(texto)}</p>` : ''}</div></div>
        ${campo && campo.tipo === 'select' ? `<select class="oui-campo" aria-label="${esc(titulo)}">${campo.opcoes.map(o => `<option value="${esc(o.valor)}">${esc(o.nome)}</option>`).join('')}</select>` : ''}
        ${campo && campo.tipo !== 'select' ? `<input class="oui-campo" type="${campo.tipo}" value="${esc(campo.valor)}" ${campo.tipo === 'number' ? 'inputmode="numeric" min="0"' : ''} autocomplete="${campo.tipo === 'password' ? 'new-password' : 'off'}">` : ''}
        <div class="oui-botoes">${cancelar ? `<button type="button" class="oui-btn" data-r="nao">${esc(cancelar)}</button>` : ''}
          <button type="button" class="oui-btn ok${perigo ? ' perigo' : ''}" data-r="sim">${esc(ok)}</button></div></div>`;
      // Dentro de um <dialog> aberto, a janela precisa ficar dentro dele para aparecer por cima
      const dlgAberto = [...document.querySelectorAll('dialog[open]')].pop();
      (dlgAberto || document.body).appendChild(fundo);
      const input = fundo.querySelector('.oui-campo');
      const fechar = valor => {
        document.removeEventListener('keydown', tecla, true);
        fundo.remove();
        try { anterior && anterior.focus && anterior.focus(); } catch { /* ok */ }
        resolve(valor);
      };
      const responder = sim => fechar(campo ? (sim ? input.value : null) : sim);
      const tecla = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); responder(false); }
        else if (e.key === 'Enter' && (input ? document.activeElement === input : true)) { e.preventDefault(); responder(true); }
      };
      document.addEventListener('keydown', tecla, true);
      fundo.addEventListener('click', e => {
        const b = e.target.closest('[data-r]');
        if (b) responder(b.dataset.r === 'sim');
        else if (e.target === fundo && cancelar) responder(false);
      });
      setTimeout(() => (input ? (input.focus(), input.select?.()) : fundo.querySelector(cancelar ? '[data-r="nao"]' : '[data-r="sim"]').focus()), 30);
    });
  }

  // Título curto + explicação: corta no primeiro "?", ":" ou antes de um parêntese
  function dividir(texto) {
    const t = String(texto).trim();
    const m = /^(.{3,90}?)(\?|:|\s(?=\())\s*([\s\S]*)$/.exec(t);
    if (!m) return [t, ''];
    return [(m[1] + (m[2] === '?' ? '?' : '')).trim(), m[3].trim().replace(/:$/, '')];
  }

  window.OfertouUI = {
    confirmar(texto, o = {}) {
      const perigo = o.perigo ?? ehPerigo(texto);
      const [tit, ...resto] = String(texto).split(/(?<=\?)\s+/);
      return abrir({ titulo: o.titulo || tit, texto: o.titulo ? texto : resto.join(' '), ok: o.ok || (perigo ? 'Sim, confirmar' : 'Confirmar'), cancelar: o.cancelar || 'Cancelar', perigo });
    },
    perguntar(texto, padrao = '', o = {}) {
      const tipo = o.tipo || (/senha/i.test(texto) ? 'password' : /quantos dias/i.test(texto) ? 'number' : 'text');
      const [tit, resto] = dividir(texto);
      return abrir({ titulo: o.titulo || tit, texto: o.titulo ? texto : resto, ok: o.ok || 'Continuar', cancelar: 'Cancelar', campo: { tipo, valor: padrao ?? '' }, icone: 'editar' });
    },
    escolher(texto, opcoes, o = {}) {
      const [tit, resto] = dividir(texto);
      return abrir({ titulo: o.titulo || tit, texto: o.titulo ? texto : resto, ok: o.ok || 'Continuar', cancelar: 'Cancelar', campo: { tipo: 'select', opcoes }, icone: 'editar' });
    },
    avisar(texto, o = {}) {
      return abrir({ titulo: o.titulo || 'Aviso', texto, ok: 'Entendi', icone: 'info' });
    },
  };
})();
