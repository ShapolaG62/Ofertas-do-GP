/* Ofertou! — assinatura de planos: dados do cadastro, pagamento (Pix, cartão, transferência ou link) e confirmação */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDia = s => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR') : '');
  const params = new URLSearchParams(location.search);
  let PLANO = null;
  let pollTimer = null;

  let toastTimer;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  const show = v => ['form', 'status', 'erro'].forEach(x => { $(`#view-${x}`).hidden = x !== v; });

  // ── Formulário ─────────────────────────────────────────────────────────────
  function aplicarPlano() {
    const conta = PLANO.conta === 'usuario';
    const empresa = PLANO.perfil === 'empresa';
    const renovar = $('#renovar').checked;
    // Cada bloco aparece se valer para o plano (conta do site / empresa) e não for só renovação.
    $$('.so-novo, .so-conta, .so-empresa').forEach(el => {
      const c = el.classList;
      el.hidden = (c.contains('so-novo') && renovar) || (c.contains('so-conta') && !conta) || (c.contains('so-empresa') && !empresa);
    });
    $('#ass-form [name=senha]').autocomplete = renovar ? 'current-password' : 'new-password';
  }

  function resumo() {
    $('#resumo').innerHTML = `
      <p class="plano-chamada">${esc(PLANO.chamada)}</p>
      <h2>${esc(PLANO.nome)}</h2>
      <p class="plano-preco"><b>${brl(PLANO.preco)}</b><span>/${PLANO.dias === 30 ? 'mês' : `${PLANO.dias} dias`}</span></p>
      <ul class="ass-beneficios">${PLANO.beneficios.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
      <p class="cli-hint">Acesso por ${PLANO.dias} dias, liberado assim que o pagamento é confirmado. Você recebe um e-mail com a data de validade.</p>
      <a class="link-btn" href="/conta#planos">Trocar de plano</a>`;
  }

  async function iniciarForm(id) {
    const d = await fetch(`/api/planos?plano=${encodeURIComponent(id)}`).then(r => r.json());
    PLANO = d.planos.find(p => p.id === id);
    if (!PLANO) return show('erro');
    document.title = `Assinar ${PLANO.nome} — Ofertou!`;
    const ufs = d.ufs.map(u => `<option>${u}</option>`).join('');
    $('#uf').insertAdjacentHTML('beforeend', ufs);
    $('#emp_uf').insertAdjacentHTML('beforeend', ufs);
    $('#ramo').insertAdjacentHTML('beforeend', d.ramos.map(r => `<option>${esc(r)}</option>`).join(''));
    const opcoes = d.metodos?.lista || [];
    $('#metodos').innerHTML = opcoes.length ? opcoes.map((m, i) => `
      <label class="ass-metodo"><input type="radio" name="metodo" value="${esc(m.id)}" ${i === 0 ? 'checked' : ''}>
        <span><b>${esc(m.nome)}</b><small>${esc(m.desc)}</small></span>${m.automatico ? '<em class="ass-auto">liberação automática</em>' : ''}</label>`).join('')
      : `<p class="form-msg err">Os pagamentos online ainda não foram configurados.${d.whatsapp ? ` <a class="link-btn" target="_blank" rel="noopener" href="https://wa.me/${esc(d.whatsapp)}?text=${encodeURIComponent(`Olá! Quero assinar o plano ${PLANO.nome}.`)}">Fale com a gente no WhatsApp</a>.` : ' Tente mais tarde.'}</p>`;
    $('#ass-enviar').disabled = !opcoes.length;
    resumo();
    aplicarPlano();
    show('form');
  }

  $('#renovar').addEventListener('change', aplicarPlano);
  $('[name=mesmo_endereco]').addEventListener('change', e => { $('#emp-endereco').hidden = e.target.checked; });

  // Máscaras simples e preenchimento do endereço pelo CEP (ViaCEP).
  const mask = (el, fn) => el && el.addEventListener('input', () => { el.value = fn(el.value.replace(/\D/g, '')); });
  mask($('[name=cpf]'), d => d.slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'));
  mask($('[name=cnpj]'), d => d.slice(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'));
  const fone = d => (d = d.slice(0, 11), d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3') : d.length > 2 ? d.replace(/(\d{2})(\d{0,4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '') : d);
  mask($('[name=telefone]'), fone);
  mask($('[name=telefone_empresa]'), fone);
  for (const prefix of ['', 'emp_']) {
    const cep = $(`[name=${prefix}cep]`);
    mask(cep, d => d.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'));
    cep.addEventListener('blur', async () => {
      const d = cep.value.replace(/\D/g, '');
      if (d.length !== 8) return;
      try {
        const r = await fetch(`https://viacep.com.br/ws/${d}/json/`).then(x => x.json());
        if (r.erro) return;
        const set = (k, v) => { const el = $(`[name=${prefix}${k}]`); if (el && v && !el.value) el.value = v; };
        set('logradouro', r.logradouro); set('bairro', r.bairro); set('cidade', r.localidade);
        if (r.uf) $(`[name=${prefix}uf]`).value = r.uf;
      } catch { /* sem internet para o ViaCEP: a pessoa preenche */ }
    });
  }

  $('#ass-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const msg = $('#ass-msg');
    msg.hidden = true;
    const body = { plano: PLANO.id };
    for (const el of f.elements) {
      if (!el.name || el.closest('[hidden]')) continue;
      if (el.type === 'checkbox') body[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) body[el.name] = el.value; } else body[el.name] = el.value;
    }
    if (!body.renovar && body.senha !== body.senha_confirmacao) { msg.textContent = 'As senhas não conferem.'; msg.hidden = false; return; }
    const btn = $('#ass-enviar');
    btn.disabled = true; btn.textContent = 'Finalizando…';
    try {
      const r = await fetch('/api/assinatura', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
      history.replaceState(null, '', `/assinar?pedido=${d.token}`);
      if (d.checkout_url) { location.href = d.checkout_url; return; } // Mercado Pago: paga lá e volta para cá
      acompanhar(d.token);
    } catch (err) {
      msg.textContent = err.message; msg.hidden = false;
      msg.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } finally {
      btn.disabled = false; btn.textContent = 'Finalizar compra';
    }
  });

  // ── Pagamento e confirmação ───────────────────────────────────────────────
  function renderStatus(p) {
    const box = $('#view-status');
    if (p.status === 'aprovado') {
      clearInterval(pollTimer);
      box.innerHTML = `
        <div class="ass-ok">✓</div>
        <h1>Pagamento confirmado!</h1>
        <p class="cli-sub">Seu plano <b>${esc(p.plano)}</b> está ativo até <b>${fmtDia(p.validade_ate)}</b>.</p>
        <p class="cli-hint">${p.email_configurado ? `Enviamos a confirmação para <b>${esc(p.email)}</b>.` : `Guarde esta data. Entre com o e-mail <b>${esc(p.email)}</b> e a senha que você cadastrou.`}</p>
        <p class="cli-hint">Levando você para as ofertas…</p>
        <a class="btn btn-primary" href="${esc(p.redirect || '/')}">Ver ofertas agora</a>`;
      setTimeout(() => { location.href = p.redirect || '/'; }, 4000);
      return;
    }
    if (p.status !== 'pendente') {
      clearInterval(pollTimer);
      const motivo = { recusado: 'O pagamento foi recusado.', cancelado: 'O pagamento foi cancelado.', expirado: 'O tempo para pagar este Pix acabou.' }[p.status] || 'O pagamento não foi concluído.';
      box.innerHTML = `<h1>${motivo}</h1><p class="cli-sub">Nenhum valor foi cobrado por este pedido. Você pode tentar de novo.</p>
        <a class="btn btn-primary" href="/conta#planos">Tentar de novo</a>`;
      return;
    }
    const valor = `<p class="ass-valor">${esc(p.plano)} · <b>${brl(p.valor)}</b></p>`;
    if (p.pix && p.pix.copia_cola) {
      const expira = p.pix.expira ? new Date(String(p.pix.expira).replace(' ', 'T') + 'Z') : null;
      box.innerHTML = `
        <h1>Pague com Pix</h1>${valor}
        ${p.pix.qr_base64 ? `<img class="ass-qr" src="data:image/png;base64,${esc(p.pix.qr_base64)}" alt="QR code do Pix" width="240" height="240">` : ''}
        <p class="cli-hint">Abra o app do seu banco, escolha Pix → <b>Ler QR code</b> ou <b>Pix copia e cola</b>.</p>
        <div class="ass-copia"><input readonly value="${esc(p.pix.copia_cola)}" aria-label="Código Pix copia e cola"><button class="btn btn-primary" type="button" id="copiar">Copiar código</button></div>
        <p class="ass-aguarde"><span class="live-dot"></span> Aguardando o pagamento… esta página atualiza sozinha.${expira ? ` O código vale até ${expira.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.` : ''}</p>`;
      $('#copiar').addEventListener('click', () => navigator.clipboard.writeText(p.pix.copia_cola).then(() => toast('Código Pix copiado!')));
      return;
    }
    if (p.manual) {
      const m = p.manual;
      const wa = String(m.whatsapp || '').replace(/\D/g, '');
      const comprovante = wa
        ? `pelo <a class="link-btn" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Paguei o plano ${p.plano} (${p.email}). Segue o comprovante.`)}">WhatsApp</a>`
        : '';
      const linha = (rot, val, copiar) => (val ? `<div class="ass-dado"><span>${rot}</span><b>${esc(val)}</b>${copiar ? `<button class="btn btn-sm" type="button" data-copiar="${esc(val)}">Copiar</button>` : ''}</div>` : '');
      if (m.tipo === 'combinar') {
        box.innerHTML = `
          <div class="ass-ok">✓</div>
          <h1>Pedido recebido!</h1>${valor}
          <p class="cli-sub">Seu cadastro foi registrado. Agora é só combinar o pagamento com a gente.</p>
          <ol class="cli-steps">
            <li>Fale conosco ${comprovante || 'pelo WhatsApp'} informando o e-mail <b>${esc(p.email)}</b>.</li>
            <li>Enviamos as opções para você pagar <b>${brl(p.valor)}</b>.</li>
            <li>Confirmado o pagamento, seu acesso é liberado e você recebe um e-mail com a data de validade — esta página atualiza sozinha.</li>
          </ol>
          ${wa ? `<a class="btn btn-primary btn-lg" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Fiz o pedido do plano ${p.plano} (${p.email}) e quero combinar o pagamento.`)}">Combinar pagamento no WhatsApp</a>` : ''}
          ${m.recado ? `<p class="cli-hint">${esc(m.recado)}</p>` : ''}
          <p class="ass-aguarde"><span class="live-dot"></span> Aguardando a confirmação do pagamento…</p>`;
        return;
      }
      let titulo, dados, passo1;
      if (m.tipo === 'pix_manual') {
        titulo = 'Pague com Pix';
        dados = `<div class="ass-chave"><span>Chave Pix${m.chave_tipo ? ` (${esc(m.chave_tipo)})` : ''}</span><b>${esc(m.chave)}</b>
          ${m.nome || m.banco ? `<small>${esc([m.nome, m.banco].filter(Boolean).join(' · '))}</small>` : ''}
          <button class="btn btn-sm" type="button" data-copiar="${esc(m.chave)}">Copiar chave</button></div>`;
        passo1 = `Faça um Pix de <b>${brl(p.valor)}</b> para a chave acima.`;
      } else if (m.tipo === 'transferencia') {
        titulo = 'Pague por transferência';
        dados = `<div class="ass-dados">${linha('Banco', m.banco)}${linha('Agência', m.agencia, true)}${linha(`Conta ${esc(m.tipo_conta).toLowerCase()}`, m.conta, true)}${linha('Titular', m.titular)}${linha('CPF/CNPJ', m.documento, true)}</div>`;
        passo1 = `Transfira <b>${brl(p.valor)}</b> para a conta acima.`;
      } else {
        titulo = `Pague com ${esc(m.nome || 'o link de pagamento')}`;
        dados = m.url ? `<a class="btn btn-primary btn-lg" href="${esc(m.url)}" target="_blank" rel="noopener">Abrir página de pagamento ↗</a>` : '';
        passo1 = `Pague <b>${brl(p.valor)}</b> pela página de pagamento (abre em outra aba).`;
      }
      box.innerHTML = `
        <h1>${titulo}</h1>${valor}
        ${dados}
        <ol class="cli-steps">
          <li>${passo1}</li>
          <li>Envie o comprovante ${comprovante} informando o e-mail <b>${esc(p.email)}</b>.</li>
          <li>Assim que confirmarmos, seu acesso é liberado — esta página atualiza sozinha.</li>
        </ol>
        ${m.recado ? `<p class="cli-hint">${esc(m.recado)}</p>` : ''}
        <p class="ass-aguarde"><span class="live-dot"></span> Aguardando a confirmação do pagamento…</p>`;
      box.querySelectorAll('[data-copiar]').forEach(b => b.addEventListener('click', () => navigator.clipboard.writeText(b.dataset.copiar).then(() => toast('Copiado!'))));
      return;
    }
    box.innerHTML = `<h1>Aguardando o Mercado Pago</h1>${valor}
      <p class="ass-aguarde"><span class="live-dot"></span> Assim que o Mercado Pago confirmar o pagamento, seu acesso é liberado e esta página atualiza sozinha.</p>
      <p class="cli-hint">Fechou a janela de pagamento sem pagar? <a class="link-btn" href="/conta#planos">Comece de novo</a>.</p>`;
  }

  async function consultar(token) {
    const r = await fetch(`/api/assinatura/${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (r.status === 404) { clearInterval(pollTimer); show('erro'); return; }
    if (!r.ok) return;
    renderStatus(await r.json());
  }

  function acompanhar(token) {
    show('status');
    $('#view-status').innerHTML = '<p class="cli-sub">Carregando o pagamento…</p>';
    consultar(token);
    clearInterval(pollTimer);
    pollTimer = setInterval(() => consultar(token), 5000);
  }

  // ── Início ─────────────────────────────────────────────────────────────────
  if (params.get('pedido')) acompanhar(params.get('pedido'));
  else iniciarForm(params.get('plano') || '').catch(() => show('erro'));
})();
