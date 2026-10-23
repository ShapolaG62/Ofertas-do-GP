/* Ofertou! — Mensagens flutuante: botão no canto inferior direito (com o número de não lidas e pedidos de
   mensagem) que abre um painel com as conversas, sem sair da página. É o lugar das mensagens no site: os links
   para /mensagens (e-mails, pedidos) abrem este painel. Mostra também os pedidos (Pix, pagamento e ações). */
(() => {
  'use strict';
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
        <button class="chatf-icone" type="button" data-chatf="menu" hidden title="Bloquear ou desbloquear" aria-label="Bloquear ou desbloquear">⋯</button>
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
  let ATUAL = null, MSGS = [], timer = null, MODO = 'chat', RESUMO = {}, contagemAntes = null;
  const tituloOriginal = document.title.replace(/^\(\d+\+?\)\s*/, '');

  // ── Contador ─────────────────────────────────────────────────────────────
  async function atualizarContador() {
    try {
      const r = await api('/api/chat/resumo');
      raiz.hidden = !r.logado;
      RESUMO = r;
      const n = (r.nao_lidas || 0) + (r.pedidos || 0) + (r.sac || 0) + (r.sac_atendente ? r.sac_atendente.fila + r.sac_atendente.nao_lidas : 0);
      const b = $('.chatf-n');
      b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
      // Chegou mensagem nova: o número vermelho pulsa e o botão fica destacado até a pessoa abrir
      if (contagemAntes !== null && n > contagemAntes) {
        b.classList.remove('chatf-pulso'); void b.offsetWidth; b.classList.add('chatf-pulso');
        $('#chatf-botao').classList.add('tem-novas');
      }
      if (!n) $('#chatf-botao').classList.remove('tem-novas');
      contagemAntes = n;
      const base = document.title.replace(/^\(\d+\+?\)\s*/, '') || tituloOriginal;
      document.title = n ? `(${n > 99 ? '99+' : n}) ${base}` : base;
      $('#chatf-botao').title = r.pedidos ? `${r.pedidos} pedido(s) de mensagem esperando sua resposta` : n ? `${n} mensagem(ns) não lida(s)` : 'Mensagens';
      sino.hidden = !r.logado;
      const sn = sino.querySelector('.sino-n');
      sn.hidden = !r.notificacoes; sn.textContent = r.notificacoes > 99 ? '99+' : r.notificacoes;
    } catch { /* sem conexão */ }
  }

  // ── Sino de notificações (no topo, ao lado dos botões): pedido pago, avisos do site… ──
  const sino = document.createElement('button');
  sino.type = 'button';
  sino.className = 'btn btn-sm sino-btn';
  sino.hidden = true;
  sino.setAttribute('aria-label', 'Notificações');
  sino.innerHTML = '<svg class="ico-linha" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg><b class="sino-n" hidden></b>';
  const acoesTopo = document.querySelector('.header-actions');
  if (acoesTopo) acoesTopo.insertBefore(sino, acoesTopo.firstChild);
  const sinoPop = document.createElement('div');
  sinoPop.className = 'sino-pop';
  sinoPop.hidden = true;
  document.body.appendChild(sinoPop);
  const quando = t => new Date(String(t).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  async function abrirSino() {
    const r = sino.getBoundingClientRect();
    sinoPop.style.top = `${Math.round(r.bottom + 8)}px`;
    sinoPop.style.right = `${Math.max(8, Math.round(document.documentElement.clientWidth - r.right))}px`;
    sinoPop.hidden = false;
    // Nunca sai pela esquerda da tela (no celular o sino fica longe da borda direita)
    const p = sinoPop.getBoundingClientRect();
    if (p.left < 8) sinoPop.style.right = `${Math.max(8, Math.round(document.documentElement.clientWidth - 8 - p.width))}px`;
    sinoPop.innerHTML = '<p class="sino-vazio">Carregando…</p>';
    try {
      const d = await api('/api/notificacoes');
      sinoPop.innerHTML = `<div class="sino-topo"><b>Notificações</b></div>${d.itens.length ? d.itens.map(n => `
        <a class="sino-item${n.lida ? '' : ' nova'}" href="${esc(n.link || '#')}" data-sino-link="${esc(n.link || '')}"><b>${esc(n.titulo)}</b>${n.texto ? `<span>${esc(n.texto)}</span>` : ''}<small>${quando(n.created_at)}</small></a>`).join('')
        : '<p class="sino-vazio">Nenhuma notificação ainda.</p>'}`;
      if (d.nao_lidas) { await api('/api/notificacoes/lidas', {}); atualizarContador(); }
    } catch { sinoPop.innerHTML = '<p class="sino-vazio">Não foi possível carregar.</p>'; }
  }
  sino.addEventListener('click', e => { e.stopPropagation(); if (sinoPop.hidden) abrirSino(); else sinoPop.hidden = true; });
  document.addEventListener('click', e => { if (!sinoPop.hidden && !e.target.closest('.sino-pop')) sinoPop.hidden = true; });
  sinoPop.addEventListener('click', e => {
    const a = e.target.closest('[data-sino-link]');
    if (!a) return;
    // Links de conversa/pedido abrem no painel de mensagens, sem sair da página
    if (a.dataset.sinoLink === '/sac/meu') { e.preventDefault(); sinoPop.hidden = true; window.OfertouChat.sac(); return; }
    const m = /^\/mensagens\?c=(\d+)(?:&pedido=(\d+))?/.exec(a.dataset.sinoLink);
    if (m) { e.preventDefault(); sinoPop.hidden = true; window.OfertouChat.abrir(Number(m[1]), m[2] ? Number(m[2]) : null); }
  });

  // ── Lista ────────────────────────────────────────────────────────────────
  async function mostrarLista() {
    ATUAL = null; MODO = 'chat'; clearInterval(timer);
    $('[data-chatf="voltar"]').hidden = true;
    $('#chatf-titulo').innerHTML = '<b>Mensagens</b>';
    $('[data-chatf="menu"]').hidden = true;
    form.hidden = true; banner.hidden = true;
    corpo.innerHTML = '<p class="chatf-vazio">Carregando…</p>';
    try {
      const d = await api('/api/chat/conversas');
      const lista = d.conversas.sort((a, b) => (b.pedido_para_mim - a.pedido_para_mim));
      const sa = RESUMO.sac_atendente;
      const topo = (sa?.admin ? "" : `<button type="button" class="chatf-item chatf-sac${RESUMO.sac ? ' tem-novas' : ''}" data-sac>
          <span class="chatf-av chatf-av-sac">${ICO_SAC}</span>
          <span class="chatf-item-txt"><b>Suporte Ofertou!</b><small>Dúvidas? Fale com a nossa equipe</small></span>
          <span class="chatf-item-lado">${RESUMO.sac ? `<b class="chatf-n-item">${RESUMO.sac}</b>` : ''}</span></button>`)+`
        ${sa ? `<a class="chatf-item chatf-sac-fila${sa.fila || sa.nao_lidas ? ' tem-novas' : ''}" href="${sa.admin ? '/admin#sac' : '/trabalho#sac'}">
          <span class="chatf-av chatf-av-sac">${ICO_FILA}</span>
          <span class="chatf-item-txt"><b>Fila do SAC</b><small>${sa.fila} na fila · ${sa.meus} com você</small></span>
          <span class="chatf-item-lado">${sa.fila + sa.nao_lidas ? `<b class="chatf-n-item">${sa.fila + sa.nao_lidas}</b>` : ''}</span></a>` : ''}`;
      corpo.innerHTML = topo + (lista.length ? lista.map(c => `
        <button type="button" class="chatf-item${c.nao_lidas || c.pedido_para_mim ? ' tem-novas' : ''}" data-conv="${c.id}">
          ${avatar(c.outro)}
          <span class="chatf-item-txt"><b>${esc(c.outro.nome)}</b>
            <small>${c.pedido_para_mim ? '<em>Quer conversar com você</em>' : c.status === 'pendente' ? '<em>Aguardando aceitar</em>'
              : c.status === 'bloqueada' ? 'Bloqueada' : c.ultima ? `${c.ultima.minha ? 'Você: ' : ''}${esc(c.ultima.texto)}` : ''}</small></span>
          <span class="chatf-item-lado"><small>${hora(c.ultima_msg_at)}</small>${c.nao_lidas ? `<b class="chatf-n-item">${c.nao_lidas}</b>` : c.pedido_para_mim ? '<b class="chatf-n-item">!</b>' : ''}</span>
        </button>`).join('')
        : '<p class="chatf-vazio">Nenhuma conversa ainda. Abra o perfil de alguém ou a página de uma loja para começar.</p>');
    } catch (err) { corpo.innerHTML = `<p class="chatf-vazio">${esc(err.message)}</p>`; }
  }

  // ── Conversa ─────────────────────────────────────────────────────────────
  let pedidoFoco = null;
  async function abrirConversa(id, foco = null) {
    const d = await api(`/api/chat/conversas/${id}`);
    MODO = 'chat';
    form.texto.placeholder = 'Escreva uma mensagem…';
    ATUAL = d.conversa; MSGS = d.mensagens;
    pedidoFoco = foco;
    $('[data-chatf="voltar"]').hidden = false;
    $('[data-chatf="menu"]').hidden = false;
    cabecalho();
    await render(true);
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
      banner.innerHTML = `<p>${c.status === 'recusada' ? `${esc(o.nome)} recusou receber suas mensagens.` : c.bloqueada_por_mim ? 'Você bloqueou esta conversa (desbloqueie no menu ⋯).' : 'Esta conversa foi bloqueada.'}</p>`;
    }
  }
  // Pedidos: a última mensagem de cada pedido mostra o cartão (situação, valores, Pix/pagamento e ações)
  const PEDIDOS = {};
  const ROTULO = {
    confirmar_pagamento: ['Confirmar pagamento recebido', 'btn-primary'],
    enviado: ['Marcar como enviado', ''], concluido: ['Concluir pedido', ''], recebido: ['Recebi o pedido', 'btn-primary'], cancelar: ['Cancelar pedido', 'danger-txt'],
  };
  function cartaoPedido(p) {
    const pg = p.pagamento;
    return `<div class="chatf-pedido${pedidoFoco === p.id ? ' is-foco' : ''}" data-pedido="${p.id}">
      <div class="chatf-pedido-topo"><b>Pedido ${esc(p.codigo)}</b><span class="status-pill st-${esc(p.status)}">${esc(p.status_nome)}</span></div>
      <div class="chatf-pedido-prod"><img src="/img/o/${p.oferta_id}.jpg" alt="" referrerpolicy="no-referrer">
        <div><b>${esc(p.produto)}</b><span>${p.quantidade}x ${brl(p.preco_unit)}${p.taxa_valor ? ` + taxa do site ${brl(p.taxa_valor)}` : ''}</span>
        <span><b>Total ${brl(p.total)}</b> · ${esc(p.metodo_nome)}</span>${p.observacao ? `<span class="muted">Obs.: ${esc(p.observacao)}</span>` : ''}</div></div>
      ${pg && pg.pix ? `<div class="chatf-pix pix-pagar">
        ${pg.qr ? `<img class="pix-qr" src="data:image/png;base64,${esc(pg.qr)}" alt="QR code do Pix" width="180" height="180">` : ''}
        <span>Pague <b>${brl(p.total)}</b> com Pix: abra o app do banco e leia o QR code ou use o copia e cola.</span>
        <div class="ass-copia"><input readonly value="${esc(pg.pix)}" aria-label="Código Pix"><button class="btn btn-sm" type="button" data-copiar="${esc(pg.pix)}">Copiar</button></div>
        <small class="pix-aguarde"><span class="live-dot"></span> Aguardando o pagamento — a confirmação é automática${pg.expira ? `. O Pix vale até ${new Date(String(pg.expira).replace(' ', 'T') + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}.</small></div>` : ''}
      ${pg && pg.cartao ? `<div class="chatf-pix"><a class="btn btn-primary btn-sm" href="${esc(pg.cartao)}" target="_blank" rel="noopener">Pagar ${brl(p.total)} com cartão ↗</a>
        <small class="pix-aguarde"><span class="live-dot"></span> Pagamento seguro pelo Mercado Pago. A confirmação é automática.</small></div>` : ''}
      ${p.eu === 'loja' && p.gateway === 'mp' && p.valor_loja !== undefined && p.status !== 'cancelado' ? `<small class="muted">Você recebe no seu Mercado Pago: <b>${brl(p.valor_loja)}</b>${p.tarifa_mp ? ` (produtos menos a tarifa do Mercado Pago de ${brl(p.tarifa_mp)})` : ''}</small>` : ''}
      ${p.instrucoes ? `<small class="muted">${esc(p.instrucoes)}</small>` : ''}
      <small class="aviso-resp-mini">O Ofertou! não se responsabiliza pela venda, entrega, troca ou garantia: é com a loja parceira.</small>
      ${p.acoes.length ? `<div class="chatf-acoes">${p.acoes.map(a => `<button class="btn btn-sm ${ROTULO[a][1]}" type="button" data-pacao="${a}" data-pid="${p.id}">${ROTULO[a][0]}</button>`).join('')}</div>` : ''}
    </div>`;
  }
  async function render(rolar) {
    const noFim = corpo.scrollHeight - corpo.scrollTop - corpo.clientHeight < 60;
    const ultimo = {};
    MSGS.forEach((m, i) => { if (m.pedido_id) ultimo[m.pedido_id] = i; });
    await Promise.all([...new Set(MSGS.filter(m => m.pedido_id).map(m => m.pedido_id))]
      .map(async id => { try { PEDIDOS[id] = await api(`/api/pedidos/${id}`); } catch { /* sem acesso */ } }));
    corpo.innerHTML = MSGS.map((m, i) => {
      if (m.sistema) return `<div class="chatf-sis">${esc(m.texto)}</div>${m.pedido_id && ultimo[m.pedido_id] === i && PEDIDOS[m.pedido_id] ? cartaoPedido(PEDIDOS[m.pedido_id]) : ''}`;
      return `<div class="chatf-bolha ${m.minha ? 'minha' : 'dele'}"><p>${esc(m.texto).replace(/\n/g, '<br>')}</p><small>${hora(m.em)}</small></div>`;
    }).join('') || '<p class="chatf-vazio">Nenhuma mensagem ainda. Diga olá!</p>';
    const foco = pedidoFoco && corpo.querySelector(`[data-pedido="${pedidoFoco}"]`);
    if (foco && rolar) { foco.scrollIntoView({ block: 'center' }); return; }
    if (rolar || noFim) corpo.scrollTop = corpo.scrollHeight;
  }
  // Mercado Pago esperando pagamento: confere de tempos em tempos (a confirmação vira mensagem)
  let ultimaConferencia = 0;
  function conferirMP() {
    if (Date.now() - ultimaConferencia < 10000) return;
    ultimaConferencia = Date.now();
    Object.values(PEDIDOS).filter(p => p.gateway === 'mp' && p.status === 'aguardando_pagamento')
      .forEach(p => api(`/api/pedidos/${p.id}`).catch(() => {}));
  }
  async function novas(forcar = false) {
    if (!ATUAL) return;
    conferirMP();
    const ult = MSGS.length ? MSGS[MSGS.length - 1].id : 0;
    const d = await api(`/api/chat/conversas/${ATUAL.id}?depois=${ult}`);
    const mudou = d.conversa.status !== ATUAL.status;
    ATUAL = d.conversa;
    // (duas atualizações ao mesmo tempo não repetem mensagens)
    const vistas = new Set(MSGS.map(m => m.id));
    const novasMsgs = d.mensagens.filter(m => !vistas.has(m.id));
    if (novasMsgs.length || forcar) { MSGS = MSGS.concat(novasMsgs); await render(novasMsgs.some(m => m.minha)); }
    if (mudou) cabecalho();
  }

  // ── SAC: suporte da equipe Ofertou! (chamado → fila → atendente) ─────────
  const ICO_SAC = '<svg class="ico-linha" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19a3 3 0 0 1-3 3h-3"/></svg>';
  const ICO_FILA = '<svg class="ico-linha" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';
  let SAC = null, SAC_MSGS = [], SAC_ASSUNTOS = {};
  function cabecalhoSac() {
    const st = SAC ? `${esc(SAC.codigo)} · ${SAC.status === 'fila' ? `Na fila${SAC.posicao ? ` (posição ${SAC.posicao})` : ''}`
      : SAC.status === 'atendimento' ? `Em atendimento com ${esc(SAC.atendente?.nome || 'a equipe')}` : 'Resolvido'}` : 'Tire suas dúvidas com a nossa equipe';
    $('#chatf-titulo').innerHTML = `<span class="chatf-sac-tit"><span class="chatf-av chatf-av-sac">${ICO_SAC}</span><span><b>Suporte Ofertou!</b><small>${st}</small></span></span>`;
  }
  function renderSac(rolar) {
    cabecalhoSac();
    if (!SAC) {
      form.hidden = true; banner.hidden = true;
      corpo.innerHTML = `<form class="chatf-sac-novo" id="sac-novo">
        <p>Conte sua dúvida: ela entra na fila e o primeiro atendente livre responde aqui mesmo. Você recebe um aviso no sino 🔔 e no e-mail.</p>
        <a class="btn btn-sm btn-block guia-btn" href="/ajuda"><svg class="ico-btn" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5V5.5M8 7h8M8 11h6"/></svg>Antes, veja o Guia do usuário</a>
        <label>Assunto<select name="assunto">${Object.entries(SAC_ASSUNTOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <label>Sua mensagem<textarea name="texto" rows="5" maxlength="2000" required placeholder="Ex.: fiz um pedido e o pagamento não aparece…"></textarea></label>
        <button class="btn btn-primary btn-block" type="submit">Entrar na fila de atendimento</button>
      </form>`;
      return;
    }
    corpo.innerHTML = SAC_MSGS.map(m => {
      if (!m.autor) return `<div class="chatf-sis">${esc(m.texto)}</div>`;
      const minha = m.autor === SAC.cliente.dono;
      return `<div class="chatf-bolha ${minha ? 'minha' : 'dele'}">${minha ? '' : `<small class="chatf-autor">${esc(m.autor_nome)}</small>`}<p>${esc(m.texto).replace(/\n/g, '<br>')}</p><small>${hora(m.created_at)}</small></div>`;
    }).join('');
    form.hidden = false; banner.hidden = false;
    form.texto.placeholder = SAC.status === 'resolvido' ? 'Escreva para abrir um novo chamado…' : 'Escreva para o suporte…';
    if (SAC.status === 'resolvido') {
      banner.innerHTML = SAC.nota ? `<p>Obrigado pela avaliação (${'★'.repeat(SAC.nota)})! Precisa de mais ajuda? É só escrever.</p>`
        : `<p>Como foi o atendimento?</p><div class="chatf-estrelas">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-sac-nota="${n}" title="${n} de 5">★</button>`).join('')}</div>`;
    } else {
      banner.innerHTML = `<p>${SAC.status === 'fila' ? `Você está na fila${SAC.posicao ? ` — <b>posição ${SAC.posicao}</b>` : ''}. Pode continuar escrevendo.` : `<b>${esc(SAC.atendente?.nome || 'Um atendente')}</b> está te atendendo.`}</p>
        <div class="chatf-acoes"><button class="btn btn-sm" type="button" data-sac-acao="encerrar">Encerrar chamado</button></div>`;
    }
    if (rolar) corpo.scrollTop = corpo.scrollHeight;
  }
  function aplicarSac(d) {
    SAC = d.chamado; SAC_MSGS = d.mensagens; if (d.assuntos) SAC_ASSUNTOS = d.assuntos;
    renderSac(true);
  }
  async function abrirSac() {
    ATUAL = null; MODO = 'sac'; clearInterval(timer);
    $('[data-chatf="voltar"]').hidden = false;
    $('[data-chatf="menu"]').hidden = true;
    form.hidden = true; banner.hidden = true;
    corpo.innerHTML = '<p class="chatf-vazio">Carregando…</p>';
    aplicarSac(await api('/api/sac/meu'));
    timer = setInterval(() => { if (document.visibilityState === 'visible') novasSac().catch(() => {}); }, 4000);
    atualizarContador();
  }
  async function novasSac() {
    if (MODO !== 'sac') return;
    const ult = SAC_MSGS.length ? SAC_MSGS[SAC_MSGS.length - 1].id : 0;
    const d = await api(`/api/sac/meu?depois=${ult}`);
    if (MODO !== 'sac') return;
    if (!d.chamado || !SAC || d.chamado.id !== SAC.id) { if (d.chamado?.id !== SAC?.id) aplicarSac(await api('/api/sac/meu')); return; }
    const vistas = new Set(SAC_MSGS.map(m => m.id));
    const novasMsgs = d.mensagens.filter(m => !vistas.has(m.id));
    const mudou = d.chamado.status !== SAC.status || d.chamado.posicao !== SAC.posicao || d.chamado.atendente?.dono !== SAC.atendente?.dono;
    SAC = d.chamado;
    if (novasMsgs.length || mudou) { SAC_MSGS = SAC_MSGS.concat(novasMsgs); renderSac(novasMsgs.length > 0); }
  }
  async function enviarSac(t) {
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      aplicarSac(await api(`/api/sac/${SAC.id}/mensagem`, { texto: t }));
      form.texto.value = ''; form.texto.style.height = '';
    } catch (err) { OfertouUI.avisar(err.message); }
    btn.disabled = false;
    form.texto.focus();
  }
  raiz.addEventListener('submit', async e => {
    if (e.target.id !== 'sac-novo') return;
    e.preventDefault();
    const fn = e.target, btn = fn.querySelector('button');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try { aplicarSac(await api('/api/sac', { assunto: fn.assunto.value, texto: fn.texto.value })); atualizarContador(); }
    catch (err) { OfertouUI.avisar(err.message); btn.disabled = false; btn.textContent = 'Entrar na fila de atendimento'; }
  });


  // ── Eventos ──────────────────────────────────────────────────────────────
  function abrirPainel(lista = true) {
    painel.hidden = false;
    $('#chatf-botao').setAttribute('aria-expanded', 'true');
    raiz.classList.add('is-aberto');
    $('#chatf-botao').classList.remove('tem-novas');
    if (lista) mostrarLista();
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
    const cp = e.target.closest('[data-copiar]');
    if (cp) { navigator.clipboard.writeText(cp.dataset.copiar).then(() => { cp.textContent = 'Copiado!'; setTimeout(() => { cp.textContent = 'Copiar'; }, 1500); }); return; }
    const pa = e.target.closest('[data-pacao]');
    if (pa && ATUAL) {
      const acao = pa.dataset.pacao;
      let motivo = '';
      if (acao === 'cancelar') { motivo = await OfertouUI.perguntar('Motivo do cancelamento (opcional):'); if (motivo === null) return; }
      else if (acao === 'confirmar_pagamento' && !await OfertouUI.confirmar('Confirma que o valor do pedido já caiu na sua conta?')) return;
      pa.disabled = true;
      try { await api(`/api/pedidos/${pa.dataset.pid}/acao`, { acao, motivo }); await novas(true); } catch (err) { OfertouUI.avisar(err.message); pa.disabled = false; }
      return;
    }
    if (e.target.closest('[data-chatf="menu"]') && ATUAL) {
      const desbloquear = ATUAL.status === 'bloqueada' && ATUAL.bloqueada_por_mim;
      if (ATUAL.status === 'bloqueada' && !desbloquear) return OfertouUI.avisar('Esta conversa foi bloqueada pela outra pessoa.');
      if (!await OfertouUI.confirmar(desbloquear ? 'Desbloquear esta conversa?' : `Bloquear ${ATUAL.outro.nome}? Ninguém poderá mandar mensagens nesta conversa.`)) return;
      try { ATUAL = await api(`/api/chat/conversas/${ATUAL.id}/responder`, { acao: desbloquear ? 'desbloquear' : 'bloquear' }); cabecalho(); await novas(true); } catch (err) { OfertouUI.avisar(err.message); }
      return;
    }
    if (e.target.closest('[data-sac]')) return abrirSac().catch(err => { corpo.innerHTML = `<p class="chatf-vazio">${esc(err.message)}</p>`; });
    const sacAcao = e.target.closest('[data-sac-acao]');
    if (sacAcao && SAC) {
      if (sacAcao.dataset.sacAcao === 'encerrar' && !await OfertouUI.confirmar('Encerrar o chamado? Se precisar depois, é só escrever de novo.')) return;
      try { aplicarSac(await api(`/api/sac/${SAC.id}/encerrar`, {})); } catch (err) { OfertouUI.avisar(err.message); }
      return;
    }
    const sacNota = e.target.closest('[data-sac-nota]');
    if (sacNota && SAC) {
      try { aplicarSac(await api(`/api/sac/${SAC.id}/avaliar`, { nota: Number(sacNota.dataset.sacNota) })); } catch (err) { OfertouUI.avisar(err.message); }
      return;
    }
    const c = e.target.closest('[data-conv]');
    if (c) return abrirConversa(Number(c.dataset.conv)).catch(err => { corpo.innerHTML = `<p class="chatf-vazio">${esc(err.message)}</p>`; });
    const r = e.target.closest('[data-resp]');
    if (r && ATUAL) {
      if (r.dataset.resp === 'bloquear' && !await OfertouUI.confirmar('Bloquear esta pessoa? Ela não poderá mais mandar mensagens para você.')) return;
      try {
        ATUAL = await api(`/api/chat/conversas/${ATUAL.id}/responder`, { acao: r.dataset.resp });
        if (r.dataset.resp === 'recusar') return mostrarLista();
        cabecalho(); await novas(); atualizarContador();
      } catch (err) { OfertouUI.avisar(err.message); }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !painel.hidden) fecharPainel(); });
  document.addEventListener('pointerdown', e => {
    if (painel.hidden || raiz.contains(e.target)) return;
    // não fecha ao usar as janelas do site (confirmar, avisar), o sino ou botões que abrem conversas
    if (e.target.closest('dialog, .oui, .oui-fundo, .sino-pop, .sino-btn, [data-chat-abrir], [data-open-chat]')) return;
    fecharPainel();
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const t = form.texto.value.trim();
    if (MODO === 'sac') { if (t) enviarSac(t); return; }
    if (!t || !ATUAL) return;
    form.querySelector('button').disabled = true;
    try {
      await api(`/api/chat/conversas/${ATUAL.id}/mensagens`, { texto: t });
      form.texto.value = ''; form.texto.style.height = '';
      const antes = ATUAL.status;
      await novas();
      if (antes !== ATUAL.status) cabecalho();
    } catch (err) { OfertouUI.avisar(err.message); }
    form.querySelector('button').disabled = false;
    form.texto.focus();
  });
  form.texto.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.texto.addEventListener('input', e => { e.target.style.height = ''; e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`; });

  // Outras partes do site podem abrir uma conversa direto no painel (ex.: OfertouChat.abrir(12))
  window.OfertouChat = {
    abrir: (id, pedido = null) => { abrirPainel(false); abrirConversa(Number(id), pedido ? Number(pedido) : null).catch(() => mostrarLista()); },
    sac: () => { raiz.hidden = false; abrirPainel(false); abrirSac().catch(() => mostrarLista()); },
  };

  // Link para uma conversa (?chat=ID&pedido=ID, vindo de /mensagens, e-mails ou do pedido): abre direto no painel
  const qs = new URLSearchParams(location.search);
  if (qs.has('sac')) { // /sac/meu (avisos e e-mails): abre o chamado no painel
    qs.delete('sac');
    history.replaceState(null, '', location.pathname + (qs.toString() ? `?${qs}` : '') + location.hash);
    setTimeout(() => window.OfertouChat.sac(), 0);
  }
  if (qs.has('chat')) {
    const id = Number(qs.get('chat')), ped = Number(qs.get('pedido')) || null;
    qs.delete('chat'); qs.delete('pedido');
    history.replaceState(null, '', location.pathname + (qs.toString() ? `?${qs}` : '') + location.hash);
    setTimeout(() => { raiz.hidden = false; if (id) window.OfertouChat.abrir(id, ped); else abrirPainel(); }, 0);
  }

  atualizarContador();
  setInterval(() => { if (document.visibilityState === 'visible' && painel.hidden) atualizarContador(); }, 10000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizarContador(); });
})();
