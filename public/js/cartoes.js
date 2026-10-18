// Cartões salvos (Minha conta → Meus cartões e escolha do cartão no pedido).
// Número, validade e código de segurança são digitados nos campos seguros do Mercado Pago (iframes deles):
// esses dados vão direto ao Mercado Pago, e o site só recebe um código (token) para salvar ou pagar.
(() => {
  if (window.OfertouCartoes) return;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  async function api(url, opts = {}) {
    const r = await fetch(url, { method: opts.method || 'GET', headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
    return d;
  }

  const css = document.createElement('style');
  css.textContent = `
  .ct-lista { display: grid; gap: 10px; margin: 12px 0; }
  .ct-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--line-strong, #cfd5cf); border-radius: 12px; background: var(--surface, #fff); }
  .ct-item img { width: 38px; height: 24px; object-fit: contain; flex: none; }
  .ct-item .ct-txt { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .ct-item .ct-txt b { font-size: 15px; }
  .ct-item .ct-txt small { color: var(--ink-3, #7a837e); }
  .ct-item.vencido { opacity: .7; }
  .ct-tag { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--deal-soft, #fdecea); color: var(--deal, #d23b2a); }
  .ct-form { display: grid; gap: 10px; margin-top: 12px; padding: 14px; border: 1px dashed var(--line-strong, #cfd5cf); border-radius: 12px; }
  .ct-campo { height: 44px; padding: 0 12px; border: 1px solid var(--line-strong, #cfd5cf); border-radius: 10px; background: var(--surface, #fff); display: flex; align-items: center; }
  .ct-campo iframe { height: 40px !important; }
  .ct-linha { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ct-rotulo { display: grid; gap: 4px; font-size: 13px; font-weight: 600; }
  .ct-nota { font-size: 12.5px; color: var(--ink-3, #7a837e); margin: 0; display: flex; gap: 6px; align-items: flex-start; }
  .ct-escolha { display: grid; gap: 8px; }
  .ct-opcao { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line-strong, #cfd5cf); border-radius: 12px; cursor: pointer; }
  .ct-opcao:has(input:checked) { border-color: var(--brand, #0c8f4f); background: var(--brand-soft, #e5f3eb); }
  .ct-opcao img { width: 34px; height: 22px; object-fit: contain; }
  .ct-opcao input { accent-color: var(--brand, #0c8f4f); }
  .ct-pagar { display: grid; gap: 10px; }
  @media (max-width: 480px) { .ct-linha { grid-template-columns: 1fr; } }`;
  document.head.appendChild(css);

  // SDK do Mercado Pago: carregado só quando precisa
  let sdkPromessa = null;
  function sdk() {
    if (window.MercadoPago) return Promise.resolve();
    if (!sdkPromessa) sdkPromessa = new Promise((ok, erro) => {
      const sc = document.createElement('script');
      sc.src = 'https://sdk.mercadopago.com/js/v2';
      sc.onload = ok; sc.onerror = () => { sdkPromessa = null; erro(new Error('Não foi possível carregar o Mercado Pago.')); };
      document.head.appendChild(sc);
    });
    return sdkPromessa;
  }
  const estiloCampos = () => {
    const cor = getComputedStyle(document.body).color || '#161b18';
    return { color: cor, fontSize: '15px', fontFamily: 'Figtree, system-ui, sans-serif', placeholderColor: '#8b958f' };
  };
  // Uma instância do Mercado Pago por chave; os campos seguros de uma tela são desmontados antes de criar outros
  let mpInst = null, mpChave = null, montados = [];
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

  const linhaCartao = c => `<img src="${esc(c.imagem || '')}" alt="" onerror="this.style.visibility='hidden'">
    <span class="ct-txt"><b>${esc(c.bandeira)} •••• ${esc(c.final)}</b><small>${esc(c.tipo)}${c.validade ? ` · validade ${esc(c.validade)}` : ''}${c.titular ? ` · ${esc(c.titular)}` : ''}</small></span>
    ${c.vencido ? '<span class="ct-tag">Vencido</span>' : ''}`;

  // ── Minha conta → Meus cartões ──
  async function gerenciar(box) {
    box.innerHTML = '<p class="muted">Carregando seus cartões…</p>';
    let d;
    try { d = await api('/api/conta/cartoes'); } catch (err) { box.innerHTML = `<p class="form-msg err">${esc(err.message)}</p>`; return; }
    if (!d.disponivel) { box.innerHTML = '<p class="muted">O pagamento com cartão ainda não está disponível no site.</p>'; return; }
    const lista = d.cartoes || [];
    box.innerHTML = `
      <div class="ct-lista">${lista.length ? lista.map(c => `<div class="ct-item ${c.vencido ? 'vencido' : ''}">${linhaCartao(c)}
        <button class="btn btn-sm" type="button" data-ct-remover="${esc(c.id)}">Remover</button></div>`).join('')
        : '<p class="muted" style="margin:0">Nenhum cartão salvo ainda. Salve um cartão para pagar seus pedidos mais rápido: na compra, você só digita o código de segurança.</p>'}</div>
      ${lista.length < d.max ? '<button class="btn btn-primary" type="button" data-ct-novo>+ Adicionar cartão</button>' : `<p class="muted">Você já tem ${d.max} cartões salvos (o máximo).</p>`}
      <div data-ct-form hidden></div>`;
    box.querySelector('[data-ct-novo]')?.addEventListener('click', () => abrirForm(box, d));
    box.querySelectorAll('[data-ct-remover]').forEach(b => b.addEventListener('click', async () => {
      const c = lista.find(x => x.id === b.dataset.ctRemover);
      const ok = window.OfertouUI ? await OfertouUI.confirmar(`Remover o cartão ${c.bandeira} final ${c.final}?`) : true;
      if (!ok) return;
      b.disabled = true;
      try { await api(`/api/conta/cartoes/${encodeURIComponent(c.id)}`, { method: 'DELETE' }); gerenciar(box); }
      catch (err) { b.disabled = false; window.OfertouUI ? OfertouUI.avisar(err.message) : alert(err.message); }
    }));
  }

  async function abrirForm(box, d) {
    const f = box.querySelector('[data-ct-form]');
    box.querySelector('[data-ct-novo]').hidden = true;
    f.hidden = false;
    f.innerHTML = `<form class="ct-form" novalidate>
      <label class="ct-rotulo">Número do cartão<div class="ct-campo" id="ct-numero"></div></label>
      <div class="ct-linha">
        <label class="ct-rotulo">Validade<div class="ct-campo" id="ct-validade"></div></label>
        <label class="ct-rotulo">Código de segurança<div class="ct-campo" id="ct-cvv"></div></label>
      </div>
      <div class="ct-linha">
        <label class="ct-rotulo">Nome impresso no cartão<input class="ct-campo" name="titular" autocomplete="cc-name" maxlength="60" required></label>
        <label class="ct-rotulo">CPF do titular<input class="ct-campo" name="cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" required></label>
      </div>
      ${notaSeguranca}
      <p class="form-msg err" data-ct-msg hidden></p>
      <div class="row-actions"><button class="btn" type="button" data-ct-cancelar>Cancelar</button><button class="btn btn-primary" type="submit">Salvar cartão</button></div>
    </form>`;
    const form = f.querySelector('form');
    const msg = t => { const m = form.querySelector('[data-ct-msg]'); m.textContent = t || ''; m.hidden = !t; };
    form.cpf.addEventListener('input', () => { const n = form.cpf.value.replace(/\D/g, '').slice(0, 11); form.cpf.value = n.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); });
    form.querySelector('[data-ct-cancelar]').addEventListener('click', () => { desmontar(); gerenciar(box); });
    let mp;
    try {
      await sdk();
      desmontar();
      mp = mercadoPago(d.public_key);
      campo(mp, 'cardNumber', 'ct-numero', '0000 0000 0000 0000');
      campo(mp, 'expirationDate', 'ct-validade', 'MM/AA');
      campo(mp, 'securityCode', 'ct-cvv', 'CVV');
    } catch { msg('Não foi possível carregar o formulário do Mercado Pago. Recarregue a página.'); return; }
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
        await api('/api/conta/cartoes', { method: 'POST', body: { token: t.id } });
        desmontar();
        if (window.toast) window.toast('Cartão salvo!');
        gerenciar(box);
      } catch (err) {
        const det = Array.isArray(err) ? err : err?.cause;
        msg(Array.isArray(det) || !err?.message ? 'Confira o número, a validade e o código de segurança do cartão.' : err.message);
        btn.disabled = false; btn.textContent = 'Salvar cartão';
      }
    });
  }

  // ── No pedido: escolher um cartão salvo (ou "outro cartão") ──
  // area: elemento onde mostrar; opcoes: { publicKey, total(), maxParcelas, aoPagar({ token, card_id, installments }), outroCartao() }
  async function escolherNoPedido(area, opcoes) {
    let d;
    try { d = await api('/api/conta/cartoes'); } catch { return false; }
    const lista = (d.cartoes || []).filter(c => !c.vencido);
    if (!d.disponivel || !lista.length) return false;
    area.innerHTML = `<div class="ct-escolha">
      ${lista.map((c, i) => `<label class="ct-opcao"><input type="radio" name="ct-escolha" value="${esc(c.id)}" ${i === 0 ? 'checked' : ''}>${linhaCartao(c)}</label>`).join('')}
      <label class="ct-opcao"><input type="radio" name="ct-escolha" value="novo"><span class="ct-txt"><b>Usar outro cartão</b></span></label>
    </div>
    <form class="ct-pagar" data-ct-pagar novalidate>
      <div class="ct-linha">
        <label class="ct-rotulo">Código de segurança<div class="ct-campo" id="ct-cvv-pedido"></div></label>
        <label class="ct-rotulo">Parcelas<select class="ct-campo" name="parcelas"><option value="1">1x</option></select></label>
      </div>
      ${notaSeguranca}
      <p class="form-msg err" data-ct-msg hidden></p>
      <button class="btn btn-primary btn-block" type="submit">Pagar com este cartão</button>
    </form>`;
    const form = area.querySelector('[data-ct-pagar]');
    const msg = t => { const m = form.querySelector('[data-ct-msg]'); m.textContent = t || ''; m.hidden = !t; };
    const escolhido = () => area.querySelector('[name=ct-escolha]:checked')?.value;
    let mp;
    try { await sdk(); desmontar(); mp = mercadoPago(opcoes.publicKey); campo(mp, 'securityCode', 'ct-cvv-pedido', 'CVV'); }
    catch { return false; }
    async function parcelas() {
      const c = lista.find(x => x.id === escolhido());
      const sel = form.parcelas;
      sel.innerHTML = '<option value="1">1x</option>';
      if (!c?.bin) return;
      try {
        const r = await mp.getInstallments({ amount: String(opcoes.total()), bin: c.bin });
        const custos = (r?.[0]?.payer_costs || []).filter(p => p.installments <= (opcoes.maxParcelas || 1));
        if (custos.length) sel.innerHTML = custos.map(p => `<option value="${p.installments}">${esc(p.recommended_message || `${p.installments}x`)}</option>`).join('');
      } catch { /* fica 1x */ }
    }
    area.querySelectorAll('[name=ct-escolha]').forEach(r => r.addEventListener('change', () => {
      if (escolhido() === 'novo') { desmontar(); opcoes.outroCartao(); return; }
      msg(''); parcelas();
    }));
    parcelas();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg('');
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.textContent = 'Processando…';
      try {
        const t = await mp.fields.createCardToken({ cardId: escolhido() });
        await opcoes.aoPagar({ token: t.id, card_id: escolhido(), installments: Number(form.parcelas.value) || 1 });
        desmontar();
      } catch (err) {
        msg(err?.message && !Array.isArray(err) ? err.message : 'Confira o código de segurança do cartão.');
        btn.disabled = false; btn.textContent = 'Pagar com este cartão';
      }
    });
    return { atualizarParcelas: parcelas, desmontar };
  }

  window.OfertouCartoes = { gerenciar, escolherNoPedido, desmontar };
})();
