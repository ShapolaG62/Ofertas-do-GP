/* Ofertou! — Loja de cosméticos: molduras animadas, efeitos de perfil e de nome (comprados com moedas) e a aba
   "Ganhar moedas" (missões e vídeos patrocinados). */
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
  async function api(url, method = 'GET', body = null) {
    const r = await fetch(url, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = `/conta?voltar=${encodeURIComponent('/cosmeticos')}`; throw new Error('Entre na sua conta.'); }
    if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
    return d;
  }

  let L = null, G = null, aba = (location.hash.slice(1) || 'moldura');
  const ABAS = ['moldura', 'efeito', 'nome', 'ganhar'];
  if (!ABAS.includes(aba)) aba = 'moldura';
  const foto = () => (L.avatar ? `<img src="${esc(L.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : `<span class="pf-avatar-letra">${esc((L.nome || '?')[0])}</span>`);
  const moldura = () => esc(L.itens.find(i => i.tipo === 'moldura' && i.equipada)?.id || L.moldura || 'nenhuma');

  // Prévia de cada tipo de item, com a foto e o nome da própria pessoa
  function previa(it) {
    if (it.tipo === 'moldura') return `<div class="cos-palco"><span class="pf-avatar pf-moldura-${esc(it.id)}" style="--tam:96px">${foto()}</span></div>`;
    if (it.tipo === 'efeito') return `<div class="cos-palco cos-palco-topo"><div class="pf-efeito pf-${esc(it.id)}" aria-hidden="true"></div>
      <span class="pf-avatar pf-moldura-${moldura()}" style="--tam:56px">${foto()}</span><b class="cos-palco-nome">${esc(L.nome)}</b></div>`;
    return `<div class="cos-palco"><b class="cos-nome-grande pf-${esc(it.id)}" data-texto="${esc(L.nome)}">${esc(L.nome)}</b></div>`;
  }
  function render() {
    $('#cos-moedas').textContent = num(G ? G.moedas : L.moedas);
    document.querySelectorAll('[data-aba]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
    $('#cos-grade').hidden = aba === 'ganhar';
    $('#cos-ganhar').hidden = aba !== 'ganhar';
    if (aba === 'ganhar') return renderGanhar();
    const moedas = L.moedas;
    $('#cos-grade').innerHTML = L.itens.filter(it => it.tipo === aba).map(it => {
      const falta = it.preco - moedas;
      const acao = it.equipada ? `<button class="btn btn-block" type="button" data-tirar="${esc(it.id)}">✓ Usando · tirar</button>`
        : it.possui ? `<button class="btn btn-primary btn-block" type="button" data-equipar="${esc(it.id)}">Usar no perfil</button>`
          : `<button class="btn btn-primary btn-block cos-comprar" type="button" data-comprar="${esc(it.id)}" ${falta > 0 ? 'disabled' : ''}>
              <span class="cos-moeda" aria-hidden="true"></span> Comprar por ${num(it.preco)}</button>
            ${falta > 0 ? `<small class="cos-falta">faltam ${num(falta)} moedas · <a href="#ganhar" data-ir-ganhar>ganhar moedas</a></small>` : ''}`;
      return `<article class="cos-item${it.possui ? ' is-sua' : ''}">${previa(it)}
        <div class="cos-info"><h2>${esc(it.nome)} ${it.possui ? '<span class="cos-tag">Sua</span>' : ''}</h2><p class="muted">${esc(it.desc)}</p>${acao}</div></article>`;
    }).join('');
  }

  // ── Ganhar moedas ──
  function renderGanhar() {
    const el = $('#cos-ganhar');
    if (!G) { el.innerHTML = '<p class="muted">Carregando…</p>'; carregarGanhar(); return; }
    const grupo = (p, tit, sub) => {
      const ms = G.missoes.filter(m => m.periodo === p);
      return `<section class="cos-bloco"><h2>${tit} <small>${sub}</small></h2><div class="cos-missoes">${ms.map(m => `
        <div class="cos-missao${m.resgatada ? ' is-feita' : m.completa ? ' is-pronta' : ''}">
          <div><b>${esc(m.nome)}</b><small>${esc(m.desc)}</small>
            <span class="cos-barra"><span style="width:${Math.round(m.atual * 100 / m.meta)}%"></span></span><small>${num(m.atual)} / ${num(m.meta)}</small></div>
          ${m.resgatada ? '<span class="cos-ok">✓ Resgatada</span>'
            : `<button type="button" class="btn btn-sm${m.completa ? ' btn-primary' : ''}" data-missao="${esc(m.id)}" ${m.completa ? '' : 'disabled'}>
                <span class="cos-moeda" aria-hidden="true"></span> +${num(m.moedas)}</button>`}
        </div>`).join('')}</div></section>`;
    };
    const v = G.videos;
    el.innerHTML = `${grupo('dia', 'Missões diárias', 'renovam à meia-noite')}${grupo('semana', 'Missões semanais', 'renovam toda segunda-feira')}${grupo('unica', 'Missões únicas', 'só uma vez')}
      <section class="cos-bloco"><h2>Vídeos patrocinados <small>${num(v.assistidos_hoje)} de ${num(v.limite)} hoje · assista até o fim para ganhar</small></h2>
        ${v.itens.length ? `<div class="cos-videos">${v.itens.map(x => `
          <div class="cos-video"><span class="cos-patrocinado">Patrocinado</span><b>${esc(x.titulo)}</b><small>${esc(x.anunciante)} · ${num(x.duracao_s)} s</small>
            ${x.visto_hoje ? '<span class="cos-ok">✓ Assistido hoje</span>'
              : `<button type="button" class="btn btn-sm btn-primary" data-video="${x.id}" ${v.assistidos_hoje >= v.limite ? 'disabled' : ''}>▶ Assistir · +${num(x.moedas)}</button>`}</div>`).join('')}</div>`
          : '<p class="muted">Nenhum vídeo patrocinado no momento. Volte mais tarde!</p>'}
      </section>
      <section class="cos-bloco"><h2>Extrato <small>últimas movimentações (o XP das conquistas entra direto no saldo)</small></h2>
        ${G.extrato.length ? `<ul class="cos-extrato">${G.extrato.map(x => `<li><span>${esc(x.descricao)}</span><b class="${x.valor < 0 ? 'neg' : 'pos'}">${x.valor > 0 ? '+' : ''}${num(x.valor)}</b></li>`).join('')}</ul>`
          : '<p class="muted">Nenhuma movimentação ainda.</p>'}
      </section>`;
  }
  async function carregarGanhar() {
    try { G = await api('/api/moedas'); if (aba === 'ganhar') render(); } catch (err) { $('#cos-ganhar').innerHTML = `<p class="form-msg err">${esc(err.message)}</p>`; }
  }
  async function carregar() {
    try { L = await api('/api/cosmeticos'); render(); } catch (err) { $('#cos-grade').innerHTML = `<p class="form-msg err">${esc(err.message)}</p>`; }
  }
  const atualizarSaldo = d => { if (G) G.moedas = d.moedas; if (L) L.moedas = d.moedas; };

  // ── Vídeo patrocinado: conta o tempo só com a página visível (e o vídeo tocando, quando é arquivo) ──
  let sessao = null, relogio = null;
  function fecharVideo() {
    clearInterval(relogio); relogio = null; sessao = null;
    $('#cos-video-quadro').innerHTML = '';
    if ($('#cos-video-dlg').open) $('#cos-video-dlg').close();
  }
  async function abrirVideo(id) {
    const r = await api(`/api/moedas/videos/${id}/iniciar`, 'POST');
    sessao = { token: r.token, video: r.video, visto: 0 };
    const v = r.video;
    $('#cos-video-tit').textContent = `${v.titulo} — ${v.anunciante}`;
    $('#cos-video-quadro').innerHTML = v.youtube
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${esc(v.youtube)}?autoplay=1&rel=0&modestbranding=1" title="${esc(v.titulo)}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
      : `<video src="${esc(v.mp4)}" autoplay playsinline controls controlslist="nodownload noplaybackrate" disablepictureinpicture></video>`;
    const btn = $('#cos-video-resgatar');
    btn.disabled = true; btn.textContent = `Resgatar +${num(v.moedas)} moedas`;
    const tempo = $('#cos-video-tempo');
    const tick = () => {
      const video = $('#cos-video-quadro video');
      if (!document.hidden && (!video || !video.paused)) sessao.visto++;
      const falta = Math.max(0, v.duracao_s - sessao.visto);
      tempo.textContent = falta ? `Faltam ${falta} s para ganhar as moedas` : 'Pronto! Resgate as suas moedas.';
      if (!falta) { btn.disabled = false; clearInterval(relogio); }
    };
    tick();
    relogio = setInterval(tick, 1000);
    $('#cos-video-dlg').showModal();
  }
  $('#cos-video-dlg').addEventListener('click', e => { if (e.target.closest('[data-fechar]')) fecharVideo(); });
  $('#cos-video-dlg').addEventListener('cancel', fecharVideo);
  $('#cos-video-resgatar').addEventListener('click', async () => {
    if (!sessao) return;
    const b = $('#cos-video-resgatar'); b.disabled = true;
    try { G = await api('/api/moedas/videos/resgatar', 'POST', { token: sessao.token }); atualizarSaldo(G); fecharVideo(); render(); toast('Moedas do vídeo resgatadas!'); }
    catch (err) { toast(err.message); b.disabled = false; }
  });

  // ── Cliques ──
  document.querySelector('.cos-abas').addEventListener('click', e => {
    const b = e.target.closest('[data-aba]');
    if (!b) return;
    aba = b.dataset.aba; history.replaceState(null, '', `#${aba}`); render();
  });
  document.querySelector('.cos-page').addEventListener('click', async e => {
    if (e.target.closest('[data-ir-ganhar]')) { e.preventDefault(); aba = 'ganhar'; history.replaceState(null, '', '#ganhar'); render(); return; }
    const c = e.target.closest('[data-comprar]'), u = e.target.closest('[data-equipar]'), t = e.target.closest('[data-tirar]');
    const m = e.target.closest('[data-missao]'), v = e.target.closest('[data-video]');
    try {
      if (m) { m.disabled = true; G = await api(`/api/moedas/missoes/${encodeURIComponent(m.dataset.missao)}/resgatar`, 'POST'); atualizarSaldo(G); render(); toast('Moedas resgatadas!'); return; }
      if (v) { await abrirVideo(v.dataset.video); return; }
      if (!c && !u && !t) return;
      const id = (c || u || t).dataset[c ? 'comprar' : u ? 'equipar' : 'tirar'];
      const it = L.itens.find(x => x.id === id);
      if (c) {
        if (!await OfertouUI.confirmar(`Comprar ${it.nome} por ${num(it.preco)} moedas? Você fica com ${num(L.moedas - it.preco)} moedas.`, { ok: 'Comprar' })) return;
        L = await api(`/api/cosmeticos/${encodeURIComponent(id)}/comprar`, 'POST'); G = null; render();
        if (await OfertouUI.confirmar(`${it.nome} é seu! Quer usar agora no seu perfil?`, { ok: 'Usar agora', cancelar: 'Depois' })) {
          L = await api(`/api/cosmeticos/${encodeURIComponent(id)}/equipar`, 'POST'); render(); toast('Aplicado no seu perfil!');
        }
      } else if (u) { L = await api(`/api/cosmeticos/${encodeURIComponent(id)}/equipar`, 'POST'); render(); toast('Aplicado no seu perfil!'); }
      else { L = await api(`/api/cosmeticos/${encodeURIComponent(id)}/tirar`, 'POST'); render(); toast('Removido do seu perfil.'); }
    } catch (err) { toast(err.message); if (m) m.disabled = false; }
  });
  carregar();
})();
