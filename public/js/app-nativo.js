/* Ofertou! — ajustes quando o site roda dentro do app (Android/iPhone, Capacitor).
   - esconde o que as lojas não permitem no app (Pix/checkout do site, login Google em webview, convites de venda externa);
   - mostra os preços das lojas nos planos;
   - compra a assinatura pela Google Play / App Store (RevenueCat) e pede ao site para liberar o plano. */
(() => {
  'use strict';
  const cap = window.Capacitor;
  const nativo = Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) || /OfertouApp/.test(navigator.userAgent);
  if (!nativo) { window.OfertouApp = { nativo: false }; return; }

  const plataforma = (cap && cap.getPlatform && cap.getPlatform()) || (/iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' : 'android');
  const loja = plataforma === 'ios' ? 'App Store' : 'Google Play';
  document.documentElement.classList.add('is-app', `is-app-${plataforma}`);
  const estilo = document.createElement('style');
  estilo.textContent = `
    .is-app .so-web, .is-app a[href="/anuncie"], .is-app .ad-invite { display: none !important; }
    .is-app .plano-equiv { display: none; }
    .app-ass { max-width: 520px; width: 100%; justify-self: center; display: grid; gap: 14px; }
    .app-ass h1 { margin: 0; font-size: 24px; letter-spacing: -.02em; }
    .app-ass .app-preco { font-size: 30px; font-weight: 800; letter-spacing: -.02em; margin: 0; }
    .app-ass .app-preco small { font-size: 15px; font-weight: 500; color: var(--ink-3); }
    .app-ass ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; color: var(--ink-2); font-size: 14.5px; }
    .app-ass li { display: flex; gap: 8px; } .app-ass li::before { content: "✓"; color: var(--brand); font-weight: 800; }
    .app-ass .app-legal { font-size: 12.5px; color: var(--ink-3); line-height: 1.5; margin: 0; }
    .app-ass .app-legal a { color: var(--brand); }
    .app-ass .app-acoes { display: grid; gap: 8px; }`;
  document.head.appendChild(estilo);

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const json = (url, opts) => fetch(url, { cache: 'no-store', ...opts }).then(r => r.json().then(d => (r.ok ? d : Promise.reject(new Error(d.error || `Erro ${r.status}`)))));

  // ── RevenueCat ─────────────────────────────────────────────────────────────
  let Purchases = null;
  let usuarioConfigurado; // undefined = ainda não verificado nesta página
  let CONFIG = null;
  const plugin = () => (Purchases ||= cap && cap.registerPlugin ? cap.registerPlugin('Purchases') : null);

  async function preparar() {
    CONFIG ||= await json('/api/app/config');
    if (!CONFIG.ativo) throw new Error('As assinaturas pelo app estarão disponíveis em breve.');
    const chave = CONFIG.chaves[plataforma];
    const P = plugin();
    if (!chave || !P) throw new Error('As assinaturas pelo app ainda não foram configuradas.');
    const conta = await json('/api/app/conta');
    const id = conta.app_user_id || null;
    if (usuarioConfigurado === undefined) {
      // O SDK nativo continua configurado entre as páginas; só configura na primeira vez.
      const { isConfigured } = await P.isConfigured().catch(() => ({ isConfigured: false }));
      if (!isConfigured) await P.configure(id ? { apiKey: chave, appUserID: id } : { apiKey: chave });
      usuarioConfigurado = isConfigured ? (await P.getAppUserID()).appUserID : id;
    }
    if (id && usuarioConfigurado !== id) {
      await P.logIn({ appUserID: id });
      usuarioConfigurado = id;
    }
    return { P, conta };
  }

  // Pacote da loja de cada plano (o produto da Google Play vem como "produto:plano-base").
  async function pacotes(P) {
    const ofertas = await P.getOfferings();
    const lista = [...(ofertas?.current?.availablePackages || []), ...Object.values(ofertas?.all || {}).flatMap(o => o.availablePackages || [])];
    const porPlano = {};
    for (const [plano, produto] of Object.entries(CONFIG.produtos)) {
      if (!produto) continue;
      const pk = lista.find(x => x.product && (x.product.identifier === produto || x.product.identifier.startsWith(`${produto}:`)));
      if (pk) porPlano[plano] = pk;
    }
    return porPlano;
  }

  // Preço da loja nos cartões de plano (página inicial e escolha de perfil).
  let PRECOS = null;
  function aplicarPrecos(raiz = document) {
    if (!PRECOS) return;
    raiz.querySelectorAll('[data-plano]').forEach(card => {
      const pk = PRECOS[card.dataset.plano];
      const b = card.querySelector('.plano-preco b');
      if (pk && b) b.textContent = pk.product.priceString;
    });
  }
  async function carregarPrecos() {
    if (!document.querySelector('#planos-grid, #perfil-planos')) return;
    try {
      const { P } = await preparar();
      PRECOS = await pacotes(P);
      aplicarPrecos();
      new MutationObserver(() => aplicarPrecos()).observe(document.body, { childList: true, subtree: true });
    } catch { /* sem compras no app: os cartões continuam como estão */ }
  }

  // ── Tela de assinatura dentro do app (substitui o checkout do site) ───────
  async function telaAssinatura(planoId) {
    const raiz = document.querySelector('.ass-page');
    raiz.innerHTML = '<section class="panel-card app-ass"><p class="cli-sub">Carregando…</p></section>';
    const box = raiz.querySelector('.app-ass');
    let ctx;
    try {
      ctx = await preparar();
    } catch (err) {
      box.innerHTML = `<h1>Assinaturas</h1><p class="cli-sub">${esc(err.message)}</p><a class="btn btn-primary" href="/">Ver ofertas</a>`;
      return;
    }
    const plano = CONFIG.planos.find(p => p.id === planoId);
    if (!plano) { box.innerHTML = '<h1>Plano não encontrado</h1><a class="btn btn-primary" href="/conta#planos">Ver planos</a>'; return; }
    document.title = `Assinar ${plano.nome} — Ofertou!`;
    if (!ctx.conta.user) {
      box.innerHTML = `
        <h1>${esc(plano.nome)}</h1>
        <p class="cli-sub">Para assinar, entre na sua conta ou crie uma. A assinatura fica ligada a ela.</p>
        <div class="app-acoes">
          <a class="btn btn-primary btn-lg" href="/conta#entrar">Entrar</a>
          <a class="btn btn-lg" href="/conta#cadastro">Criar conta</a>
        </div>`;
      return;
    }
    let pk = null;
    try { pk = (await pacotes(ctx.P))[planoId]; } catch { /* tratado abaixo */ }
    const periodo = plano.dias === 30 ? 'mês' : `${plano.dias} dias`;
    box.innerHTML = `
      <p class="plano-chamada">${esc(plano.chamada)}</p>
      <h1>${esc(plano.nome)}</h1>
      <p class="app-preco">${pk ? esc(pk.product.priceString) : '—'} <small>/${periodo}</small></p>
      <ul>${plano.beneficios.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
      <div class="form-msg err" id="app-msg" hidden></div>
      <div class="app-acoes">
        <button class="btn btn-primary btn-lg" type="button" id="app-comprar" ${pk ? '' : 'disabled'}>${pk ? `Assinar por ${esc(pk.product.priceString)}/${periodo}` : 'Indisponível no momento'}</button>
        <button class="btn" type="button" id="app-restaurar">Restaurar compras</button>
      </div>
      <p class="app-legal">Assinatura de ${periodo === 'mês' ? '1 mês' : periodo}, renovada automaticamente pela ${loja} com a conta ${esc(ctx.conta.user.email)}.
        Cancele quando quiser nas assinaturas da ${loja}, até 24 horas antes da renovação.
        <a href="/privacidade">Termos de uso</a> · <a href="/privacidade">Política de privacidade</a></p>`;
    const msg = t => { const m = box.querySelector('#app-msg'); m.textContent = t; m.hidden = !t; };

    async function liberar() {
      for (let i = 0; i < 4; i++) {
        const r = await json('/api/app/sincronizar', { method: 'POST' });
        const ok = r.liberados.find(l => l.plano === planoId) || r.liberados[0];
        if (ok) return ok;
        await new Promise(res => setTimeout(res, 3000));
      }
      return null;
    }
    async function concluir() {
      const ok = await liberar();
      if (!ok) { msg('Recebemos a compra, mas a liberação ainda não chegou. Toque em "Restaurar compras" em alguns instantes.'); return; }
      box.innerHTML = `<div class="ass-ok">✓</div><h1>Assinatura ativa!</h1>
        <p class="cli-sub">${esc(plano.nome)} liberado até <b>${new Date(ok.validade.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}</b>.</p>`;
      setTimeout(() => { location.href = ok.conta === 'cliente' ? '/cliente' : '/'; }, 2500);
    }

    box.querySelector('#app-comprar').addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true; msg('');
      try {
        await ctx.P.purchasePackage({ aPackage: pk });
        btn.textContent = 'Liberando seu acesso…';
        await concluir();
      } catch (err) {
        const cancelou = err && (err.userCancelled || /cancel/i.test(String(err.code || err.message)));
        if (!cancelou) msg(err.message || 'Não foi possível concluir a compra.');
      } finally { btn.disabled = !pk; }
    });
    box.querySelector('#app-restaurar').addEventListener('click', async e => {
      e.currentTarget.disabled = true; msg('');
      try { await ctx.P.restorePurchases(); await concluir(); } catch (err) { msg(err.message || 'Nada para restaurar.'); }
      finally { e.currentTarget.disabled = false; }
    });
  }

  window.OfertouApp = { nativo: true, plataforma, loja, telaAssinatura };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', carregarPrecos);
  else carregarPrecos();
})();
