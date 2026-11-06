// Resultado das postagens nos grupos de WhatsApp: envios, cliques e falhas por grupo, horário, tema, loja e oferta.
(function () {
  const raiz = document.getElementById('envio-resultados');
  if (!raiz) return;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = v => Number(v || 0).toLocaleString('pt-BR');
  const plural = (n, um, varios) => `${num(n)} ${Number(n) === 1 ? um : varios}`;
  const data = sql => new Date(`${String(sql).replace(' ', 'T')}Z`).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  raiz.innerHTML = `
    <div class="er-cab"><h2>Resultado das postagens</h2>
      <label class="er-periodo">Período <select id="er-dias"><option value="7">7 dias</option><option value="30" selected>30 dias</option><option value="90">90 dias</option></select></label></div>
    <div id="er-corpo"><p class="er-vazio">Carregando…</p></div>`;
  const corpo = raiz.querySelector('#er-corpo');

  function lista(titulo, itens, comFalhas = false) {
    if (!itens.length) return '';
    const maior = Math.max(1, ...itens.map(i => Number(i.cliques) || 0));
    return `<section class="er-bloco"><h3>${esc(titulo)}</h3><ul class="er-lista">${itens.map(i => `
      <li title="${esc(`${i.nome}: ${plural(i.cliques, 'clique', 'cliques')} em ${plural(i.envios, 'envio', 'envios')}`)}">
        <span class="er-nome">${esc(i.nome)}</span>
        <span class="er-barra"><i style="width:${Math.round((Number(i.cliques) || 0) / maior * 100)}%"></i></span>
        <span class="er-num">${plural(i.cliques, 'clique', 'cliques')} · ${plural(i.envios, 'envio', 'envios')}${comFalhas && i.falhas ? ` · ${plural(i.falhas, 'falha', 'falhas')}` : ''}</span>
      </li>`).join('')}</ul></section>`;
  }
  function desenhar(d) {
    const t = d.total;
    if (!t.envios && !t.falhas && !t.tentando) {
      corpo.innerHTML = '<p class="er-vazio">Ainda não há envios neste período. Os números começam a contar a partir desta atualização.</p>';
      return;
    }
    const media = t.rastreados ? (t.cliques / t.rastreados).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—';
    corpo.innerHTML = `
      <div class="er-kpis">
        <div><b>${num(t.envios)}</b><span>entregues nos grupos</span></div>
        <div><b>${num(t.cliques)}</b><span>cliques nos links</span></div>
        <div><b>${media}</b><span>cliques por envio</span></div>
        <div><b>${num(t.falhas)}</b><span>não chegaram</span></div>
      </div>
      ${t.recuperados || t.tentando ? `<p class="er-nota">${t.recuperados ? `${plural(t.recuperados, 'envio entregue', 'envios entregues')} em nova tentativa. ` : ''}${t.tentando ? `${plural(t.tentando, 'envio', 'envios')} aguardando nova tentativa.` : ''}</p>` : ''}
      ${!t.rastreados && t.envios ? '<p class="er-nota">Os cliques só são contados com o endereço público do site (https) preenchido e o link dele na mensagem.</p>' : ''}
      <div class="er-grade">
        ${lista('Por grupo', d.grupos.map(g => ({ ...g, nome: g.nome || g.chave })), true)}
        ${lista('Por horário', d.horas)}
        ${lista('Por tema', d.temas)}
        ${lista('Por loja', d.lojas)}
        ${lista('Ofertas com mais cliques', d.ofertas)}
      </div>
      ${d.falhas.length ? `<section class="er-bloco"><h3>Últimas falhas</h3><ul class="er-falhas">${d.falhas.map(f => `
        <li><b>${esc(f.grupo_nome)}</b> · ${esc(data(f.created_at))}${f.situacao === 'tentando' ? ' · nova tentativa em breve' : ''}<br><span>${esc(String(f.produto || '').slice(0, 70))}</span><br><small>${esc(f.erro || 'Sem detalhe.')}</small></li>`).join('')}</ul></section>` : ''}`;
  }
  async function carregar() {
    try {
      const r = await fetch(`/api/postagens/resultados?dias=${raiz.querySelector('#er-dias').value}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
      desenhar(d);
    } catch (err) { corpo.innerHTML = `<p class="er-vazio">${esc(err.message)}</p>`; }
  }
  raiz.querySelector('#er-dias').addEventListener('change', carregar);
  document.querySelector(`[data-tab="${raiz.dataset.aba}"]`)?.addEventListener('click', carregar);
  if (raiz.offsetParent !== null) carregar();
})();
