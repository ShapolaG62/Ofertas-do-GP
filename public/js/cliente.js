/* Ofertou! — painel do cliente da ferramenta: links de afiliado, canais, agendamento e histórico DELE */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmtDate = s => (s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('T') ? '' : 'Z')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const fmtDay = s => (String(s).startsWith('9999') ? 'sem vencimento' : s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR') : '—');
  const REDE = { telegram: 'Telegram', facebook: 'Facebook', instagram: 'Instagram', x: 'X (Twitter)', whatsapp: 'WhatsApp' };
  const FILA = { pendente: 'Na fila', postado: 'Postado', erro: 'Erro', expirado: 'Saiu do ar' };
  let CFG = {};

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.endsWith('/entrar')) { mostrarLogin(); throw new Error(data.error || 'Sessão expirada.'); }
    if (!res.ok) throw Object.assign(new Error(data.error || `Erro ${res.status}`), { reativar: data.reativar || null });
    return data;
  }

  let toastTimer;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }
  function msg(el, texto, ok = true) {
    el.innerHTML = `<div class="form-msg ${ok ? 'ok' : 'err'}">${esc(texto)}</div>`;
    if (ok) setTimeout(() => { el.innerHTML = ''; }, 5000);
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  function mostrarLogin() {
    $('#view-app').hidden = true; $('#view-login').hidden = false;
    ['#go-offers', '#go-posts', '#logout'].forEach(s => { $(s).hidden = true; });
  }

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const box = $('#login-msg');
    box.hidden = true;
    try {
      await api('/api/cliente/entrar', { method: 'POST', body: { email: f.email.value, senha: f.senha.value } });
      f.reset();
      abrir();
    } catch (err) {
      box.textContent = err.message; box.hidden = false;
      if (err.reativar) {
        const a = document.createElement('a');
        a.className = 'btn btn-primary btn-block form-reativar';
        a.href = err.reativar;
        a.textContent = 'Reativar plano';
        box.appendChild(a);
      }
    }
  });

  $('#logout').addEventListener('click', async () => {
    await fetch('/api/cliente/sair', { method: 'POST' });
    location.reload();
  });

  // ── Painel ─────────────────────────────────────────────────────────────────
  async function abrir() {
    const me = await fetch('/api/cliente/me').then(r => r.json()).catch(() => ({}));
    if (!me.cliente) return mostrarLogin();
    $('#view-login').hidden = true; $('#view-app').hidden = false;
    ['#go-offers', '#go-posts', '#logout'].forEach(s => { $(s).hidden = false; });
    $('#cli-nome').textContent = `Olá, ${me.cliente.nome.split(' ')[0]}`;
    $('#cli-validade').textContent = String(me.cliente.validade).startsWith('9999') ? 'Acesso sem vencimento.' : `Acesso válido até ${fmtDay(me.cliente.validade)}.`;
    // Termos do Afiliado ainda não aceitos (acesso criado pelo painel ou antes dos Termos): pede antes de abrir o painel
    await OfertouAceiteParceiro.pedir(me.parceiro_pendente, '/api/cliente/aceite-parceiro', '/api/cliente/sair');
    await carregarConfig();
  }

  async function carregarConfig() {
    const d = await api('/api/cliente/config');
    CFG = d.config;
    for (const form of $$('.cfg-form')) {
      for (const el of form.elements) {
        if (!el.name) continue;
        if (el.dataset.secret !== undefined) {
          el.value = '';
          el.placeholder = CFG[`${el.name}_set`] ? '•••••••• (configurado — deixe vazio para manter)' : 'não configurado';
        } else if (el.name in CFG) el.value = CFG[el.name] ?? '';
      }
    }
    let redes = [];
    try { redes = JSON.parse(CFG.agenda_redes || '[]'); } catch { /* vazio */ }
    $$('[data-agenda-rede]').forEach(c => { c.checked = redes.includes(c.dataset.agendaRede); });
    const falta = d.sem_afiliado || [];
    $('#aviso-afiliado').hidden = !falta.length;
    $('#aviso-afiliado').innerHTML = falta.length
      ? `Ainda sem link de afiliado seu: <b>${falta.map(esc).join(', ')}</b>. Produtos dessas lojas vão <b>sem comissão</b> até você configurar em "Links de afiliado".`
      : '';
    atualizarWa();
  }

  // Abas
  $('.tabs-line').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    $$('.tabs-line [data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $$('.cli-tab').forEach(t => { t.hidden = t.dataset.body !== b.dataset.tab; });
    if (b.dataset.tab === 'agenda') carregarAgenda().catch(err => toast(err.message));
    if (b.dataset.tab === 'historico') carregarHistorico().catch(err => toast(err.message));
  });

  // Salvar qualquer formulário de configuração (campos secretos vazios mantêm o valor atual).
  $$('.cfg-form').forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault();
    const body = {};
    for (const el of form.elements) if (el.name) body[el.name] = el.value;
    const redes = $$('[data-agenda-rede]', form);
    if (redes.length) body.agenda_redes = redes.filter(c => c.checked).map(c => c.dataset.agendaRede);
    try {
      await api('/api/cliente/config', { method: 'PUT', body });
      toast('Salvo!');
      await carregarConfig();
      if (redes.length) carregarAgenda().catch(() => {});
    } catch (err) { toast(err.message); }
  }));

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  function atualizarWa() {
    const p = $('#wa-provider').value;
    $$('.wa-zapi').forEach(el => { el.hidden = p !== 'zapi'; });
    $$('.wa-evolution').forEach(el => { el.hidden = p !== 'evolution'; });
    let g = [];
    try { g = JSON.parse(CFG.whatsapp_groups || '[]'); } catch { /* vazio */ }
    $('#wa-chosen').innerHTML = g.length ? `Grupos de destino: <b>${g.map(x => esc(x.nome)).join(', ')}</b>` : 'Nenhum grupo de destino escolhido ainda.';
  }
  $('#wa-provider').addEventListener('change', atualizarWa);

  async function salvarWa() {
    const form = $('#wa-provider').form;
    const body = {};
    for (const el of form.elements) if (el.name) body[el.name] = el.value;
    await api('/api/cliente/config', { method: 'PUT', body });
    await carregarConfig();
  }

  $('#wa-test').addEventListener('click', async () => {
    try { await salvarWa(); const r = await api('/api/cliente/whatsapp/status'); msg($('#wa-msg'), r.mensagem, r.conectado); }
    catch (err) { msg($('#wa-msg'), err.message, false); }
  });

  $('#wa-load').addEventListener('click', async () => {
    const b = $('#wa-load');
    b.disabled = true; b.textContent = 'Carregando…';
    try {
      await salvarWa();
      const r = await api('/api/cliente/whatsapp/grupos');
      const chosen = new Set(r.escolhidos.map(g => g.id));
      $('#wa-groups').innerHTML = r.grupos.length
        ? r.grupos.map(g => `<label class="check-line"><input type="checkbox" data-wa-group="${esc(g.id)}" data-nome="${esc(g.nome)}" ${chosen.has(g.id) ? 'checked' : ''}> ${esc(g.nome)}</label>`).join('')
        : '<span class="cli-hint">O número não participa de nenhum grupo.</span>';
      $('#wa-groups-box').hidden = false;
    } catch (err) { msg($('#wa-msg'), err.message, false); }
    b.disabled = false; b.textContent = 'Carregar meus grupos';
  });

  $('#wa-save-groups').addEventListener('click', async () => {
    const grupos = $$('[data-wa-group]').filter(c => c.checked).map(c => ({ id: c.dataset.waGroup, nome: c.dataset.nome }));
    try { await api('/api/cliente/config', { method: 'PUT', body: { whatsapp_groups: grupos } }); await carregarConfig(); msg($('#wa-msg'), `${grupos.length} grupo(s) salvos.`); }
    catch (err) { msg($('#wa-msg'), err.message, false); }
  });

  // ── Agendamento e fila ─────────────────────────────────────────────────────
  async function carregarAgenda() {
    const { estado, fila } = await api('/api/cliente/agenda');
    const ult = estado.ultimaExecucao;
    $('#agenda-estado').innerHTML = `${estado.ativa ? `<b>Ligado</b> · ${estado.horarios.join(', ')} · próximo: <b>${esc(estado.proximo || '—')}</b>` : '<b>Desligado</b>'}
      · ${estado.pendentes} oferta(s) na fila${estado.rodando ? ' · <b>publicando agora…</b>' : ''}
      ${ult ? `<br>Última rodada: ${ult.feitos.filter(f => f.ok).length} de ${ult.feitos.length} publicadas em ${fmtDate(ult.em)}` : ''}`;
    $('#fila-body').innerHTML = fila.length ? fila.map(q => `<tr>
        <td>${esc(q.produto || `oferta #${q.offer_id}`)}</td>
        <td><span class="status-pill ${q.status === 'postado' ? 'ok' : q.status === 'erro' ? 'err' : ''}">${FILA[q.status] || q.status}</span></td>
        <td class="cli-hint">${esc(q.resultado || '')}</td>
        <td>${q.status === 'pendente' ? `<button class="btn btn-sm" type="button" data-fila-del="${q.id}">Tirar</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="4" class="cli-hint">A fila está vazia.</td></tr>';
  }
  $('#fila-body').addEventListener('click', async e => {
    const b = e.target.closest('[data-fila-del]');
    if (!b) return;
    try { await api(`/api/cliente/agenda/fila/${b.dataset.filaDel}`, { method: 'DELETE' }); carregarAgenda(); } catch (err) { toast(err.message); }
  });
  $('#fila-limpar').addEventListener('click', async () => {
    try { await api('/api/cliente/agenda/fila', { method: 'DELETE' }); carregarAgenda(); toast('Fila limpa.'); } catch (err) { toast(err.message); }
  });
  $('#agenda-run').addEventListener('click', async () => {
    try {
      await api('/api/cliente/agenda/executar', { method: 'POST', body: {} });
      toast('Rodada iniciada: as ofertas serão publicadas com o intervalo configurado.');
      setTimeout(() => carregarAgenda().catch(() => {}), 1500);
    } catch (err) { toast(err.message); }
  });

  // ── Histórico ──────────────────────────────────────────────────────────────
  async function carregarHistorico() {
    const rows = await api('/api/postagens/historico');
    $('#hist-body').innerHTML = rows.length ? rows.map(r => `<tr>
        <td>${fmtDate(r.created_at)}</td><td>${esc((r.produto || '—').slice(0, 70))}</td><td>${esc(REDE[r.rede] || r.rede)}</td>
        <td>${r.ok ? '<span class="status-pill ok">Publicado</span>' : `<span class="status-pill err">Erro</span> <span class="cli-hint">${esc(r.mensagem || '')}</span>`}</td></tr>`).join('')
      : '<tr><td colspan="4" class="cli-hint">Nenhuma postagem ainda.</td></tr>';
  }

  // ── Conta ──────────────────────────────────────────────────────────────────
  $('#senha-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try { await api('/api/cliente/senha', { method: 'POST', body: { atual: f.atual.value, nova: f.nova.value } }); f.reset(); toast('Senha alterada.'); }
    catch (err) { toast(err.message); }
  });

  abrir().catch(() => mostrarLogin());
})();
