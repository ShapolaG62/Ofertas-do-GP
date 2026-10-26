// Ofertou! Ganhos — páginas de produto do Mercado Livre. Quem está logado como afiliado vê na página quanto ganha
// com o produto (ex.: "Ganhe 12%", "Ganho extra de 5%"). Lê esse ganho, sem mostrar nada na tela, e entrega para a
// extensão, que manda ao Ofertou! (selos azul/amarelo e filtro de comissão extra). Não clica em nada.
(() => {
  'use strict';
  if (window.__ofertouComissaoMl) return;
  window.__ofertouComissaoMl = true;

  // Código do anúncio: na URL (MLB-123…, item_id:MLB123… do pdp_filters, wid=MLB123…)
  function itemDaPagina() {
    const u = decodeURIComponent(location.href);
    const m = u.match(/item_id[:=]MLB-?(\d{6,})/i) || u.match(/[?&]wid=MLB-?(\d{6,})/i) || u.match(/\/MLB-(\d{6,})/i);
    return m ? `MLB${m[1]}` : null;
  }

  const PCT = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g;
  const num = s => Number(String(s).replace(',', '.'));
  // Textos de preço/desconto que também têm "%" e não são a comissão
  const NAO = /off\b|desconto|juros|parcela|cashback|pix|cupom|frete|avalia|estrela|vendid|bateria|algod|poliéster|poliester/i;
  const visivel = el => el && el.getClientRects().length > 0;

  // Procura blocos curtos com "ganh"/"comiss" e uma porcentagem (a barra de afiliado do Mercado Livre)
  function ler() {
    const blocos = [];
    // Parte dos textos com "ganh"/"comiss" e sobe até 3 níveis procurando o bloco com a porcentagem
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let no, vistos = 0;
    while ((no = w.nextNode()) && vistos < 60) {
      if (!/ganh|comiss|\bextra\b/i.test(no.nodeValue || '')) continue;
      vistos++;
      let el = no.parentElement;
      for (let i = 0; i < 4 && el && el !== document.body; i++, el = el.parentElement) {
        if (!visivel(el)) break;
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (t.length > 160) break;
        if (t.includes('%') && !NAO.test(t)) { blocos.push(t); break; }
      }
    }
    if (!blocos.length) return null;
    // Os blocos de dentro repetem o texto dos de fora: fica com os menores, sem repetição
    const unicos = [...new Set(blocos)].sort((a, b) => a.length - b.length)
      .filter((t, i, l) => !l.slice(0, i).some(menor => t.includes(menor)));
    let base = 0, extra = 0, incluida = false;
    for (const t of unicos) {
      const achados = [...t.matchAll(PCT)];
      achados.forEach((m, i) => {
        const v = num(m[1]);
        if (!(v > 0 && v <= 60)) return;
        // Contexto só desta porcentagem: do fim da anterior até o começo da próxima (sem misturar com a vizinha)
        const ini = i ? achados[i - 1].index + achados[i - 1][0].length : Math.max(0, m.index - 30);
        const fim = i < achados.length - 1 ? achados[i + 1].index : m.index + m[0].length + 30;
        const contexto = t.slice(ini, Math.min(fim, m.index + m[0].length + 30));
        if (/extra|adicional|campanha|bônus|bonus/i.test(contexto)) {
          extra = Math.max(extra, v);
          if (/inclu|dos quais|sendo/i.test(contexto)) incluida = true; // "Ganhe 12% (inclui 4% extra)"
        } else base = Math.max(base, v);
      });
    }
    if (!base && !extra) return null;
    // Normal e extra mostradas separadas ("7%" + "extra +5%") → o total é a soma; "inclui X% extra" → já é o total
    const total = extra && !incluida ? base + extra : (base || extra);
    return { comissao: Math.round(total * 100) / 100, extra, textos: unicos.slice(0, 4) };
  }

  // A barra de afiliado aparece um pouco depois da página: tenta por até 25 s
  let tentativas = 0;
  const timer = setInterval(() => {
    tentativas++;
    const r = ler();
    if (r || tentativas >= 12) {
      clearInterval(timer);
      chrome.runtime.sendMessage({ tipo: 'comissao-ml', item: itemDaPagina(), url: location.href, ...(r || { comissao: null, extra: 0 }) });
    }
  }, 2000);
})();
