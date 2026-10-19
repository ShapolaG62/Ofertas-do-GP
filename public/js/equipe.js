/* Ofertou! — Equipe (/equipe): pessoas da equipe com os cargos (Proprietário, Gerente, Admin, Moderador, Suporte)
   e a tabela "Cargos e permissões". Usada pelo dono do site (dentro do painel) e por quem tem a função
   "Gerenciar a equipe" (Área de trabalho). Cada um só gerencia cargos abaixo do seu; só o dono muda as permissões. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const quando = s => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');
  if (/[?&]embed=1\b/.test(location.search) && window.top !== window) document.documentElement.classList.add('eqp-embed');
  async function api(url, opts = {}) {
    const r = await fetch(url, { method: opts.method || 'GET', headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || `Erro ${r.status}`), { status: r.status });
    return d;
  }
  const UI = () => window.OfertouUI;
  const msg = (el, t, ok) => { el.textContent = t || ''; el.hidden = !t; el.className = `form-msg ${ok ? 'ok' : 'err'}`; };
  let D = null;

  async function carregar() {
    try { D = await api('/api/equipe'); }
    catch (err) {
      if (err.status === 401 || err.status === 403) { document.querySelectorAll('[data-painel], .eqp-abas').forEach(e => { e.hidden = true; }); $('#eqp-sem-acesso').hidden = false; return; }
      $('#eqp-lista').innerHTML = `<p class="form-msg err">${esc(err.message)}</p>`; return;
    }
    const nomeCargo = id => D.nomes.cargos.find(c => c.id === id)?.nome || id;
    // Cargos e permissões: só aparece para o dono do site, Proprietários e Gerentes
    document.querySelector('[data-aba="cargos"]').hidden = !D.ver_cargos;
    if (!D.ver_cargos) document.querySelector('[data-painel="cargos"]').hidden = true;
    $('#eqp-cargo-novo').innerHTML = D.cargos_permitidos.slice().reverse().map(c => `<option value="${c}">${esc(nomeCargo(c))}</option>`).join('');
    // Pessoas
    $('#eqp-lista').innerHTML = D.equipe.length ? D.equipe.map(p => `<div class="eqp-pessoa">
      <div class="eqp-quem"><b>${esc(p.nome || '—')}</b><small>${esc(p.email)} · último acesso: ${quando(p.last_login_at)}${p.status !== 'active' ? ` · conta: ${esc(p.status)}` : ''}</small>
        <small class="eqp-faz">${p.permissoes.length ? p.permissoes.map(id => esc(D.nomes.permissoes.find(x => x.id === id)?.nome || id)).join(' · ') : 'sem funções'}</small></div>
      <div class="eqp-ctrl">
        ${p.pode_gerenciar
          ? `<select data-cargo="${p.id}" aria-label="Cargo de ${esc(p.nome)}">${[...new Set([...D.cargos_permitidos, p.cargo].filter(Boolean))].map(c => `<option value="${c}" ${c === p.cargo ? 'selected' : ''}>${esc(nomeCargo(c))}</option>`).join('')}</select>
             <button class="btn btn-sm" type="button" data-senha="${p.id}" data-email="${esc(p.email)}">Nova senha</button>
             <button class="btn btn-sm btn-danger" type="button" data-remover="${p.id}" data-nome="${esc(p.nome || p.email)}">Tirar da equipe</button>`
          : `<span class="eqp-cargo-tag">${esc(p.cargo_nome)}</span>`}
      </div></div>`).join('')
      : '<p class="muted">Ninguém na equipe ainda. Adicione a primeira pessoa acima.</p>';
    // Cargos e permissões
    const m = D.matriz;
    if (!m) return;
    $('#eqp-matriz').innerHTML = `<thead><tr><th>Função</th>${m.cargos.map(c => `<th>${esc(c.nome)}</th>`).join('')}</tr></thead>
      <tbody>${m.permissoes.map(p => `<tr><td><b>${esc(p.nome)}</b><small>${esc(p.desc)}</small></td>${m.cargos.map(c => `<td>
        <input type="checkbox" data-mc="${c.id}" data-mp="${p.id}" ${c.permissoes.includes(p.id) ? 'checked' : ''} ${c.fixo || !D.dono_site ? 'disabled' : ''} aria-label="${esc(c.nome)}: ${esc(p.nome)}"></td>`).join('')}</tr>`).join('')}</tbody>`;
    $('#eqp-salvar-cargos').hidden = !D.dono_site;
    $('#eqp-dica-cargos').textContent = D.dono_site
      ? 'Marque, uma a uma, o que cada cargo pode fazer na Área de trabalho. O Proprietário tem acesso total. Ninguém da equipe entra no painel administrativo.'
      : 'O que cada cargo pode fazer na Área de trabalho. Só o Proprietário (dono do site) muda estas permissões.';
  }

  document.addEventListener('click', async e => {
    const aba = e.target.closest('[data-aba]');
    if (aba) {
      document.querySelectorAll('[data-aba]').forEach(b => b.setAttribute('aria-selected', String(b === aba)));
      document.querySelectorAll('[data-painel]').forEach(p => { p.hidden = p.dataset.painel !== aba.dataset.aba; });
      return;
    }
    const s = e.target.closest('[data-senha]');
    if (s) {
      const senha = await UI().perguntar(`Nova senha para ${s.dataset.email}. A pessoa sai de todos os aparelhos e entra com a nova senha.`);
      if (!senha) return;
      try { await api(`/api/equipe/${s.dataset.senha}/senha`, { method: 'POST', body: { senha } }); UI().avisar('Senha alterada. Passe a nova senha para a pessoa.'); }
      catch (err) { UI().avisar(err.message); }
      return;
    }
    const r = e.target.closest('[data-remover]');
    if (r) {
      if (!await UI().confirmar(`Tirar ${r.dataset.nome} da equipe? A pessoa perde o cargo e a Área de trabalho (a conta continua existindo).`)) return;
      try { await api(`/api/equipe/${r.dataset.remover}/remover`, { method: 'POST', body: {} }); carregar(); }
      catch (err) { UI().avisar(err.message); }
      return;
    }
    if (e.target.closest('#eqp-salvar-cargos')) {
      const matriz = {};
      document.querySelectorAll('[data-mc]').forEach(c => { (matriz[c.dataset.mc] ||= []); if (c.checked) matriz[c.dataset.mc].push(c.dataset.mp); });
      try { await api('/api/equipe/cargos', { method: 'PUT', body: { matriz } }); msg($('#eqp-msg-cargos'), 'Permissões salvas. A equipe já passa a ver as partes novas.', true); carregar(); }
      catch (err) { msg($('#eqp-msg-cargos'), err.message, false); }
    }
  });

  document.addEventListener('change', async e => {
    const c = e.target.closest('[data-cargo]');
    if (!c) return;
    try { await api(`/api/equipe/${c.dataset.cargo}/cargo`, { method: 'POST', body: { cargo: c.value } }); carregar(); }
    catch (err) { UI().avisar(err.message); carregar(); }
  });

  $('#eqp-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      const { pessoa } = await api('/api/equipe', { method: 'POST', body: { nome: f.nome.value, email: f.email.value, senha: f.senha.value, cargo: f.cargo.value } });
      msg($('#eqp-msg'), `${pessoa.nome || pessoa.email} entrou para a equipe como ${pessoa.cargo_nome}. Passe o e-mail e a senha: a pessoa entra em /conta e usa a Área de trabalho.`, true);
      f.reset(); carregar();
    } catch (err) { msg($('#eqp-msg'), err.message, false); }
  });

  carregar();
})();
