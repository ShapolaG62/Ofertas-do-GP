/* Ofertou! — Fila do SAC (/sac): o administrador e os atendentes veem os chamados na fila, assumem um,
   conversam com o cliente e marcam como resolvido (ou devolvem à fila). */
(() => {
  'use strict';
  // Dentro do painel do administrador (/sac?embed=1): sem o cabeçalho do site
  const EMBUTIDO = /[?&]embed=1\b/.test(location.search) && window.top !== window;
  if (EMBUTIDO) document.documentElement.classList.add('sac-embed');
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const data = s => new Date(String(s).replace(' ', 'T') + 'Z');
  const hora = s => {
    const d = data(s);
    return new Date().toDateString() === d.toDateString()
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  const espera = s => {
    const min = Math.max(0, Math.round((Date.now() - data(s).getTime()) / 60000));
    return min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${Math.floor(min / 1440)} dia(s)`;
  };
  async function api(url, body) {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || `Erro ${r.status}`), { status: r.status });
    return d;
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
  }
  const avatar = p => (p.avatar ? `<img class="sac-av" src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="sac-av sac-av-letra">${esc((p.nome || '?').charAt(0).toUpperCase())}</span>`);

  let F = null, ABA = 'fila', ATUAL = null, MSGS = [], filaAntes = null;

  // ── Lista ──
  async function carregarFila() {
    try { F = await api('/api/sac/fila'); }
    catch (err) {
      if (err.status === 403 || err.status === 401) { $('#sac-sem-acesso').hidden = false; $('#sac-eu').textContent = 'Acesso restrito à equipe de atendimento.'; return; }
      throw err;
    }
    $('#sac-app').hidden = false;
    $('#sac-voltar').href = F.eu.admin ? '/admin' : '/';
    $('#sac-voltar').textContent = F.eu.admin ? 'Painel do administrador' : 'Ver site';
    $('#sac-eu').textContent = `Atendendo como ${F.eu.nome} · assuma um chamado da fila para responder.`;
    const n = F.numeros;
    $('#sac-nums').innerHTML = `<div><b>${n.fila || 0}</b><span>na fila</span></div><div><b>${n.atendimento || 0}</b><span>em atendimento</span></div>
      <div><b>${n.resolvidos_24h || 0}</b><span>resolvidos em 24 h</span></div><div><b>${n.nota_media ? `${String(n.nota_media).replace('.', ',')} ★` : '—'}</b><span>${n.avaliacoes || 0} avaliação(ões)</span></div>`;
    $('#n-fila').textContent = F.fila.length || '';
    $('#n-meus').textContent = F.meus.length || '';
    $('#n-outros').textContent = F.outros.length || '';
    // Chamado novo na fila: avisa no título da aba do navegador
    if (filaAntes !== null && F.fila.length > filaAntes) toast('Novo chamado na fila!');
    filaAntes = F.fila.length;
    document.title = `${F.fila.length ? `(${F.fila.length}) ` : ''}Fila do SAC — Ofertou!`;
    desenharLista();
  }
  function desenharLista() {
    const itens = F[ABA] || [];
    const vazio = { fila: 'Ninguém na fila. 🎉', meus: 'Você não está atendendo ninguém agora.', outros: 'Nenhum chamado com outros atendentes.', resolvidos: 'Nenhum chamado resolvido ainda.' }[ABA];
    $('#sac-itens').innerHTML = itens.length ? itens.map(c => `
      <button type="button" class="sac-item${ATUAL && ATUAL.id === c.id ? ' ativo' : ''}${c.nao_lidas ? ' novas' : ''}" data-id="${c.id}">
        ${avatar(c.cliente)}
        <span class="sac-item-txt"><b>${esc(c.cliente.nome)}</b>
          <small>${esc(c.codigo)} · ${esc(c.assunto_nome)}</small>
          <small class="sac-item-ult">${c.ultima ? esc(c.ultima.texto.slice(0, 90)) : ''}</small></span>
        <span class="sac-item-lado">${ABA === 'fila' ? `<small title="Esperando há">${espera(c.created_at)}</small>` : `<small>${hora(c.ultima_msg_at)}</small>`}
          ${ABA === 'outros' ? `<small>${esc(c.atendente?.nome || '')}</small>` : ''}${ABA === 'resolvidos' && c.nota ? `<small class="sac-nota">${'★'.repeat(c.nota)}</small>` : ''}
          ${c.nao_lidas ? `<b class="sac-n">${c.nao_lidas}</b>` : ''}</span>
      </button>`).join('') : `<p class="sac-lista-vazia">${vazio}</p>`;
  }

  // ── Conversa ──
  async function abrir(id) {
    const d = await api(`/api/sac/chamados/${id}`);
    ATUAL = d.chamado; MSGS = d.mensagens;
    desenharConversa(d.anteriores, true);
    desenharLista();
  }
  function desenharConversa(anteriores, rolar) {
    const c = ATUAL, meu = c.status === 'atendimento' && c.atendente?.dono === F.eu.dono;
    const acoes = c.status === 'fila' ? '<button class="btn btn-primary btn-sm" type="button" data-acao="assumir">Assumir chamado</button>'
      : meu ? '<button class="btn btn-sm" type="button" data-acao="devolver">Devolver à fila</button><button class="btn btn-primary btn-sm" type="button" data-acao="resolver">Marcar como resolvido</button>'
        : c.status === 'atendimento' && F.eu.admin ? '<button class="btn btn-sm" type="button" data-acao="assumir">Assumir este atendimento</button>' : '';
    const conv = $('#sac-conversa');
    if (!conv.querySelector(`[data-chamado="${c.id}"]`)) {
      conv.innerHTML = `<div class="sac-conv" data-chamado="${c.id}">
        <header class="sac-conv-topo"><div class="sac-conv-quem"></div><div class="sac-conv-acoes"></div></header>
        <div class="sac-msgs" id="sac-msgs"></div>
        <div class="sac-aviso" id="sac-aviso" hidden></div>
        <form class="sac-escrever" id="sac-form"><textarea name="texto" rows="2" maxlength="2000" placeholder="Responder ao cliente… (Enter envia, Shift+Enter quebra a linha)"></textarea>
          <button class="btn btn-primary" type="submit">Enviar</button></form>
        <details class="sac-anteriores" id="sac-anteriores"></details>
      </div>`;
    }
    conv.querySelector('.sac-conv-quem').innerHTML = `${avatar(c.cliente)}<div><b>${esc(c.cliente.nome)}</b>
      <small>${esc(c.codigo)} · ${esc(c.assunto_nome)} · <span class="sac-st sac-st-${c.status}">${esc(c.status_nome)}${c.atendente ? ` com ${esc(c.atendente.nome)}` : ''}</span></small>
      <small>Aberto em ${hora(c.created_at)}${c.cliente.slug ? ` · <a href="/perfil/${esc(c.cliente.slug)}" target="_top">ver perfil</a>` : ''}</small></div>`;
    conv.querySelector('.sac-conv-acoes').innerHTML = acoes;
    const box = $('#sac-msgs');
    const noFim = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = MSGS.map(m => {
      if (!m.autor) return `<div class="chatf-sis">${esc(m.texto)}</div>`;
      const doCliente = m.autor === c.cliente.dono;
      return `<div class="chatf-bolha ${doCliente ? 'dele' : 'minha'}"><small class="chatf-autor">${esc(m.autor_nome)}</small><p>${esc(m.texto).replace(/\n/g, '<br>')}</p><small>${hora(m.created_at)}</small></div>`;
    }).join('');
    if (rolar || noFim) box.scrollTop = box.scrollHeight;
    const aviso = $('#sac-aviso'), form = $('#sac-form');
    form.hidden = !meu;
    aviso.hidden = meu;
    aviso.innerHTML = c.status === 'fila' ? 'Este chamado está na fila. Clique em <b>Assumir chamado</b> para responder.'
      : c.status === 'resolvido' ? `Chamado resolvido${c.nota ? ` · avaliação do cliente: <b>${'★'.repeat(c.nota)}</b>${c.nota_texto ? ` — "${esc(c.nota_texto)}"` : ''}` : ''}.`
        : `${esc(c.atendente?.nome || 'Outro atendente')} está atendendo este chamado.`;
    if (anteriores) {
      const ant = $('#sac-anteriores');
      ant.hidden = !anteriores.length;
      ant.innerHTML = `<summary>Outros chamados desta pessoa (${anteriores.length})</summary>${anteriores.map(a => `<button type="button" class="sac-ant" data-id="${a.id}">${esc(a.codigo)} · ${esc(a.assunto_nome)} · ${esc(a.status_nome)} · ${hora(a.created_at)}</button>`).join('')}`;
    }
  }
  async function novas() {
    if (!ATUAL) return;
    const ult = MSGS.length ? MSGS[MSGS.length - 1].id : 0;
    const d = await api(`/api/sac/chamados/${ATUAL.id}?depois=${ult}`);
    const vistas = new Set(MSGS.map(m => m.id));
    const nv = d.mensagens.filter(m => !vistas.has(m.id));
    const mudou = d.chamado.status !== ATUAL.status || d.chamado.atendente?.dono !== ATUAL.atendente?.dono || d.chamado.nota !== ATUAL.nota;
    ATUAL = d.chamado;
    if (nv.length || mudou) { MSGS = MSGS.concat(nv); desenharConversa(null, false); }
  }

  // ── Eventos ──
  document.addEventListener('click', async e => {
    const aba = e.target.closest('[data-aba]');
    if (aba) {
      ABA = aba.dataset.aba;
      document.querySelectorAll('[data-aba]').forEach(b => b.setAttribute('aria-selected', b === aba));
      return desenharLista();
    }
    const item = e.target.closest('[data-id]');
    if (item) return abrir(Number(item.dataset.id)).catch(err => toast(err.message));
    const ac = e.target.closest('[data-acao]');
    if (ac && ATUAL) {
      const acao = ac.dataset.acao;
      if (acao === 'resolver' && !await OfertouUI.confirmar('Marcar este chamado como resolvido? O cliente poderá avaliar o atendimento.')) return;
      if (acao === 'devolver' && !await OfertouUI.confirmar('Devolver o chamado à fila? Outro atendente poderá assumir.')) return;
      ac.disabled = true;
      try {
        const d = await api(`/api/sac/chamados/${ATUAL.id}/${acao}`, {});
        ATUAL = d.chamado; MSGS = d.mensagens;
        desenharConversa(d.anteriores, true);
        if (acao === 'assumir') { ABA = 'meus'; document.querySelectorAll('[data-aba]').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === 'meus')); $('#sac-form textarea')?.focus(); }
        toast({ assumir: 'Chamado assumido. Responda ao cliente.', devolver: 'Chamado devolvido à fila.', resolver: 'Chamado resolvido.' }[acao]);
        await carregarFila();
      } catch (err) { toast(err.message); ac.disabled = false; await carregarFila().catch(() => {}); }
    }
  });
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'sac-form') return;
    e.preventDefault();
    const f = e.target, t = f.texto.value.trim();
    if (!t || !ATUAL) return;
    f.querySelector('button').disabled = true;
    try {
      const d = await api(`/api/sac/chamados/${ATUAL.id}/responder`, { texto: t });
      ATUAL = d.chamado; MSGS = d.mensagens; f.texto.value = '';
      desenharConversa(null, true);
    } catch (err) { toast(err.message); }
    f.querySelector('button').disabled = false;
    f.texto.focus();
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches('#sac-form textarea') && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); }
  });

  carregarFila().catch(err => { $('#sac-eu').textContent = err.message; });
  setInterval(() => { if (document.visibilityState === 'visible') carregarFila().catch(() => {}); }, 6000);
  setInterval(() => { if (document.visibilityState === 'visible') novas().catch(() => {}); }, 4000);
})();
