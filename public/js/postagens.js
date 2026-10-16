/* Ofertas do GP — tela de postagens: produtos escolhidos, textos editáveis e publicação nas redes sociais */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parseDate = s => (s ? new Date(String(s).replace(' ', 'T') + 'Z') : null);
  const fmtWhen = d => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const STORES = { mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee', magalu: 'Magalu', shein: 'Shein', aliexpress: 'AliExpress', temu: 'Temu' };

  // Seleção e textos editados ficam no navegador (mesma chave usada pela página de ofertas).
  const SEL_KEY = 'gp_postagens';
  const TXT_KEY = 'gp_postagens_textos';
  const NET_KEY = 'gp_postagens_redes';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

  let OFFERS = [];
  let REDES = [];
  let textos = load(TXT_KEY, {});
  const excluded = new Set();
  let stopRequested = false;

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  function defaultText(o) {
    const store = STORES[o.store_id] || o.plataforma;
    const lines = [
      `*${o.produto}*`, '',
      `De ~R$ ${brl(o.preco_anterior)}~`,
      `*Por R$ ${brl(o.preco_atual)}* (${Math.round(o.desconto_pct)}% off)`,
      `Loja: ${store}`, '',
      o.link,
    ];
    const seen = parseDate(o.last_seen_at);
    if (seen && !isNaN(seen)) lines.push('', `_Preço conferido em ${fmtWhen(seen)}. Pode mudar a qualquer momento._`);
    return lines.join('\n');
  }
  const textOf = o => textos[o.id] ?? defaultText(o);

  function selection() { return load(SEL_KEY, []).map(Number).filter(Boolean); }
  function setSelection(ids) { save(SEL_KEY, ids); }

  // ── Redes ──────────────────────────────────────────────────────────────────
  function renderNets(info) {
    const chosen = load(NET_KEY, []);
    $('#net-list').innerHTML = REDES.map(r => `
      <label class="net-option${r.pronta ? '' : ' is-off'}" title="${esc(r.motivo || '')}">
        <input type="checkbox" value="${r.id}" ${r.pronta ? '' : 'disabled'} ${r.pronta && chosen.includes(r.id) ? 'checked' : ''}>
        <span>${esc(r.nome)}</span>${r.pronta ? '' : '<small>não configurada</small>'}
      </label>`).join('') + `
      <span class="net-option is-off" title="O WhatsApp não tem API oficial para grupos">
        <input type="checkbox" disabled><span>WhatsApp</span><small>só manual</small>
      </span>`;
    const off = REDES.filter(r => !r.pronta);
    const hint = $('#net-hint');
    hint.hidden = !off.length;
    hint.innerHTML = off.length ? (info.admin
      ? `Redes não configuradas: ${off.map(r => esc(r.nome)).join(', ')}. Configure em <a class="link-btn" href="/admin">Painel → Redes sociais</a>.`
      : `Redes não configuradas: ${off.map(r => esc(r.nome)).join(', ')}. Peça ao administrador para configurar.`) : '';
  }
  $('#net-list').addEventListener('change', () => {
    save(NET_KEY, [...document.querySelectorAll('#net-list input:checked')].map(i => i.value));
  });

  // ── Lista de produtos ──────────────────────────────────────────────────────
  function render() {
    const n = OFFERS.length;
    $('#posts-sub').textContent = n
      ? `${n} produto${n === 1 ? '' : 's'} escolhido${n === 1 ? '' : 's'}. Edite os textos se quiser e publique manualmente ou automaticamente.`
      : 'Nenhum produto escolhido.';
    $('#auto-post').disabled = !n;
    if (!n) {
      $('#posts-list').innerHTML = `<div class="empty"><img src="/images/pet-capi.png" alt="" width="120">
        <h3>Nenhum produto escolhido</h3><p>Volte às ofertas e toque no ✓ dos produtos que quer postar.</p>
        <a class="btn btn-primary" href="/">Escolher produtos</a></div>`;
      return;
    }
    $('#posts-list').innerHTML = OFFERS.map(o => {
      const text = textOf(o);
      const posted = Object.entries(o.postado_em || {}).map(([r, em]) => `${esc(REDES.find(x => x.id === r)?.nome || r)} ${fmtWhen(parseDate(em))}`);
      return `<article class="post-item post-card${excluded.has(o.id) ? ' is-excluded' : ''}" data-id="${o.id}">
        <header>
          <img src="/api/img/${o.id}" alt="" loading="lazy">
          <div class="post-card-info">
            <strong>${esc(o.produto)}</strong>
            <span><s>R$ ${brl(o.preco_anterior)}</s> <b>R$ ${brl(o.preco_atual)}</b> · -${Math.round(o.desconto_pct)}% · ${esc(STORES[o.store_id] || o.plataforma)}</span>
            ${posted.length ? `<span class="post-done">Já postado: ${posted.join(' · ')}</span>` : ''}
          </div>
          <label class="post-include" title="Incluir na postagem automática">
            <input type="checkbox" data-include="${o.id}" ${excluded.has(o.id) ? '' : 'checked'}> Incluir
          </label>
        </header>
        <textarea class="post-text" data-text="${o.id}" rows="9" aria-label="Texto da postagem">${esc(text)}</textarea>
        <div class="post-actions">
          <button class="btn btn-sm" type="button" data-copy="${o.id}">Copiar texto</button>
          <a class="btn btn-sm" href="/api/img/${o.id}" download="oferta-${o.id}.jpg">Baixar imagem</a>
          <a class="btn btn-sm" data-share="wa" href="#" target="_blank" rel="noopener"><svg><use href="#i-wa"/></svg>WhatsApp</a>
          <a class="btn btn-sm" data-share="tg" href="#" target="_blank" rel="noopener"><svg><use href="#i-tg"/></svg>Telegram</a>
          <button class="btn btn-sm" type="button" data-reset="${o.id}">Texto original</button>
          <button class="btn btn-sm post-remove" type="button" data-remove="${o.id}">Remover</button>
        </div>
        <div class="post-status" data-status="${o.id}"></div>
      </article>`;
    }).join('');
  }

  const offerOf = el => OFFERS.find(o => o.id === Number(el.closest('[data-id]').dataset.id));

  $('#posts-list').addEventListener('input', e => {
    const t = e.target.closest('[data-text]');
    if (!t) return;
    textos[t.dataset.text] = t.value;
    save(TXT_KEY, textos);
  });

  $('#posts-list').addEventListener('click', e => {
    const share = e.target.closest('[data-share]');
    if (share) {
      // Links de compartilhar montados na hora do clique, com o texto já editado.
      const o = offerOf(share);
      const text = textOf(o);
      share.href = share.dataset.share === 'wa'
        ? `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
        : `https://t.me/share/url?url=${encodeURIComponent(o.link)}&text=${encodeURIComponent(text)}`;
      return;
    }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.copy) {
      navigator.clipboard.writeText(textOf(offerOf(b))).then(() => toast('Texto copiado.'));
    } else if (b.dataset.reset) {
      delete textos[b.dataset.reset]; save(TXT_KEY, textos);
      b.closest('article').querySelector('textarea').value = textOf(offerOf(b));
    } else if (b.dataset.remove) {
      const id = Number(b.dataset.remove);
      setSelection(selection().filter(x => x !== id));
      delete textos[id]; save(TXT_KEY, textos);
      OFFERS = OFFERS.filter(o => o.id !== id);
      render();
    }
  });

  $('#posts-list').addEventListener('change', e => {
    const c = e.target.closest('[data-include]');
    if (!c) return;
    const id = Number(c.dataset.include);
    c.checked ? excluded.delete(id) : excluded.add(id);
    c.closest('article').classList.toggle('is-excluded', !c.checked);
  });

  $('#copy-all').addEventListener('click', () => {
    const list = OFFERS.filter(o => !excluded.has(o.id));
    if (!list.length) return toast('Nenhum produto incluído.');
    navigator.clipboard.writeText(list.map(textOf).join('\n\n———\n\n')).then(() => toast(`${list.length} textos copiados.`));
  });

  $('#clear-all').addEventListener('click', () => {
    if (!OFFERS.length) return;
    setSelection([]); textos = {}; save(TXT_KEY, textos);
    OFFERS = []; render();
    toast('Seleção limpa.');
  });

  // ── Postagem automática ────────────────────────────────────────────────────
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let confirmTimer;

  $('#auto-post').addEventListener('click', async () => {
    const redes = [...document.querySelectorAll('#net-list input:checked')].map(i => i.value);
    const list = OFFERS.filter(o => !excluded.has(o.id));
    if (!redes.length) return toast('Marque pelo menos uma rede configurada.');
    if (!list.length) return toast('Nenhum produto incluído.');

    // Primeiro clique pede confirmação; o segundo publica.
    const btn = $('#auto-post');
    if (!btn.dataset.confirm) {
      btn.dataset.confirm = '1';
      btn.textContent = `Confirmar: ${list.length} produto${list.length === 1 ? '' : 's'} em ${redes.map(r => REDES.find(x => x.id === r).nome).join(', ')}`;
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => { delete btn.dataset.confirm; btn.textContent = 'Postar automaticamente'; }, 6000);
      return;
    }
    clearTimeout(confirmTimer);
    delete btn.dataset.confirm;
    btn.textContent = 'Postando…';
    btn.disabled = true;
    stopRequested = false;
    $('#auto-stop').hidden = false;
    const prog = $('#progress');
    prog.hidden = false;
    let ok = 0, falhas = 0;

    for (let i = 0; i < list.length; i++) {
      if (stopRequested) break;
      const o = list[i];
      prog.textContent = `Publicando ${i + 1} de ${list.length}: ${o.produto.slice(0, 60)}…`;
      const st = document.querySelector(`[data-status="${o.id}"]`);
      if (st) st.innerHTML = '<span class="post-pending">Publicando…</span>';
      try {
        const res = await fetch('/api/postagens/publicar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offer_id: o.id, redes, texto: textOf(o) }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || `Erro ${res.status}`);
        for (const r of d.resultados) {
          r.ok ? ok++ : falhas++;
          if (r.ok) (o.postado_em ||= {})[r.rede] = new Date().toISOString().replace('T', ' ').slice(0, 19);
        }
        if (st) st.innerHTML = d.resultados.map(r => `<span class="${r.ok ? 'post-ok' : 'post-fail'}">${esc(REDES.find(x => x.id === r.rede)?.nome || r.rede)}: ${r.ok ? 'publicado' : esc(r.mensagem)}</span>`).join('');
      } catch (err) {
        falhas++;
        if (st) st.innerHTML = `<span class="post-fail">${esc(err.message)}</span>`;
        if (/limite|permiss/i.test(err.message)) break;
      }
      if (i < list.length - 1 && !stopRequested) await sleep(3000); // intervalo entre postagens (evita bloqueio por spam)
    }

    prog.textContent = `${stopRequested ? 'Interrompido. ' : 'Concluído. '}${ok} publicação(ões) feitas${falhas ? `, ${falhas} com erro (veja em cada produto)` : ''}.`;
    btn.textContent = 'Postar automaticamente';
    btn.disabled = false;
    $('#auto-stop').hidden = true;
  });
  $('#auto-stop').addEventListener('click', () => { stopRequested = true; $('#auto-stop').hidden = true; });

  // ── Início ─────────────────────────────────────────────────────────────────
  (async () => {
    try {
      const info = await fetch('/api/postagens/redes').then(r => {
        if (r.status === 403 || r.status === 401) { location.href = '/conta?voltar=/postagens'; throw new Error('sem permissão'); }
        return r.json();
      });
      REDES = info.redes;
      renderNets(info);
      const ids = selection();
      const rows = ids.length ? await fetch(`/api/postagens/ofertas?ids=${ids.join(',')}`).then(r => r.json()) : [];
      const byId = new Map(rows.map(o => [o.id, o]));
      OFFERS = ids.map(id => byId.get(id)).filter(Boolean); // mantém a ordem em que foram escolhidos
      if (OFFERS.length !== ids.length) setSelection(OFFERS.map(o => o.id)); // remove ofertas que não existem mais
      render();
    } catch (err) {
      if (err.message !== 'sem permissão') $('#posts-sub').textContent = `Erro ao carregar: ${err.message}`;
    }
  })();
})();
