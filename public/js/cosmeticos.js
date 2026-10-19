/* Ofertou! — Loja de cosméticos: molduras animadas, efeitos de perfil e de nome (comprados com moedas) e a aba
   "Ganhar moedas" (missões e vídeos patrocinados).
   É um componente: abre por cima da tela em qualquer página (botões com data-abrir-loja, ou OfertouLoja.abrir())
   e também monta a página /cosmeticos. Ao fechar a janela, avisa com o evento "ofertou:loja-fechou" ({ mudou }). */
(() => {
  'use strict';
  if (window.OfertouLoja) return;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = n => Number(n || 0).toLocaleString('pt-BR');
  async function api(url, method = 'GET', body = null) {
    const r = await fetch(url, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = `/conta?voltar=${encodeURIComponent('/cosmeticos')}`; throw new Error('Entre na sua conta.'); }
    if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
    return d;
  }
  const ABAS = ['moldura', 'efeito', 'nome', 'ganhar'];
  const ESTRUTURA = `
    <section class="cos-topo">
      <div>
        <h1><svg class="ico-btn cos-h1-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 8h13l-1 12h-11z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/></svg>Loja de cosméticos</h1>
        <p class="muted">Molduras animadas, efeitos de perfil e efeitos de nome. Compre com <b>moedas</b>: cada XP das conquistas vira uma moeda, e você ganha mais cumprindo <b>missões</b> e assistindo a <b>vídeos patrocinados</b>. Gastar moedas não tira o seu nível.</p>
      </div>
      <div class="cos-saldo" aria-live="polite"><span class="cos-moeda" aria-hidden="true"></span><div><b data-cos="moedas">—</b><small>moedas</small></div></div>
    </section>
    <nav class="cos-abas" role="tablist" aria-label="Seções da loja">
      <button type="button" role="tab" data-aba="moldura" aria-selected="true"><svg class="ico-btn" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5"/></svg>Molduras</button>
      <button type="button" role="tab" data-aba="efeito" aria-selected="false"><svg class="ico-btn" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l1.8 4.6L18.5 10l-4.7 1.6L12 16.5l-1.8-4.9L5.5 10l4.7-1.4z"/><path d="M18 16l.7 1.6 1.6.6-1.6.6L18 20.5l-.7-1.7-1.6-.6 1.6-.6z"/></svg>Efeitos de perfil</button>
      <button type="button" role="tab" data-aba="nome" aria-selected="false"><svg class="ico-btn" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14M12 6.5V19M9 19h6"/></svg>Efeitos de nome</button>
      <button type="button" role="tab" data-aba="ganhar" aria-selected="false" class="cos-aba-ganhar"><svg class="ico-btn" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8.5v7M14.2 10.2c-.4-.9-1.2-1.3-2.2-1.3-1.3 0-2.2.7-2.2 1.6 0 2.2 4.6 1.2 4.6 3.4 0 1-.9 1.7-2.4 1.7-1.1 0-2-.5-2.4-1.4"/></svg>Ganhar moedas</button>
    </nav>
    <div class="cos-grade" data-cos="grade" role="tabpanel"><p class="muted">Carregando…</p></div>
    <div class="cos-ganhar" data-cos="ganhar" role="tabpanel" hidden></div>
    <div class="toast cos-toast" role="status" aria-live="polite"></div>`;

  // Janela do vídeo patrocinado (uma só, compartilhada)
  function dialogoVideo() {
    let d = document.getElementById('cos-video-dlg');
    if (d) return d;
    d = document.createElement('dialog');
    d.className = 'cos-video-dlg'; d.id = 'cos-video-dlg'; d.setAttribute('aria-labelledby', 'cos-video-tit');
    d.innerHTML = `<div class="cos-video-topo"><span class="cos-patrocinado">Patrocinado</span><b id="cos-video-tit"></b><button type="button" class="cos-fechar" data-fechar-video aria-label="Fechar">×</button></div>
      <div class="cos-video-quadro" id="cos-video-quadro"></div>
      <div class="cos-video-rodape"><span id="cos-video-tempo" class="muted"></span><button type="button" class="btn btn-primary" id="cos-video-resgatar" disabled>Resgatar moedas</button></div>`;
    document.body.appendChild(d);
    return d;
  }

  // Monta a loja dentro de "raiz". Devolve { recarregar(aba), mudou() }.
  function montar(raiz, { abaInicial = 'moldura', usarHash = false } = {}) {
    raiz.innerHTML = ESTRUTURA;
    const q = s => raiz.querySelector(s);
    let L = null, G = null, mudou = false, toastTimer;
    let aba = ABAS.includes(abaInicial) ? abaInicial : 'moldura';
    const toast = t => { const el = q('.cos-toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800); };
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
      q('[data-cos="moedas"]').textContent = num(G ? G.moedas : L?.moedas);
      raiz.querySelectorAll('[data-aba]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
      q('[data-cos="grade"]').hidden = aba === 'ganhar';
      q('[data-cos="ganhar"]').hidden = aba !== 'ganhar';
      if (aba === 'ganhar') return renderGanhar();
      if (!L) return;
      q('[data-cos="grade"]').innerHTML = L.itens.filter(it => it.tipo === aba).map(it => {
        const falta = it.preco - L.moedas;
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
      const el = q('[data-cos="ganhar"]');
      if (!G) { el.innerHTML = '<p class="muted">Carregando…</p>'; carregarGanhar(); return; }
      const grupo = (p, tit, sub) => `<section class="cos-bloco"><h2>${tit} <small>${sub}</small></h2><div class="cos-missoes">${G.missoes.filter(m => m.periodo === p).map(m => `
          <div class="cos-missao${m.resgatada ? ' is-feita' : m.completa ? ' is-pronta' : ''}">
            <div><b>${esc(m.nome)}</b><small>${esc(m.desc)}</small>
              <span class="cos-barra"><span style="width:${Math.round(m.atual * 100 / m.meta)}%"></span></span><small>${num(m.atual)} / ${num(m.meta)}</small></div>
            ${m.resgatada ? '<span class="cos-ok">✓ Resgatada</span>'
              : `<button type="button" class="btn btn-sm${m.completa ? ' btn-primary' : ''}" data-missao="${esc(m.id)}" ${m.completa ? '' : 'disabled'}>
                  <span class="cos-moeda" aria-hidden="true"></span> +${num(m.moedas)}</button>`}
          </div>`).join('')}</div></section>`;
      const v = G.videos;
      el.innerHTML = `${grupo('dia', 'Missões diárias', 'renovam à meia-noite')}${grupo('semana', 'Missões semanais', 'renovam toda segunda-feira')}${grupo('unica', 'Missões únicas', 'só uma vez')}
        <section class="cos-bloco"><h2>Vídeos patrocinados <small>${num(v.assistidos_hoje)} de ${num(v.limite)} hoje · assista até o fim para ganhar</small></h2>
          ${v.itens.length ? `<div class="cos-videos">${v.itens.map(x => `
            <div class="cos-video"><span class="cos-patrocinado">Patrocinado</span><b>${esc(x.titulo)}</b><small>${esc(x.anunciante)} · ${num(x.duracao_s)} s</small>
              ${x.visto_hoje ? '<span class="cos-ok">✓ Assistido hoje</span>'
                : `<button type="button" class="btn btn-sm btn-primary" data-video="${x.id}" ${v.assistidos_hoje >= v.limite ? 'disabled' : ''}><svg class="ico-btn" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>Assistir · +${num(x.moedas)}</button>`}</div>`).join('')}</div>`
            : '<p class="muted">Nenhum vídeo patrocinado no momento. Volte mais tarde!</p>'}
        </section>
        <section class="cos-bloco"><h2>Extrato <small>últimas movimentações (o XP das conquistas entra direto no saldo)</small></h2>
          ${G.extrato.length ? `<ul class="cos-extrato">${G.extrato.map(x => `<li><span>${esc(x.descricao)}</span><b class="${x.valor < 0 ? 'neg' : 'pos'}">${x.valor > 0 ? '+' : ''}${num(x.valor)}</b></li>`).join('')}</ul>`
            : '<p class="muted">Nenhuma movimentação ainda.</p>'}
        </section>`;
    }
    async function carregarGanhar() {
      try { G = await api('/api/moedas'); if (aba === 'ganhar') render(); } catch (err) { q('[data-cos="ganhar"]').innerHTML = `<p class="form-msg err">${esc(err.message)}</p>`; }
    }
    async function carregar() {
      try { L = await api('/api/cosmeticos'); G = null; render(); } catch (err) { q('[data-cos="grade"]').innerHTML = `<p class="form-msg err">${esc(err.message)}</p>`; }
    }
    const atualizarSaldo = d => { if (G) G.moedas = d.moedas; if (L) L.moedas = d.moedas; };
    const irPara = a => { aba = a; if (usarHash) history.replaceState(null, '', `#${aba}`); render(); };

    // ── Vídeo patrocinado: conta o tempo só com a página visível (e o vídeo tocando, quando é arquivo) ──
    let sessao = null, relogio = null;
    const dv = dialogoVideo();
    function fecharVideo() {
      clearInterval(relogio); relogio = null; sessao = null;
      dv.querySelector('#cos-video-quadro').innerHTML = '';
      if (dv.open) dv.close();
    }
    async function abrirVideo(id) {
      const r = await api(`/api/moedas/videos/${id}/iniciar`, 'POST');
      sessao = { token: r.token, visto: 0 };
      const v = r.video;
      dv.querySelector('#cos-video-tit').textContent = `${v.titulo} — ${v.anunciante}`;
      dv.querySelector('#cos-video-quadro').innerHTML = v.youtube
        ? `<iframe src="https://www.youtube-nocookie.com/embed/${esc(v.youtube)}?autoplay=1&rel=0&modestbranding=1" title="${esc(v.titulo)}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
        : `<video src="${esc(v.mp4)}" autoplay playsinline controls controlslist="nodownload noplaybackrate" disablepictureinpicture></video>`;
      const btn = dv.querySelector('#cos-video-resgatar');
      btn.disabled = true; btn.textContent = `Resgatar +${num(v.moedas)} moedas`;
      btn.onclick = async () => {
        if (!sessao) return;
        btn.disabled = true;
        try { G = await api('/api/moedas/videos/resgatar', 'POST', { token: sessao.token }); atualizarSaldo(G); mudou = true; fecharVideo(); render(); toast('Moedas do vídeo resgatadas!'); }
        catch (err) { toast(err.message); btn.disabled = false; }
      };
      const tempo = dv.querySelector('#cos-video-tempo');
      const tick = () => {
        const video = dv.querySelector('video');
        if (!document.hidden && (!video || !video.paused)) sessao.visto++;
        const falta = Math.max(0, v.duracao_s - sessao.visto);
        tempo.textContent = falta ? `Faltam ${falta} s para ganhar as moedas` : 'Pronto! Resgate as suas moedas.';
        if (!falta) { btn.disabled = false; clearInterval(relogio); }
      };
      tick();
      relogio = setInterval(tick, 1000);
      dv.onclick = e => { if (e.target.closest('[data-fechar-video]')) fecharVideo(); };
      dv.oncancel = fecharVideo;
      dv.showModal();
    }

    // ── Cliques ──
    raiz.addEventListener('click', async e => {
      const ab = e.target.closest('[data-aba]');
      if (ab) { irPara(ab.dataset.aba); return; }
      if (e.target.closest('[data-ir-ganhar]')) { e.preventDefault(); irPara('ganhar'); return; }
      const c = e.target.closest('[data-comprar]'), u = e.target.closest('[data-equipar]'), t = e.target.closest('[data-tirar]');
      const m = e.target.closest('[data-missao]'), v = e.target.closest('[data-video]');
      try {
        if (m) { m.disabled = true; G = await api(`/api/moedas/missoes/${encodeURIComponent(m.dataset.missao)}/resgatar`, 'POST'); atualizarSaldo(G); mudou = true; render(); toast('Moedas resgatadas!'); return; }
        if (v) { await abrirVideo(v.dataset.video); return; }
        if (!c && !u && !t) return;
        const id = (c || u || t).dataset[c ? 'comprar' : u ? 'equipar' : 'tirar'];
        const it = L.itens.find(x => x.id === id);
        if (c) {
          if (!await OfertouUI.confirmar(`Comprar ${it.nome} por ${num(it.preco)} moedas? Você fica com ${num(L.moedas - it.preco)} moedas.`, { ok: 'Comprar' })) return;
          L = await api(`/api/cosmeticos/${encodeURIComponent(id)}/comprar`, 'POST'); G = null; mudou = true; render();
          if (await OfertouUI.confirmar(`${it.nome} é seu! Quer usar agora no seu perfil?`, { ok: 'Usar agora', cancelar: 'Depois' })) {
            L = await api(`/api/cosmeticos/${encodeURIComponent(id)}/equipar`, 'POST'); render(); toast('Aplicado no seu perfil!');
          }
        } else if (u) { L = await api(`/api/cosmeticos/${encodeURIComponent(id)}/equipar`, 'POST'); mudou = true; render(); toast('Aplicado no seu perfil!'); }
        else { L = await api(`/api/cosmeticos/${encodeURIComponent(id)}/tirar`, 'POST'); mudou = true; render(); toast('Removido do seu perfil.'); }
      } catch (err) { toast(err.message); if (m) m.disabled = false; }
    });
    carregar();
    return {
      recarregar(novaAba) { if (novaAba && ABAS.includes(novaAba)) aba = novaAba; mudou = false; carregar(); },
      mudou: () => mudou,
    };
  }

  // ── Janela por cima da tela ──
  let janela = null, loja = null, aberta = false;
  // Avisa a página uma vez por fechamento (botão ✕, clique fora, Esc ou o próprio "close" do navegador)
  function avisarFechou() {
    if (!aberta) return;
    aberta = false;
    window.dispatchEvent(new CustomEvent('ofertou:loja-fechou', { detail: { mudou: loja.mudou() } }));
  }
  function fechar() { if (janela.open) janela.close(); avisarFechou(); }
  function abrir(aba = 'moldura') {
    if (!janela) {
      janela = document.createElement('dialog');
      janela.className = 'cos-dlg';
      janela.setAttribute('aria-label', 'Loja de cosméticos');
      janela.innerHTML = '<button type="button" class="cos-dlg-fechar" aria-label="Fechar a loja">✕</button><div class="cos-page"></div>';
      document.body.appendChild(janela);
      loja = montar(janela.querySelector('.cos-page'), { abaInicial: aba });
      janela.querySelector('.cos-dlg-fechar').addEventListener('click', fechar);
      janela.addEventListener('click', e => { if (e.target === janela) fechar(); }); // clique fora fecha
      janela.addEventListener('cancel', e => { e.preventDefault(); fechar(); }); // Esc
      janela.addEventListener('close', avisarFechou);
    } else {
      loja.recarregar(aba);
    }
    aberta = true;
    janela.showModal();
    janela.scrollTop = 0;
  }
  // Qualquer botão/link com data-abrir-loja abre a loja por cima (sem sair da página)
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-abrir-loja]');
    if (!b || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    abrir(b.dataset.abrirLoja || 'moldura');
  });

  window.OfertouLoja = { abrir, fechar: () => janela && fechar(), montar };
  // Página /cosmeticos: monta direto na página
  const pagina = document.getElementById('cos-raiz');
  if (pagina) {
    const h = location.hash.slice(1);
    montar(pagina, { abaInicial: ABAS.includes(h) ? h : 'moldura', usarHash: true });
  }
})();
