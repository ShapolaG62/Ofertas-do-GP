/* Ofertas do GP — login (e-mail ou Google), primeiro acesso, área do usuário e criador de anúncios */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = s => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const parseMoney = s => {
    let c = String(s || '').replace(/[^\d.,]/g, '');
    if (c.includes(',')) c = c.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(c);
    return Number.isFinite(n) ? n : null;
  };

  let ME = null, LOJA = null;
  let INFO = { ufs: [], ramos: [], categorias: [], condicoes: {}, fretes: {}, max_fotos: 6, google: false };
  const CAT_LABELS = {
    celulares: 'Celulares e tablets', informatica: 'Informática', games: 'Games', audio_tv: 'Áudio e TV',
    cozinha: 'Cozinha', eletrodomesticos: 'Eletrodomésticos', casa: 'Casa', moda: 'Moda e calçados',
    beleza: 'Beleza', saude: 'Saúde e suplementos', ferramentas: 'Ferramentas', limpeza: 'Limpeza',
    alimentos: 'Alimentos e bebidas', pets: 'Pets', automotivo: 'Automotivo', brinquedos: 'Brinquedos', outros: 'Outros',
  };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.raw ? { 'Content-Type': opts.raw.type } : opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.raw ? opts.raw : opts.body ? JSON.stringify(opts.body) : undefined,
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
    if (text && !ok) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  let toastTimer;
  function toast(t) {
    const el = $('#toast');
    el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  const formData = form => Object.fromEntries(new FormData(form));

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

  // ── Campos cadastrais (primeiro acesso e "Meus dados") ─────────────────────
  const field = (label, input, extra = '') => `<label class="field"><span>${label}${extra}</span>${input}</label>`;
  const inp = (name, attrs = '') => `<input name="${name}" ${attrs}>`;
  const opt = ' <span class="hint-inline">(opcional)</span>';

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
        ${field('Complemento', inp(p('complemento'), 'maxlength="60" placeholder="Apto, sala, bloco..."'), opt)}
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
        ${field('Inscrição estadual', inp('inscricao_estadual', 'maxlength="20" placeholder="Isento, se não tiver"'), opt)}
        ${field('Telefone da empresa', inp('telefone_empresa', 'inputmode="tel" data-mask="tel" maxlength="15" placeholder="(11) 3000-0000"'))}
      </div>
      <div class="form-row">
        ${field('Ramo de atividade', `<select name="ramo"><option value="">Selecione</option>${INFO.ramos.map(r => `<option>${esc(r)}</option>`).join('')}</select>`)}
        ${field('Site da empresa', inp('site_empresa', 'type="url" maxlength="200" placeholder="https://"'), opt)}
      </div>
      <label class="check-line"><input type="checkbox" name="mesmo_endereco" data-same-address> <span>O endereço da empresa é o mesmo informado acima</span></label>
    </fieldset>
    ${addressFields('emp_', 'Endereço da empresa')}`;
  }

  function renderFieldBlocks() {
    $$('[data-fields]').forEach(el => {
      el.innerHTML = el.dataset.fields === 'pessoa' ? pessoaFields(el.dataset.mode) : empresaFields(el.dataset.mode);
    });
  }

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
  const applyMask = el => { if (el?.dataset?.mask && el.value) el.value = MASKS[el.dataset.mask](el.value.replace(/\D/g, '')); };

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
    } catch { /* sem internet: preenchimento manual */ }
  }

  document.addEventListener('input', e => {
    if (e.target.dataset?.mask) {
      applyMask(e.target);
      if (e.target.dataset.mask === 'cep') lookupCep(e.target);
    }
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-same-address]')) e.target.form.querySelector('[data-address="emp_"]').hidden = e.target.checked;
  });

  function fillFields(form, data) {
    for (const el of form.elements) {
      if (!el.name || !(el.name in data) || el.type === 'checkbox' || el.type === 'file') continue;
      el.value = data[el.name] ?? '';
      applyMask(el);
    }
  }

  // ── Navegação entre telas ──────────────────────────────────────────────────
  const VIEWS = ['login', 'perfil', 'dados', 'aguardando', 'conta'];
  function show(view) {
    for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
    $('#logout').hidden = view === 'login';
    document.title = `${view === 'login' ? 'Entrar' : 'Minha conta'} — Ofertas do GP`;
    window.scrollTo(0, 0);
  }

  async function route() {
    const me = await api('/api/conta/me');
    ME = me.user; LOJA = me.loja;
    if (!ME) return showLogin();
    if (ME.status === 'onboarding') return showProfileChoice();
    if (ME.status === 'pending') {
      $('#aguardando-text').textContent = `Seu cadastro de ${ME.tipo === 'empresa' ? 'empresa' : 'consumidor'} foi enviado e está aguardando a aprovação do administrador. Assim que for aprovado, as ferramentas da sua conta serão liberadas aqui.`;
      return show('aguardando');
    }
    renderAccount();
  }

  // ── Login e criação de conta ───────────────────────────────────────────────
  function showLogin() {
    show('login');
    const params = new URLSearchParams(location.search);
    if (params.get('erro')) {
      $('#auth-error').textContent = params.get('erro');
      $('#auth-error').hidden = false;
      history.replaceState(null, '', location.pathname + location.hash);
    }
    $('#google-btn').hidden = !INFO.google;
    $('#google-divider').hidden = !INFO.google;
    setAuthTab(location.hash === '#cadastro' ? 'criar' : 'entrar');
  }

  function setAuthTab(tab) {
    $$('[data-auth]').forEach(b => b.setAttribute('aria-selected', b.dataset.auth === tab));
    $('#form-entrar').hidden = tab !== 'entrar';
    $('#form-criar').hidden = tab !== 'criar';
    $('#google-label').textContent = tab === 'criar' ? 'Criar conta com Google' : 'Entrar com Google';
    const closed = INFO.consumidor === 'fechado' && INFO.empresa === 'fechado';
    if (tab === 'criar' && closed) msg($('#form-criar'), 'Os cadastros estão fechados no momento.');
  }
  $$('[data-auth]').forEach(b => b.addEventListener('click', () => setAuthTab(b.dataset.auth)));

  bind('#form-entrar', async (form, d) => {
    await api('/api/conta/entrar', { method: 'POST', body: d });
    location.hash = '';
    route();
  });

  bind('#form-criar', async (form, d) => {
    if (d.senha !== d.senha_confirmacao) throw new Error('As senhas não conferem.');
    await api('/api/conta/cadastro', { method: 'POST', body: d });
    location.hash = '';
    route();
  });

  // ── Primeiro acesso: perfil e dados ────────────────────────────────────────
  let chosenTipo = null;

  function showProfileChoice() {
    show('perfil');
    for (const tipo of ['consumidor', 'empresa']) {
      const mode = INFO[tipo];
      const card = $(`.profile-card[data-tipo="${tipo}"]`);
      card.disabled = mode === 'fechado';
      $(`[data-note="${tipo}"]`).textContent = mode === 'fechado' ? 'Cadastros fechados no momento.'
        : mode === 'aprovacao' ? 'Liberado após aprovação do administrador.' : 'Acesso liberado na hora.';
    }
  }

  $$('.profile-card').forEach(card => card.addEventListener('click', () => {
    if (card.disabled) return;
    chosenTipo = card.dataset.tipo;
    const empresa = chosenTipo === 'empresa';
    $('#dados-title').textContent = empresa ? 'Dados do responsável e da empresa' : 'Seus dados';
    $('#dados-sub').textContent = `Perfil escolhido: ${empresa ? 'Empresarial' : 'Consumidor'}.`;
    $('#form-dados [data-fields="empresa"]').hidden = !empresa;
    const form = $('#form-dados');
    if (ME?.nome && !form.nome.value) form.nome.value = ME.nome;
    show('dados');
  }));
  $('#trocar-perfil').addEventListener('click', showProfileChoice);

  bind('#form-dados', async (form, d) => {
    const r = await api('/api/conta/perfil-inicial', { method: 'POST', body: { ...d, tipo: chosenTipo } });
    toast(r.status === 'active' ? 'Cadastro concluído!' : 'Cadastro enviado para aprovação.');
    route();
  });

  // ── Área do usuário ────────────────────────────────────────────────────────
  const TABS_CONSUMIDOR = [['inicio', 'Início'], ['perfil', 'Meus dados'], ['seguranca', 'Senha e conta']];
  const TABS_EMPRESA = [['inicio', 'Início'], ['anuncios', 'Anúncios'], ['loja', 'Minha loja'], ['importar', 'Importação automática'],
    ['perfil', 'Meus dados'], ['seguranca', 'Senha e conta']];
  let currentTab = 'inicio';

  function renderAccount() {
    show('conta');
    const empresa = ME.tipo === 'empresa';
    $('#who-name').textContent = empresa ? (ME.empresa_nome || ME.nome) : ME.nome;
    $('#who-type').textContent = empresa ? `Conta empresarial · ${ME.nome}` : 'Conta de consumidor';
    $('#who-avatar').hidden = !ME.avatar_url;
    if (ME.avatar_url) $('#who-avatar').src = ME.avatar_url;
    const tabs = empresa ? TABS_EMPRESA : TABS_CONSUMIDOR;
    if (!tabs.some(([k]) => k === currentTab)) currentTab = 'inicio';
    $('#account-nav').innerHTML = tabs.map(([k, label]) =>
      `<button type="button" data-tab="${k}" aria-current="${k === currentTab}">${label}</button>`).join('');
    $$('#view-conta [data-empresa]').forEach(el => { el.hidden = !empresa; });

    $('#hello-name').textContent = (ME.nome || '').split(' ')[0];
    $('#hello-text').textContent = empresa
      ? (ME.bloqueio_publicacao
        ? 'Sua conta está impedida de publicar anúncios pelo administrador. Você ainda pode ver as ofertas.'
        : LOJA ? 'Crie anúncios dos seus produtos em promoção, edite sua loja ou configure a importação automática.'
          : 'Comece criando sua loja na aba "Minha loja". Depois é só anunciar seus produtos em promoção.')
      : 'Sua conta de consumidor dá acesso a todas as ofertas com desconto do site.';
    $('#hello-store').hidden = !LOJA;
    if (LOJA) $('#hello-store').href = `/loja/${LOJA.slug}`;
    $('#hello-new-ad').hidden = !empresa || !LOJA || ME.bloqueio_publicacao;

    fillFields($('#form-perfil'), ME);
    $('#form-perfil').email.value = ME.email;

    // Conta só com Google: pode definir senha sem a atual; exclusão confirma digitando EXCLUIR.
    $('#senha-title').textContent = ME.tem_senha ? 'Trocar senha' : 'Definir senha';
    $('#senha-note').hidden = ME.tem_senha;
    $('#senha-atual-field').hidden = !ME.tem_senha;
    $('#excluir-senha').hidden = !ME.tem_senha;
    $('#excluir-confirma').hidden = ME.tem_senha;

    if (empresa) fillStore();
    openTab(currentTab);
  }

  function openTab(tab) {
    currentTab = tab;
    $$('.tab-pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
    $$('#account-nav button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab));
    if (tab === 'anuncios') { closeEditor(); loadProducts(); }
  }
  $('#account-nav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) openTab(b.dataset.tab); });
  $('#hello-new-ad').addEventListener('click', () => { openTab('anuncios'); openEditor(); });

  function fillStore() {
    const f = $('#form-loja');
    f.nome.value = LOJA?.nome || ME.empresa_nome || '';
    f.descricao.value = LOJA?.descricao || '';
    f.logo_url.value = LOJA?.logo_url || '';
    f.site_url.value = LOJA?.site_url || ME.site_empresa || '';
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
    renderAccount();
    openTab('loja');
    msg($('#form-loja'), 'Loja salva!', true);
  });

  // ── Lista de anúncios ──────────────────────────────────────────────────────
  async function loadProducts() {
    const list = await api('/api/conta/produtos').catch(() => []);
    $('#prod-count').textContent = `(${list.length})`;
    $('#new-ad').disabled = !LOJA || ME.bloqueio_publicacao;
    $('#prod-list').innerHTML = !LOJA
      ? '<p class="muted">Crie sua loja na aba "Minha loja" antes de anunciar.</p>'
      : list.length ? list.map(p => {
        const status = p.oculto ? ['Oculto pelo administrador', 'err'] : p.no_prazo ? ['No ar', 'ok'] : ['Expirado', ''];
        const isAd = p.fonte === 'empresa';
        return `<div class="prod-row">
          <img src="/api/img/${p.id}" alt="" loading="lazy">
          <div style="min-width:0">
            <div class="t" title="${esc(p.produto)}">${esc(p.produto)}</div>
            <div class="s"><s>R$ ${brl(p.preco_anterior)}</s> R$ ${brl(p.preco_atual)} · -${p.desconto_pct}% ·
              <span class="status-pill ${status[1]}">${status[0]}</span> · ${isAd ? 'anúncio' : 'importado'} · ${p.link_clicks} clique(s)
              ${p.no_prazo ? ` · até ${fmtDate(p.expires_at)}` : ''}</div>
          </div>
          <div class="row-actions">
            ${isAd && p.no_prazo && !p.oculto ? `<a class="btn btn-sm" href="/anuncio/${p.id}" target="_blank">Ver</a>` : ''}
            ${isAd ? `<button class="btn btn-sm" type="button" data-edit="${p.id}">${p.no_prazo ? 'Editar' : 'Editar e renovar'}</button>` : ''}
            <button class="btn btn-sm" type="button" data-del="${p.id}">Excluir</button>
          </div>
        </div>`;
      }).join('') : '<p class="muted">Você ainda não tem anúncios. Clique em "Criar anúncio".</p>';
  }

  $('#prod-list').addEventListener('click', async e => {
    const del = e.target.closest('[data-del]');
    const edit = e.target.closest('[data-edit]');
    if (edit) return openEditor(Number(edit.dataset.edit));
    if (!del || !confirm('Excluir este anúncio?')) return;
    try { await api(`/api/conta/produtos/${del.dataset.del}`, { method: 'DELETE' }); loadProducts(); toast('Anúncio excluído.'); }
    catch (err) { toast(err.message); }
  });
  $('#new-ad').addEventListener('click', () => openEditor());

  // ── Criador de anúncios ────────────────────────────────────────────────────
  let editingId = null;
  let photos = [];

  function fillAdSelects() {
    $('#ad-categoria').innerHTML = '<option value="">Selecione</option>' +
      INFO.categorias.map(c => `<option value="${c}">${esc(CAT_LABELS[c] || c)}</option>`).join('');
    $('#ad-condicao').innerHTML = '<option value="">Selecione</option>' +
      Object.entries(INFO.condicoes).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    $('#ad-frete').innerHTML = '<option value="">Selecione</option>' +
      Object.entries(INFO.fretes).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    $('#max-fotos').textContent = INFO.max_fotos;
  }

  async function openEditor(id = null) {
    editingId = id;
    const form = $('#form-ad');
    form.reset();
    msg(form, '');
    photos = [];
    $('#ad-editor-title').textContent = id ? 'Editar anúncio' : 'Criar anúncio';
    $('#ad-submit').textContent = id ? 'Salvar e publicar' : 'Publicar anúncio';
    if (id) {
      try {
        const ad = await api(`/api/conta/anuncios/${id}`);
        fillFields(form, {
          titulo: ad.produto, categoria: ad.categoria, condicao: ad.condicao, marca: ad.marca, modelo: ad.modelo,
          descricao: ad.descricao, preco_anterior: brl(ad.preco_anterior), preco_atual: brl(ad.preco_atual),
          parcelamento: ad.parcelamento, cupom_codigo: ad.cupom_codigo, cupom_descricao: ad.cupom_descricao,
          frete: ad.frete, frete_valor: ad.frete_valor != null ? brl(ad.frete_valor) : '', prazo_entrega: ad.prazo_entrega,
          estoque: ad.estoque ?? '', garantia: ad.garantia, sku: ad.sku, ean: ad.ean, url: ad.original_url, whatsapp: ad.whatsapp,
        });
        photos = ad.imagens || [];
      } catch (err) { return toast(err.message); }
    }
    $('#ads-list-card').hidden = true;
    $('#ad-editor').hidden = false;
    renderPhotos();
    updateAdUi();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeEditor() {
    $('#ad-editor').hidden = true;
    $('#ads-list-card').hidden = false;
  }
  $('#ad-cancel').addEventListener('click', () => { closeEditor(); loadProducts(); });

  // Fotos: envio, remoção e reordenação (arrastar)
  function renderPhotos() {
    $('#photo-grid').innerHTML = photos.map((src, i) => `
      <div class="photo-item" draggable="true" data-i="${i}">
        <img src="${esc(src)}" alt="" referrerpolicy="no-referrer">
        ${i === 0 ? '<span class="photo-badge">Capa</span>' : ''}
        <button type="button" class="photo-del" data-del-photo="${i}" aria-label="Remover foto">×</button>
      </div>`).join('') || '<p class="muted" style="margin:0">Nenhuma foto ainda.</p>';
    updatePreview();
  }

  async function uploadFiles(files) {
    for (const file of files) {
      if (photos.length >= INFO.max_fotos) { toast(`Máximo de ${INFO.max_fotos} fotos.`); break; }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast(`${file.name}: use JPG, PNG ou WEBP.`); continue; }
      if (file.size > 3 * 1024 * 1024) { toast(`${file.name}: máximo 3 MB.`); continue; }
      try {
        const r = await api('/api/conta/upload', { method: 'POST', raw: file });
        photos.push(r.url);
        renderPhotos();
      } catch (err) { toast(err.message); }
    }
  }
  $('#photo-input').addEventListener('change', e => { uploadFiles([...e.target.files]); e.target.value = ''; });
  $('#photo-link').addEventListener('click', () => {
    if (photos.length >= INFO.max_fotos) return toast(`Máximo de ${INFO.max_fotos} fotos.`);
    const url = prompt('Link da foto (começando com https://):');
    if (!url) return;
    if (!/^https:\/\//i.test(url.trim())) return toast('Use um link começando com https://');
    photos.push(url.trim());
    renderPhotos();
  });
  $('#photo-grid').addEventListener('click', e => {
    const b = e.target.closest('[data-del-photo]');
    if (b) { photos.splice(Number(b.dataset.delPhoto), 1); renderPhotos(); }
  });
  let dragFrom = null;
  $('#photo-grid').addEventListener('dragstart', e => { dragFrom = Number(e.target.closest('.photo-item')?.dataset.i); });
  $('#photo-grid').addEventListener('dragover', e => e.preventDefault());
  $('#photo-grid').addEventListener('drop', e => {
    e.preventDefault();
    const to = Number(e.target.closest('.photo-item')?.dataset.i);
    if (Number.isInteger(dragFrom) && Number.isInteger(to) && dragFrom !== to) {
      const [moved] = photos.splice(dragFrom, 1);
      photos.splice(to, 0, moved);
      renderPhotos();
    }
    dragFrom = null;
  });
  // Arrastar arquivos do computador direto para a área de fotos
  const dropZone = $('#photo-grid').closest('fieldset');
  dropZone.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  dropZone.addEventListener('drop', e => {
    if (e.dataTransfer?.files?.length) { e.preventDefault(); uploadFiles([...e.dataTransfer.files]); }
  });

  // Contadores, desconto calculado, campo de frete e prévia ao vivo
  function updateAdUi() {
    const f = $('#form-ad');
    const anterior = parseMoney(f.preco_anterior.value), atual = parseMoney(f.preco_atual.value);
    const pct = anterior && atual && anterior > atual ? Math.round((anterior - atual) / anterior * 100) : null;
    $('#ad-discount').textContent = pct ? `— ${pct}% de desconto` : '';
    $('#frete-valor-field').hidden = f.frete.value !== 'pago';
    $('[data-count="titulo"]').textContent = `${f.titulo.value.length}/150`;
    $('[data-count="descricao"]').textContent = `${f.descricao.value.length}/3000 (mín. 20)`;
    updatePreview();
  }
  $('#form-ad').addEventListener('input', updateAdUi);
  $('#form-ad').addEventListener('change', updateAdUi);

  function updatePreview() {
    const f = $('#form-ad');
    const anterior = parseMoney(f.preco_anterior.value), atual = parseMoney(f.preco_atual.value);
    const pct = anterior && atual && anterior > atual ? Math.round((anterior - atual) / anterior * 100) : null;
    const frete = INFO.fretes[f.frete.value];
    $('#ad-preview-card').innerHTML = `<div class="card">
      <div class="card-media">
        ${photos[0] ? `<img src="${esc(photos[0])}" alt="" referrerpolicy="no-referrer">` : '<div class="preview-empty">Foto de capa</div>'}
        ${pct ? `<span class="card-off">-${pct}%</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-store"><span class="store-dot" style="background:var(--brand)"></span>Loja parceira · ${esc(LOJA?.nome || 'Sua loja')}</div>
        <h3 class="card-title">${esc(f.titulo.value || 'Título do anúncio')}</h3>
        <div class="card-prices">
          <div class="card-old num">${anterior ? `R$ ${brl(anterior)}` : '&nbsp;'}</div>
          <div class="card-price num"><small>R$</small>${atual ? brl(atual) : '0,00'}</div>
        </div>
        <div class="card-foot"><span>${esc([frete, f.parcelamento.value].filter(Boolean).join(' · ') || 'Publicado pela loja')}</span></div>
      </div>
    </div>`;
  }

  bind('#form-ad', async (form, d) => {
    const body = { ...d, imagens: photos };
    const r = editingId
      ? await api(`/api/conta/anuncios/${editingId}`, { method: 'PUT', body })
      : await api('/api/conta/anuncios', { method: 'POST', body });
    toast(editingId ? 'Anúncio atualizado!' : 'Anúncio publicado!');
    closeEditor();
    loadProducts();
    if (!editingId && confirm('Anúncio publicado! Quer ver como ficou?')) window.open(`/anuncio/${r.id}`, '_blank');
  });

  // ── Importação, dados e segurança ──────────────────────────────────────────
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
    form.reset();
    const me = await api('/api/conta/me'); ME = me.user;
    renderAccount(); openTab('seguranca');
    msg($('#form-senha'), 'Senha salva!', true);
  });

  bind('#form-excluir', async (form, d) => {
    if (!confirm('Tem certeza? Sua conta, loja e anúncios serão apagados.')) return;
    await api('/api/conta/excluir', { method: 'POST', body: d });
    location.href = '/';
  });

  $('#logout').addEventListener('click', async () => {
    await api('/api/conta/sair', { method: 'POST' });
    ME = null; location.hash = ''; route();
  });

  // ── Início ─────────────────────────────────────────────────────────────────
  (async () => {
    INFO = { ...INFO, ...(await api('/api/conta/cadastro-info').catch(() => ({}))) };
    renderFieldBlocks();
    fillAdSelects();
    await route();
  })().catch(err => { document.querySelector('main').innerHTML = `<p class="container">Erro: ${esc(err.message)}</p>`; });
})();
