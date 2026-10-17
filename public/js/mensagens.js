/* Ofertou! — mensagens: conversas pessoais (com pedido de mensagem), atendimento das lojas e pedidos */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const quando = s => {
    if (!s) return '';
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    const hoje = new Date().toDateString() === d.toDateString();
    return hoje ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };
  const hora = s => new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const params = new URLSearchParams(location.search);

  let toastTimer;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  async function api(url, body) {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = `/conta?voltar=${encodeURIComponent(location.pathname + location.search)}`; throw new Error('Entre na sua conta.'); }
    if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
    return d;
  }
  const avatar = p => (p.avatar ? `<img class="msg-av" src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="msg-av msg-av-letra">${esc((p.nome || '?').charAt(0).toUpperCase())}</span>`);

  // ── Lista ────────────────────────────────────────────────────────────────
  let CONVS = [];
  let filtro = 'todas';
  let ATUAL = null;    // conversa aberta
  let MSGS = [];
  const PEDIDOS = {};  // cache dos pedidos mostrados na conversa

  async function carregarLista() {
    const d = await api('/api/chat/conversas');
    CONVS = d.conversas;
    renderLista();
  }
  function renderLista() {
    const n = CONVS.filter(c => c.pedido_para_mim).length;
    $('#n-pedidos').hidden = !n; $('#n-pedidos').textContent = n;
    const lista = CONVS.filter(c => filtro === 'todas' ? true : filtro === 'pedidos' ? c.pedido_para_mim : c.tipo === 'loja');
    $('#msg-itens').innerHTML = lista.length ? lista.map(c => `
      <button type="button" class="msg-item${ATUAL && ATUAL.id === c.id ? ' is-ativa' : ''}${c.nao_lidas || c.pedido_para_mim ? ' tem-novas' : ''}" data-conv="${c.id}">
        ${avatar(c.outro)}
        <span class="msg-item-txt">
          <b>${esc(c.outro.nome)}${c.tipo === 'loja' ? ` <small class="msg-tag">${c.minha_loja ? 'cliente da sua loja' : 'loja'}</small>` : ''}</b>
          <small>${c.pedido_para_mim ? '<em>Quer conversar com você</em>' : c.status === 'pendente' ? '<em>Aguardando aceitar</em>'
            : c.status === 'bloqueada' ? '<em>Bloqueada</em>' : c.status === 'recusada' ? '<em>Recusada</em>'
            : c.ultima ? `${c.ultima.minha ? 'Você: ' : ''}${esc(c.ultima.texto)}` : ''}</small>
        </span>
        <span class="msg-item-lado"><small>${quando(c.ultima_msg_at)}</small>${c.nao_lidas ? `<b class="msg-n">${c.nao_lidas}</b>` : c.pedido_para_mim ? '<b class="msg-n">!</b>' : ''}</span>
      </button>`).join('')
      : `<p class="muted msg-vazio">${filtro === 'pedidos' ? 'Nenhum pedido de mensagem esperando você.' : filtro === 'loja' ? 'Nenhum atendimento de loja ainda.' : 'Nenhuma conversa ainda. Abra o perfil de alguém ou a página de uma loja para começar.'}</p>`;
  }
  $('.msg-filtros').addEventListener('click', e => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    filtro = b.dataset.filtro;
    $$('.msg-filtros button').forEach(x => x.setAttribute('aria-current', x === b));
    renderLista();
  });
  $('#msg-itens').addEventListener('click', e => {
    const b = e.target.closest('[data-conv]');
    if (b) abrir(Number(b.dataset.conv));
  });

  // ── Conversa ─────────────────────────────────────────────────────────────
  async function abrir(id, pedidoFoco = null) {
    const d = await api(`/api/chat/conversas/${id}`);
    ATUAL = d.conversa; MSGS = d.mensagens;
    history.replaceState(null, '', `/mensagens?c=${id}${pedidoFoco ? `&pedido=${pedidoFoco}` : ''}`);
    document.body.classList.add('msg-aberta');
    $('#msg-placeholder').hidden = true;
    $('#msg-ativa').hidden = false;
    renderCabeca();
    await renderMensagens(true, pedidoFoco);
    const c = CONVS.find(x => x.id === id);
    if (c) c.nao_lidas = 0;
    renderLista();
    $('#msg-form').texto.focus({ preventScroll: true });
  }

  function renderCabeca() {
    const c = ATUAL;
    const o = c.outro;
    const href = o.loja_slug ? `/loja/${o.loja_slug}` : o.slug ? `/perfil/${o.slug}` : '#';
    $('#msg-quem').href = href;
    $('#msg-quem').innerHTML = `${avatar(o)}<span><b>${esc(o.nome)}</b><small>${c.tipo === 'loja' ? (c.minha_loja ? 'Cliente da sua loja' : 'Atendimento da loja') : 'Conversa pessoal'}${c.oferta ? ` · ${esc(c.oferta.produto.slice(0, 50))}` : ''}</small></span>`;
    $('#msg-ticket').textContent = c.ticket;
    const banner = $('#msg-pedido-banner');
    const form = $('#msg-form'), aviso = $('#msg-aviso');
    banner.hidden = true; form.hidden = false; aviso.hidden = true;
    if (c.pedido_para_mim) {
      banner.hidden = false;
      banner.innerHTML = `<p><b>${esc(o.nome)}</b> quer conversar com você. Deseja receber mensagens dessa pessoa?</p>
        <div class="row-actions"><button class="btn btn-primary btn-sm" data-resp="aceitar">Aceitar</button>
        <button class="btn btn-sm" data-resp="recusar">Recusar</button><button class="btn btn-sm danger-txt" data-resp="bloquear">Bloquear</button></div>
        <p class="muted" style="margin:6px 0 0;font-size:12.5px">Responder também aceita a conversa. Ao recusar, a pessoa só pode pedir de novo depois de 30 dias.</p>`;
    } else if (c.status === 'pendente') {
      aviso.hidden = false;
      aviso.textContent = `Pedido de mensagem enviado. Você pode mandar até 3 mensagens até ${o.nome} aceitar.`;
    } else if (c.status === 'recusada') {
      form.hidden = true; aviso.hidden = false;
      aviso.textContent = `${o.nome} recusou receber mensagens suas.`;
    } else if (c.status === 'bloqueada') {
      form.hidden = true; aviso.hidden = false;
      aviso.textContent = c.bloqueada_por_mim ? 'Você bloqueou esta conversa. Use o menu ⋯ para desbloquear.' : 'Esta conversa foi bloqueada.';
    }
  }
  $('#msg-pedido-banner').addEventListener('click', async e => {
    const b = e.target.closest('[data-resp]');
    if (!b) return;
    if (b.dataset.resp === 'bloquear' && !confirm('Bloquear esta pessoa? Ela não poderá mais mandar mensagens para você.')) return;
    try {
      ATUAL = await api(`/api/chat/conversas/${ATUAL.id}/responder`, { acao: b.dataset.resp });
      toast(b.dataset.resp === 'aceitar' ? 'Conversa aceita.' : b.dataset.resp === 'recusar' ? 'Pedido recusado.' : 'Bloqueado.');
      if (b.dataset.resp === 'recusar') { voltarLista(); }
      else { await atualizar(); renderCabeca(); }
      carregarLista();
    } catch (err) { toast(err.message); }
  });
  $('#msg-menu').addEventListener('click', async () => {
    if (!ATUAL) return;
    const desbloquear = ATUAL.status === 'bloqueada' && ATUAL.bloqueada_por_mim;
    if (ATUAL.status === 'bloqueada' && !desbloquear) return toast('Esta conversa foi bloqueada pela outra pessoa.');
    if (!confirm(desbloquear ? 'Desbloquear esta conversa?' : `Bloquear ${ATUAL.outro.nome}? Ninguém poderá mandar mensagens nesta conversa.`)) return;
    try {
      ATUAL = await api(`/api/chat/conversas/${ATUAL.id}/responder`, { acao: desbloquear ? 'desbloquear' : 'bloquear' });
      await atualizar(); renderCabeca(); carregarLista();
    } catch (err) { toast(err.message); }
  });

  // Mensagens: a última mensagem de cada pedido mostra o cartão do pedido (situação, pagamento e ações)
  async function renderMensagens(rolarFim = false, pedidoFoco = null) {
    const hist = $('#msg-historico');
    const noFim = hist.scrollHeight - hist.scrollTop - hist.clientHeight < 80;
    const ultimoDoPedido = {};
    MSGS.forEach((m, i) => { if (m.pedido_id) ultimoDoPedido[m.pedido_id] = i; });
    const ids = [...new Set(MSGS.filter(m => m.pedido_id).map(m => m.pedido_id))];
    await Promise.all(ids.map(async id => { try { PEDIDOS[id] = await api(`/api/pedidos/${id}`); } catch { /* sem acesso */ } }));
    let dia = '';
    hist.innerHTML = MSGS.map((m, i) => {
      const d = new Date(String(m.em).replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
      const sep = d !== dia ? `<div class="msg-dia">${(dia = d)}</div>` : '';
      if (m.pedido_id && ultimoDoPedido[m.pedido_id] === i && PEDIDOS[m.pedido_id]) return sep + `<div class="msg-sis">${esc(m.texto)}</div>` + cartaoPedido(PEDIDOS[m.pedido_id]);
      if (m.sistema) return `${sep}<div class="msg-sis">${esc(m.texto)}</div>`;
      return `${sep}<div class="msg-bolha ${m.minha ? 'minha' : 'dele'}"><p>${esc(m.texto).replace(/\n/g, '<br>')}</p><small>${hora(m.em)}</small></div>`;
    }).join('') || '<p class="muted msg-vazio">Nenhuma mensagem ainda. Diga olá!</p>';
    if (pedidoFoco) {
      const el = hist.querySelector(`[data-pedido="${pedidoFoco}"]`);
      if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('is-foco'); return; }
    }
    if (rolarFim || noFim) hist.scrollTop = hist.scrollHeight;
  }

  const ROTULO = {
    informar_pagamento: ['Já paguei', 'btn-primary'], confirmar_pagamento: ['Confirmar pagamento recebido', 'btn-primary'],
    enviado: ['Marcar como enviado', ''], concluido: ['Concluir pedido', ''], recebido: ['Recebi o pedido', 'btn-primary'], cancelar: ['Cancelar pedido', 'danger-txt'],
  };
  function cartaoPedido(p) {
    const pg = p.pagamento;
    return `<div class="msg-pedido" data-pedido="${p.id}">
      <div class="msg-pedido-topo"><b>Pedido ${esc(p.codigo)}</b><span class="status-pill st-${esc(p.status)}">${esc(p.status_nome)}</span></div>
      <div class="msg-pedido-prod">${p.imagem ? `<img src="/api/img/${p.oferta_id}" alt="" referrerpolicy="no-referrer">` : ''}
        <div><b>${esc(p.produto)}</b><span>${p.quantidade}x ${brl(p.preco_unit)} · <b>${brl(p.total)}</b></span><span>Pagamento: ${esc(p.metodo_nome)}</span>
        ${p.observacao ? `<span class="muted">Obs.: ${esc(p.observacao)}</span>` : ''}</div></div>
      ${pg && pg.pix ? `<div class="msg-pix"><span>Pix copia e cola (valor ${brl(p.total)} para <b>${esc(pg.recebedor)}</b>):</span>
        <div class="ass-copia"><input readonly value="${esc(pg.pix)}" aria-label="Código Pix"><button class="btn btn-sm" type="button" data-copiar="${esc(pg.pix)}">Copiar</button></div>
        <small class="muted">No app do banco: Pix → Pix copia e cola. Depois toque em "Já paguei".</small></div>` : ''}
      ${pg && pg.link ? `<div class="msg-pix"><a class="btn btn-primary btn-sm" href="${esc(pg.link)}" target="_blank" rel="noopener nofollow">Pagar com cartão (link da loja) ↗</a>
        <small class="muted">Pague ${brl(p.total)} no link e depois toque em "Já paguei".</small></div>` : ''}
      ${p.instrucoes ? `<p class="muted" style="margin:6px 0 0;font-size:12.5px">${esc(p.instrucoes)}</p>` : ''}
      ${p.acoes.length ? `<div class="row-actions">${p.acoes.map(a => `<button class="btn btn-sm ${ROTULO[a][1]}" type="button" data-pacao="${a}" data-pid="${p.id}">${ROTULO[a][0]}</button>`).join('')}</div>` : ''}
    </div>`;
  }
  $('#msg-historico').addEventListener('click', async e => {
    const cp = e.target.closest('[data-copiar]');
    if (cp) return navigator.clipboard.writeText(cp.dataset.copiar).then(() => toast('Código Pix copiado!'));
    const b = e.target.closest('[data-pacao]');
    if (!b) return;
    const acao = b.dataset.pacao;
    let motivo = '';
    if (acao === 'cancelar') {
      motivo = prompt('Motivo do cancelamento (opcional):');
      if (motivo === null) return;
    } else if (acao === 'confirmar_pagamento' && !confirm('Confirma que o valor do pedido já caiu na sua conta?')) return;
    b.disabled = true;
    try {
      await api(`/api/pedidos/${b.dataset.pid}/acao`, { acao, motivo });
      toast('Pedido atualizado.');
      await atualizar(true);
    } catch (err) { toast(err.message); b.disabled = false; }
  });

  async function atualizar(forcar = false) {
    if (!ATUAL) return;
    const ultimo = MSGS.length ? MSGS[MSGS.length - 1].id : 0;
    const d = await api(`/api/chat/conversas/${ATUAL.id}?depois=${ultimo}`);
    const mudouStatus = d.conversa.status !== ATUAL.status;
    ATUAL = d.conversa;
    if (d.mensagens.length || forcar) {
      MSGS = MSGS.concat(d.mensagens);
      await renderMensagens(d.mensagens.some(m => m.minha));
    }
    if (mudouStatus) renderCabeca();
  }

  $('#msg-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const t = f.texto.value.trim();
    if (!t || !ATUAL) return;
    f.querySelector('button').disabled = true;
    try {
      await api(`/api/chat/conversas/${ATUAL.id}/mensagens`, { texto: t });
      f.texto.value = ''; f.texto.style.height = '';
      await atualizar();
      if (ATUAL.status === 'aceita') renderCabeca();
      carregarLista();
    } catch (err) { toast(err.message); }
    f.querySelector('button').disabled = false;
    f.texto.focus();
  });
  // Enter envia; Shift+Enter quebra a linha; a caixa cresce com o texto
  $('#msg-form').texto.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#msg-form').requestSubmit(); }
  });
  $('#msg-form').texto.addEventListener('input', e => { e.target.style.height = ''; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; });

  function voltarLista() {
    ATUAL = null;
    document.body.classList.remove('msg-aberta');
    $('#msg-ativa').hidden = true; $('#msg-placeholder').hidden = false;
    history.replaceState(null, '', '/mensagens');
    renderLista();
  }
  $('#msg-voltar').addEventListener('click', voltarLista);

  // Atualiza sozinho: a conversa aberta a cada 4 s e a lista a cada 15 s (só com a aba visível)
  setInterval(() => { if (document.visibilityState === 'visible') atualizar().catch(() => {}); }, 4000);
  setInterval(() => { if (document.visibilityState === 'visible') carregarLista().catch(() => {}); }, 15000);

  (async () => {
    try {
      await carregarLista();
      const c = Number(params.get('c'));
      if (c) await abrir(c, Number(params.get('pedido')) || null);
      else if (CONVS.some(x => x.pedido_para_mim)) {
        filtro = 'pedidos';
        $$('.msg-filtros button').forEach(x => x.setAttribute('aria-current', x.dataset.filtro === 'pedidos'));
        renderLista();
      }
    } catch (err) {
      $('#msg-itens').innerHTML = `<p class="muted msg-vazio">${esc(err.message)}</p>`;
    }
  })();
})();
