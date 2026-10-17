/* Ofertou! — prévia de produto das lojas parceiras: fotos, preço e descrição, conversa com a loja e pedido pelo site.
   Usado na página da loja, no perfil da empresa e na página do anúncio:
     OfertouLoja.abrir(oferta, loja)       → abre a prévia (oferta: item do catálogo; loja: { id, nome, slug, pedidos })
     OfertouLoja.conversar(lojaId, ofertaId)
     OfertouLoja.pedir(oferta, loja)       → abre direto o formulário do pedido
     OfertouLoja.visita(lojaId, tipo, ofertaId)  → contador (pagina | produto | site | link) */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const okImg = src => /^(\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)|https:\/\/)/.test(src || '');
  const slugOf = o => `${String(o.produto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}-${o.id}`;
  const voltarLogin = () => { location.href = `/conta?voltar=${encodeURIComponent(location.pathname + location.search)}`; };

  async function api(url, body) {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { voltarLogin(); throw new Error(d.error || 'Entre na sua conta.'); }
    if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
    return d;
  }

  function visita(lojaId, tipo, ofertaId) {
    if (!lojaId) return;
    const corpo = JSON.stringify({ tipo, oferta_id: ofertaId || null });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(`/api/lojas/${lojaId}/visita`, new Blob([corpo], { type: 'application/json' }));
      else fetch(`/api/lojas/${lojaId}/visita`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true });
    } catch { /* contador é opcional */ }
  }

  // Janela (criada uma vez)
  let dlg;
  function janela() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'prod-dlg';
    dlg.innerHTML = '<button class="prod-fechar" type="button" aria-label="Fechar">✕</button><div class="prod-corpo"></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('.prod-fechar')) dlg.close(); });
    return dlg;
  }
  const corpo = () => janela().querySelector('.prod-corpo');

  async function conversar(lojaId, ofertaId, botao) {
    if (botao) { botao.disabled = true; botao.textContent = 'Abrindo conversa…'; }
    try {
      const r = await api('/api/chat/iniciar', { loja_id: lojaId, oferta_id: ofertaId || null });
      location.href = `/mensagens?c=${r.id}`;
    } catch (err) {
      if (botao) { botao.disabled = false; botao.textContent = 'Conversar com a loja'; }
      alert(err.message);
    }
  }

  async function abrir(o, loja) {
    janela();
    corpo().innerHTML = '<p class="muted" style="padding:30px;text-align:center">Carregando…</p>';
    if (!dlg.open) dlg.showModal();
    visita(loja.id, 'produto', o.id);
    // Anúncio feito no site: busca fotos, descrição e ficha técnica
    let a = { ...o, imagens: o.imagem ? [o.imagem] : [] };
    if (o.fonte === 'empresa') {
      try { a = { ...a, ...(await fetch(`/api/anuncios/${o.id}`).then(r => (r.ok ? r.json() : {}))) }; } catch { /* usa o básico */ }
    }
    const imgs = (a.imagens || []).filter(okImg);
    const fotos = imgs.length ? imgs : [`/api/img/${o.id}`];
    const ped = loja.pedidos || { aceita_pedidos: false, metodos: [] };
    const fatos = [
      a.condicao && ['Condição', a.condicao], a.marca && ['Marca', a.marca], a.modelo && ['Modelo', a.modelo],
      a.garantia && ['Garantia', a.garantia], a.frete && ['Entrega', `${a.frete}${a.frete_valor != null ? `: R$ ${brl(a.frete_valor)}` : ''}${a.prazo_entrega ? ` — ${a.prazo_entrega}` : ''}`],
      a.estoque != null && ['Estoque', `${a.estoque} unidade(s)`], a.parcelamento && ['Parcelamento', a.parcelamento],
    ].filter(Boolean);
    const linkExterno = o.fonte !== 'empresa' ? `/oferta/${slugOf(o)}` : null;
    corpo().innerHTML = `
      <div class="prod-grid">
        <div class="prod-galeria">
          <div class="prod-foto"><img id="prod-img" src="${esc(fotos[0])}" alt="${esc(a.produto)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/api/img/${o.id}'">
            ${a.desconto_pct ? `<span class="card-off">-${Math.round(a.desconto_pct)}%</span>` : ''}</div>
          ${fotos.length > 1 ? `<div class="prod-miniaturas">${fotos.map((src, i) => `<button type="button" data-foto="${esc(src)}" ${i ? '' : 'aria-current="true"'}><img src="${esc(src)}" alt="" referrerpolicy="no-referrer"></button>`).join('')}</div>` : ''}
        </div>
        <div class="prod-info">
          <a class="ad-store" href="/loja/${esc(loja.slug)}"><span class="store-dot" style="background:var(--brand)"></span>${esc(loja.nome)}</a>
          <h2>${esc(a.produto)}</h2>
          <div class="ad-price">
            ${a.preco_anterior ? `<div class="card-old num">De R$ ${brl(a.preco_anterior)}</div>` : ''}
            <div class="ad-price-now num"><small>R$</small>${brl(a.preco_atual)}</div>
          </div>
          ${fatos.length ? `<dl class="prod-fatos">${fatos.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
          ${a.cupom_codigo ? `<p class="prod-cupom">Cupom: <b>${esc(a.cupom_codigo)}</b>${a.cupom_descricao ? ` — ${esc(a.cupom_descricao)}` : ''}</p>` : ''}
          <div class="prod-acoes">
            ${ped.aceita_pedidos ? '<button class="btn btn-primary btn-block" type="button" data-prod="pedir">Fazer pedido</button>' : ''}
            <button class="btn btn-block" type="button" data-prod="conversar">💬 Conversar com a loja</button>
            ${linkExterno ? `<a class="btn btn-block" href="${linkExterno}" target="_blank" rel="noopener sponsored" data-prod="externo">Ver no site da loja ↗</a>` : ''}
            ${o.fonte === 'empresa' ? `<a class="link-btn" href="/anuncio/${o.id}">Abrir a página completa do anúncio</a>` : ''}
          </div>
          ${ped.aceita_pedidos && ped.metodos.length ? `<p class="muted prod-nota">Pagamento direto à loja: ${ped.metodos.map(m => esc(m.nome)).join(', ')}. O pedido e a conversa ficam registrados no site.</p>` : ''}
        </div>
      </div>
      ${a.descricao ? `<div class="prod-desc"><h3>Descrição</h3><p>${esc(a.descricao).replace(/\n/g, '<br>')}</p></div>` : ''}`;
    corpo().onclick = e => {
      const f = e.target.closest('[data-foto]');
      if (f) {
        corpo().querySelector('#prod-img').src = f.dataset.foto;
        corpo().querySelectorAll('[data-foto]').forEach(b => b.removeAttribute('aria-current'));
        f.setAttribute('aria-current', 'true');
      }
      const b = e.target.closest('[data-prod]');
      if (!b) return;
      if (b.dataset.prod === 'conversar') conversar(loja.id, o.id, b);
      if (b.dataset.prod === 'pedir') pedir(a, loja);
      if (b.dataset.prod === 'externo') visita(loja.id, 'link', o.id);
    };
  }

  // Formulário do pedido
  function pedir(o, loja) {
    janela();
    if (!dlg.open) dlg.showModal();
    const ped = loja.pedidos || { metodos: [] };
    corpo().innerHTML = `
      <form class="prod-pedido" id="prod-pedido">
        <h2>Fazer pedido</h2>
        <div class="prod-resumo"><img src="/api/img/${o.id}" alt="" referrerpolicy="no-referrer"><div><b>${esc(o.produto)}</b>
          <span class="muted">${esc(loja.nome)} · R$ ${brl(o.preco_atual)} cada</span></div></div>
        <label class="field"><span>Quantidade</span><input type="number" name="quantidade" min="1" max="99" value="1" required></label>
        <fieldset class="prod-metodos"><legend>Como você quer pagar?</legend>
          ${ped.metodos.map((m, i) => `<label class="ass-metodo"><input type="radio" name="metodo" value="${esc(m.id)}" ${i ? '' : 'checked'}>
            <span><b>${esc(m.nome)}</b><small>${esc(m.desc)}</small></span></label>`).join('')}
        </fieldset>
        <label class="field"><span>Observações para a loja <small class="muted">(endereço de entrega, cor, tamanho…)</small></span>
          <textarea name="observacao" maxlength="600" rows="3"></textarea></label>
        ${ped.instrucoes ? `<p class="muted prod-nota">${esc(ped.instrucoes)}</p>` : ''}
        <dl class="prod-conta" id="prod-conta"></dl>
        <p class="muted prod-nota" style="margin:0">Frete e prazo: combine com a loja pelo chat, se houver.</p>
        <div class="form-msg err" id="prod-msg" hidden></div>
        <button class="btn btn-primary btn-block" type="submit">Confirmar pedido</button>
        <button class="btn btn-block" type="button" data-voltar>Voltar ao produto</button>
        <p class="muted prod-nota">O pagamento vai direto para a loja. O Ofertou! registra o pedido e a conversa, mas não cobra nem entrega o produto.</p>
      </form>`;
    const f = corpo().querySelector('#prod-pedido');
    // Produtos + taxa de uso do site (somada na finalização) = total
    const pct = Number(ped.taxa_pct) || 0;
    const conta = () => {
      const q = Math.min(Math.max(parseInt(f.quantidade.value, 10) || 1, 1), 99);
      const sub = Math.round(o.preco_atual * q * 100) / 100;
      const taxa = Math.round(sub * pct) / 100;
      corpo().querySelector('#prod-conta').innerHTML = `<dt>Produtos (${q}x)</dt><dd>R$ ${brl(sub)}</dd>
        ${taxa ? `<dt>Taxa de uso do site (${String(pct).replace('.', ',')}%)</dt><dd>R$ ${brl(taxa)}</dd>` : ''}
        <dt class="prod-conta-total">Total</dt><dd class="prod-conta-total">R$ ${brl(sub + taxa)}</dd>`;
    };
    f.quantidade.addEventListener('input', conta);
    conta();
    corpo().querySelector('[data-voltar]').onclick = () => abrir(o, loja);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = f.querySelector('[type=submit]');
      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        const p = await api('/api/pedidos', { oferta_id: o.id, quantidade: f.quantidade.value, metodo: f.metodo.value, observacao: f.observacao.value });
        location.href = `/mensagens?c=${p.conversa_id}&pedido=${p.id}`;
      } catch (err) {
        const m = corpo().querySelector('#prod-msg'); m.textContent = err.message; m.hidden = false;
        btn.disabled = false; btn.textContent = 'Confirmar pedido';
      }
    });
  }

  window.OfertouLoja = { abrir, pedir, conversar, visita };
})();
