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
    $('#cli-nome').textContent = me.cliente.nome.split(' ').slice(0, 2).join(' ');
    $('#cli-avatar').textContent = (me.cliente.nome.trim()[0] || '?').toUpperCase();
    $('#cli-plano').textContent = me.cliente.plano || 'Afiliado';
    $('#cli-validade').textContent = String(me.cliente.validade).startsWith('9999') ? 'Acesso sem vencimento.' : `Acesso válido até ${fmtDay(me.cliente.validade)}.`;
    // Termos do Afiliado ainda não aceitos (acesso criado pelo painel ou antes dos Termos): pede antes de abrir o painel
    await OfertouAceiteParceiro.pedir(me.parceiro_pendente, '/api/cliente/aceite-parceiro', '/api/cliente/sair');
    await carregarConfig();
    carregarPainel().catch(() => {});
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  let DIAS = 7;
  const num = n => Number(n || 0).toLocaleString('pt-BR');
  const ICONE_KPI = {
    enviados: '<path d="M3 11l18-8-8 18-2-8z"/>',
    conexoes: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
    fila: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    cliques: '<path d="M9 3v4M3 9h4M5.6 5.6l2.8 2.8M12 12l9 3-4 2-2 4z"/>',
  };
  const kpi = (id, titulo, valor, sub, cor) => `<div class="cli-kpi cli-kpi-${cor}">
      <span class="cli-kpi-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONE_KPI[id]}</svg></span>
      <div><small>${titulo}</small><b>${valor}</b><em>${sub}</em></div></div>`;
  async function carregarPainel() {
    const d = await api(`/api/cliente/painel?dias=${DIAS}`);
    const prontas = d.redes.filter(r => r.pronta);
    const periodo = DIAS === 1 ? 'hoje' : `nos últimos ${DIAS} dias`;
    $('#cli-kpis').innerHTML = [
      kpi('enviados', 'Mensagens enviadas', num(d.enviados), d.falhas ? `${num(d.falhas)} com falha ${periodo}` : periodo, 'verde'),
      kpi('conexoes', 'Redes conectadas', `${prontas.length}/${d.redes.length}`, prontas.length ? prontas.map(r => r.nome).join(', ') : 'nenhuma ainda', 'azul'),
      kpi('fila', 'Na fila', num(d.fila), d.agenda.ativa ? `agendamento ligado${d.agenda.proximo ? ` · próximo ${d.agenda.proximo}` : ''}` : 'agendamento desligado', 'laranja'),
      kpi('cliques', 'Cliques nos seus links', num(d.cliques), 'desde o começo', 'roxo'),
    ].join('');
    // Gráfico de barras (enviadas e falhas por dia)
    const max = Math.max(1, ...d.serie.map(x => x.ok + x.erro));
    const rot = s => new Date(s + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    $('#cli-graf-sub').textContent = `Volume de mensagens ${periodo}${d.ultimo_envio ? ` · último envio em ${fmtDate(d.ultimo_envio)}` : ''}`;
    $('#cli-graf').innerHTML = `<div class="cli-barras" style="--n:${d.serie.length}">${d.serie.map(x => `
      <div class="cli-barra" title="${rot(x.dia)}: ${x.ok} enviada(s)${x.erro ? `, ${x.erro} com falha` : ''}">
        <span class="cli-barra-pilha"><i class="ok" style="height:${(x.ok / max) * 100}%"></i><i class="erro" style="height:${(x.erro / max) * 100}%"></i></span>
        <small>${d.serie.length > 10 ? (x.dia.endsWith('01') || x.dia.endsWith('15') ? rot(x.dia) : '') : rot(x.dia)}</small>
      </div>`).join('')}</div>
      <div class="cli-legenda"><span><i class="ok"></i>Enviadas</span><span><i class="erro"></i>Com falha</span></div>`;
    // Conexões
    const linha = (ok, nome, det) => `<li class="${ok ? 'on' : 'off'}"><span class="cli-ponto"></span><div><b>${esc(nome)}</b><small>${esc(det)}</small></div></li>`;
    $('#cli-conexoes').innerHTML = d.redes.map(r => r.id === 'whatsapp'
      ? linha(r.pronta, 'WhatsApp', r.pronta ? `${d.grupos_whatsapp} grupo(s)${d.contingencia ? ' · com número de contingência' : ' · sem contingência'}` : r.motivo || 'não configurado')
      : linha(r.pronta, r.nome, r.pronta ? 'Conectado' : r.motivo || 'não configurado')).join('')
      + (d.sem_afiliado.length ? linha(false, 'Links de afiliado', `faltam: ${d.sem_afiliado.join(', ')}`) : linha(true, 'Links de afiliado', 'todas as lojas configuradas'));
  }
  $('#cli-periodo').addEventListener('click', e => {
    const b = e.target.closest('[data-dias]');
    if (!b) return;
    DIAS = Number(b.dataset.dias);
    $$('#cli-periodo [data-dias]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    carregarPainel().catch(err => toast(err.message));
  });

  // ── Barra "cole o link" (gera o link de afiliado do cliente) ────────────────
  $('#cli-busca').addEventListener('submit', async e => {
    e.preventDefault();
    const url = $('#cli-busca-url').value.trim(), box = $('#cli-busca-res');
    if (!url) return;
    box.hidden = false; box.innerHTML = '<p class="cli-hint">Gerando o seu link…</p>';
    try {
      const r = await fetch('/api/postagens/converter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
      box.innerHTML = `<div class="cli-busca-card"><div><small>${esc(d.loja)} · seu link de afiliado</small><code>${esc(d.link)}</code>
        ${d.aviso ? `<em>${esc(d.aviso)}</em>` : ''}</div>
        <div class="cli-busca-acoes"><button class="btn btn-primary btn-sm" type="button" data-copiar>Copiar link</button>
        <button class="btn btn-sm" type="button" data-fechar>Fechar</button></div></div>`;
      box.querySelector('[data-copiar]').addEventListener('click', () => navigator.clipboard.writeText(d.link).then(() => toast('Link copiado.')));
      box.querySelector('[data-fechar]').addEventListener('click', () => { box.hidden = true; $('#cli-busca-url').value = ''; });
    } catch (err) { box.innerHTML = `<p class="form-msg err">${esc(err.message)}</p>`; }
  });
  // Colou um link: gera na hora
  $('#cli-busca-url').addEventListener('paste', () => setTimeout(() => $('#cli-busca').requestSubmit(), 50));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !$('#view-app').hidden) { e.preventDefault(); $('#cli-busca-url').focus(); }
  });

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
    previaModelo();
  }

  // Modelo da mensagem: prévia com uma oferta de exemplo
  const EXEMPLO_MODELO = { produto: 'Air Fryer Mondial 4L Family Inox', preco_de: '499,90', preco: '289,90', desconto: '42', economia: '210,00',
    loja: 'Mercado Livre', link: 'https://tanoofertou.com.br/o/123456', cupom: '', conferido: '26/10, 09:30' };
  function previaModelo() {
    if (!$('#modelo-previa') || !window.OfertouModelo) return;
    $('#modelo-previa').textContent = OfertouModelo.aplicar($('#modelo-texto').value, EXEMPLO_MODELO);
  }
  document.addEventListener('input', e => { if (e.target.id === 'modelo-texto') previaModelo(); });
  $('#modelo-padrao')?.addEventListener('click', () => { $('#modelo-texto').value = OfertouModelo.PADRAO; previaModelo(); });

  // Abas
  $('.tabs-line').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    $$('.tabs-line [data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $$('.cli-tab').forEach(t => { t.hidden = t.dataset.body !== b.dataset.tab; });
    if (b.dataset.tab === 'redes') previaModelo();
    if (b.dataset.tab === 'agenda') carregarAgenda().catch(err => toast(err.message));
    if (b.dataset.tab === 'inicio') carregarPainel().catch(() => {});
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
