/* Ofertou! — Loja de cosméticos: molduras animadas compradas com moedas (o XP das conquistas) */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = n => Number(n || 0).toLocaleString('pt-BR');
  let toastTimer;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  async function api(url, method = 'GET') {
    const r = await fetch(url, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = `/conta?voltar=${encodeURIComponent('/cosmeticos')}`; throw new Error('Entre na sua conta.'); }
    if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
    return d;
  }

  let L = null;
  const foto = () => (L.avatar ? `<img src="${esc(L.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : `<span class="pf-avatar-letra">${esc((L.nome || '?')[0])}</span>`);
  function render() {
    $('#cos-moedas').textContent = num(L.moedas);
    $('#cos-grade').innerHTML = L.itens.map(it => {
      const falta = it.preco - L.moedas;
      const acao = it.equipada ? '<button class="btn btn-block" type="button" disabled>✓ Usando agora</button>'
        : it.possui ? `<button class="btn btn-primary btn-block" type="button" data-equipar="${esc(it.id)}">Usar no perfil</button>`
          : `<button class="btn btn-primary btn-block cos-comprar" type="button" data-comprar="${esc(it.id)}" ${falta > 0 ? 'disabled' : ''}>
              <span class="cos-moeda" aria-hidden="true"></span> Comprar por ${num(it.preco)}</button>
            ${falta > 0 ? `<small class="cos-falta">faltam ${num(falta)} moedas</small>` : ''}`;
      return `<article class="cos-item${it.possui ? ' is-sua' : ''}">
        <div class="cos-palco"><span class="pf-avatar pf-moldura-${esc(it.id)}" style="--tam:96px">${foto()}</span></div>
        <div class="cos-info">
          <h2>${esc(it.nome)} ${it.possui ? '<span class="cos-tag">Sua</span>' : ''}</h2>
          <p class="muted">${esc(it.desc)}</p>
          ${acao}
        </div></article>`;
    }).join('');
  }
  async function carregar() {
    try { L = await api('/api/cosmeticos'); render(); } catch (err) { $('#cos-grade').innerHTML = `<p class="form-msg err">${esc(err.message)}</p>`; }
  }
  $('#cos-grade').addEventListener('click', async e => {
    const c = e.target.closest('[data-comprar]'), u = e.target.closest('[data-equipar]');
    if (!c && !u) return;
    const id = (c || u).dataset[c ? 'comprar' : 'equipar'];
    const it = L.itens.find(x => x.id === id);
    try {
      if (c) {
        if (!await OfertouUI.confirmar(`Comprar a moldura ${it.nome} por ${num(it.preco)} moedas? Você fica com ${num(L.moedas - it.preco)} moedas.`, { ok: 'Comprar' })) return;
        L = await api(`/api/cosmeticos/${encodeURIComponent(id)}/comprar`, 'POST');
        render();
        if (await OfertouUI.confirmar(`Moldura ${it.nome} comprada! Quer usar agora no seu perfil?`, { ok: 'Usar agora', cancelar: 'Depois' })) {
          L = await api(`/api/cosmeticos/${encodeURIComponent(id)}/equipar`, 'POST'); render(); toast('Moldura aplicada no seu perfil!');
        }
      } else {
        L = await api(`/api/cosmeticos/${encodeURIComponent(id)}/equipar`, 'POST'); render(); toast('Moldura aplicada no seu perfil!');
      }
    } catch (err) { toast(err.message); }
  });
  carregar();
})();
