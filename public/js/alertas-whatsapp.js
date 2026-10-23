/* Ofertou! — alertas de ofertas no WhatsApp particular (tela de ofertas).
   1) Pergunta, numa faixa acima das ofertas: "Deseja receber ofertas no seu WhatsApp particular?" (some quando a pessoa
      responde; "Agora não" fica guardado neste navegador).
   2) Janela para escolher os termos (ex.: iphone, air fryer), o desconto mínimo, o limite por dia e aceitar (LGPD).
   Também abre pelo menu da conta ("Alertas no WhatsApp") e pelo link das mensagens (/?alertas=1).
   O envio é feito pelo servidor (src/alertas-whatsapp.js) para o celular cadastrado na conta. */
(() => {
  'use strict';
  if (window.OfertouAlertas) return;
  const CHAVE_NAO = 'ofertou-alertas-nao';
  const SUGESTOES = ['celular', 'iphone', 'notebook', 'air fryer', 'smart tv', 'fone bluetooth', 'tênis', 'perfume', 'cadeira gamer', 'geladeira'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = async (url, opt = {}) => {
    const r = await fetch(url, { method: opt.method || 'GET', headers: opt.body ? { 'Content-Type': 'application/json' } : {}, body: opt.body ? JSON.stringify(opt.body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'Não foi possível concluir.'), { status: r.status });
    return d;
  };
  const ICONE_WA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19.1z"/><path d="M9 8.6c0 3 2.4 5.9 5.6 6.4.6.1 1.2-.4 1.4-1l.2-.6-1.9-.9-.8.8c-1-.4-1.9-1.3-2.4-2.4l.8-.8-.9-1.9-.6.2c-.6.2-1.1.8-1 1.4z"/></svg>';

  const css = document.createElement('style');
  css.textContent = `
  .awa-faixa { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin: 0 0 14px; border-radius: 14px;
    border: 1px solid color-mix(in srgb, #25d366 45%, var(--line)); background: linear-gradient(110deg, rgba(37, 211, 102, .12), var(--surface) 70%); }
  .awa-faixa[hidden] { display: none; }
  .awa-ico { flex: none; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: #25d366; color: #fff; }
  .awa-ico svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .awa-faixa-txt { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .awa-faixa-txt b { font-size: 15px; }
  .awa-faixa-txt span { font-size: 13px; color: var(--ink-3); }
  .awa-faixa-acoes { display: flex; gap: 8px; flex: none; }
  .awa-faixa .btn-sim { background: #25d366; border-color: #25d366; color: #fff; }
  .awa-faixa .btn-sim:hover { filter: brightness(1.05); }
  @media (max-width: 720px) {
    .awa-faixa { flex-wrap: wrap; padding: 10px 12px; gap: 10px; }
    .awa-ico { width: 34px; height: 34px; border-radius: 10px; }
    .awa-faixa-txt b { font-size: 14px; }
    .awa-faixa-txt span { font-size: 12px; }
    .awa-faixa-acoes { width: 100%; }
    .awa-faixa-acoes .btn { flex: 1; height: 34px; font-size: 13px; }
  }
  .awa-dlg { width: min(520px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); margin: auto; padding: 0; border: 1px solid var(--line-strong);
    border-radius: 18px; background: var(--surface); color: var(--ink); box-shadow: 0 24px 70px rgba(0, 0, 0, .45); overflow: auto; scrollbar-width: none; }
  .awa-dlg::backdrop { background: rgba(5, 8, 7, .6); backdrop-filter: blur(3px); }
  .awa-corpo { padding: 20px; display: grid; gap: 14px; }
  .awa-topo { display: flex; gap: 12px; align-items: flex-start; }
  .awa-topo h2 { margin: 0; font-size: 18px; }
  .awa-topo p { margin: 2px 0 0; font-size: 13.5px; color: var(--ink-3); }
  .awa-fechar { margin-left: auto; flex: none; width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--surface-2); color: var(--ink); cursor: pointer; font-size: 18px; line-height: 1; }
  .awa-campo { display: grid; gap: 6px; font-size: 13.5px; font-weight: 700; }
  .awa-campo small { font-weight: 500; color: var(--ink-3); }
  .awa-termos { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface-2); min-height: 46px; align-items: center; }
  .awa-termos input { flex: 1; min-width: 140px; border: 0; outline: none; background: transparent; color: inherit; font: inherit; font-weight: 500; padding: 4px; }
  .awa-termo { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 4px 0 10px; border-radius: 999px; background: var(--brand-soft); color: var(--brand-strong); font-size: 13px; font-weight: 700; }
  .awa-termo button { width: 22px; height: 22px; border-radius: 50%; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 15px; line-height: 1; }
  .awa-sug { display: flex; flex-wrap: wrap; gap: 6px; }
  .awa-sug .chip { cursor: pointer; }
  .awa-linha { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .awa-linha select { height: 40px; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font: inherit; font-weight: 500; padding: 0 10px; }
  .awa-tel { padding: 10px 12px; border-radius: 12px; background: var(--surface-2); font-size: 13.5px; }
  .awa-aceite { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; line-height: 1.5; color: var(--ink-2); cursor: pointer; }
  .awa-aceite input { flex: none; width: 18px; height: 18px; margin-top: 2px; }
  .awa-acoes { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .awa-acoes .btn-perigo { color: var(--deal); margin-right: auto; }
  .awa-msg { margin: 0; font-size: 13.5px; color: var(--deal); }
  .awa-ok { color: var(--brand-strong); }
  @media (max-width: 720px) { .awa-corpo { padding: 16px; } .awa-linha { grid-template-columns: 1fr; } }`;
  document.head.appendChild(css);

  let estado = null;
  const dlg = document.createElement('dialog');
  dlg.className = 'awa-dlg';
  dlg.setAttribute('aria-labelledby', 'awa-tit');

  function render() {
    const e = estado;
    const termos = e.termos.slice();
    dlg.innerHTML = `<form class="awa-corpo" method="dialog">
      <div class="awa-topo"><span class="awa-ico">${ICONE_WA}</span>
        <div><h2 id="awa-tit">Ofertas no seu WhatsApp</h2><p>Escolha o que você procura. Quando entrar uma oferta nova com esses termos, a gente te avisa.</p></div>
        <button type="button" class="awa-fechar" data-fechar aria-label="Fechar">×</button></div>
      ${e.tem_telefone ? `<div class="awa-tel">Vamos enviar para o seu WhatsApp <b>${esc(e.telefone)}</b> · <a href="/conta?aba=perfil">trocar em Meus dados</a></div>`
        : '<div class="awa-tel">Cadastre o seu celular com DDD em <a href="/conta?aba=perfil">Minha conta → Meus dados</a> para receber.</div>'}
      <label class="awa-campo">Termos das ofertas <small>Até ${e.max_termos}. Digite e aperte Enter (ex.: iphone 15, air fryer, tênis nike).</small>
        <div class="awa-termos" data-termos>${termos.map(t => `<span class="awa-termo" data-termo="${esc(t)}">${esc(t)}<button type="button" data-tirar aria-label="Tirar ${esc(t)}">×</button></span>`).join('')}
          <input type="text" data-novo maxlength="40" placeholder="${termos.length ? 'Adicionar outro…' : 'Ex.: iphone'}" autocomplete="off" enterkeyhint="done"></div></label>
      <div class="awa-sug">${SUGESTOES.filter(s => !termos.includes(s)).slice(0, 8).map(s => `<button type="button" class="chip" data-sug="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div>
      <div class="awa-linha">
        <label class="awa-campo">Desconto mínimo <select data-desconto>${e.descontos.map(d => `<option value="${d}"${d === e.desconto_min ? ' selected' : ''}>${d ? `${d}% ou mais` : 'Qualquer desconto'}</option>`).join('')}</select></label>
        <label class="awa-campo">Mensagens por dia (no máximo) <select data-max>${[1, 2, 3, 5, 10].map(n => `<option value="${n}"${n === e.max_dia ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      ${e.aceite_em ? '' : `<label class="awa-aceite"><input type="checkbox" data-aceite> <span>Aceito receber mensagens de ofertas do Ofertou! no meu WhatsApp, no celular cadastrado na minha conta, com os termos que escolhi (das 8h às 22h, até o limite por dia). Posso parar quando quiser, por aqui ou pelo link das mensagens. Veja a <a href="/privacidade#privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</span></label>`}
      <p class="awa-msg" data-msg hidden></p>
      <div class="awa-acoes">
        ${e.ativo ? '<button type="button" class="btn btn-perigo" data-parar>Parar de receber</button>' : ''}
        <button type="button" class="btn" data-fechar>Cancelar</button>
        <button type="button" class="btn btn-primary" data-salvar>${e.ativo ? 'Salvar' : 'Ativar alertas'}</button>
      </div></form>`;
  }

  const termosAtuais = () => [...dlg.querySelectorAll('[data-termo]')].map(x => x.dataset.termo);
  function addTermo(t) {
    t = String(t || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (t.length < 2) return;
    const atuais = termosAtuais();
    if (atuais.some(x => x.toLowerCase() === t.toLowerCase()) || atuais.length >= estado.max_termos) return;
    estado = { ...estado, termos: [...atuais, t], desconto_min: Number(dlg.querySelector('[data-desconto]').value), max_dia: Number(dlg.querySelector('[data-max]').value) };
    const aceite = dlg.querySelector('[data-aceite]')?.checked;
    render(); if (aceite) dlg.querySelector('[data-aceite]').checked = true;
    dlg.querySelector('[data-novo]').focus();
  }
  dlg.addEventListener('keydown', e => {
    if (e.target.matches('[data-novo]') && (e.key === 'Enter' || e.key === ',')) { e.preventDefault(); addTermo(e.target.value); }
    if (e.target.matches('[data-novo]') && e.key === 'Backspace' && !e.target.value) { const ult = dlg.querySelectorAll('[data-termo]'); ult[ult.length - 1]?.remove(); }
  });
  dlg.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const msg = dlg.querySelector('[data-msg]');
    const erro = t => { msg.textContent = t; msg.className = 'awa-msg'; msg.hidden = false; };
    if (b.hasAttribute('data-fechar')) return dlg.close();
    if (b.hasAttribute('data-tirar')) return b.closest('[data-termo]').remove();
    if (b.dataset.sug) return addTermo(b.dataset.sug);
    if (b.hasAttribute('data-salvar') || b.hasAttribute('data-parar')) {
      const pendente = dlg.querySelector('[data-novo]').value; if (pendente.trim()) addTermo(pendente);
      const parar = b.hasAttribute('data-parar');
      b.disabled = true;
      try {
        estado = await api('/api/conta/alertas-whatsapp', { method: 'PUT', body: {
          ativo: !parar, termos: termosAtuais(), desconto_min: dlg.querySelector('[data-desconto]').value, max_dia: dlg.querySelector('[data-max]').value,
          aceite: Boolean(dlg.querySelector('[data-aceite]')?.checked) } });
        dlg.close(); atualizarFaixa();
        (window.OfertouUI?.avisar || alert)(parar ? 'Pronto: você não vai mais receber ofertas no WhatsApp.' : `Pronto! Você vai receber no WhatsApp as ofertas novas de: ${estado.termos.join(', ')}.`);
      } catch (err) { erro(err.message); b.disabled = false; }
    }
  });

  async function abrir() {
    try { estado = await api('/api/conta/alertas-whatsapp'); } catch (err) {
      if (err.status === 401) { location.href = '/conta?voltar=' + encodeURIComponent('/?alertas=1'); return; }
      return (window.OfertouUI?.avisar || alert)(err.message);
    }
    if (!estado.disponivel) return (window.OfertouUI?.avisar || alert)('Os alertas no WhatsApp ainda não estão disponíveis.');
    render();
    if (!dlg.isConnected) document.body.appendChild(dlg);
    dlg.showModal();
    if (!estado.termos.length) dlg.querySelector('[data-novo]').focus();
  }

  // Faixa com a pergunta, acima das ofertas
  const faixa = document.createElement('div');
  faixa.className = 'awa-faixa';
  faixa.hidden = true;
  faixa.innerHTML = `<span class="awa-ico">${ICONE_WA}</span>
    <div class="awa-faixa-txt"><b>Deseja receber ofertas no seu WhatsApp particular?</b><span>Escolha os produtos e a gente avisa quando entrar desconto.</span></div>
    <div class="awa-faixa-acoes"><button type="button" class="btn btn-sm" data-nao>Agora não</button><button type="button" class="btn btn-sm btn-sim" data-sim>Sim, quero</button></div>`;
  faixa.addEventListener('click', e => {
    if (e.target.closest('[data-sim]')) abrir();
    if (e.target.closest('[data-nao]')) { try { localStorage.setItem(CHAVE_NAO, '1'); } catch { /* sem armazenamento */ } faixa.hidden = true; }
  });
  function atualizarFaixa() {
    let disse = false; try { disse = localStorage.getItem(CHAVE_NAO) === '1'; } catch { /* */ }
    faixa.hidden = !estado || !estado.disponivel || estado.ativo || disse;
  }

  async function iniciar() {
    try { estado = await api('/api/conta/alertas-whatsapp'); } catch { return; } // sem login: nada aparece
    if (!estado.disponivel) return;
    const alvo = document.querySelector('#ofertas .results-head') || document.querySelector('#grid');
    if (alvo) alvo.parentElement.insertBefore(faixa, alvo);
    atualizarFaixa();
    // Atalho no menu da conta (topo)
    const menu = document.querySelector('#conta-pop');
    if (menu && !menu.querySelector('[data-alertas]')) {
      const item = document.createElement('button');
      item.type = 'button'; item.setAttribute('role', 'menuitem'); item.dataset.alertas = '';
      item.innerHTML = `${ICONE_WA}<span><b>Alertas no WhatsApp</b><small>${estado.ativo ? `Recebendo: ${esc(estado.termos.slice(0, 3).join(', '))}` : 'Receba ofertas no seu celular'}</small></span>`;
      item.addEventListener('click', () => { menu.hidden = true; abrir(); });
      menu.insertBefore(item, menu.querySelector('.conta-tema') || menu.querySelector('#logout-site'));
    }
    if (/[?&]alertas=1\b/.test(location.search)) { history.replaceState(null, '', location.pathname); abrir(); }
  }
  window.OfertouAlertas = { abrir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
