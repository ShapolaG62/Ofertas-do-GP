/* Ofertou! — prévia de produto das lojas parceiras: fotos, preço e descrição, conversa com a loja e pedido pelo site.
   Usado na página da loja, no perfil da empresa e na página do anúncio:
     OfertouLoja.abrir(oferta, loja)       → abre a prévia (oferta: item do catálogo; loja: { id, nome, slug, pedidos })
     OfertouLoja.conversar(lojaId, ofertaId)
     OfertouLoja.pedir(oferta, loja)       → abre direto o formulário do pedido
     OfertouLoja.visita(lojaId, tipo, ofertaId)  → contador (pagina | produto | site | link) */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const okImg = src => /^(\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)|https:\/\/)/.test(src || '');
  const voltarLogin = () => { location.href = `/conta?voltar=${encodeURIComponent(location.pathname + location.search)}`; };

  async function api(url, body) {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { voltarLogin(); throw new Error(d.error || 'Entre na sua conta.'); }
    if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
    return d;
  }

  function visita(lojaId, tipo, ofertaId) {
    if (!lojaId) return;
    const corpo = JSON.stringify({ tipo, oferta_id: ofertaId || null });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(`/api/lojas/${lojaId}/visita`, new Blob([corpo], { type: 'application/json' }));
      else fetch(`/api/lojas/${lojaId}/visita`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true });
    } catch { /* contador é opcional */ }
  }

  // Janela (criada uma vez)
  let dlg;
  function janela() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'prod-dlg';
    dlg.innerHTML = '<button class="prod-fechar" type="button" aria-label="Fechar">✕</button><div class="prod-corpo"></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('.prod-fechar')) dlg.close(); });
    return dlg;
  }
  const corpo = () => janela().querySelector('.prod-corpo');

  async function conversar(lojaId, ofertaId, botao) {
    const original = botao ? botao.innerHTML : '';
    if (botao) { botao.disabled = true; botao.textContent = 'Abrindo conversa…'; }
    try {
      const r = await api('/api/chat/iniciar', { loja_id: lojaId, oferta_id: ofertaId || null });
      // Abre a conversa no painel flutuante de mensagens (sem sair da página); sem ele, na tela de mensagens
      if (window.OfertouChat) {
        if (dlg && dlg.open) dlg.close();
        if (botao) { botao.disabled = false; botao.innerHTML = original; }
        window.OfertouChat.abrir(r.id);
      } else location.href = `/mensagens?c=${r.id}`;
    } catch (err) {
      if (botao) { botao.disabled = false; botao.innerHTML = original; }
      OfertouUI.avisar(err.message);
    }
  }

  async function abrir(o, loja) {
    janela();
    corpo().innerHTML = '<p class="muted" style="padding:30px;text-align:center">Carregando…</p>';
    if (!dlg.open) dlg.showModal();
    visita(loja.id, 'produto', o.id);
    // Anúncio feito no site: busca fotos, descrição e ficha técnica
    let a = { ...o, imagens: o.imagem ? [o.imagem] : [] };
    if (o.fonte === 'empresa') {
      try { a = { ...a, ...(await fetch(`/api/anuncios/${o.id}`).then(r => (r.ok ? r.json() : {}))) }; } catch { /* usa o básico */ }
    }
    const imgs = (a.imagens || []).filter(okImg);
    const fotos = imgs.length ? imgs : [`/api/img/${o.id}`];
    const ped = loja.pedidos || { aceita_pedidos: false, metodos: [] };
    const fatos = [
      a.condicao && ['Condição', a.condicao], a.marca && ['Marca', a.marca], a.modelo && ['Modelo', a.modelo],
      a.garantia && ['Garantia', a.garantia], a.frete && ['Entrega', `${a.frete}${a.frete_valor != null ? `: R$ ${brl(a.frete_valor)}` : ''}${a.prazo_entrega ? ` — ${a.prazo_entrega}` : ''}`],
      a.estoque != null && ['Estoque', `${a.estoque} unidade(s)`], a.parcelamento && ['Parcelamento', a.parcelamento],
    ].filter(Boolean);
    corpo().innerHTML = `
      <div class="prod-grid">
        <div class="prod-galeria">
          <div class="prod-foto"><img id="prod-img" src="${esc(fotos[0])}" alt="${esc(a.produto)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/api/img/${o.id}'">
            ${a.desconto_pct ? `<span class="card-off">-${Math.round(a.desconto_pct)}%</span>` : ''}</div>
          ${fotos.length > 1 ? `<div class="prod-miniaturas">${fotos.map((src, i) => `<button type="button" data-foto="${esc(src)}" ${i ? '' : 'aria-current="true"'}><img src="${esc(src)}" alt="" referrerpolicy="no-referrer"></button>`).join('')}</div>` : ''}
        </div>
        <div class="prod-info">
          <a class="ad-store" href="/loja/${esc(loja.slug)}"><span class="store-dot" style="background:var(--brand)"></span>${esc(loja.nome)}</a>
          <h2>${esc(a.produto)}</h2>
          <div class="ad-price">
            ${a.preco_anterior ? `<div class="card-old num">De R$ ${brl(a.preco_anterior)}</div>` : ''}
            <div class="ad-price-now num"><small>R$</small>${brl(a.preco_atual)}</div>
          </div>
          ${fatos.length ? `<dl class="prod-fatos">${fatos.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
          ${a.cupom_codigo ? `<p class="prod-cupom">Cupom: <b>${esc(a.cupom_codigo)}</b>${a.cupom_descricao ? ` — ${esc(a.cupom_descricao)}` : ''}</p>` : ''}
          <div class="prod-acoes">
            ${ped.aceita_pedidos ? '<button class="btn btn-primary btn-block" type="button" data-prod="pedir">Fazer pedido</button>' : ''}
            <button class="btn btn-block" type="button" data-prod="conversar"><svg class="ico-btn" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z"/><path d="M8 8.5h8M8 11.5h5"/></svg>Conversar com a loja</button>
            ${o.fonte === 'empresa' ? `<a class="link-btn" href="/anuncio/${o.id}">Abrir a página completa do anúncio</a>` : ''}
          </div>
          ${ped.aceita_pedidos ? `<p class="muted prod-nota">${ped.metodos.length ? `Pagamento direto à loja: ${ped.metodos.map(m => esc(m.nome)).join(', ')}.` : 'A loja envia a forma de pagamento pela conversa, logo depois do pedido.'} O pedido e a conversa ficam registrados no site.</p>` : ''}
          <p class="aviso-resp aviso-resp-p"><svg class="aviso-resp-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg><span>O Ofertou! não se responsabiliza pela venda, entrega, troca ou garantia: é com a loja parceira.</span></p>
        </div>
      </div>
      ${a.descricao ? `<div class="prod-desc"><h3>Descrição</h3><p>${esc(a.descricao).replace(/\n/g, '<br>')}</p></div>` : ''}`;
    corpo().onclick = e => {
      const f = e.target.closest('[data-foto]');
      if (f) {
        corpo().querySelector('#prod-img').src = f.dataset.foto;
        corpo().querySelectorAll('[data-foto]').forEach(b => b.removeAttribute('aria-current'));
        f.setAttribute('aria-current', 'true');
      }
      const b = e.target.closest('[data-prod]');
      if (!b) return;
      if (b.dataset.prod === 'conversar') conversar(loja.id, o.id, b);
      if (b.dataset.prod === 'pedir') pedir(a, loja);
    };
  }

  // Formulário do pedido
  function pedir(o, loja) {
    janela();
    clearTimeout(timerPedido);
    if (!dlg.open) dlg.showModal();
    const ped = loja.pedidos || { metodos: [] };
    corpo().innerHTML = `
      <form class="prod-pedido" id="prod-pedido">
        <h2>Fazer pedido</h2>
        <div class="prod-resumo"><img src="/api/img/${o.id}" alt="" referrerpolicy="no-referrer"><div><b>${esc(o.produto)}</b>
          <span class="muted">${esc(loja.nome)} · R$ ${brl(o.preco_atual)} cada</span></div></div>
        <label class="field"><span>Quantidade</span><input type="text" name="quantidade" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="1" required></label>
        ${ped.metodos.length ? `<fieldset class="prod-metodos"><legend>Como você quer pagar?</legend>
          ${ped.metodos.map((m, i) => `<label class="ass-metodo"><input type="radio" name="metodo" value="${esc(m.id)}" ${i ? '' : 'checked'}>
            <span><b>${esc(m.nome)}</b><small>${esc(m.desc)}</small></span></label>`).join('')}
        </fieldset>` : '<p class="muted prod-nota" style="margin:0"><b>Pagamento:</b> a loja envia a forma de pagamento pela conversa assim que receber o pedido.</p>'}
        <label class="field"><span>Observações para a loja <small class="muted">(endereço de entrega, cor, tamanho…)</small></span>
          <textarea name="observacao" maxlength="600" rows="3"></textarea></label>
        ${ped.instrucoes ? `<p class="muted prod-nota">${esc(ped.instrucoes)}</p>` : ''}
        <dl class="prod-conta" id="prod-conta"></dl>
        <div class="prod-cartao" id="prod-cartao" hidden></div>
        <p class="muted prod-nota" style="margin:0">Frete e prazo: combine com a loja pelo chat, se houver.</p>
        <p class="aviso-resp aviso-resp-p"><svg class="aviso-resp-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg><span><b>Aviso:</b> o Ofertou! não vende nem entrega este produto e não se responsabiliza pela venda, pagamento, entrega, troca ou garantia: tudo isso é com a loja parceira. O site só registra o pedido e a conversa.</span></p>
        <div class="form-msg err" id="prod-msg" hidden></div>
        <button class="btn btn-primary btn-block" type="submit">Confirmar pedido</button>
        <button class="btn btn-block" type="button" data-voltar>Voltar ao produto</button>
      </form>`;
    const f = corpo().querySelector('#prod-pedido');
    // Produtos + taxa de uso do site (somada na finalização) = total
    const pct = Number(ped.taxa_pct) || 0;
    const valores = () => {
      const q = Math.min(Math.max(parseInt(f.quantidade.value, 10) || 1, 1), 99);
      const sub = Math.round(o.preco_atual * q * 100) / 100;
      return { q, sub, taxa: Math.round(sub * pct) / 100 };
    };
    const total = () => { const v = valores(); return Math.round((v.sub + v.taxa) * 100) / 100; };
    const conta = () => {
      const { q, sub, taxa } = valores();
      corpo().querySelector('#prod-conta').innerHTML = `<dt>Produtos (${q}x)</dt><dd>R$ ${brl(sub)}</dd>
        ${taxa ? `<dt>Taxa de uso do site (${String(pct).replace('.', ',')}%)</dt><dd>R$ ${brl(taxa)}</dd>` : ''}
        <dt class="prod-conta-total">Total</dt><dd class="prod-conta-total">R$ ${brl(sub + taxa)}</dd>`;
    };
    // Cartão: formulário do Mercado Pago dentro da janela (os dados do cartão vão direto ao Mercado Pago)
    const areaCartao = corpo().querySelector('#prod-cartao');
    const btnConfirmar = f.querySelector('[type=submit]');
    const msgErro = t => { const m = corpo().querySelector('#prod-msg'); if (!m) return; m.textContent = t || ''; m.hidden = !t; };
    let brick = null, recriar = null;
    const metodoAtual = () => f.querySelector('[name=metodo]:checked')?.value || '';
    async function montarCartao() {
      if (brick) { try { await brick.unmount(); } catch { /* já removido */ } brick = null; }
      if (metodoAtual() !== 'cartao' || !dlg.open || !areaCartao.isConnected) return;
      areaCartao.innerHTML = '<div id="prod-brick"></div><p class="muted prod-nota" data-carregando>Carregando o formulário do cartão…</p>';
      try {
        await sdkMP();
        // O formulário do Mercado Pago às vezes falha sem avisar (chave inválida, rede): sem resposta em 15 s, mostra o aviso
        const vigia = setTimeout(() => {
          if (areaCartao.querySelector('[data-carregando]')) areaCartao.innerHTML = '<p class="form-msg err">O pagamento com cartão está indisponível agora. Pague com Pix ou tente mais tarde.</p>';
        }, 15000);
        const mp = new window.MercadoPago(ped.mp_public_key, { locale: 'pt-BR' });
        const fundo = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [255, 255, 255];
        const escuro = (Number(fundo[0]) + Number(fundo[1]) + Number(fundo[2])) / 3 < 128;
        brick = await mp.bricks().create('cardPayment', 'prod-brick', {
          initialization: { amount: total() },
          customization: { paymentMethods: { maxInstallments: Number(ped.parcelas) || 1 }, visual: { style: { theme: escuro ? 'dark' : 'default' } } },
          callbacks: {
            onReady: () => { clearTimeout(vigia); areaCartao.querySelector('[data-carregando]')?.remove(); },
            onError: err => {
              console.warn('[cartão]', err);
              if (err?.type === 'critical' || !areaCartao.querySelector('#prod-brick')?.children.length) {
                areaCartao.innerHTML = '<p class="form-msg err">O pagamento com cartão está indisponível agora. Pague com Pix ou tente mais tarde.</p>';
              }
            },
            onSubmit: dados => new Promise((resolve, reject) => {
              msgErro('');
              api('/api/pedidos', { oferta_id: o.id, quantidade: f.quantidade.value, metodo: 'cartao', observacao: f.observacao.value, cartao: dados })
                .then(p => { resolve(); acompanhar(p); })
                .catch(err => { msgErro(err.message); reject(); });
            }),
          },
        });
      } catch {
        areaCartao.innerHTML = '<p class="form-msg err">Não foi possível carregar o formulário do cartão. Recarregue a página ou pague com Pix.</p>';
      }
    }
    const trocarMetodo = () => {
      const cartao = metodoAtual() === 'cartao';
      areaCartao.hidden = !cartao;
      btnConfirmar.hidden = cartao;
      msgErro('');
      montarCartao();
    };
    f.querySelectorAll('[name=metodo]').forEach(r => r.addEventListener('change', trocarMetodo));
    f.quantidade.addEventListener('input', () => {
      f.quantidade.value = f.quantidade.value.replace(/\D/g, '').slice(0, 2); conta();
      if (metodoAtual() === 'cartao') { // valor novo: refaz o formulário do cartão com o total certo
        clearTimeout(recriar); recriar = setTimeout(montarCartao, 700);
      }
    });
    conta();
    trocarMetodo();
    dlg.addEventListener('close', () => { clearTimeout(timerPedido); if (brick) { try { brick.unmount(); } catch { /* ok */ } brick = null; } }, { once: true });
    corpo().querySelector('[data-voltar]').onclick = () => abrir(o, loja);
    // Pix: gera o QR code aqui mesmo
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (metodoAtual() === 'cartao') return;
      btnConfirmar.disabled = true; btnConfirmar.textContent = 'Gerando o Pix…';
      try {
        const p = await api('/api/pedidos', { oferta_id: o.id, quantidade: f.quantidade.value, metodo: metodoAtual(), observacao: f.observacao.value });
        acompanhar(p);
      } catch (err) {
        msgErro(err.message);
        btnConfirmar.disabled = false; btnConfirmar.textContent = 'Confirmar pedido';
      }
    });
  }

  // Carrega o SDK do Mercado Pago só quando o cliente escolhe cartão
  let sdkPromessa = null;
  function sdkMP() {
    if (window.MercadoPago) return Promise.resolve();
    if (!sdkPromessa) sdkPromessa = new Promise((ok, erro) => {
      const sc = document.createElement('script');
      sc.src = 'https://sdk.mercadopago.com/js/v2';
      sc.onload = ok; sc.onerror = () => { sdkPromessa = null; erro(new Error('SDK')); };
      document.head.appendChild(sc);
    });
    return sdkPromessa;
  }

  // Depois de criado: QR do Pix (ou cartão em análise) até o pagamento ser confirmado; então a conversa com a loja
  let timerPedido = null;
  function acompanhar(p) {
    clearTimeout(timerPedido);
    if (!dlg.open) return;
    const cod = esc(p.codigo || `PD-${p.id}`);
    const fechar = () => { const b = corpo().querySelector('[data-fechar]'); if (b) b.onclick = () => dlg.close(); };
    if (p.status === 'pago' || p.pago_em) {
      corpo().innerHTML = `<div class="prod-pedido prod-ok">
        <div class="prod-ok-ico"><svg class="ico-linha" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.5"/></svg></div>
        <h2>Pagamento confirmado!</h2>
        <p>Pedido <b>${cod}</b> — R$ ${brl(p.total)}. A loja ${esc(p.loja?.nome || '')} já foi avisada e o pedido está na conversa com ela: combine a entrega por lá.</p>
        ${p.conversa_id ? '<button class="btn btn-primary btn-block" type="button" data-conversa>Abrir conversa com a loja</button>' : ''}
        <button class="btn btn-block" type="button" data-fechar>Fechar</button></div>`;
      const bc = corpo().querySelector('[data-conversa]');
      if (bc) bc.onclick = () => { if (window.OfertouChat) { dlg.close(); window.OfertouChat.abrir(p.conversa_id, p.id); } else location.href = `/mensagens?c=${p.conversa_id}&pedido=${p.id}`; };
      fechar();
      return;
    }
    if (p.status === 'cancelado') {
      corpo().innerHTML = `<div class="prod-pedido"><h2>Pedido ${cod} cancelado</h2>
        <p class="muted">${p.metodo === 'pix' ? 'O Pix venceu sem pagamento.' : 'O pagamento não foi aprovado.'} Nada foi cobrado. Você pode fazer um novo pedido.</p>
        <button class="btn btn-block" type="button" data-fechar>Fechar</button></div>`;
      fechar();
      return;
    }
    const pix = p.pagamento?.pix;
    if (!corpo().querySelector(`[data-acompanha="${p.id}"]`)) {
      const ate = p.pagamento?.expira ? new Date(String(p.pagamento.expira).replace(' ', 'T') + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      corpo().innerHTML = pix ? `<div class="prod-pedido prod-pix" data-acompanha="${p.id}">
          <h2>Pague com Pix</h2>
          <p class="muted" style="margin:0">Pedido <b>${cod}</b> · total <b>R$ ${brl(p.total)}</b></p>
          ${p.pagamento.qr ? `<img class="prod-pix-qr" src="data:image/png;base64,${esc(p.pagamento.qr)}" alt="QR code do Pix">` : ''}
          <label class="field"><span>Pix copia e cola</span><textarea readonly rows="3">${esc(pix)}</textarea></label>
          <button class="btn btn-primary btn-block" type="button" data-copiar>Copiar código Pix</button>
          <p class="prod-espera"><span class="prod-spin" aria-hidden="true"></span> Aguardando o pagamento… a confirmação aparece aqui sozinha.</p>
          ${ate ? `<p class="muted prod-nota" style="margin:0">Válido até ${ate}. Você também encontra este Pix em Minha conta → Meus pedidos.</p>` : ''}
        </div>`
        : `<div class="prod-pedido" data-acompanha="${p.id}"><h2>Pagamento em análise</h2>
          <p class="prod-espera"><span class="prod-spin" aria-hidden="true"></span> O Mercado Pago está analisando o pagamento do pedido <b>${cod}</b>. Pode fechar esta janela: avisamos você quando for aprovado.</p>
          <button class="btn btn-block" type="button" data-fechar>Fechar</button></div>`;
      const cp = corpo().querySelector('[data-copiar]');
      if (cp) cp.onclick = async () => {
        const ta = corpo().querySelector('.prod-pix textarea');
        try { await navigator.clipboard.writeText(pix); } catch { ta.select(); document.execCommand('copy'); }
        cp.textContent = 'Código copiado!'; setTimeout(() => { cp.textContent = 'Copiar código Pix'; }, 2000);
      };
      fechar();
    }
    timerPedido = setTimeout(async () => {
      try { acompanhar(await api(`/api/pedidos/${p.id}`)); } catch { acompanhar(p); }
    }, 5000);
  }

  window.OfertouLoja = { abrir, pedir, conversar, visita };
})();
