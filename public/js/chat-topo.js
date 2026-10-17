/* Ofertou! — Mensagens flutuante: botão no canto inferior direito (com o número de não lidas e pedidos de
   mensagem) que abre um painel com as conversas, sem sair da página. A tela completa continua em /mensagens. */
(() => {
  'use strict';
  if (location.pathname.startsWith('/mensagens')) return;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const hora = s => {
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    return new Date().toDateString() === d.toDateString()
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };
  async function api(url, body) {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
    return d;
  }
  const avatar = p => (p.avatar ? `<img class="chatf-av" src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="chatf-av chatf-av-letra">${esc((p.nome || '?').charAt(0).toUpperCase())}</span>`);

  // Botão e painel
  const raiz = document.createElement('div');
  raiz.className = 'chatf';
  raiz.hidden = true;
  raiz.innerHTML = `
    <section class="chatf-painel" id="chatf-painel" hidden aria-label="Mensagens">
      <header class="chatf-topo">
        <button class="chatf-icone" type="button" data-chatf="voltar" hidden aria-label="Voltar">‹</button>
        <div class="chatf-titulo" id="chatf-titulo"><b>Mensagens</b></div>
        <a class="chatf-icone" href="/mensagens" id="chatf-cheia" title="Abrir em tela cheia" aria-label="Abrir em tela cheia">⤢</a>
        <button class="chatf-icone" type="button" data-chatf="fechar" aria-label="Fechar">✕</button>
      </header>
      <div class="chatf-corpo" id="chatf-corpo"></div>
      <div class="chatf-banner" id="chatf-banner" hidden></div>
      <form class="chatf-escrever" id="chatf-form" hidden>
        <textarea name="texto" rows="1" maxlength="2000" placeholder="Escreva uma mensagem…"></textarea>
        <button class="btn btn-primary btn-sm" type="submit">Enviar</button>
      </form>
    </section>
    <button class="chatf-botao" type="button" id="chatf-botao" aria-label="Mensagens" aria-expanded="false">
      <svg class="ico-linha" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z"/><path d="M8 8.5h8M8 11.5h5"/></svg><span class="chatf-botao-txt">Mensagens</span><b class="chatf-n" hidden></b>
    </button>`;
  document.body.appendChild(raiz);
  const $ = s => raiz.querySelector(s);
  const painel = $('#chatf-painel'), corpo = $('#chatf-corpo'), form = $('#chatf-form'), banner = $('#chatf-banner');
  let ATUAL = null, MSGS = [], timer = null;

  // ── Contador ─────────────────────────────────────────────────────────────
  async function atualizarContador() {
    try {
      const r = await api('/api/chat/resumo');
      raiz.hidden = !r.logado;
      const n = (r.nao_lidas || 0) + (r.pedidos || 0);
      const b = $('.chatf-n');
      b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
      $('#chatf-botao').title = r.pedidos ? `${r.pedidos} pedido(s) de mensagem esperando sua resposta` : n ? `${n} mensagem(ns) não lida(s)` : 'Mensagens';
    } catch { /* sem conexão */ }
  }

  // ── Lista ────────────────────────────────────────────────────────────────
  async function mostrarLista() {
    ATUAL = null; clearInterval(timer);
    $('[data-chatf="voltar"]').hidden = true;
    $('#chatf-titulo').innerHTML = '<b>Mensagens</b>';
    $('#chatf-cheia').href = '/mensagens';
    form.hidden = true; banner.hidden = true;
    corpo.innerHTML = '<p class="chatf-vazio">Carregando…</p>';
    try {
      const d = await api('/api/chat/conversas');
      const lista = d.conversas.sort((a, b) => (b.pedido_para_mim - a.pedido_para_mim));
      corpo.innerHTML = lista.length ? lista.map(c => `
        <button type="button" class="chatf-item${c.nao_lidas || c.pedido_para_mim ? ' tem-novas' : ''}" data-conv="${c.id}">
          ${avatar(c.outro)}
          <span class="chatf-item-txt"><b>${esc(c.outro.nome)}</b>
            <small>${c.pedido_para_mim ? '<em>Quer conversar com você</em>' : c.status === 'pendente' ? '<em>Aguardando aceitar</em>'
              : c.status === 'bloqueada' ? 'Bloqueada' : c.ultima ? `${c.ultima.minha ? 'Você: ' : ''}${esc(c.ultima.texto)}` : ''}</small></span>
          <span class="chatf-item-lado"><small>${hora(c.ultima_msg_at)}</small>${c.nao_lidas ? `<b class="chatf-n-item">${c.nao_lidas}</b>` : c.pedido_para_mim ? '<b class="chatf-n-item">!</b>' : ''}</span>
        </button>`).join('')
        : '<p class="chatf-vazio">Nenhuma conversa ainda. Abra o perfil de alguém ou a página de uma loja para começar.</p>';
    } catch (err) { corpo.innerHTML = `<p class="chatf-vazio">${esc(err.message)}</p>`; }
  }

  // ── Conversa ─────────────────────────────────────────────────────────────
  async function abrirConversa(id) {
    const d = await api(`/api/chat/conversas/${id}`);
    ATUAL = d.conversa; MSGS = d.mensagens;
    $('[data-chatf="voltar"]').hidden = false;
    $('#chatf-cheia').href = `/mensagens?c=${id}`;
    cabecalho();
    render(true);
    clearInterval(timer);
    timer = setInterval(() => { if (document.visibilityState === 'visible') novas().catch(() => {}); }, 4000);
    atualizarContador();
  }
  function cabecalho() {
    const c = ATUAL, o = c.outro;
    const href = o.loja_slug ? `/loja/${o.loja_slug}` : o.slug ? `/perfil/${o.slug}` : '#';
    $('#chatf-titulo').innerHTML = `<a href="${href}">${avatar(o)}<span><b>${esc(o.nome)}</b><small>${c.tipo === 'loja' ? (c.minha_loja ? 'Cliente da sua loja' : 'Atendimento da loja') : 'Conversa pessoal'} · ${esc(c.ticket)}</small></span></a>`;
    banner.hidden = true; form.hidden = false;
    if (c.pedido_para_mim) {
      banner.hidden = false;
      banner.innerHTML = `<p><b>${esc(o.nome)}</b> quer conversar com você. Aceita receber mensagens?</p>
        <div class="chatf-acoes"><button class="btn btn-primary btn-sm" type="button" data-resp="aceitar">Aceitar</button>
        <button class="btn btn-sm" type="button" data-resp="recusar">Recusar</button><button class="btn btn-sm danger-txt" type="button" data-resp="bloquear">Bloquear</button></div>`;
    } else if (c.status === 'pendente') {
      banner.hidden = false; banner.innerHTML = `<p>Pedido enviado: você pode mandar até 3 mensagens até ${esc(o.nome)} aceitar.</p>`;
    } else if (c.status === 'recusada' || c.status === 'bloqueada') {
      form.hidden = true; banner.hidden = false;
      banner.innerHTML = `<p>${c.status === 'recusada' ? `${esc(o.nome)} recusou receber suas mensagens.` : c.bloqueada_por_mim ? 'Você bloqueou esta conversa (desbloqueie na tela cheia).' : 'Esta conversa foi bloqueada.'}</p>`;
    }
  }
  function render(rolar) {
    const noFim = corpo.scrollHeight - corpo.scrollTop - corpo.clientHeight < 60;
    corpo.innerHTML = MSGS.map(m => {
      if (m.sistema) return `<div class="chatf-sis">${esc(m.texto)}${m.pedido_id ? ` <a href="/mensagens?c=${ATUAL.id}&pedido=${m.pedido_id}">Ver pedido</a>` : ''}</div>`;
      return `<div class="chatf-bolha ${m.minha ? 'minha' : 'dele'}"><p>${esc(m.texto).replace(/\n/g, '<br>')}</p><small>${hora(m.em)}</small></div>`;
    }).join('') || '<p class="chatf-vazio">Nenhuma mensagem ainda. Diga olá!</p>';
    if (rolar || noFim) corpo.scrollTop = corpo.scrollHeight;
  }
  async function novas() {
    if (!ATUAL) return;
    const ult = MSGS.length ? MSGS[MSGS.length - 1].id : 0;
    const d = await api(`/api/chat/conversas/${ATUAL.id}?depois=${ult}`);
    const mudou = d.conversa.status !== ATUAL.status;
    ATUAL = d.conversa;
    // (duas atualizações ao mesmo tempo não repetem mensagens)
    const vistas = new Set(MSGS.map(m => m.id));
    const novasMsgs = d.mensagens.filter(m => !vistas.has(m.id));
    if (novasMsgs.length) { MSGS = MSGS.concat(novasMsgs); render(novasMsgs.some(m => m.minha)); }
    if (mudou) cabecalho();
  }

  // ── Eventos ──────────────────────────────────────────────────────────────
  function abrirPainel() {
    painel.hidden = false;
    $('#chatf-botao').setAttribute('aria-expanded', 'true');
    raiz.classList.add('is-aberto');
    mostrarLista();
  }
  function fecharPainel() {
    painel.hidden = true;
    $('#chatf-botao').setAttribute('aria-expanded', 'false');
    raiz.classList.remove('is-aberto');
    clearInterval(timer); ATUAL = null;
    atualizarContador();
  }
  $('#chatf-botao').addEventListener('click', () => (painel.hidden ? abrirPainel() : fecharPainel()));
  raiz.addEventListener('click', async e => {
    if (e.target.closest('[data-chatf="fechar"]')) return fecharPainel();
    if (e.target.closest('[data-chatf="voltar"]')) return mostrarLista();
    const c = e.target.closest('[data-conv]');
    if (c) return abrirConversa(Number(c.dataset.conv)).catch(err => { corpo.innerHTML = `<p class="chatf-vazio">${esc(err.message)}</p>`; });
    const r = e.target.closest('[data-resp]');
    if (r && ATUAL) {
      if (r.dataset.resp === 'bloquear' && !confirm('Bloquear esta pessoa? Ela não poderá mais mandar mensagens para você.')) return;
      try {
        ATUAL = await api(`/api/chat/conversas/${ATUAL.id}/responder`, { acao: r.dataset.resp });
        if (r.dataset.resp === 'recusar') return mostrarLista();
        cabecalho(); await novas(); atualizarContador();
      } catch (err) { alert(err.message); }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !painel.hidden) fecharPainel(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const t = form.texto.value.trim();
    if (!t || !ATUAL) return;
    form.querySelector('button').disabled = true;
    try {
      await api(`/api/chat/conversas/${ATUAL.id}/mensagens`, { texto: t });
      form.texto.value = ''; form.texto.style.height = '';
      const antes = ATUAL.status;
      await novas();
      if (antes !== ATUAL.status) cabecalho();
    } catch (err) { alert(err.message); }
    form.querySelector('button').disabled = false;
    form.texto.focus();
  });
  form.texto.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.texto.addEventListener('input', e => { e.target.style.height = ''; e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`; });

  // Outras partes do site podem abrir uma conversa direto no painel (ex.: OfertouChat.abrir(12))
  window.OfertouChat = { abrir: id => { abrirPainel(); abrirConversa(Number(id)).catch(() => {}); } };

  atualizarContador();
  setInterval(() => { if (document.visibilityState === 'visible' && painel.hidden) atualizarContador(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizarContador(); });
})();
