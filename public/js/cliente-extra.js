/* Ofertou! — painel do afiliado: comissão, monitor de membros e site do grupo */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = v => Number(v || 0).toLocaleString('pt-BR');
  const dia = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const SITUACAO = { pendente: 'Pendente', confirmada: 'Confirmada', paga: 'Paga', cancelada: 'Cancelada' };

  function aviso(t) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = t; el.classList.add('show');
    clearTimeout(aviso.t); aviso.t = setTimeout(() => el.classList.remove('show'), 3500);
  }
  async function api(p, opts = {}) {
    const r = await fetch(p, { method: opts.method || 'GET', headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
    return d;
  }
  const kpi = (rot, val, sub = '') => `<div class="cli-kpi"><div><small>${esc(rot)}</small><b class="ex-kpi-valor">${esc(val)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
  function periodo(sel, aoMudar) {
    $(sel).addEventListener('click', e => {
      const b = e.target.closest('[data-dias]');
      if (!b) return;
      $(sel).querySelectorAll('[data-dias]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      aoMudar(Number(b.dataset.dias));
    });
  }

  // ── Comissão ──
  let comDias = 30, LOJAS_OK = false, csvTexto = '';
  async function carregarComissao() {
    const d = await api(`/api/cliente/comissao?dias=${comDias}`);
    $('#com-kpis').innerHTML = kpi('Comissão no período', brl(d.comissao), `${num(d.cancelados)} cancelada(s), fora da conta`)
      + kpi('Confirmada', brl(d.confirmada)) + kpi('Pendente', brl(d.pendente), 'pode mudar até a loja confirmar')
      + kpi('Pedidos válidos', num(d.pedidos), d.pedidos ? `ticket médio de ${brl(d.ticket)}` : '');
    const max = Math.max(...d.serie.map(x => x.comissao), 0);
    $('#com-serie').innerHTML = d.serie.map(x => `<div title="${dia(x.dia)}: ${brl(x.comissao)}"><i style="height:${max ? (x.comissao / max) * 100 : 0}%"></i></div>`).join('');
    $('#com-lojas').innerHTML = d.por_loja.map(l => `<div class="ex-lin"><span>${esc(l.nome)} · ${num(l.pedidos)} pedido(s)</span><b>${brl(l.comissao)}</b></div>`).join('') || '<p class="cli-hint">Nenhuma venda neste período.</p>';
    $('#com-top').innerHTML = d.top.map(p => `<div class="ex-lin"><span title="${esc(p.produto)}">${esc(p.produto)}</span><b>${brl(p.comissao)}</b></div>`).join('') || '<p class="cli-hint">Nenhuma venda neste período.</p>';
    $('#com-vendas').innerHTML = d.recentes.map(v => `<tr><td>${esc(String(v.data_venda).slice(8, 10))}/${esc(String(v.data_venda).slice(5, 7))}</td><td>${esc(d.lojas[v.plataforma] || v.plataforma)}</td><td>${esc(String(v.produto || '').slice(0, 70))}</td><td>${brl(v.comissao)}</td><td>${esc(SITUACAO[v.status] || v.status)}</td></tr>`).join('')
      || '<tr><td colspan="5" class="cli-hint">Nenhuma venda ainda. Sincronize a Shopee ou importe uma planilha.</td></tr>';
    mostrarSaldos(d);
    const s = d.sync;
    $('#com-sync-txt').textContent = !d.shopee_ligada ? 'A Shopee atualiza sozinha quando você preenche o App ID e a Senha da API em Links de afiliado.'
      : s ? (s.ok ? `Shopee sincronizada em ${new Date(s.em).toLocaleString('pt-BR')}: ${num(s.novas)} nova(s), ${num(s.atualizadas)} atualizada(s). Atualiza sozinha a cada 6 horas.` : `A última sincronização falhou: ${s.mensagem}`)
        : 'A Shopee atualiza sozinha a cada 6 horas.';
    $('#com-sync').disabled = !d.shopee_ligada;
    if (!LOJAS_OK) { $('#com-loja').innerHTML = Object.entries(d.lojas).filter(([k]) => k !== 'shopee').concat([['shopee', d.lojas.shopee]]).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join(''); LOJAS_OK = true; }
  }
  const emMoeda = (v, m) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: m || 'BRL' });
  const dataBr = s => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR') : '—');
  function textoLembrete(lista) {
    const nomes = lista.map(l => l.nome);
    const juntos = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0];
    return `Hora de enviar a planilha de vendas: ${juntos}.`;
  }
  function mostrarSaldos(d) {
    const { brl: reais, usd, lojas } = d.saldos;
    const extra = k => (usd[k] ? `+ ${emMoeda(usd[k], 'USD')}` : '');
    $('#com-saldos').innerHTML = kpi('Disponível para saque', brl(reais.disponivel), extra('disponivel')) + kpi('A liberar', brl(reais.a_liberar), extra('a_liberar')) + kpi('Já recebido', brl(reais.recebido), extra('recebido'));
    $('#com-saldo-lojas').innerHTML = lojas.map(l => `<tr><td>${esc(l.nome)}${l.estimado ? `<br><small class="cli-hint">estimado em ${new Date(l.estimado.em).toLocaleDateString('pt-BR')}</small>` : ''}</td>
      <td>${emMoeda(l.disponivel, l.moeda)}</td><td>${emMoeda(l.a_liberar, l.moeda)}</td><td>${dataBr(l.proxima_liberacao)}</td>
      <td class="${l.pode_sacar ? 'ex-pos' : ''}">${l.pode_sacar ? 'Pode sacar' : l.falta > 0 ? `Faltam ${emMoeda(l.falta, l.moeda)}` : '—'}</td></tr>`).join('')
      || '<tr><td colspan="5" class="cli-hint">Nenhuma venda ainda.</td></tr>';
    $('#com-lembrete').hidden = !d.lembrete.length;
    if (d.lembrete.length) $('#com-lembrete').textContent = textoLembrete(d.lembrete);
    const sel = $('#com-saque-loja');
    if (!sel.options.length) sel.innerHTML = Object.entries(d.lojas).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('');
    $('#com-saques').innerHTML = d.saques.map(s => `<div class="ex-lin"><span>${esc(d.lojas[s.plataforma] || s.plataforma)} · ${new Date(`${String(s.criado_em).replace(' ', 'T')}Z`).toLocaleDateString('pt-BR')}</span><b>${brl(s.valor)}</b><button class="btn btn-sm" type="button" data-saque-apagar="${s.id}">Apagar</button></div>`).join('');
  }
  $('#com-saque-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      await api('/api/cliente/comissao/saque', { method: 'POST', body: { plataforma: f.elements.plataforma.value, valor: f.elements.valor.value } });
      f.elements.valor.value = ''; aviso('Saque registrado.');
      await carregarComissao();
    } catch (err) { aviso(err.message); }
  });
  $('#com-saques').addEventListener('click', async e => {
    const b = e.target.closest('[data-saque-apagar]');
    if (!b) return;
    try { await api(`/api/cliente/comissao/saque/${b.dataset.saqueApagar}`, { method: 'DELETE' }); await carregarComissao(); } catch (err) { aviso(err.message); }
  });
  // Extensão do Chrome: entrega aqui o "Ganho estimado" lido no painel do Mercado Livre
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.ofertouExt !== true) return;
    if (e.data.tipo === 'instalada') $('#com-ext-status').textContent = 'Extensão instalada neste navegador.';
    if (e.data.tipo === 'ganho-estimado') {
      api('/api/cliente/comissao/ml-estimado', { method: 'POST', body: { valor: e.data.valor } })
        .then(() => { aviso('Ganho estimado do Mercado Livre atualizado.'); if (!$('[data-body="comissao"]').hidden) carregarComissao().catch(() => {}); })
        .catch(() => {});
    }
  });
  periodo('#com-periodo', x => { comDias = x; carregarComissao().catch(e => aviso(e.message)); });
  $('#com-sync').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Sincronizando…';
    try { const r = await api('/api/cliente/comissao/sincronizar', { method: 'POST' }); aviso(`${num(r.novas)} venda(s) nova(s).`); }
    catch (err) { aviso(err.message); }
    b.textContent = 'Sincronizar a Shopee agora'; b.disabled = false;
    carregarComissao().catch(() => {});
  });
  const CAMPOS = [['data_venda', 'Data da venda *'], ['comissao', 'Comissão *'], ['produto', 'Produto'], ['pedido', 'Número do pedido'], ['valor_venda', 'Valor da venda'], ['status', 'Situação']];
  $('#com-arquivo').addEventListener('change', async e => {
    const arq = e.target.files[0];
    $('#com-mapa').hidden = true;
    if (!arq) return;
    if (arq.size > 11 * 1024 * 1024) { aviso('Planilha grande demais (máx. 11 MB).'); e.target.value = ''; return; }
    try {
      csvTexto = await arq.text();
      const p = await api('/api/cliente/comissao/previa', { method: 'POST', body: { texto: csvTexto } });
      $('#com-mapa-txt').textContent = `${num(p.total)} linha(s) encontrada(s). Confira qual coluna é qual:`;
      const opcoes = sel => `<option value="-1">Não tem</option>${p.cabecalho.map((c, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(c)}</option>`).join('')}`;
      $('#com-colunas').innerHTML = CAMPOS.map(([k, n]) => `<label class="field">${esc(n)}<select data-coluna="${k}">${opcoes(p.sugestao[k])}</select></label>`).join('');
      $('#com-mapa').hidden = false;
    } catch (err) { aviso(err.message); e.target.value = ''; }
  });
  $('#com-importar').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true;
    const mapa = {};
    document.querySelectorAll('[data-coluna]').forEach(s => { mapa[s.dataset.coluna] = Number(s.value); });
    try {
      const r = await api('/api/cliente/comissao/importar', { method: 'POST', body: { texto: csvTexto, plataforma: $('#com-loja').value, mapa } });
      aviso(`${num(r.novas)} nova(s), ${num(r.atualizadas)} atualizada(s), ${num(r.ignoradas)} ignorada(s).`);
      $('#com-mapa').hidden = true; $('#com-arquivo').value = ''; csvTexto = '';
      carregarComissao().catch(() => {});
    } catch (err) { aviso(err.message); }
    b.disabled = false;
  });

  // ── Membros ──
  let memDias = 30;
  async function carregarMembros() {
    const d = await api(`/api/cliente/membros?dias=${memDias}`);
    const saldo = d.entradas - d.saidas;
    $('#mem-kpis').innerHTML = kpi('Membros nos grupos', d.grupos.some(g => g.total !== null) ? num(d.total) : '—') + kpi('Entradas', num(d.entradas)) + kpi('Saídas', num(d.saidas)) + kpi('Saldo', `${saldo > 0 ? '+' : ''}${num(saldo)}`);
    const max = Math.max(...d.serie.map(x => Math.max(x.entradas, x.saidas)), 0);
    $('#mem-serie').innerHTML = d.serie.map(x => `<div title="${dia(x.dia)}: ${num(x.entradas)} entrada(s), ${num(x.saidas)} saída(s)"><i style="height:${max ? (x.entradas / max) * 50 : 0}%"></i><i class="sai" style="height:${max ? (x.saidas / max) * 50 : 0}%"></i></div>`).join('');
    $('#mem-grupos').innerHTML = d.grupos.map(g => { const s = g.entradas - g.saidas; return `<tr><td>${esc(g.nome)}</td><td>${g.total === null ? '—' : num(g.total)}</td><td>${num(g.entradas)}</td><td>${num(g.saidas)}</td><td class="${s > 0 ? 'ex-pos' : s < 0 ? 'ex-neg' : ''}">${s > 0 ? '+' : ''}${num(s)}</td></tr>`; }).join('')
      || '<tr><td colspan="5" class="cli-hint">Sem dados ainda. Escolha os grupos de envio em Redes e mensagem e toque em "Atualizar o total agora".</td></tr>';
  }
  periodo('#mem-periodo', x => { memDias = x; carregarMembros().catch(e => aviso(e.message)); });
  $('#mem-atualizar').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const r = await api('/api/cliente/membros/atualizar', { method: 'POST' });
      aviso(r.grupos ? `${num(r.lidos)} de ${num(r.grupos)} grupo(s) conferido(s).` : 'Escolha os grupos de envio em Redes e mensagem.');
      await carregarMembros();
    } catch (err) { aviso(err.message); }
    b.disabled = false;
  });

  // ── Site do grupo ──
  let sgEndereco = '';
  async function carregarSite() {
    const d = await api('/api/cliente/site-grupo');
    sgEndereco = d.endereco;
    const a = $('#sg-link'); a.textContent = d.endereco; a.href = d.endereco;
    const campo = $('#sg-form').elements.grupo_slug;
    if (document.activeElement !== campo) campo.value = d.slug;
    $('#sg-grupos').innerHTML = d.grupos.map(g => `<tr><td>${esc(g.nome)}</td><td>${num(g.entradas)}</td><td>${g.limite ? num(g.limite) : 'Sem limite'}</td><td>${g.lotado ? 'Lotado' : 'Recebendo'}</td></tr>`).join('')
      || '<tr><td colspan="4" class="cli-hint">Adicione os seus grupos acima para a página funcionar.</td></tr>';
  }
  $('#sg-copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(sgEndereco); aviso('Link copiado!'); } catch { aviso(sgEndereco); }
  });
  $('#sg-form').addEventListener('submit', () => setTimeout(() => carregarSite().catch(() => {}), 700));
  $('#sg-zerar').addEventListener('click', async () => {
    if (!confirm('Zerar a contagem de entradas dos seus grupos?')) return;
    try { await api('/api/cliente/site-grupo/zerar', { method: 'POST' }); await carregarSite(); } catch (err) { aviso(err.message); }
  });

  // O que está em alta (dashboard): carrega quando o painel aparece, depois do login
  async function carregarAlta() {
    const d = await api('/api/cliente/populares');
    $('#alta-buscados').innerHTML = d.buscados.map((b, i) => `<li><a href="/?q=${encodeURIComponent(b.termo)}"><i>${i + 1}</i><span>${esc(b.termo)}</span><small>${num(b.vezes)} buscas</small></a></li>`).join('') || '<li class="cli-hint">Ainda sem dados.</li>';
    $('#alta-clicados').innerHTML = d.clicados.map((o, i) => `<li><a href="${esc(o.link)}" target="_blank" rel="noopener sponsored" title="${esc(o.produto)}"><i>${i + 1}</i><img src="/img/o/${Number(o.id)}.jpg" alt="" width="40" height="40" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(o.produto)}</span><b>${brl(o.preco_atual)}</b></a></li>`).join('') || '<li class="cli-hint">Ainda sem dados.</li>';
    $('#cli-alta').hidden = !d.buscados.length && !d.clicados.length;
  }
  const app = $('#view-app');
  let altaFeita = false;
  const talvezAlta = () => { if (!altaFeita && app && !app.hidden) { altaFeita = true; carregarAlta().catch(() => { altaFeita = false; }); } };
  if (app) new MutationObserver(talvezAlta).observe(app, { attributes: true, attributeFilter: ['hidden'] });
  talvezAlta();

  // Ofertas, postagens e perfil abrem aqui mesmo, num quadro
  const irAba = a => document.querySelector(`.tabs-line [data-tab="${a}"]`)?.click();
  const selecao = () => { try { return localStorage.getItem('gp_postagens') || ''; } catch { return ''; } };
  function abrirQuadro(id, url) {
    const f = $(`#quadro-${id}`);
    if (!f.getAttribute('src') || url) f.src = url;
  }
  function abrirOfertas(busca = '') {
    const qs = new URLSearchParams(busca);
    qs.set('embed', '1');
    const f = $('#quadro-ofertas');
    if (!f.getAttribute('src') || busca) f.src = `/?${qs}`;
  }
  function abrirPostagens() {
    const f = $('#quadro-postagens'), sel = selecao();
    if (!f.getAttribute('src') || f.dataset.sel !== sel) { f.dataset.sel = sel; f.src = '/postagens?embed=1'; } // escolheu outros produtos: mostra os novos
  }
  let buscaPedida = '';
  // Pedido vindo de dentro do quadro ("Ir para postagens", por exemplo)
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data?.ofertouAba) return;
    buscaPedida = e.data.busca || '';
    irAba(e.data.ofertouAba);
  });
  // Links do painel para essas áreas ficam no painel (o logo continua indo para o site)
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!a || a.target === '_blank' || e.ctrlKey || e.metaKey || a.closest('.brand, .cli-side-logo')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return;
    const aba = { '/': 'ofertas', '/postagens': 'postagens', '/perfil': 'perfil' }[u.pathname];
    if (!aba) return;
    e.preventDefault();
    buscaPedida = u.search;
    irAba(aba);
  }, true);

  // Carrega cada aba ao abrir
  const CARGA = {
    comissao: carregarComissao, membros: carregarMembros, sitegrupo: carregarSite,
    ofertas: async () => { const b = buscaPedida; buscaPedida = ''; abrirOfertas(b); },
    postagens: async () => { buscaPedida = ''; abrirPostagens(); },
    perfil: async () => abrirQuadro('perfil', $('#quadro-perfil').getAttribute('src') ? '' : '/perfil?embed=1'),
  };
  document.querySelector('.tabs-line')?.addEventListener('click', e => {
    const f = CARGA[e.target.closest('[data-tab]')?.dataset.tab];
    if (f) f().catch(err => aviso(err.message));
  });
})();
