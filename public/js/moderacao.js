/* Ofertou! — Moderação do chat (/moderacao): conversas em que alguém xingou, histórico com a hora e o texto original,
   e punições. Usada pelo administrador (dentro do painel) e pela equipe com a função "Moderar o chat" (Área de trabalho).
   Advertir, bloquear as mensagens e resolver: todo cargo com Moderação; suspender e banir: cargos com essa função. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const quando = s => new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  if (/[?&]embed=1\b/.test(location.search) && window.top !== window) document.documentElement.classList.add('mod-embed');

  async function api(url, body) {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || `Erro ${r.status}`), { status: r.status });
    return d;
  }
  const avisar = t => (window.OfertouUI ? OfertouUI.avisar(t) : alert(t));

  let STATUS = 'novo', ATUAL = null, PUNIR = false;

  async function carregar() {
    let d;
    try { d = await api(`/api/moderacao?status=${STATUS}`); }
    catch (err) {
      if (err.status === 401 || err.status === 403) { $('#mod-app').hidden = true; $('.mod-topo').hidden = true; $('#mod-sem-acesso').hidden = false; return; }
      $('#mod-itens').innerHTML = `<p class="form-msg err">${esc(err.message)}</p>`; return;
    }
    PUNIR = d.pode_punir;
    $('#mod-n').textContent = d.novos || '';
    document.querySelectorAll('[data-status]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.status === STATUS)));
    $('#mod-itens').innerHTML = d.conversas.length ? d.conversas.map(c => `
      <button type="button" class="mod-item ${ATUAL && ATUAL.origem === c.origem && ATUAL.ref_id === c.ref_id ? 'ativo' : ''}" data-abrir="${c.origem}:${c.ref_id}">
        <span class="mod-item-txt"><b>${esc(c.codigo)} <small>· ${esc(c.tipo)}</small></b>
          <small>${c.participantes.map(esc).join(' · ')}</small>
          <small>Xingou: <b>${c.autores.map(a => esc(a.nome)).join(', ')}</b></small></span>
        <span class="mod-item-lado"><small>${quando(c.ultima)}</small>${c.novos ? `<b class="mod-n">${c.novos}</b>` : '<small class="mod-ok">resolvida</small>'}</span>
      </button>`).join('')
      : `<p class="muted mod-vazio">${STATUS === 'novo' ? 'Nenhuma conversa nova com xingamentos. 🎉' : 'Nada por aqui.'}</p>`;
  }

  function marcar(texto, palavras) {
    let h = esc(texto);
    for (const p of [...new Set(palavras)].sort((a, b) => b.length - a.length)) h = h.split(esc(p)).join(`<mark>${esc(p)}</mark>`);
    return h;
  }

  function render(d) {
    ATUAL = d; PUNIR = d.pode_punir;
    const btn = (a, acao, txt, cls = '') => `<button class="btn btn-sm ${cls}" type="button" data-acao="${acao}" data-autor="${esc(a.dono)}">${txt}</button>`;
    $('#mod-conversa').innerHTML = `<div class="mod-conv">
      <div class="mod-conv-topo"><div><b>${esc(d.codigo)} · ${esc(d.tipo)}</b><small>${d.participantes.map(esc).join(' · ')} — ${d.ocorrencias} ocorrência(s)${d.novos ? `, <b class="mod-vermelho">${d.novos} sem revisão</b>` : ''}</small></div>
        ${d.novos ? '<button class="btn btn-sm" type="button" data-acao="resolver">Marcar como resolvido</button>' : ''}</div>
      <div class="mod-autores">${d.autores.map(a => `<div class="mod-autor">
        <div><b>${esc(a.nome)}</b> <small>${a.total_infracoes} ocorrência(s) no total${a.status && a.status !== 'active' ? ` · conta: ${esc(a.status)}` : ''}${a.chat_bloqueado_ate ? ` · mensagens bloqueadas até ${quando(a.chat_bloqueado_ate)}` : ''}</small></div>
        <div class="mod-botoes">
          ${btn(a, 'advertir', 'Advertir')}
          ${a.conta_site ? (a.chat_bloqueado_ate ? btn(a, 'liberar_chat', 'Liberar mensagens') : btn(a, 'bloquear_chat', 'Bloquear mensagens…')) : ''}
          ${PUNIR && a.conta_site ? btn(a, 'suspender', 'Suspender conta…', 'btn-danger') : ''}
          ${PUNIR && a.conta_site && a.status !== 'banned' ? btn(a, 'banir', 'Banir', 'btn-danger') : ''}
        </div></div>`).join('')}</div>
      <div class="mod-msgs" id="mod-msgs">${d.mensagens.map(m => m.autor ? `<div class="mod-msg ${m.infracao ? 'xing' : ''}">
          <small><b>${esc(m.nome)}</b> · ${quando(m.created_at)}${m.infracao ? ` · <b class="mod-vermelho">xingamento</b>${m.infracao.acao ? ` · ${esc(m.infracao.acao)}` : m.infracao.status === 'novo' ? ' · sem revisão' : ''}` : ''}</small>
          <div>${esc(m.texto)}</div>
          ${m.infracao ? `<span class="mod-orig"><small>Escrito originalmente:</small> ${marcar(m.infracao.original, m.infracao.palavras)}</span>` : ''}
        </div>` : `<div class="mod-msg sis">${esc(m.texto)} · ${quando(m.created_at)}</div>`).join('')}</div>
      ${PUNIR ? '' : '<p class="muted mod-rodape">Suspender ou banir a conta: peça a quem tem esse cargo.</p>'}
    </div>`;
    const primeira = $('#mod-msgs .xing');
    if (primeira) setTimeout(() => primeira.scrollIntoView({ block: 'center' }), 50);
    document.querySelectorAll('.mod-item').forEach(b => b.classList.toggle('ativo', b.dataset.abrir === `${d.origem}:${d.ref_id}`));
  }

  async function abrir(origem, id) {
    try { render(await api(`/api/moderacao/${origem}/${id}`)); }
    catch (err) { avisar(err.message); }
  }

  document.addEventListener('click', async e => {
    const f = e.target.closest('[data-status]');
    if (f) { STATUS = f.dataset.status; carregar(); return; }
    const a = e.target.closest('[data-abrir]');
    if (a) { const [o, id] = a.dataset.abrir.split(':'); abrir(o, id); return; }
    const b = e.target.closest('[data-acao]');
    if (!b || !ATUAL) return;
    const acao = b.dataset.acao, autor = b.dataset.autor, nome = ATUAL.autores.find(x => x.dono === autor)?.nome || '';
    const body = { acao, autor };
    const UI = window.OfertouUI;
    if (acao === 'resolver' && !await UI.confirmar('Marcar as ocorrências desta conversa como resolvidas, sem punição?')) return;
    if (acao === 'advertir') { const m = await UI.perguntar(`Advertir ${nome}. Mensagem extra para a pessoa (opcional):`, ''); if (m === null) return; body.motivo = m; }
    if (acao === 'bloquear_chat' || acao === 'suspender') {
      const dias = await UI.perguntar(`${acao === 'suspender' ? 'Suspender a conta de' : 'Bloquear as mensagens de'} ${nome} por quantos dias?`, acao === 'suspender' ? '7' : '3');
      if (!dias) return; body.dias = Number(dias);
    }
    if (acao === 'banir' && !await UI.confirmar(`Banir ${nome}? A pessoa perde o acesso ao site.`)) return;
    if (['bloquear_chat', 'suspender', 'banir'].includes(acao)) { const m = await UI.perguntar('Motivo (aparece para a pessoa):', 'Linguagem ofensiva no chat'); if (m === null) return; body.motivo = m; }
    b.disabled = true;
    try { render(await api(`/api/moderacao/${ATUAL.origem}/${ATUAL.ref_id}/acao`, body)); carregar(); }
    catch (err) { avisar(err.message); b.disabled = false; }
  });

  carregar();
  setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 30000);
})();
