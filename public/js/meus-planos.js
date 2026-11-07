/* Ofertou! — Meus planos (Minha conta e painel do afiliado): situação de cada plano, renovação automática, trocar de plano ou período e adicionar outro plano */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dia = s => new Date(s.length <= 10 ? `${s}T12:00:00Z` : `${s.replace(' ', 'T')}Z`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const assinar = (plano, extra = {}) => `/assinar?${new URLSearchParams({ plano, ...extra })}`;
  const RISCO = 'A conexão do WhatsApp por QR code não é a API oficial do WhatsApp. O número pode sofrer restrição ou ser banido, principalmente com muitas mensagens. Use um número só para isso.';
  const NOME_CICLO = { mensal: 'mês', trimestral: 'trimestre', anual: 'ano' };

  function cartao(p, d) {
    const nativo = Boolean(window.OfertouApp?.nativo);
    const ciclos = p.ciclos || [];
    const situacao = !p.ativo ? '<span class="mp-selo is-off">Vencido</span>' : p.em_teste ? '<span class="mp-selo is-teste">Período grátis</span>' : '<span class="mp-selo">Ativo</span>';
    const prazo = p.sem_vencimento ? 'Sem data de vencimento' : p.validade ? `${p.ativo ? 'Válido até' : 'Venceu em'} ${dia(p.validade)}` : '';
    let renovacao = '';
    if (p.auto) {
      renovacao = `<p class="mp-linha">Renovação automática ligada: <b>${brl(p.auto.valor)}</b> por ${NOME_CICLO[p.auto.ciclo] || `${p.auto.dias} dias`}, no cartão.</p>
        <button class="btn btn-sm" type="button" data-desligar="${p.auto.id}">Desligar a renovação</button>`;
    } else if (!p.gratis && p.ativo && !p.em_teste) {
      renovacao = '<p class="mp-linha">Renovação manual: você paga de novo quando quiser continuar.</p>';
    }
    if (nativo) return `<article class="mp-card"><div class="mp-topo"><h3>${esc(p.nome)}</h3>${situacao}</div><p class="mp-linha">${prazo}</p>${renovacao}<p class="mp-linha">Para mudar de plano, abra o Ofertou! no navegador.</p></article>`;
    const atual = ciclos.find(c => c.id === p.ciclo) || ciclos[0];
    const acoes = [];
    if (p.em_teste || !p.ativo) acoes.push(`<a class="btn btn-sm btn-primary" href="${assinar(p.plano)}">${p.em_teste ? 'Assinar agora' : 'Reativar'}</a>`);
    if (!p.gratis && p.ativo && !p.em_teste && !p.auto && p.desconto_auto > 0 && d.mercadopago && atual) {
      acoes.push(`<a class="btn btn-sm btn-primary" href="${assinar(p.plano, { trocar: p.plano, ciclo: atual.id, auto: 1 })}">Ligar renovação automática (${p.desconto_auto}% de desconto)</a>`);
    }
    if (!p.gratis && p.ativo && !p.em_teste && !p.auto) acoes.push(`<a class="btn btn-sm" href="${assinar(p.plano, { ciclo: p.ciclo })}">Renovar agora</a>`);
    const periodos = !p.gratis && p.ativo && !p.em_teste ? ciclos.filter(c => c.id !== p.ciclo) : [];
    return `<article class="mp-card">
      <div class="mp-topo"><h3>${esc(p.nome)}</h3>${situacao}</div>
      <p class="mp-linha">${prazo}</p>
      ${renovacao}
      ${acoes.length ? `<div class="mp-acoes">${acoes.join('')}</div>` : ''}
      ${periodos.length ? `<p class="mp-titulo">Mudar o período</p><div class="mp-acoes">${periodos.map(c => `<a class="btn btn-sm" href="${assinar(p.plano, { trocar: p.plano, ciclo: c.id })}">${esc(c.nome)}: ${brl(c.preco)}</a>`).join('')}</div>` : ''}
      ${!p.gratis && p.ativo && !d.so_ferramenta && d.disponiveis.length ? `<p class="mp-titulo">Trocar por outro plano</p><div class="mp-acoes">${d.disponiveis.map(o => `<a class="btn btn-sm" href="${assinar(o.id, { trocar: p.plano })}">${esc(o.nome)}</a>`).join('')}</div>
      <p class="mp-nota">Na troca, o que falta usar deste plano vira dias a mais no novo.</p>` : ''}
      ${p.ferramenta ? `<p class="mp-risco">${RISCO}</p>` : ''}
    </article>`;
  }

  async function mostrar(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    const r = await fetch('/api/planos/meus', { cache: 'no-store' });
    if (!r.ok) { box.innerHTML = '<p class="muted">Não foi possível carregar os seus planos.</p>'; return; }
    const d = await r.json();
    const nativo = Boolean(window.OfertouApp?.nativo);
    const oferta = o => (o.cortesia ? (o.cortesia.tipo === 'loja_mes' ? ' · 1 mês grátis' : ` · ${o.cortesia.dias} dias grátis`) : '');
    const adicionar = !nativo && d.disponiveis.length ? `
      <section class="mp-adicionar">
        <h3>${d.planos.some(p => !p.gratis && p.ativo) ? 'Adicionar outro plano' : 'Assinar um plano'}</h3>
        <p class="muted">Os planos ficam juntos na mesma conta, cada um com a sua validade.</p>
        <div class="mp-acoes">${d.disponiveis.map(o => `<a class="btn btn-primary btn-sm" href="${assinar(o.id)}">${esc(o.nome)}${oferta(o)}</a>`).join('')}</div>
      </section>` : '';
    box.innerHTML = `${d.planos.length ? d.planos.map(p => cartao(p, d)).join('') : '<p class="muted">Você ainda não tem um plano.</p>'}${adicionar}`;
    box.querySelectorAll('[data-desligar]').forEach(b => b.addEventListener('click', async () => {
      const ok = window.OfertouUI?.confirmar ? await window.OfertouUI.confirmar('Desligar a renovação automática? Seu acesso continua até o fim do prazo, e nada mais é cobrado.') : true;
      if (!ok) return;
      b.disabled = true;
      const x = await fetch(`/api/planos/renovacao/${encodeURIComponent(b.dataset.desligar)}/desligar`, { method: 'POST' });
      const e = await x.json().catch(() => ({}));
      if (!x.ok && window.OfertouUI?.avisar) await window.OfertouUI.avisar(e.error || 'Não foi possível desligar agora. Tente de novo.');
      mostrar(box);
    }));
  }

  window.OfertouMeusPlanos = { mostrar };
  const auto = document.querySelector('#meus-planos[data-auto]');
  if (auto) mostrar(auto).catch(() => {});
})();
