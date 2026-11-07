// Ofertou! — coleta das ofertas do Mercado Livre (só age quando ligada pelo botão "Coletar agora" do Painel).
//  1. Lê a página de ofertas relâmpago e depois a de ofertas gerais, poucas páginas, rolando como uma pessoa;
//  2. Guarda o que achou e segue para a mineração de cupons;
//  3. No fim, a mineração de cupons volta para o Painel, que grava os dois.
// Só lê as páginas. Se o Mercado Livre pedir login ou verificação, não tenta nada: segue em frente sem as ofertas.
(() => {
  'use strict';
  if (window.__ofertouOfertas) return;
  window.__ofertouOfertas = true;

  const espera = ms => new Promise(r => setTimeout(r, ms));
  const num = s => { const t = String(s || '').replace(/[^\d,.]/g, ''); return t ? Number(t.replace(/\./g, '').replace(',', '.')) : null; };
  const CUPONS = 'https://www.mercadolivre.com.br/cupons/filter?all=true&page=1';
  const paginaDe = (fase, n) => {
    const q = new URLSearchParams();
    if (fase === 'relampago') { q.set('container_id', 'MLB779362-1'); q.set('promotion_type', 'lightning'); }
    if (n > 1) q.set('page', n);
    const t = q.toString();
    return `https://www.mercadolivre.com.br/ofertas${t ? `?${t}` : ''}`;
  };

  let raiz;
  function caixa(msg) {
    if (!raiz) {
      const c = document.createElement('div');
      c.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646';
      raiz = c.attachShadow({ mode: 'open' });
      raiz.innerHTML = `<style>
        .c { display: flex; align-items: center; gap: 10px; max-width: min(400px, calc(100vw - 32px)); padding: 10px 12px; border-radius: 14px;
          font: 600 13.5px/1.4 system-ui, sans-serif; background: #121714; color: #eef3f0; border: 1px solid #2bb673; box-shadow: 0 12px 30px rgba(0,0,0,.35); }
        b { color: #2bb673; } .t { flex: 1; }
        button { font: inherit; font-weight: 800; padding: 7px 12px; border-radius: 999px; border: 0; background: #3a2222; color: #ffb4b4; cursor: pointer; }
      </style><div class="c"><span class="t"></span><button class="p">Parar</button></div>`;
      raiz.querySelector('.p').addEventListener('click', () => { terminar('parado'); });
      document.documentElement.append(c);
    }
    raiz.querySelector('.t').innerHTML = '<b>Ofertou!</b> ';
    raiz.querySelector('.t').append(msg);
  }

  const valor = el => {
    if (!el) return null;
    const f = el.querySelector('.andes-money-amount__fraction')?.textContent, c = el.querySelector('.andes-money-amount__cents')?.textContent;
    return f ? num(f) + (c ? Number(c.replace(/\D/g, '').slice(0, 2).padEnd(2, '0')) / 100 : 0) : null;
  };
  // "Termina em 02:14:33"
  function restante(texto) {
    const m = String(texto).match(/(\d{1,2}):(\d{2}):(\d{2})/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  }
  function lerCartoes(pagRelampago) {
    const out = [];
    for (const card of document.querySelectorAll('.poly-card, .promotion-item')) {
      const a = card.querySelector('a.poly-component__title, .poly-component__title-wrapper a, a[href*="MLB"]');
      const href = (a?.href || '').split(/[?#]/)[0];
      const produto = (href.match(/\/p\/(MLB\d{6,})/i) || [])[1] || null;
      const item = (decodeURIComponent(a?.href || '').match(/MLB-?(\d{6,})/i) || [])[1];
      if (!href || (!produto && !item)) continue;
      const preco = valor(card.querySelector('.poly-price__current .andes-money-amount'));
      const anterior = valor(card.querySelector('.andes-money-amount--previous'));
      if (!preco || !anterior) continue;
      const texto = card.innerText || '';
      const img = card.querySelector('img');
      const relampago = pagRelampago || /REL[ÂA]MPAGO/i.test(texto);
      out.push({
        produto, item: item ? `MLB${item}` : null, link: href,
        nome: (card.querySelector('.poly-component__title')?.textContent || a?.textContent || '').trim().slice(0, 200),
        preco, preco_anterior: anterior, imagem: img?.getAttribute('data-src') || img?.src || null,
        relampago, resta_s: relampago ? restante(texto) : null,
      });
    }
    return out;
  }

  async function terminar(motivo) {
    const { ofertasJob: j } = await chrome.storage.local.get('ofertasJob');
    await chrome.storage.local.remove('ofertasJob');
    if (!j) return;
    await chrome.storage.local.set({ ofertasResultado: { em: Date.now(), motivo, itens: Object.values(j.itens || {}) }, cuponsJob: { ...j.cupons, ate: Date.now() + 3 * 60 * 60 * 1000 } });
    caixa('Ofertas lidas. Agora os cupons…');
    location.href = CUPONS;
  }

  (async () => {
    const { ofertasJob: j } = await chrome.storage.local.get('ofertasJob');
    if (!j || Date.now() > j.ate) { if (j) await chrome.storage.local.remove('ofertasJob'); return; }
    await espera(1500);
    caixa(`Lendo ofertas ${j.fase === 'relampago' ? 'relâmpago' : 'gerais'}, página ${j.pagina}…`);
    for (let i = 0; i < 6; i++) { window.scrollBy(0, innerHeight); await espera(700); }
    const lidos = lerCartoes(j.fase === 'relampago');
    for (const it of lidos) {
      const chave = it.produto || it.item;
      if (!j.itens[chave] || it.relampago) j.itens[chave] = it;
    }
    caixa(`${Object.keys(j.itens).length} ofertas até agora…`);
    let { fase, pagina } = j;
    if (lidos.length && pagina < j.paginas) pagina++;
    else if (fase === 'relampago') { fase = 'geral'; pagina = 1; }
    else return terminar(Object.keys(j.itens).length ? 'ok' : 'sem-dados');
    await chrome.storage.local.set({ ofertasJob: { ...j, fase, pagina } });
    await espera(1500);
    location.href = paginaDe(fase, pagina);
  })();
})();
