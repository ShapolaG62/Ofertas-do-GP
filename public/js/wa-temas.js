// Grupos de WhatsApp no painel (admin e cliente): foto, nome e o tipo de produto que cada grupo recebe.
// Sem tipo marcado, o grupo recebe todas as ofertas. Se o nome indica o tipo ("Ofertas Tech"), ele já vem sugerido.
window.OfertouTemas = (function () {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const iniciais = nome => String(nome || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  // Foto com as iniciais por baixo: se não houver foto, ficam as iniciais
  const avatar = (nome, foto) => `<span class="wa-avatar" aria-hidden="true">${esc(iniciais(nome))}${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" data-wa-foto>` : ''}</span>`;
  // A imagem que falhar some (o erro não sobe na página, por isso a escuta na captura)
  document.addEventListener('error', e => { if (e.target?.matches?.('[data-wa-foto]')) e.target.remove(); }, true);

  const temasMarcados = (categorias, sugestao, temas) => temas.filter(t => sugestao.includes(t.id) || t.categorias.some(c => categorias.includes(c))).map(t => t.id);
  function linha(g, temas = []) {
    const marcados = temasMarcados(g.categorias || [], g.sugestao || [], temas);
    const chips = temas.map(t => `<button type="button" class="wa-chip" data-wa-tema="${esc(t.id)}" data-cats="${esc(t.categorias.join(','))}" aria-pressed="${marcados.includes(t.id)}"><span aria-hidden="true">${esc(t.icone)}</span> ${esc(t.nome)}</button>`).join('');
    const sub = [g.membros ? `${Number(g.membros).toLocaleString('pt-BR')} pessoas` : '', g.sugestao?.length ? 'tipo sugerido pelo nome' : ''].filter(Boolean).join(' · ');
    return `<div class="wa-grupo-linha">
      <label class="wa-grupo-topo"><input type="checkbox" data-wa-group="${esc(g.id)}" data-nome="${esc(g.nome)}" ${g.salvo ? 'checked' : ''}>${avatar(g.nome, g.foto)}<span class="wa-grupo-nome"><b>${esc(g.nome)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></label>
      ${chips ? `<div class="wa-chips" role="group" aria-label="Tipos de produto de ${esc(g.nome)}">${chips}</div>` : ''}
    </div>`;
  }
  function ligar(caixa) {
    caixa.addEventListener('click', e => {
      const b = e.target.closest('[data-wa-tema]');
      if (!b) return;
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    });
  }
  // Os grupos marcados, para salvar
  function ler(caixa) {
    return [...caixa.querySelectorAll('.wa-grupo-linha')].map(l => {
      const c = l.querySelector('[data-wa-group]');
      if (!c.checked) return null;
      const categorias = [...l.querySelectorAll('[data-wa-tema][aria-pressed="true"]')].flatMap(t => t.dataset.cats.split(','));
      return { id: c.dataset.waGroup, nome: c.dataset.nome, ...(categorias.length ? { categorias } : {}) };
    }).filter(Boolean);
  }
  // Grupos que não aparecem na lista
  const avisoOcultos = n => (n ? `${n} grupo(s) não aparecem porque não foram criados por este número ou ele não é administrador.` : '');
  return { linha, ligar, ler, avatar, avisoOcultos };
})();
