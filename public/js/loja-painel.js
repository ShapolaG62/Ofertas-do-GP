/* Ofertou! — Painel da loja (Minha conta → Painel da loja): resumo de vendas, recebimento, pendências, acessos,
   funil, produtos, avaliações e o que falta configurar. OfertouPainelLoja.carregar(elemento, abrirAba) */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = v => Number(v || 0).toLocaleString('pt-BR');
  const data = t => (t ? new Date(String(t).replace(' ', 'T') + (String(t).length > 10 ? 'Z' : 'T12:00:00Z')) : null);
  const diaMes = t => data(t)?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) || '';
  const ICO = {
    vendas: '<path d="M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/><path d="M15 8h4v4"/>',
    saldo: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/>',
    ticket: '<path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M10 7v12" stroke-dasharray="2 2"/>',
    olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    estrela: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    caixa: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    chat: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.5"/>',
    vazio: '<circle cx="12" cy="12" r="9"/>',
    seta: '<path d="M9 6l6 6-6 6"/>',
  };
  const ico = (n, cls = '') => `<svg class="dash-ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICO[n]}</svg>`;
  const varTxt = v => (v === null || v === undefined ? '<span class="dash-var">novo</span>'
    : `<span class="dash-var ${v > 0 ? 'sobe' : v < 0 ? 'desce' : ''}">${v > 0 ? '▲' : v < 0 ? '▼' : '='} ${Math.abs(v)}%</span>`);

  // Gráfico de barras (vendas em R$) com linha de acessos — 30 dias
  function grafico(serie, modo) {
    const W = 640, H = 180, P = 22, n = serie.length, bw = (W - P * 2) / n;
    const valores = serie.map(d => (modo === 'acessos' ? d.pagina + d.produto : d.valor));
    const max = Math.max(1, ...valores);
    const barras = serie.map((d, i) => {
      const v = valores[i], h = Math.max(v ? 3 : 0, (v / max) * (H - P * 2));
      const tip = modo === 'acessos' ? `${diaMes(d.dia)}: ${num(d.pagina)} acessos à loja, ${num(d.produto)} produtos abertos` : `${diaMes(d.dia)}: ${brl(d.valor)} em ${num(d.vendas)} venda(s)`;
      return `<rect x="${(P + i * bw + 2).toFixed(1)}" y="${(H - P - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${esc(tip)}</title></rect>`;
    }).join('');
    const rotulos = serie.map((d, i) => (i % 5 === 4 || i === n - 1 ? `<text x="${(P + i * bw + bw / 2).toFixed(1)}" y="${H - 4}">${diaMes(d.dia)}</text>` : '')).join('');
    const topo = modo === 'acessos' ? num(max) : brl(max);
    return `<svg class="dash-graf ${modo}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gráfico dos últimos 30 dias">
      <line x1="${P}" x2="${W - P}" y1="${P}" y2="${P}" class="grade"/><line x1="${P}" x2="${W - P}" y1="${(H - P + P) / 2}" y2="${(H - P + P) / 2}" class="grade"/>
      <line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" class="base"/>
      <text x="${P}" y="${P - 6}" class="topo">${esc(topo)}</text>${barras}${rotulos}</svg>`;
  }

  function render(el, d, abrirAba) {
    if (!d.loja) {
      el.innerHTML = `<div class="panel-card"><h2>Painel da loja</h2><p class="muted">Crie sua loja para ver aqui as vendas, os pedidos e os acessos.</p>
        <button class="btn btn-primary" type="button" data-ir="loja">Criar minha loja</button></div>`;
      return;
    }
    const k = d.kpis, p = d.pendencias, f = d.funil;
    // Pendências (ações)
    const acoes = [];
    if (p.a_enviar.length) acoes.push({ ico: 'caixa', forte: true, txt: `<b>${p.a_enviar.length} pedido(s) pago(s) para enviar</b>${p.a_enviar.some(x => x.atrasado) ? ' — há pedidos pagos há mais de 3 dias' : ''}`, ir: 'vendas' });
    if (p.pedidos_mensagem) acoes.push({ ico: 'chat', forte: true, txt: `<b>${p.pedidos_mensagem} pedido(s) de mensagem</b> esperando sua resposta`, ir: 'mensagens' });
    if (p.mensagens) acoes.push({ ico: 'chat', txt: `<b>${p.mensagens} mensagem(ns) não lida(s)</b> de clientes`, ir: 'mensagens' });
    if (k.mp.disponivel && !k.mp.conectado) acoes.push({ ico: 'saldo', forte: true, txt: '<b>Conecte o Mercado Pago da loja</b> para receber os pedidos pelo site', ir: 'vendas' });
    if (k.mp.erro) acoes.push({ ico: 'saldo', forte: true, txt: '<b>A conexão com o Mercado Pago falhou</b>: conecte de novo', ir: 'vendas' });
    if (p.avaliacoes_sem_resposta) acoes.push({ ico: 'estrela', txt: `<b>${p.avaliacoes_sem_resposta} avaliação(ões)</b> sem resposta`, link: `/loja/${d.loja.slug}#avaliacoes` });
    if (p.anuncios_expirando) acoes.push({ ico: 'relogio', txt: `<b>${p.anuncios_expirando} anúncio(s)</b> vencem nos próximos 3 dias`, ir: 'anuncios' });
    if (p.anuncios_vencidos) acoes.push({ ico: 'relogio', txt: `<b>${p.anuncios_vencidos} anúncio(s)</b> venceram nos últimos 15 dias`, ir: 'anuncios' });
    const feitos = d.checklist.filter(c => c.ok).length;
    const pctChk = Math.round((feitos / d.checklist.length) * 100);
    const etapas = [['Acessos à loja', f.pagina], ['Produtos abertos', f.produto], ['Pedidos iniciados', f.pedidos], ['Pedidos pagos', f.pagos]];
    const maxF = Math.max(1, ...etapas.map(e => e[1]));
    const lista = (itens, vazio, linha) => (itens.length ? `<ol class="dash-lista">${itens.map(linha).join('')}</ol>` : `<p class="muted dash-vazio">${vazio}</p>`);
    const estrelasTxt = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

    el.innerHTML = `
      <div class="dash-topo">
        <div class="dash-loja">${d.loja.logo ? `<img src="${esc(d.loja.logo)}" alt="" referrerpolicy="no-referrer">` : ''}
          <div><h2>${esc(d.loja.nome)}</h2><span class="muted">Resumo dos últimos 30 dias · ${d.loja.aceita_pedidos ? `<b class="dash-on">Recebendo pedidos</b> (${esc(d.loja.metodos.join(' e '))})` : '<b class="dash-off">Pedidos pelo site desligados</b>'}</span></div></div>
        <div class="row-actions"><a class="btn btn-sm" href="/loja/${esc(d.loja.slug)}">Ver minha loja</a><button class="btn btn-sm btn-primary" type="button" data-ir="novo-anuncio">Novo anúncio</button></div>
      </div>

      <div class="dash-kpis">
        <div class="dash-kpi">${ico('vendas')}<span>Vendas (30 dias)</span><b>${brl(k.vendas.valor)}</b><small>${num(k.vendas.n)} pedido(s) · ${num(k.vendas.itens)} item(ns) ${varTxt(k.vendas.var_valor)}</small></div>
        <div class="dash-kpi">${ico('saldo')}<span>Recebimento</span><b>${k.mp.conectado ? 'Mercado Pago' : 'Não conectado'}</b><small>${k.mp.conectado ? 'os pagamentos caem direto na sua conta' : 'conecte em Vendas e pagamentos'}</small></div>
        <div class="dash-kpi">${ico('ticket')}<span>Ticket médio</span><b>${brl(k.ticket_medio)}</b><small>por pedido pago</small></div>
        <div class="dash-kpi">${ico('olho')}<span>Acessos à loja</span><b>${num(k.acessos.n)}</b><small>${k.conversao === null ? 'sem dados de conversão' : `${String(k.conversao).replace('.', ',')}% dos produtos abertos viram venda`} ${varTxt(k.acessos.var)}</small></div>
        <div class="dash-kpi">${ico('estrela')}<span>Avaliação</span><b>${k.avaliacao.media === null ? '—' : `${String(k.avaliacao.media).replace('.', ',')} ★`}</b><small>${num(k.avaliacao.total)} avaliação(ões)</small></div>
      </div>

      <div class="dash-grade">
        <section class="panel-card dash-card dash-acoes">
          <h3>Precisa da sua atenção</h3>
          ${acoes.length ? `<ul>${acoes.map(a => `<li><button type="button" class="${a.forte ? 'forte' : ''}" ${a.ir ? `data-ir="${a.ir}"` : `data-link="${esc(a.link)}"`}>${ico(a.ico)}<span>${a.txt}</span>${ico('seta', 'dash-seta')}</button></li>`).join('')}</ul>`
            : `<p class="dash-tudo">${ico('ok')} Tudo em dia! Nenhuma pendência agora.</p>`}
        </section>

        <section class="panel-card dash-card dash-graf-card">
          <div class="row-between"><h3>Últimos 30 dias</h3>
            <div class="dash-tabs" role="tablist"><button type="button" data-graf="vendas" aria-selected="true">Vendas</button><button type="button" data-graf="acessos" aria-selected="false">Acessos</button></div></div>
          <div id="dash-graf">${grafico(d.serie, 'vendas')}</div>
        </section>

        <section class="panel-card dash-card">
          <h3>Funil de vendas (30 dias)</h3>
          <div class="dash-funil">${etapas.map(([nome, v], i) => `<div class="dash-etapa"><span>${nome}</span><div class="dash-barra"><i style="width:${Math.max(v ? 4 : 0, (v / maxF) * 100).toFixed(1)}%"></i></div><b>${num(v)}</b>${i ? `<small>${etapas[i - 1][1] ? `${Math.round((v / etapas[i - 1][1]) * 100)}%` : '—'}</small>` : '<small></small>'}</div>`).join('')}</div>
          <p class="muted dash-nota">A porcentagem é quantos passaram da etapa anterior para esta.</p>
        </section>

        <section class="panel-card dash-card">
          <div class="row-between"><h3>Configuração da loja</h3><b class="dash-pct">${pctChk}%</b></div>
          <div class="dash-barra dash-barra-chk"><i style="width:${pctChk}%"></i></div>
          <ul class="dash-chk">${d.checklist.map(c => `<li class="${c.ok ? 'ok' : ''}">${ico(c.ok ? 'ok' : 'vazio')}<span>${esc(c.texto)}</span>${c.ok ? '' : `<button class="btn btn-sm" type="button" data-ir="${c.aba}">Fazer</button>`}</li>`).join('')}</ul>
        </section>

        <section class="panel-card dash-card">
          <h3>Mais vendidos (30 dias)</h3>
          ${lista(d.mais_vendidos, 'Nenhuma venda pelo site nos últimos 30 dias.', x => `<li><span>${esc(x.produto)}</span><b>${num(x.q)} un.</b><small>${brl(x.v)}</small></li>`)}
          <h3 class="dash-sub">Mais vistos no catálogo</h3>
          ${lista(d.mais_vistos, 'Nenhum produto aberto nos últimos 30 dias.', x => `<li><span>${esc(x.produto)}</span><b>${num(x.n)}</b><small>visualizações</small></li>`)}
        </section>

        <section class="panel-card dash-card">
          <div class="row-between"><h3>Últimos pedidos</h3><button class="btn btn-sm" type="button" data-ir="vendas">Ver todos</button></div>
          ${d.ultimos.length ? `<ul class="dash-pedidos">${d.ultimos.map(x => `<li><div><b>${esc(x.codigo)}</b> · ${esc(x.produto)}<small>${num(x.quantidade)}x · ${brl(x.subtotal)}${x.pago_em ? ` · pago em ${diaMes(x.pago_em)}` : ''}</small></div>
            <span class="status-pill st-${esc(x.status)}">${esc(x.status_nome)}</span>${x.conversa_id ? `<button class="btn btn-sm" type="button" data-abrir-chat="${x.conversa_id}" data-pedido="${x.id}">Conversa</button>` : ''}</li>`).join('')}</ul>`
            : '<p class="muted dash-vazio">Nenhum pedido ainda. Os pedidos pagos pelo site aparecem aqui.</p>'}
        </section>

        <section class="panel-card dash-card">
          <h3>Avaliações recentes</h3>
          ${k.avaliacao.total ? `<div class="dash-estrelas">${[5, 4, 3, 2, 1].map(s => `<div><span>${s} ★</span><div class="dash-barra"><i style="width:${((k.avaliacao.estrelas[s] || 0) / k.avaliacao.total * 100).toFixed(1)}%"></i></div><small>${num(k.avaliacao.estrelas[s] || 0)}</small></div>`).join('')}</div>` : ''}
          ${d.avaliacoes.length ? `<ul class="dash-avs">${d.avaliacoes.map(a => `<li><div><b class="dash-nota-est">${estrelasTxt(a.nota)}</b> <span class="muted">${esc(a.autor)} · ${diaMes(a.created_at)}</span></div>${a.texto ? `<p>${esc(a.texto)}</p>` : ''}${a.resposta ? '' : '<small class="dash-sem-resp">Sem resposta</small>'}</li>`).join('')}</ul>`
            : '<p class="muted dash-vazio">Sua loja ainda não recebeu avaliações.</p>'}
          <a class="btn btn-sm" href="/loja/${esc(d.loja.slug)}#avaliacoes">Ver e responder na loja</a>
        </section>
      </div>`;

    el.querySelectorAll('[data-graf]').forEach(b => b.addEventListener('click', () => {
      el.querySelectorAll('[data-graf]').forEach(x => x.setAttribute('aria-selected', x === b));
      el.querySelector('#dash-graf').innerHTML = grafico(d.serie, b.dataset.graf);
    }));
    el.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => abrirAba(b.dataset.ir)));
    el.querySelectorAll('[data-link]').forEach(b => b.addEventListener('click', () => { location.href = b.dataset.link; }));
  }

  async function carregar(el, abrirAba) {
    if (!el.querySelector('.dash-kpis')) el.innerHTML = '<div class="panel-card"><p class="muted">Carregando o painel da loja…</p></div>';
    const r = await fetch('/api/conta/loja/painel', { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { el.innerHTML = `<div class="panel-card"><p class="form-msg err">${esc(d.error || 'Não foi possível carregar o painel.')}</p></div>`; return; }
    render(el, d, abrirAba);
  }

  window.OfertouPainelLoja = { carregar };
})();
