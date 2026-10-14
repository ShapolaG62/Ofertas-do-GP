/* Ofertas do GP — área de conta (entrar, cadastro, consumidor e empresa) */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = s => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

  let ME = null, LOJA = null, INFO = { ufs: [], ramos: [], idade_minima: 18 };

  // ── Campos cadastrais (usados no cadastro e em "Meus dados") ───────────────
  const field = (label, input, extra = '') => `<label class="field"><span>${label}${extra}</span>${input}</label>`;
  const inp = (name, attrs = '') => `<input name="${name}" ${attrs}>`;

  function addressFields(prefix, title) {
    const p = n => `${prefix}${n}`;
    return `<fieldset class="form-section" data-address="${prefix}">
      <legend>${title}</legend>
      <div class="form-row-addr">
        ${field('CEP', inp(p('cep'), 'inputmode="numeric" data-mask="cep" maxlength="9" placeholder="00000-000" autocomplete="postal-code"'))}
        ${field('Rua / avenida', inp(p('logradouro'), 'maxlength="120" autocomplete="address-line1"'))}
        ${field('Número', inp(p('numero'), 'maxlength="10"'))}
      </div>
      <div class="form-row">
        ${field('Complemento', inp(p('complemento'), 'maxlength="60" placeholder="Apto, sala, bloco..."'), ' <span class="hint-inline">(opcional)</span>')}
        ${field('Bairro', inp(p('bairro'), 'maxlength="60"'))}
      </div>
      <div class="form-row">
        ${field('Cidade', inp(p('cidade'), 'maxlength="60" autocomplete="address-level2"'))}
        ${field('Estado (UF)', `<select name="${p('uf')}"><option value="">Selecione</option>${INFO.ufs.map(u => `<option>${u}</option>`).join('')}</select>`)}
      </div>
    </fieldset>`;
  }

  function pessoaFields(mode) {
    const cadastro = mode === 'cadastro';
    return `<fieldset class="form-section">
      <legend>${cadastro ? 'Seus dados' : 'Dados pessoais'}</legend>
      ${field('Nome completo', inp('nome', 'maxlength="100" autocomplete="name"'))}
      <div class="form-row-3">
        ${field('CPF', inp('cpf', `inputmode="numeric" data-mask="cpf" maxlength="14" placeholder="000.000.000-00" ${cadastro ? '' : 'disabled'}`))}
        ${field('Data de nascimento', inp('data_nascimento', 'type="date" autocomplete="bday"'))}
        ${field('Celular / WhatsApp', inp('telefone', 'inputmode="tel" data-mask="tel" maxlength="15" placeholder="(11) 90000-0000" autocomplete="tel"'))}
      </div>
    </fieldset>
    ${addressFields('', cadastro ? 'Seu endereço' : 'Endereço')}`;
  }

  function empresaFields(mode) {
    const cadastro = mode === 'cadastro';
    return `<fieldset class="form-section">
      <legend>Dados da empresa</legend>
      ${field('Razão social', inp('razao_social', 'maxlength="150" autocomplete="organization"'))}
      <div class="form-row">
        ${field('Nome fantasia', inp('empresa_nome', 'maxlength="80"'))}
        ${field('CNPJ', inp('cnpj', `inputmode="numeric" data-mask="cnpj" maxlength="18" placeholder="00.000.000/0000-00" ${cadastro ? '' : 'disabled'}`))}
      </div>
      <div class="form-row">
        ${field('Inscrição estadual', inp('inscricao_estadual', 'maxlength="20" placeholder="Isento, se não tiver"'), ' <span class="hint-inline">(opcional)</span>')}
        ${field('Telefone da empresa', inp('telefone_empresa', 'inputmode="tel" data-mask="tel" maxlength="15" placeholder="(11) 3000-0000"'))}
      </div>
      <div class="form-row">
        ${field('Ramo de atividade', `<select name="ramo"><option value="">Selecione</option>${INFO.ramos.map(r => `<option>${esc(r)}</option>`).join('')}</select>`)}
        ${field('Site da empresa', inp('site_empresa', 'type="url" maxlength="200" placeholder="https://"'), ' <span class="hint-inline">(opcional)</span>')}
      </div>
      <label class="check-line"><input type="checkbox" name="mesmo_endereco" data-same-address> <span>O endereço da empresa é o mesmo informado acima</span></label>
    </fieldset>
    ${addressFields('emp_', 'Endereço da empresa')}`;
  }

  function renderFieldBlocks() {
    document.querySelectorAll('[data-fields]').forEach(el => {
      el.innerHTML = el.dataset.fields === 'pessoa' ? pessoaFields(el.dataset.mode) : empresaFields(el.dataset.mode);
    });
  }

  // Máscaras de digitação
  const MASKS = {
    cpf: d => d.slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'),
    cnpj: d => d.slice(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'),
    cep: d => d.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'),
    tel: d => {
      d = d.slice(0, 11);
      if (d.length <= 2) return d.length ? `(${d}` : '';
      const ddd = `(${d.slice(0, 2)}) `, n = d.slice(2);
      return ddd + (n.length > 8 ? `${n.slice(0, 5)}-${n.slice(5)}` : n.length > 4 ? `${n.slice(0, 4)}-${n.slice(4)}` : n);
    },
  };
  const applyMask = el => { if (el?.dataset?.mask) el.value = MASKS[el.dataset.mask](el.value.replace(/\D/g, '')); };

  // Busca o endereço pelo CEP (ViaCEP) e preenche rua, bairro, cidade e estado.
  async function lookupCep(input) {
    const cep = input.value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    const box = input.closest('[data-address]');
    const prefix = box.dataset.address;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then(x => x.json());
      if (r.erro) return toast('CEP não encontrado. Preencha o endereço manualmente.');
      const set = (n, v) => { const el = box.querySelector(`[name="${prefix}${n}"]`); if (el && v && !el.value) el.value = v; };
      set('logradouro', r.logradouro); set('bairro', r.bairro); set('cidade', r.localidade); set('uf', r.uf);
      box.querySelector(`[name="${prefix}numero"]`)?.focus();
    } catch { /* sem internet: o usuário preenche à mão */ }
  }

  document.addEventListener('input', e => {
    if (e.target.dataset?.mask) {
      applyMask(e.target);
      if (e.target.dataset.mask === 'cep') lookupCep(e.target);
    }
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-same-address]')) {
      const form = e.target.form;
      form.querySelector('[data-address="emp_"]').hidden = e.target.checked;
    }
  });

  function fillFields(form, data) {
    for (const el of form.elements) {
      if (!el.name || !(el.name in data) || el.type === 'checkbox') continue;
      el.value = data[el.name] ?? '';
      applyMask(el);
    }
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  }

  function msg(form, text, ok = false) {
    const el = form.querySelector('.form-msg');
    el.hidden = !text;
    el.className = `form-msg ${ok ? 'ok' : 'err'}`;
    el.textContent = text || '';
  }

  let toastTimer;
  function toast(t) {
    const el = $('#toast');
    el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  const formData = form => Object.fromEntries(new FormData(form));

  // Liga um formulário a uma chamada da API, com mensagem de erro/sucesso.
  function bind(sel, handler) {
    $(sel).addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target, btn = form.querySelector('[type=submit]');
      msg(form, '');
      btn.disabled = true;
      try { await handler(form, formData(form)); } catch (err) { msg(form, err.message); }
      btn.disabled = false;
    });
  }

  // ── Telas ────────────────────────────────────────────────────────────────
  function show(view) {
    for (const v of ['entrar', 'cadastro', 'conta']) $(`#view-${v}`).hidden = v !== view;
    $('#logout').hidden = view !== 'conta';
  }

  let fieldsReady = false;
  async function route() {
    if (!fieldsReady) {
      INFO = await api('/api/conta/cadastro-info').catch(() => INFO);
      signupInfo = INFO;
      renderFieldBlocks();
      fieldsReady = true;
    }
    const me = await api('/api/conta/me');
    ME = me.user; LOJA = me.loja;
    if (ME) return renderAccount();
    const hash = location.hash.replace('#', '');
    show(hash === 'cadastro' ? 'cadastro' : 'entrar');
    if (hash === 'cadastro') loadSignupInfo();
  }
  window.addEventListener('hashchange', () => { if (!ME) route(); });

  // ── Entrar ───────────────────────────────────────────────────────────────
  bind('#form-entrar', async (form, d) => {
    await api('/api/conta/entrar', { method: 'POST', body: d });
    location.hash = '';
    route();
  });

  // ── Cadastro ─────────────────────────────────────────────────────────────
  let signupInfo = null;
  async function loadSignupInfo() {
    signupInfo = signupInfo || await api('/api/conta/cadastro-info').catch(() => null);
    updateSignupNote();
  }
  function updateSignupNote() {
    const tipo = $('#form-cadastro').tipo.value;
    $('#form-cadastro [data-empresa]').hidden = tipo !== 'empresa';
    const mode = signupInfo?.[tipo];
    const label = tipo === 'empresa' ? 'empresas' : 'consumidores';
    $('#signup-note').textContent = mode === 'fechado'
      ? `Os cadastros de ${label} estão fechados no momento.`
      : mode === 'aprovacao'
        ? `Cadastros de ${label} passam por aprovação do administrador antes de liberar o acesso.`
        : 'Escolha o tipo de conta.';
    $('#form-cadastro [type=submit]').disabled = mode === 'fechado';
  }
  $('#form-cadastro').addEventListener('change', e => { if (e.target.name === 'tipo') updateSignupNote(); });

  bind('#form-cadastro', async (form, d) => {
    const r = await api('/api/conta/cadastro', { method: 'POST', body: d });
    if (r.status === 'active') { location.hash = ''; return route(); }
    form.reset();
    form.querySelector('[data-address="emp_"]').hidden = false;
    updateSignupNote();
    msg(form, 'Cadastro enviado! Assim que o administrador aprovar, você poderá entrar com seu e-mail e senha.', true);
  });

  // ── Área do usuário ──────────────────────────────────────────────────────
  const TABS_CONSUMIDOR = [['inicio', 'Início'], ['perfil', 'Meus dados']];
  const TABS_EMPRESA = [['inicio', 'Início'], ['loja', 'Minha loja'], ['produtos', 'Produtos'], ['importar', 'Importação automática'], ['perfil', 'Meus dados']];
  let currentTab = 'inicio';

  function renderAccount() {
    show('conta');
    const empresa = ME.tipo === 'empresa';
    $('#who-name').textContent = empresa ? (ME.empresa_nome || ME.nome) : ME.nome;
    $('#who-type').textContent = empresa ? `Conta de empresa · ${ME.nome}` : 'Conta de consumidor';
    const tabs = empresa ? TABS_EMPRESA : TABS_CONSUMIDOR;
    if (!tabs.some(([k]) => k === currentTab)) currentTab = 'inicio';
    $('#account-nav').innerHTML = tabs.map(([k, label]) =>
      `<button type="button" data-tab="${k}" aria-current="${k === currentTab}">${label}</button>`).join('');
    document.querySelectorAll('[data-empresa]').forEach(el => { el.hidden = !empresa; });

    $('#hello-name').textContent = ME.nome.split(' ')[0];
    $('#hello-text').textContent = empresa
      ? (ME.bloqueio_publicacao
        ? 'Sua conta está impedida de publicar produtos pelo administrador. Você ainda pode ver as ofertas.'
        : LOJA ? 'Gerencie sua loja, cadastre produtos em promoção ou configure a importação automática.'
          : 'Crie sua loja na aba "Minha loja" para começar a publicar seus produtos com desconto.')
      : 'Sua conta de consumidor dá acesso a todas as ofertas com desconto do site.';
    $('#hello-store').hidden = !LOJA;
    if (LOJA) $('#hello-store').href = `/loja/${LOJA.slug}`;

    const fp = $('#form-perfil');
    fillFields(fp, ME);
    fp.email.value = ME.email;

    if (empresa) fillStore();
    openTab(currentTab);
  }

  function openTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
    document.querySelectorAll('#account-nav button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab));
    if (tab === 'produtos') loadProducts();
  }
  $('#account-nav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) openTab(b.dataset.tab); });

  function fillStore() {
    const f = $('#form-loja');
    f.nome.value = LOJA?.nome || ME.empresa_nome || '';
    f.descricao.value = LOJA?.descricao || '';
    f.logo_url.value = LOJA?.logo_url || '';
    f.site_url.value = LOJA?.site_url || '';
    $('#store-link').hidden = !LOJA;
    if (LOJA) $('#store-link').href = `/loja/${LOJA.slug}`;
    $('#form-feed').feed_url.value = LOJA?.feed_url || '';
    const st = LOJA?.feed_status;
    $('#feed-status').innerHTML = !LOJA?.feed_url ? 'Nenhum link configurado.'
      : `<span class="status-pill ${st === 'ok' ? 'ok' : st === 'erro' ? 'err' : ''}">${st === 'ok' ? 'Funcionando' : st === 'erro' ? 'Com erro' : 'Aguardando sincronização'}</span>
         ${LOJA.feed_tipo ? ` · formato: ${esc(LOJA.feed_tipo)}` : ''} · última sincronização: ${fmtDate(LOJA.feed_ultima_sync)}
         ${LOJA.feed_mensagem ? `<br>${esc(LOJA.feed_mensagem)}` : ''}`;
  }

  bind('#form-loja', async (form, d) => {
    const r = await api('/api/conta/loja', { method: 'PUT', body: d });
    LOJA = r.loja;
    msg(form, 'Loja salva!', true);
    renderAccount();
    openTab('loja');
  });

  async function loadProducts() {
    const list = await api('/api/conta/produtos').catch(() => []);
    $('#prod-count').textContent = `(${list.length})`;
    $('#prod-list').innerHTML = list.length ? list.map(p => {
      const status = p.oculto ? ['Oculto pelo administrador', 'err'] : p.no_prazo ? ['No ar', 'ok'] : ['Expirado', ''];
      return `<div class="prod-row">
        <img src="/api/img/${p.id}" alt="" loading="lazy">
        <div style="min-width:0">
          <div class="t" title="${esc(p.produto)}">${esc(p.produto)}</div>
          <div class="s"><s>R$ ${brl(p.preco_anterior)}</s> R$ ${brl(p.preco_atual)} · -${p.desconto_pct}% ·
            <span class="status-pill ${status[1]}">${status[0]}</span> · ${p.fonte === 'feed' ? 'importado' : 'manual'} · ${p.link_clicks} clique(s)</div>
        </div>
        <button class="btn btn-sm" type="button" data-del="${p.id}">Excluir</button>
      </div>`;
    }).join('') : '<p class="muted">Nenhum produto ainda.</p>';
  }
  $('#prod-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm('Excluir este produto?')) return;
    try { await api(`/api/conta/produtos/${b.dataset.del}`, { method: 'DELETE' }); loadProducts(); }
    catch (err) { toast(err.message); }
  });

  bind('#form-produto', async (form, d) => {
    await api('/api/conta/produtos', { method: 'POST', body: d });
    form.reset();
    msg(form, 'Produto publicado!', true);
    loadProducts();
  });

  bind('#form-feed', async (form, d) => {
    const r = await api('/api/conta/feed', { method: 'PUT', body: d });
    LOJA = r.loja;
    fillStore();
    msg(form, d.feed_url ? 'Link salvo. Clique em "Sincronizar agora" para importar.' : 'Importação desativada.', true);
  });

  $('#feed-sync').addEventListener('click', async () => {
    const btn = $('#feed-sync');
    btn.disabled = true; btn.textContent = 'Sincronizando…';
    try {
      const r = await api('/api/conta/feed/sincronizar', { method: 'POST' });
      toast(`${r.saved} produto(s) importado(s).`);
    } catch (err) { msg($('#form-feed'), err.message); }
    const me = await api('/api/conta/me'); LOJA = me.loja; fillStore();
    btn.disabled = false; btn.textContent = 'Sincronizar agora';
  });

  bind('#form-perfil', async (form, d) => {
    await api('/api/conta/perfil', { method: 'PUT', body: d });
    const me = await api('/api/conta/me'); ME = me.user;
    renderAccount(); openTab('perfil');
    msg($('#form-perfil'), 'Dados salvos!', true);
  });
  bind('#form-senha', async (form, d) => {
    await api('/api/conta/senha', { method: 'POST', body: d });
    form.reset(); msg(form, 'Senha alterada!', true);
  });
  bind('#form-excluir', async (form, d) => {
    if (!confirm('Tem certeza? Sua conta, loja e produtos serão apagados.')) return;
    await api('/api/conta/excluir', { method: 'POST', body: d });
    location.href = '/';
  });

  $('#logout').addEventListener('click', async () => {
    await api('/api/conta/sair', { method: 'POST' });
    ME = null; location.hash = ''; route();
  });

  route().catch(err => { document.querySelector('main').innerHTML = `<p class="container">Erro: ${esc(err.message)}</p>`; });
})();
