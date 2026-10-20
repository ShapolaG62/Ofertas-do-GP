/* Ofertou! — avisos na entrada da tela de ofertas (cupom, novidade, produto, aviso), criados em Painel → Avisos na entrada.
   Mostra um por vez ("1 de 3"). Quantas vezes cada um aparece fica guardado neste navegador:
   uma_vez (até o aviso ser editado), diaria (uma vez por dia) ou sempre (uma vez a cada visita ao site).
   OfertouAvisos.mostrar(lista, { previa: true }) → abre na hora, sem guardar nada (prévia do painel). */
(() => {
  'use strict';
  if (window.OfertouAvisos) return;
  const CHAVE = 'ofertou-avisos';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const ler = (st, k) => { try { return JSON.parse(st.getItem(k) || '{}'); } catch { return {}; } };
  const gravar = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento: mostra de novo */ } };
  const SELO = { cupom: 'Cupom', novidade: 'Novidade', produto: 'Produto', aviso: 'Aviso' };
  const ICONE = {
    cupom: '<path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z"/><path d="M14 5v2M14 11v2M14 17v2"/>',
    novidade: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    produto: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    aviso: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  };

  const css = document.createElement('style');
  css.textContent = `
  .avs-fundo { position: fixed; inset: 0; z-index: 2147483200; display: grid; place-items: center; padding: 16px;
    background: rgba(5, 8, 7, .66); backdrop-filter: blur(4px); }
  .avs-caixa { position: relative; width: min(440px, 100%); max-height: calc(100dvh - 32px); overflow: auto; scrollbar-width: none;
    background: var(--surface, #161b18); color: var(--ink, #eef3f0); border: 1px solid var(--line-strong, #343c36); border-radius: 22px;
    box-shadow: 0 30px 80px rgba(0,0,0,.6); font-family: Figtree, system-ui, sans-serif; animation: avs-sobe .28s cubic-bezier(.2,1.2,.4,1); }
  .avs-caixa::-webkit-scrollbar { display: none; }
  .avs-img { display: block; width: 100%; max-height: 300px; object-fit: cover; background: var(--surface-2, #1b211d); }
  .avs-corpo { padding: 20px 22px 22px; display: grid; gap: 10px; }
  .avs-selo { justify-self: start; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 8px; border-radius: 999px;
    font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; background: var(--avs-soft); color: var(--avs-cor); }
  .avs-selo svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .avs-cupom-t { --avs-cor: #f2c94c; --avs-soft: rgba(242,201,76,.15); }
  .avs-novidade-t { --avs-cor: #2bd47d; --avs-soft: rgba(43,212,125,.15); }
  .avs-produto-t { --avs-cor: #58b4ff; --avs-soft: rgba(88,180,255,.15); }
  .avs-aviso-t { --avs-cor: #c4b5fd; --avs-soft: rgba(196,181,253,.15); }
  .avs-titulo { margin: 0; font-size: 21px; line-height: 1.25; font-weight: 800; letter-spacing: -.01em; }
  .avs-texto { margin: 0; font-size: 15px; line-height: 1.55; color: var(--ink-2, #b7c0ba); white-space: pre-line; overflow-wrap: anywhere; }
  .avs-cupom { display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 16px; border-radius: 14px;
    border: 2px dashed var(--avs-cor); background: var(--avs-soft); }
  .avs-cupom code { flex: 1; min-width: 0; font: 800 19px/1.2 ui-monospace, Consolas, monospace; letter-spacing: .08em; color: var(--avs-cor); overflow-wrap: anywhere; }
  .avs-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 18px; border-radius: 999px;
    font: inherit; font-weight: 800; font-size: 14.5px; cursor: pointer; text-decoration: none; border: 1px solid var(--line-strong, #343c36);
    background: transparent; color: inherit; }
  .avs-btn:hover { background: var(--surface-2, rgba(255,255,255,.05)); }
  .avs-btn.ok { background: var(--brand, #2bd47d); border-color: transparent; color: #fff; }
  .avs-btn.ok:hover { filter: brightness(1.07); }
  .avs-btn.copiar { min-height: 38px; padding: 0 14px; font-size: 13.5px; background: var(--avs-cor); border-color: transparent; color: #161b18; }
  .avs-acoes { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
  .avs-acoes .avs-btn { flex: 1 1 140px; }
  .avs-x { position: absolute; top: 10px; right: 10px; z-index: 1; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
    border: 0; background: rgba(0,0,0,.55); color: #fff; }
  .avs-x svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }
  .avs-x:hover { background: rgba(0,0,0,.75); }
  .avs-pontos { display: flex; justify-content: center; gap: 6px; margin-top: 2px; }
  .avs-pontos i { width: 7px; height: 7px; border-radius: 50%; background: var(--line-strong, #343c36); }
  .avs-pontos i.on { background: var(--brand, #2bd47d); width: 18px; border-radius: 4px; }
  .avs-previa { margin: 0; text-align: center; font-size: 12.5px; color: var(--ink-3, #8b958f); }
  @keyframes avs-sobe { from { transform: translateY(18px) scale(.96) } }
  @media (prefers-reduced-motion: reduce) { .avs-caixa { animation: none; } }`;
  document.head.appendChild(css);

  const contar = (a, evento, previa) => { if (!previa) fetch(`/api/avisos/${a.id}/${evento}`, { method: 'POST' }).catch(() => {}); };

  function mostrar(lista, { previa = false } = {}) {
    lista = (lista || []).filter(Boolean);
    if (!lista.length) return;
    document.querySelector('.avs-fundo')?.remove();
    let i = 0;
    const fundo = document.createElement('div');
    fundo.className = 'avs-fundo';
    const voltarFoco = document.activeElement;
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); voltarFoco?.focus?.(); };
    const tecla = e => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    fundo.addEventListener('click', e => { if (e.target === fundo) fechar(); });

    function desenhar() {
      const a = lista[i], ultimo = i === lista.length - 1;
      const externo = /^https:/i.test(a.link || '');
      fundo.innerHTML = `<div class="avs-caixa avs-${esc(a.tipo)}-t" role="dialog" aria-modal="true" aria-labelledby="avs-tit">
        <button class="avs-x" type="button" aria-label="Fechar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        ${a.imagem ? `<img class="avs-img" src="${esc(a.imagem)}" alt="">` : ''}
        <div class="avs-corpo">
          <span class="avs-selo"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONE[a.tipo] || ICONE.aviso}</svg>${SELO[a.tipo] || 'Aviso'}</span>
          <h2 class="avs-titulo" id="avs-tit">${esc(a.titulo)}</h2>
          ${a.texto ? `<p class="avs-texto">${esc(a.texto)}</p>` : ''}
          ${a.cupom ? `<div class="avs-cupom"><code>${esc(a.cupom)}</code><button class="avs-btn copiar" type="button" data-avs-copiar>Copiar</button></div>` : ''}
          <div class="avs-acoes">
            ${a.link ? `<a class="avs-btn ok" href="${esc(a.link)}"${externo ? ' target="_blank" rel="noopener"' : ''} data-avs-ir>${esc(a.botao_texto || 'Saiba mais')}</a>` : ''}
            <button class="avs-btn${a.link ? '' : ' ok'}" type="button" data-avs-seguir>${ultimo ? 'Fechar' : 'Próximo'}</button>
          </div>
          ${lista.length > 1 ? `<div class="avs-pontos" aria-label="Aviso ${i + 1} de ${lista.length}">${lista.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>` : ''}
          ${previa ? '<p class="avs-previa">Prévia: nada é contado nem guardado.</p>' : ''}
        </div></div>`;
      fundo.querySelector('.avs-x').onclick = fechar;
      fundo.querySelector('[data-avs-seguir]').onclick = () => { if (ultimo) fechar(); else { i++; desenhar(); } };
      fundo.querySelector('[data-avs-ir]')?.addEventListener('click', () => contar(a, 'clique', previa));
      fundo.querySelector('[data-avs-copiar]')?.addEventListener('click', async e => {
        const b = e.currentTarget;
        try { await navigator.clipboard.writeText(a.cupom); b.textContent = 'Copiado!'; }
        catch { b.textContent = 'Selecione e copie'; }
        setTimeout(() => { b.textContent = 'Copiar'; }, 2000);
        contar(a, 'clique', previa);
      });
      contar(a, 'visto', previa);
      fundo.querySelector('[data-avs-seguir]').focus({ preventScroll: true });
    }
    desenhar();
    document.body.appendChild(fundo);
  }

  // Quais avisos ainda faltam para este navegador (e marca como vistos)
  function filtrar(lista) {
    const salvos = ler(localStorage, CHAVE), sessao = ler(sessionStorage, CHAVE), dia = hoje();
    const falta = lista.filter(a => {
      const s = salvos[a.id];
      if (a.frequencia === 'sempre') return !sessao[a.id];
      if (a.frequencia === 'diaria') return !s || s.d !== dia || s.v !== a.versao;
      return !s || s.v !== a.versao;
    });
    for (const a of falta) { salvos[a.id] = { v: a.versao, d: dia }; sessao[a.id] = 1; }
    const ids = new Set(lista.map(a => String(a.id)));
    for (const k of Object.keys(salvos)) if (!ids.has(k) && salvos[k].d < dia.slice(0, 8) + '00') delete salvos[k]; // limpa os antigos
    gravar(localStorage, CHAVE, salvos); gravar(sessionStorage, CHAVE, sessao);
    return falta;
  }

  async function iniciar() {
    try {
      const d = await fetch('/api/avisos', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null));
      const falta = filtrar(d?.avisos || []);
      if (!falta.length) return;
      // Pré-carrega a primeira imagem para a janela abrir pronta
      if (falta[0].imagem) await new Promise(ok => { const im = new Image(); im.onload = im.onerror = ok; im.src = falta[0].imagem; setTimeout(ok, 2500); });
      setTimeout(() => mostrar(falta), 500);
    } catch { /* sem avisos */ }
  }

  window.OfertouAvisos = { mostrar };
  if (document.currentScript?.dataset.auto !== undefined) {
    if (document.readyState === 'complete') iniciar(); else addEventListener('load', iniciar, { once: true });
  }
})();
