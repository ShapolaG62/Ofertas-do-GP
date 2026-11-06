// Temas de cada grupo de WhatsApp (painel do admin e do cliente): sem tema marcado, o grupo recebe todas as ofertas.
window.OfertouTemas = (function () {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const texto = (marcados, categorias) => {
    if (!marcados.length) return 'Temas: todas as ofertas';
    const nomes = marcados.map(id => (categorias.find(c => c.id === id) || { nome: id }).nome);
    return `Temas: ${nomes.join(', ')}`;
  };
  // Uma linha da lista: o grupo e, se houver a lista de temas, a escolha deles
  function linha(g, escolhido, categorias = []) {
    const marcados = escolhido?.categorias || [];
    const temas = categorias.length ? `<details class="wa-temas"><summary>${esc(texto(marcados, categorias))}</summary><div class="wa-temas-lista">${categorias.map(c => `
      <label class="check"><input type="checkbox" data-wa-tema="${esc(c.id)}" ${marcados.includes(c.id) ? 'checked' : ''}> ${esc(c.nome)}</label>`).join('')}</div></details>` : '';
    return `<div class="wa-grupo-linha"><label class="check"><input type="checkbox" data-wa-group="${esc(g.id)}" data-nome="${esc(g.nome)}" ${escolhido ? 'checked' : ''}> ${esc(g.nome)}</label>${temas}</div>`;
  }
  function ligar(caixa, categorias = []) {
    caixa.addEventListener('change', e => {
      if (!e.target.matches('[data-wa-tema]')) return;
      const det = e.target.closest('details');
      det.querySelector('summary').textContent = texto([...det.querySelectorAll('[data-wa-tema]:checked')].map(c => c.dataset.waTema), categorias);
    });
  }
  // Os grupos marcados, para salvar
  function ler(caixa) {
    return [...caixa.querySelectorAll('.wa-grupo-linha')].map(l => {
      const c = l.querySelector('[data-wa-group]');
      if (!c.checked) return null;
      const temas = [...l.querySelectorAll('[data-wa-tema]:checked')].map(t => t.dataset.waTema);
      return { id: c.dataset.waGroup, nome: c.dataset.nome, ...(temas.length ? { categorias: temas } : {}) };
    }).filter(Boolean);
  }
  return { linha, ligar, ler };
})();
