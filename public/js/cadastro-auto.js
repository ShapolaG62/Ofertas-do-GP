// Ajudas dos formulários de cadastro, usadas em todas as telas do site:
// • CEP → preenche rua, bairro, cidade e estado (ViaCEP; reserva: BrasilAPI);
// • CNPJ → preenche os dados da empresa com os dados públicos da Receita Federal (/api/cadastro/cnpj);
// • Loja parceira pessoa física (CPF) ou jurídica (CNPJ): mostra só os campos de cada caso;
// • Senha nova → lista ao vivo do que falta para a senha ficar forte (mesmas regras do servidor).
(() => {
  // Estilos próprios (o painel do administrador não usa o site.css)
  const css = document.createElement('style');
  css.textContent = `
    [data-so-pj][hidden], [data-so-pf][hidden], .auto-aviso[hidden], .senha-regras[hidden] { display: none !important; }
    .senha-par { display: grid; grid-template-columns: 1fr 1fr !important; gap: 12px; grid-column: 1 / -1; }
    .senha-par > .field { min-width: 0; }
    .senha-par > [hidden] { display: none !important; }
    .senha-par:has(> .field[hidden]) { grid-template-columns: 1fr !important; }
    .tipo-loja { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 4px 0 12px; }
    @media (max-width: 480px) { .tipo-loja { grid-template-columns: 1fr; } }
    .auto-aviso { display: block; margin: -4px 0 10px; font-size: 12.5px; color: var(--muted, #6b7280); grid-column: 1 / -1; }
    .auto-aviso.ok { color: #15803d; } .auto-aviso.erro { color: #b91c1c; }
    .senha-regras { list-style: none; margin: -2px 0 10px; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12.5px; color: var(--muted, #6b7280); grid-column: 1 / -1; }
    .senha-regras li::before { content: '○ '; }
    .senha-regras li.ok { color: #15803d; } .senha-regras li.ok::before { content: '✓ '; font-weight: 700; }`;
  document.head.appendChild(css);
  const so =s => String(s || '').replace(/\D/g, '');
  const fmtCep = d => d.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  const fmtTel = d => {
    d = d.slice(0, 11);
    if (d.length <= 2) return d;
    const n = d.slice(2);
    return `(${d.slice(0, 2)}) ${n.length > 8 ? `${n.slice(0, 5)}-${n.slice(5)}` : n.length > 4 ? `${n.slice(0, 4)}-${n.slice(4)}` : n}`;
  };
  const campo = (form, nome) => form?.querySelector(`[name="${nome}"]`);
  const definir = (form, nome, valor) => {
    const el = campo(form, nome);
    if (!el || valor == null || valor === '') return;
    if (el.tagName === 'SELECT' && ![...el.options].some(o => (o.value || o.text) === valor)) return;
    el.value = valor;
  };

  // Mensagem curta logo abaixo do campo
  function aviso(input, texto, tipo = '') {
    const label = input.closest('label') || input.parentElement;
    let el = label.parentElement.querySelector(`.auto-aviso[data-de="${input.name}"]`);
    if (!el) {
      el = document.createElement('small');
      el.className = 'auto-aviso';
      el.dataset.de = input.name;
      label.insertAdjacentElement('afterend', el);
    }
    el.className = `auto-aviso ${tipo}`;
    el.textContent = texto;
    el.hidden = !texto;
  }

  // ── CEP ─────────────────────────────────────────────────────────────────
  async function buscarCep(cep) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then(x => x.json());
      if (!r.erro) return { logradouro: r.logradouro, bairro: r.bairro, cidade: r.localidade, uf: r.uf };
    } catch { /* tenta a reserva */ }
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
      if (r.ok) { const d = await r.json(); return { logradouro: d.street, bairro: d.neighborhood, cidade: d.city, uf: d.state }; }
      if (r.status === 404) return null;
    } catch { /* sem internet */ }
    return undefined;
  }

  async function aoDigitarCep(input) {
    const cep = so(input.value);
    if (cep.length !== 8 || input.dataset.cepBuscado === cep) return;
    input.dataset.cepBuscado = cep;
    const form = input.form || input.closest('form') || document;
    const p = input.name.slice(0, -3); // '' ou 'emp_'
    aviso(input, 'Buscando endereço…');
    const end = await buscarCep(cep);
    if (so(input.value) !== cep) return; // a pessoa já mudou o CEP
    if (end === null) return aviso(input, 'CEP não encontrado. Confira ou preencha o endereço.', 'erro');
    if (!end) return aviso(input, 'Não foi possível buscar o CEP agora. Preencha o endereço.', 'erro');
    for (const k of ['logradouro', 'bairro', 'cidade']) { const el = campo(form, p + k); if (el) el.value = end[k] || ''; }
    definir(form, `${p}uf`, end.uf);
    aviso(input, end.logradouro ? '' : 'CEP geral da cidade: informe a rua e o bairro.');
    const prox = campo(form, end.logradouro ? `${p}numero` : `${p}logradouro`);
    if (prox && !prox.closest('[hidden]')) prox.focus();
  }

  // ── CNPJ ────────────────────────────────────────────────────────────────
  async function aoDigitarCnpj(input) {
    const cnpj = so(input.value);
    if (cnpj.length !== 14) { aviso(input, ''); return; }
    if (input.dataset.cnpjBuscado === cnpj || input.disabled) return;
    input.dataset.cnpjBuscado = cnpj;
    const form = input.form || document;
    aviso(input, 'Consultando o CNPJ na Receita Federal…');
    let d;
    try {
      const r = await fetch(`/api/cadastro/cnpj/${cnpj}`);
      d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Não foi possível consultar o CNPJ agora.');
    } catch (err) {
      input.dataset.cnpjBuscado = '';
      return aviso(input, err.message, 'erro');
    }
    if (so(input.value) !== cnpj) return;
    definir(form, 'razao_social', d.razao_social);
    definir(form, 'empresa_nome', d.empresa_nome);
    if (d.telefone_empresa) definir(form, 'telefone_empresa', fmtTel(d.telefone_empresa));
    definir(form, 'ramo', d.ramo);
    // Endereço da empresa: o cadastrado na Receita
    const mesmo = campo(form, 'mesmo_endereco');
    if (d.emp_cep && campo(form, 'emp_cep')) {
      if (mesmo?.checked) { mesmo.checked = false; mesmo.dispatchEvent(new Event('change', { bubbles: true })); }
      for (const k of ['logradouro', 'numero', 'complemento', 'bairro', 'cidade']) { const el = campo(form, `emp_${k}`); if (el) el.value = d[`emp_${k}`] || ''; }
      const cep = campo(form, 'emp_cep');
      cep.value = fmtCep(d.emp_cep); cep.dataset.cepBuscado = d.emp_cep;
      definir(form, 'emp_uf', d.emp_uf);
    }
    const situacao = d.ativa ? '' : ` Atenção: situação na Receita "${d.situacao || 'desconhecida'}".`;
    aviso(input, `✓ Dados de ${d.razao_social} preenchidos. Confira antes de continuar.${situacao}`, d.ativa ? 'ok' : 'erro');
  }

  // ── Pessoa física × pessoa jurídica (loja parceira) ─────────────────────
  function aplicarTipo(form) {
    if (!form) return;
    const marcado = form.querySelector('[name="empresa_tipo"]:checked') || form.querySelector('input[type=hidden][name="empresa_tipo"]');
    const pf = marcado?.value === 'pf';
    form.querySelectorAll('[data-so-pj]').forEach(el => { el.hidden = pf; });
    form.querySelectorAll('[data-so-pf]').forEach(el => { el.hidden = !pf; });
    const avisoCnpj = form.querySelector('.auto-aviso[data-de="cnpj"]');
    if (avisoCnpj) avisoCnpj.style.display = pf ? 'none' : '';
    form.querySelectorAll('[data-rotulo-pf]').forEach(el => {
      el.dataset.rotuloPj ||= el.textContent;
      el.textContent = pf ? el.dataset.rotuloPf : el.dataset.rotuloPj;
    });
  }

  // ── Senha forte ─────────────────────────────────────────────────────────
  // Mesmas regras de src/senha.js (o servidor confere de novo ao salvar)
  const REGRAS = [
    ['Pelo menos 8 caracteres', s => s.length >= 8],
    ['Uma letra maiúscula', s => /[A-ZÀ-Ý]/.test(s)],
    ['Uma letra minúscula', s => /[a-zà-ÿ]/.test(s)],
    ['Um número', s => /\d/.test(s)],
    ['Um símbolo (ex.: ! @ # $ %)', s => /[^A-Za-zÀ-ÿ0-9\s]/.test(s)],
  ];
  const ehSenhaNova = el => el.type === 'password' && el.autocomplete === 'new-password' && !/confirm/i.test(el.name) && !el.classList.contains('oui-campo');

  function listaSenha(input) {
    // Senha e confirmação lado a lado (.senha-par): a lista vai embaixo das duas
    const label = input.closest('.senha-par') || input.closest('label') || input.parentElement;
    let ul = label.parentElement.querySelector(`.senha-regras[data-de="${input.name}"]`);
    if (!ul) {
      ul = document.createElement('ul');
      ul.className = 'senha-regras';
      ul.dataset.de = input.name;
      ul.setAttribute('aria-live', 'polite');
      ul.innerHTML = REGRAS.map(([t]) => `<li>${t}</li>`).join('');
      label.insertAdjacentElement('afterend', ul);
    }
    return ul;
  }
  function conferirSenha(input) {
    if (!ehSenhaNova(input)) { // ex.: em /assinar, quem renova digita a senha atual
      const ul = (input.closest('label') || input).parentElement?.querySelector(`.senha-regras[data-de="${input.name}"]`);
      if (ul) ul.hidden = true;
      input.setCustomValidity('');
      return;
    }
    const ul = listaSenha(input);
    const s = input.value;
    const oks = REGRAS.map(([, ok]) => ok(s));
    [...ul.children].forEach((li, i) => li.classList.toggle('ok', oks[i]));
    ul.hidden = false;
    input.setCustomValidity(oks.every(Boolean) || !s ? '' : 'A senha ainda não segue o padrão de segurança.');
  }

  document.addEventListener('input', e => {
    const el = e.target;
    if (!el.name) return;
    if (/(^|_)cep$/.test(el.name)) aoDigitarCep(el);
    else if (el.name === 'cnpj') aoDigitarCnpj(el);
    else if (el.type === 'password') conferirSenha(el);
  });
  document.addEventListener('focusin', e => {
    if (e.target.type !== 'password') return;
    // Clicar na confirmação também mostra as regras da senha do mesmo par
    const principal = [...(e.target.closest('.senha-par')?.querySelectorAll('input[type=password]') || [])].find(ehSenhaNova);
    conferirSenha(principal || e.target);
  });
  document.addEventListener('change', e => { if (e.target.name === 'empresa_tipo') aplicarTipo(e.target.form); });

  window.OfertouCadastro = { aplicarTipo, buscarCep };
})();
