// Cartões salvos (Minha conta → Meus cartões e escolha do cartão na compra de um plano do Ofertou!).
// Número, validade e código de segurança são digitados nos campos seguros do Mercado Pago (iframes deles):
// esses dados vão direto ao Mercado Pago, e o site só recebe um código (token) para salvar ou pagar.
(() => {
  if (window.OfertouCartoes) return;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  async function api(url, opts = {}) {
    const r = await fetch(url, { method: opts.method || 'GET', headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || `Erro ${r.status}`), { status: r.status });
    return d;
  }
  const lembrar = id => { try { localStorage.setItem('ct-ultimo', id); } catch { /* sem armazenamento */ } };
  const ultimo = () => { try { return localStorage.getItem('ct-ultimo'); } catch { return null; } };

  const css = document.createElement('style');
  css.textContent = `
  .ct-lista { display: grid; gap: 10px; margin: 12px 0; }
  .ct-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--line-strong, #cfd5cf); border-radius: 12px; background: var(--surface, #fff); }
  .ct-item img, .ct-opcao img { width: 38px; height: 24px; object-fit: contain; flex: none; }
  .ct-txt { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .ct-txt b { font-size: 15px; }
  .ct-txt small { color: var(--ink-3, #7a837e); }
  .ct-item.vencido { opacity: .7; }
  .ct-tag { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--deal-soft, #fdecea); color: var(--deal, #d23b2a); }
  .ct-form { display: grid; gap: 10px; margin-top: 12px; padding: 14px; border: 1px dashed var(--line-strong, #cfd5cf); border-radius: 12px; }
  .ct-campo { height: 44px; padding: 0 12px; border: 1px solid var(--line-strong, #cfd5cf); border-radius: 10px; background: var(--surface, #fff); display: flex; align-items: center; color: inherit; font: inherit; width: 100%; box-sizing: border-box; }
  .ct-campo iframe { height: 40px !important; }
  .ct-linha { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ct-rotulo { display: grid; gap: 4px; font-size: 13px; font-weight: 600; }
  .ct-nota { font-size: 12.5px; color: var(--ink-3, #7a837e); margin: 0; display: flex; gap: 6px; align-items: flex-start; }
  .ct-escolha { display: grid; gap: 8px; }
  .ct-opcao { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line-strong, #cfd5cf); border-radius: 12px; cursor: pointer; background: none; color: inherit; font: inherit; text-align: left; width: 100%; }
  .ct-opcao.sel, .ct-opcao:hover { border-color: var(--brand, #0c8f4f); }
  .ct-opcao.sel { background: var(--brand-soft, #e5f3eb); }
  .ct-escolhido { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--brand, #0c8f4f); border-radius: 12px; background: var(--brand-soft, #e5f3eb); }
  .ct-escolhido img { width: 38px; height: 24px; object-fit: contain; }
  .ct-acoes { display: flex; gap: 8px; flex-wrap: wrap; }
  .ct-link { background: none; border: 0; padding: 0; color: var(--brand, #0c8f4f); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: underline; }
  .ct-pagar { display: grid; gap: 10px; }
  .ct-titulo { margin: 0; font-size: 14px; font-weight: 700; }
  @media (max-width: 480px) { .ct-linha { grid-template-columns: 1fr; } }`;
  document.head.appendChild(css);

  // SDK do Mercado Pago: carregado só quando precisa
  let sdkPromessa = null;
  function sdk() {
    if (window.MercadoPago) return Promise.resolve();
    if (!sdkPromessa) sdkPromessa = new Promise((ok, erro) => {
      const sc = document.createElement('script');
      sc.src = 'https://sdk.mercadopago.com/js/v2';
      const falhou = () => { clearTimeout(limite); sdkPromessa = null; erro(new Error('Não foi possível carregar o Mercado Pago.')); };
      const limite = setTimeout(falhou, 15000); // rede lenta ou bloqueada: avisa em vez de ficar carregando para sempre
      sc.onload = () => { clearTimeout(limite); ok(); }; sc.onerror = falhou;
      document.head.appendChild(sc);
    });
    return sdkPromessa;
  }
  const estiloCampos = () => ({ color: getComputedStyle(document.body).color || '#161b18', fontSize: '15px', fontFamily: 'Figtree, system-ui, sans-serif', placeholderColor: '#8b958f' });
  // Uma instância do Mercado Pago por chave; os campos seguros abertos são desmontados antes de criar outros
  let mpInst = null, mpChave = null, montados = [], seq = 0;
  function mercadoPago(chave) {
    if (!mpInst || mpChave !== chave) { mpInst = new window.MercadoPago(chave, { locale: 'pt-BR' }); mpChave = chave; }
    return mpInst;
  }
  function desmontar() { montados.forEach(f => { try { f.unmount(); } catch { /* já saiu */ } }); montados = []; }
  function campo(mp, tipo, alvo, placeholder) {
    const f = mp.fields.create(tipo, { placeholder, style: estiloCampos() }).mount(alvo);
    montados.push(f);
    return f;
  }
  const cadeado = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const notaSeguranca = `<p class="ct-nota">${cadeado}<span>Os dados do cartão vão direto para o Mercado Pago. O Ofertou! não guarda número, validade nem código de segurança.</span></p>`;
  const resumoCartao = c => `<img src="${esc(c.imagem || '')}" alt="" onerror="this.style.visibility='hidden'">
    <span class="ct-txt"><b>${esc(c.bandeira)} •••• ${esc(c.final)}</b><small>${esc(c.tipo)}${c.validade ? ` · validade ${esc(c.validade)}` : ''}${c.titular ? ` · ${esc(c.titular)}` : ''}</small></span>
    ${c.vencido ? '<span class="ct-tag">Vencido</span>' : ''}`;
  const erroCartao = (err, padrao) => (err?.message && !Array.isArray(err) && !Array.isArray(err?.cause) ? err.message : padrao);

  // Formulário "cadastrar cartão" (usado em Meus cartões e no pedido): salva no Mercado Pago e devolve o cartão salvo
  async function formNovo(alvo, d, { aoSalvar, aoCancelar, textoSalvar = 'Salvar cartão', extra = '' }) {
    const n = ++seq;
    alvo.innerHTML = `<form class="ct-form" novalidate>
      <label class="ct-rotulo">Número do cartão<div class="ct-campo" id="ct-numero-${n}"></div></label>
      <div class="ct-linha">
        <label class="ct-rotulo">Validade<div class="ct-campo" id="ct-validade-${n}"></div></label>
        <label class="ct-rotulo">Código de segurança<div class="ct-campo" id="ct-cvv-${n}"></div></label>
      </div>
      <div class="ct-linha">
        <label class="ct-rotulo">Nome impresso no cartão<input class="ct-campo" name="titular" autocomplete="cc-name" maxlength="60" required></label>
        <label class="ct-rotulo">CPF do titular<input class="ct-campo" name="cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" required></label>
      </div>
      ${notaSeguranca}
      <p class="form-msg err" data-ct-msg hidden></p>
      <div class="row-actions">${aoCancelar ? '<button class="btn" type="button" data-ct-cancelar>Cancelar</button>' : ''}<button class="btn btn-primary" type="submit">${esc(textoSalvar)}</button></div>
      ${extra}
    </form>`;
    const form = alvo.querySelector('form');
    const msg = t => { const m = form.querySelector('[data-ct-msg]'); m.textContent = t || ''; m.hidden = !t; };
    form.cpf.addEventListener('input', () => { const v = form.cpf.value.replace(/\D/g, '').slice(0, 11); form.cpf.value = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); });
    form.querySelector('[data-ct-cancelar]')?.addEventListener('click', () => { desmontar(); aoCancelar(); });
    let mp;
    try {
      await sdk();
      desmontar();
      mp = mercadoPago(d.public_key);
      campo(mp, 'cardNumber', `ct-numero-${n}`, '0000 0000 0000 0000');
      campo(mp, 'expirationDate', `ct-validade-${n}`, 'MM/AA');
      campo(mp, 'securityCode', `ct-cvv-${n}`, 'CVV');
    } catch { msg('Não foi possível carregar o formulário do Mercado Pago. Recarregue a página.'); return form; }
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg('');
      const cpf = form.cpf.value.replace(/\D/g, '');
      if (form.titular.value.trim().length < 3) return msg('Informe o nome impresso no cartão.');
      if (cpf.length !== 11) return msg('Informe o CPF do titular do cartão.');
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.textContent = 'Salvando…';
      try {
        const t = await mp.fields.createCardToken({ cardholderName: form.titular.value.trim(), identificationType: 'CPF', identificationNumber: cpf });
        const r = await api('/api/conta/cartoes', { method: 'POST', body: { token: t.id } });
        desmontar();
        lembrar(r.cartao.id);
        await aoSalvar(r.cartao);
      } catch (err) {
        msg(erroCartao(err, 'Confira o número, a validade e o código de segurança do cartão.'));
        btn.disabled = false; btn.textContent = textoSalvar;
      }
    });
    return form;
  }

  // ── Minha conta → Meus cartões ──
  async function gerenciar(box) {
    box.innerHTML = '<p class="muted">Carregando seus cartões…</p>';
    let d;
    try { d = await api('/api/conta/cartoes'); } catch (err) { box.innerHTML = `<p class="form-msg err">${esc(err.message)}</p>`; return; }
    if (!d.disponivel) { box.innerHTML = '<p class="muted">O pagamento com cartão ainda não está disponível no site.</p>'; return; }
    const lista = d.cartoes || [];
    box.innerHTML = `
      <div class="ct-lista">${lista.length ? lista.map(c => `<div class="ct-item ${c.vencido ? 'vencido' : ''}">${resumoCartao(c)}
        <button class="btn btn-sm" type="button" data-ct-remover="${esc(c.id)}">Remover</button></div>`).join('')
        : '<p class="muted" style="margin:0">Nenhum cartão salvo ainda. Salve um cartão para pagar seus planos mais rápido: na compra, ele já vem escolhido e você só digita o código de segurança.</p>'}</div>
      ${lista.length < d.max ? '<button class="btn btn-primary" type="button" data-ct-novo>+ Adicionar cartão</button>' : `<p class="muted">Você já tem ${d.max} cartões salvos (o máximo).</p>`}
      <div data-ct-form hidden></div>`;
    box.querySelector('[data-ct-novo]')?.addEventListener('click', () => {
      box.querySelector('[data-ct-novo]').hidden = true;
      const alvo = box.querySelector('[data-ct-form]'); alvo.hidden = false;
      formNovo(alvo, d, { aoSalvar: () => { if (window.toast) window.toast('Cartão salvo!'); gerenciar(box); }, aoCancelar: () => gerenciar(box) });
    });
    box.querySelectorAll('[data-ct-remover]').forEach(b => b.addEventListener('click', async () => {
      const c = lista.find(x => x.id === b.dataset.ctRemover);
      const ok = window.OfertouUI ? await OfertouUI.confirmar(`Remover o cartão ${c.bandeira} final ${c.final}?`) : true;
      if (!ok) return;
      b.disabled = true;
      try { await api(`/api/conta/cartoes/${encodeURIComponent(c.id)}`, { method: 'DELETE' }); gerenciar(box); }
      catch (err) { b.disabled = false; window.OfertouUI ? OfertouUI.avisar(err.message) : alert(err.message); }
    }));
  }

  // ── Na compra do plano: cartão salvo já escolhido, "Trocar cartão" e "Cadastrar cartão novo" ──
  // opcoes: { publicKey, total(), maxParcelas, aoPagar({ token, card_id, installments }), outroCartao() }
  // Devolve false quando a pessoa não pode usar cartões salvos (aí a loja mostra o formulário comum).
  async function escolherNoPedido(area, opcoes) {
    let d;
    try { d = await api('/api/conta/cartoes'); } catch { return false; }
    if (!d.disponivel) return false;
    let lista = (d.cartoes || []).filter(c => !c.vencido);
    let sel = (lista.find(c => c.id === ultimo()) || lista[0])?.id || null;
    let modo = lista.length ? 'pagar' : 'novo';
    let atualizarParcelas = () => {};
    const semSalvar = '<p class="ct-nota" style="justify-content:center"><button class="ct-link" type="button" data-ct-sem-salvar>Pagar com um cartão sem salvar</button></p>';

    area._ctOuvinte?.abort(); // a mesma área pode ser reaproveitada: só o último escolherNoPedido responde
    area._ctOuvinte = new AbortController();
    area.addEventListener('click', e => {
      if (e.target.closest('[data-ct-novo]')) { modo = 'novo'; render(); }
      else if (e.target.closest('[data-ct-sem-salvar]')) { desmontar(); opcoes.outroCartao(); }
    }, { signal: area._ctOuvinte.signal });
    async function render() {
      desmontar();
      atualizarParcelas = () => {};
      if (modo === 'novo') {
        area.innerHTML = `<p class="ct-titulo">${lista.length ? 'Cadastrar cartão novo' : 'Cadastre seu cartão'}</p><div data-ct-alvo></div>
          ${lista.length ? '<p class="ct-nota" style="justify-content:center"><button class="ct-link" type="button" data-ct-voltar>Voltar para os cartões salvos</button></p>' : ''}${semSalvar}`;
        area.querySelector('[data-ct-voltar]')?.addEventListener('click', () => { modo = 'pagar'; render(); });
        await formNovo(area.querySelector('[data-ct-alvo]'), d, {
          textoSalvar: 'Salvar e usar este cartão',
          aoSalvar: async c => { lista = [...lista.filter(x => x.id !== c.id), c]; sel = c.id; modo = 'pagar'; await render(); },
        });
      } else if (modo === 'trocar') {
        area.innerHTML = `<p class="ct-titulo">Escolha o cartão</p>
          <div class="ct-escolha">${lista.map(c => `<button type="button" class="ct-opcao ${c.id === sel ? 'sel' : ''}" data-ct-id="${esc(c.id)}">${resumoCartao(c)}</button>`).join('')}</div>
          <div class="ct-acoes">${lista.length < d.max ? '<button class="btn btn-sm" type="button" data-ct-novo>+ Cadastrar cartão novo</button>' : ''}</div>${semSalvar}`;
        area.querySelectorAll('[data-ct-id]').forEach(b => b.addEventListener('click', () => { sel = b.dataset.ctId; modo = 'pagar'; render(); }));
      } else {
        const c = lista.find(x => x.id === sel) || lista[0];
        sel = c.id;
        const n = ++seq;
        area.innerHTML = `<p class="ct-titulo">Pagar com</p>
          <div class="ct-escolhido">${resumoCartao(c)}</div>
          <div class="ct-acoes">${lista.length > 1 ? '<button class="btn btn-sm" type="button" data-ct-trocar>Trocar cartão</button>' : ''}
            ${lista.length < d.max ? '<button class="btn btn-sm" type="button" data-ct-novo>+ Cadastrar cartão novo</button>' : ''}</div>
          <form class="ct-pagar" novalidate>
            <div class="ct-linha">
              <label class="ct-rotulo">Código de segurança (CVV)<div class="ct-campo" id="ct-cvv-pedido-${n}"></div></label>
              <label class="ct-rotulo">Parcelas<select class="ct-campo" name="parcelas"><option value="1">1x</option></select></label>
            </div>
            <p class="ct-nota">${cadeado}<span>Por segurança, o código de segurança é pedido a cada compra (regra do Mercado Pago e das bandeiras).</span></p>
            <p class="form-msg err" data-ct-msg hidden></p>
            <button class="btn btn-primary btn-block" type="submit">Pagar com este cartão</button>
          </form>${semSalvar}`;
        area.querySelector('[data-ct-trocar]')?.addEventListener('click', () => { modo = 'trocar'; render(); });
        const form = area.querySelector('.ct-pagar');
        const msg = t => { const m = form.querySelector('[data-ct-msg]'); m.textContent = t || ''; m.hidden = !t; };
        let mp;
        try { await sdk(); mp = mercadoPago(opcoes.publicKey || d.public_key); campo(mp, 'securityCode', `ct-cvv-pedido-${n}`, 'CVV'); }
        catch { msg('Não foi possível carregar o Mercado Pago. Recarregue a página.'); return; }
        atualizarParcelas = async () => {
          const s = form.parcelas;
          s.innerHTML = '<option value="1">1x</option>';
          if (!c.bin) return;
          try {
            const r = await mp.getInstallments({ amount: String(opcoes.total()), bin: c.bin });
            const custos = (r?.[0]?.payer_costs || []).filter(p => p.installments <= (opcoes.maxParcelas || d.parcelas || 1));
            if (custos.length) s.innerHTML = custos.map(p => `<option value="${p.installments}">${esc(p.recommended_message || `${p.installments}x`)}</option>`).join('');
          } catch { /* fica 1x */ }
        };
        atualizarParcelas();
        form.addEventListener('submit', async e => {
          e.preventDefault();
          msg('');
          const btn = form.querySelector('[type=submit]');
          btn.disabled = true; btn.textContent = 'Processando…';
          try {
            const t = await mp.fields.createCardToken({ cardId: c.id });
            lembrar(c.id);
            await opcoes.aoPagar({ token: t.id, card_id: c.id, installments: Number(form.parcelas.value) || 1 });
            desmontar();
          } catch (err) {
            msg(erroCartao(err, 'Confira o código de segurança do cartão.'));
            btn.disabled = false; btn.textContent = 'Pagar com este cartão';
          }
        });
      }
    }
    await render();
    return { atualizarParcelas: () => atualizarParcelas(), desmontar };
  }

  window.OfertouCartoes = { gerenciar, escolherNoPedido, desmontar };
})();
