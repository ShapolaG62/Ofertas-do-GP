// Ofertou! — minerador de cupons do Mercado Livre (só age quando ligado pelo botão "Minerar cupons" do Painel).
//  1. Lê a central de cupons (mercadolivre.com.br/cupons/filter?all=true&page=N), página por página: título, desconto,
//     compra mínima, limite, validade e se o cupom já está ativo na sua conta;
//  2. Lê por trás a lista de produtos de cada cupom ativo (o link "Conferir") e pega os produtos marcados "com Cupom";
//     uma lista que não abre é pulada, sem parar a coleta;
//  3. Volta para o Painel do Ofertou! entregando tudo (o Painel grava os cupons e as ofertas).
// Com "Aplicar sozinho" marcado no Painel, toca em "Aplicar" nos cupons ainda não aplicados (até o limite escolhido),
// para o Mercado Livre liberar a lista de produtos deles. Fora isso, só lê as páginas.
(() => {
  'use strict';
  if (window.__ofertouCupons) return;
  window.__ofertouCupons = true;

  const espera = ms => new Promise(r => setTimeout(r, ms));
  const num = s => { const t = String(s || '').replace(/[^\d,.]/g, ''); return t ? Number(t.replace(/\./g, '').replace(',', '.')) : null; };

  // Caixa de andamento no canto (Shadow DOM: o estilo da página não interfere)
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
      raiz.querySelector('.p').addEventListener('click', async () => { await terminar('parado'); });
      document.documentElement.append(c);
    }
    raiz.querySelector('.t').innerHTML = '<b>Ofertou!</b> ';
    raiz.querySelector('.t').append(msg);
  }

  // Estado da página (o Mercado Livre manda os dados prontos num <script id="__NORDIC_RENDERING_CTX__">)
  function estado(doc = document) {
    const txt = doc.getElementById('__NORDIC_RENDERING_CTX__')?.textContent || '';
    const ini = txt.indexOf('{');
    if (ini < 0) return null;
    let d = 0, str = false, esc = false;
    for (let i = ini; i < txt.length; i++) {
      const c = txt[i];
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
      if (c === '"') str = true;
      else if (c === '{') d++;
      else if (c === '}' && !--d) { try { return JSON.parse(txt.slice(ini, i + 1)); } catch { return null; } }
    }
    return null;
  }

  // Cupom esgotado: pelo estado ou por qualquer texto do próprio cupom (os nomes dos produtos ficam de fora da conferência)
  const RE_ESGOTADO = /esgotad|sold[_ -]?out|out[_ -]?of[_ -]?stock|exhausted|depleted|sem estoque|cupons? (acabou|acabaram)/i;
  const RE_ESTADO_FORA = /SOLD|EXHAUST|DEPLET|OUT_OF|FINISH|EXPIRED|UNAVAILABLE|CONSUMED/i;
  function esgotado(c, cartao) {
    if (RE_ESTADO_FORA.test(String(c.status?.id || ''))) return true;
    const { items, ...semProdutos } = c;
    return RE_ESGOTADO.test(JSON.stringify(semProdutos)) || RE_ESGOTADO.test(cartao?.innerText || '');
  }

  function cupomDe(c) {
    const titulo = String(c.title?.text || '').replace(/\s+/g, ' ').trim();
    const pct = titulo.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
    const valor = titulo.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/);
    return {
      id: String(c.campaign_id || ''),
      titulo,
      subtitulo: String(c.initial_subtitle?.text || '').trim(),
      tipo: pct ? 'pct' : valor ? 'valor' : null,
      valor: pct ? num(pct[1]) : valor ? num(valor[1]) : null,
      minimo: num((c.amount?.min_amount || '').replace(/^[^R]*/, '')),
      limite: num((c.amount?.cap_amount || '').replace(/^[^R]*/, '')),
      validade: String(c.expiration_date?.text || '').trim(),
      expira: c.future_coupon_info?.expiration_date || null,
      ativo: c.status?.id === 'ACTIVE',
      link: c.action?.type === 'link' && /^https:\/\/lista\.mercadolivre\.com\.br\//.test(c.action.value || '') ? c.action.value : null,
      previa: (c.items || []).map(i => String(i.alt_text || '').slice(0, 120)).filter(Boolean).slice(0, 5),
    };
  }

  // Produtos marcados "com Cupom" na lista do cupom
  function produtosDaLista(doc) {
    const out = [];
    for (const card of doc.querySelectorAll('.poly-card')) {
      const rotulo = [...card.querySelectorAll('[class*="label"]')].map(x => x.textContent.trim()).find(t => /OFF.*cupom/i.test(t))
        || [...card.querySelectorAll('[class*="label"]')].map(x => x.textContent.trim()).find(t => /cupom/i.test(t));
      if (!rotulo) continue;
      const a = card.querySelector('a.poly-component__title, .poly-component__title-wrapper a, a[href*="MLB"]');
      const href = (a?.href || '').split(/[?#]/)[0];
      const produto = (href.match(/\/p\/(MLB\d{6,})/i) || [])[1] || null;
      const item = (decodeURIComponent(a?.href || '').match(/MLB-?(\d{6,})/i) || [])[1];
      if (!href || (!produto && !item)) continue;
      const valor = el => {
        if (!el) return null;
        const f = el.querySelector('.andes-money-amount__fraction')?.textContent, c = el.querySelector('.andes-money-amount__cents')?.textContent;
        return f ? num(f) + (c ? Number(c.replace(/\D/g, '').slice(0, 2).padEnd(2, '0')) / 100 : 0) : null;
      };
      const img = card.querySelector('img');
      out.push({
        produto, item: item ? `MLB${item}` : null, link: href,
        nome: (card.querySelector('.poly-component__title')?.textContent || a?.textContent || '').trim().slice(0, 200),
        preco: valor(card.querySelector('.poly-price__current .andes-money-amount')),
        preco_anterior: valor(card.querySelector('.andes-money-amount--previous')),
        imagem: img?.getAttribute('data-src') || img?.src || null,
        rotulo,
      });
    }
    return out;
  }

  // Guarda os cupons de uma página. Na coleta completa, só os ativos na conta.
  function guardarCupons(j, dados, cartoes = []) {
    const brutos = dados.rawCoupons || [];
    j.esgotados ||= {};
    brutos.forEach((c, i) => {
      const k = cupomDe(c);
      if (!k.id) return;
      if (esgotado(c, cartoes.length === brutos.length ? cartoes[i] : null)) { j.esgotados[k.id] = k.titulo; delete j.cupons[k.id]; return; }
      if (j.soAtivos && !k.ativo) return;
      j.cupons[k.id] = k;
    });
  }
  // Lê as outras páginas da central sem abrir uma por uma (3 de cada vez, com uma pausa). Devolve a primeira página que
  // não deu para ler, para continuar do jeito normal a partir dela, ou 0 se leu tudo.
  async function lerPaginasPorTras(j, total) {
    for (let p = j.pagina + 1; p <= total;) {
      const { cuponsJob: ainda } = await chrome.storage.local.get('cuponsJob');
      if (!ainda) return -1; // parado pela pessoa
      const lote = [];
      for (let i = 0; i < 3 && p + i <= total; i++) lote.push(p + i);
      const lidas = await Promise.all(lote.map(async n => {
        try {
          const r = await fetch(`/cupons/filter?all=true&page=${n}`, { credentials: 'include' });
          if (!r.ok) return null;
          const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
          return estado(doc)?.appProps?.pageProps?.filteredCouponsData || null;
        } catch { return null; }
      }));
      for (const [i, dados] of lidas.entries()) {
        if (!dados) return lote[i];
        guardarCupons(j, dados);
      }
      p += lote.length;
      caixa(`cupons: página ${Math.min(p - 1, total)} de ${total} · ${Object.keys(j.cupons).length} ativos`);
      await espera(500);
    }
    return 0;
  }

  // Lista de produtos lida por trás, sem abrir a página. O Mercado Livre pedindo verificação ou limitando os pedidos
  // encerra a leitura e entrega o que já veio: quem resolve é a pessoa, no Mercado Livre.
  const RE_VERIFICACAO = /account-verification|negative_traffic|captcha|\/login|\/lgz\//i;
  async function lerLista(url) {
    let r;
    try { r = await chrome.runtime.sendMessage({ tipo: 'ler-lista', url }); } catch { return { falhou: true }; }
    if (!r || r.erro) return { falhou: true };
    if (r.status === 403 || r.status === 429 || RE_VERIFICACAO.test(r.url || '')) return { verificacao: true };
    if (!r.html) return { falhou: true };
    return { doc: new DOMParser().parseFromString(r.html, 'text/html') };
  }
  async function produtosDoCupom(j, cupom) {
    const lista = j.produtos[cupom.id] || (j.produtos[cupom.id] = []);
    const vistos = new Set(lista.map(p => p.produto || p.item));
    let url = cupom.link;
    for (let pag = 1; url && pag <= j.paginasProd; pag++) {
      const { doc, falhou, verificacao } = await lerLista(url);
      if (verificacao) return 'verificacao';
      if (falhou) { if (pag === 1) j.listasFalhas = (j.listasFalhas || 0) + 1; return 'ok'; }
      const achados = produtosDaLista(doc);
      for (const p of achados) if (!vistos.has(p.produto || p.item) && lista.length < 150) { lista.push(p); vistos.add(p.produto || p.item); }
      url = achados.length ? doc.querySelector('.andes-pagination__button--next a')?.getAttribute('href') : null;
      if (url) await espera(300);
    }
    return 'ok';
  }
  // Três cupons de cada vez, com uma pausa. O progresso fica guardado: se a guia recarregar, continua de onde parou.
  async function lerProdutos(j) {
    while (j.idx < j.fila.length) {
      const { cuponsJob: ainda } = await chrome.storage.local.get('cuponsJob');
      if (!ainda) return; // parado pela pessoa
      const lote = j.fila.slice(j.idx, j.idx + 3);
      const res = await Promise.all(lote.map(c => produtosDoCupom(j, c)));
      const { cuponsJob: seguir } = await chrome.storage.local.get('cuponsJob');
      if (!seguir) return; // parado durante a leitura: não grava de novo, senão a coleta voltaria
      j.idx += lote.length;
      await chrome.storage.local.set({ cuponsJob: j });
      if (res.includes('verificacao')) return terminar('verificacao');
      const total = Object.values(j.produtos).reduce((s, l) => s + l.length, 0);
      caixa(`produtos: cupom ${j.idx} de ${j.fila.length} · ${total} com cupom${j.listasFalhas ? ` · ${j.listasFalhas} listas puladas` : ''}`);
      await espera(500);
    }
    return terminar('ok');
  }

  async function terminar(motivo) {
    const { cuponsJob: j } = await chrome.storage.local.get('cuponsJob');
    await chrome.storage.local.remove('cuponsJob');
    if (!j) return;
    await chrome.storage.local.set({ cuponsResultado: { em: Date.now(), motivo, aplicados: j.aplicados || 0, listasFalhas: j.listasFalhas || 0, cupons: Object.values(j.cupons || {}), esgotados: Object.keys(j.esgotados || {}), produtos: j.produtos || {} } });
    caixa('Pronto! Voltando para o Painel…');
    location.href = `${j.painel}/admin?ml-cupons=1#mining`;
  }

  (async () => {
    const { cuponsJob: j } = await chrome.storage.local.get('cuponsJob');
    if (!j || Date.now() > j.ate) { if (j) await chrome.storage.local.remove('cuponsJob'); return; }
    await espera(1500); // a lista termina de montar

    // 1. Central de cupons
    if (j.fase === 'cupons' && location.hostname === 'www.mercadolivre.com.br' && location.pathname.startsWith('/cupons')) {
      // Aplicar sozinho (opção do Painel): toca em "Aplicar" nos cupons desta página e recarrega para ler os links
      // dos produtos (o cupom aplicado passa a ter o "Conferir" com a lista de produtos)
      if (j.aplicar && j.aplicouPagina !== j.pagina && j.aplicados < j.maxAplicar) {
        const botoes = [...document.querySelectorAll('.coupon-card button')].filter(b => b.textContent.trim() === 'Aplicar' && !b.disabled && !RE_ESGOTADO.test(b.closest('.coupon-card')?.innerText || ''));
        for (const b of botoes) {
          if (j.aplicados >= j.maxAplicar) break;
          const { cuponsJob: ainda } = await chrome.storage.local.get('cuponsJob');
          if (!ainda) return; // parado pela pessoa
          caixa(`aplicando cupons: página ${j.pagina} · ${j.aplicados} aplicados`);
          b.click();
          await espera(1200);
          if (/Aplicado|Conferir/.test(b.closest('.coupon-card')?.innerText || '')) j.aplicados++;
        }
        j.aplicouPagina = j.pagina;
        await chrome.storage.local.set({ cuponsJob: j });
        if (botoes.length) { await espera(800); location.reload(); return; }
      }
      const dados = estado()?.appProps?.pageProps?.filteredCouponsData;
      if (!dados) { caixa('não consegui ler os cupons desta página (faça login no Mercado Livre e tente de novo).'); return terminar('sem-dados'); }
      guardarCupons(j, dados, [...document.querySelectorAll('.coupon-card')]);
      const total = Math.min(Number(dados.pagination?.total) || 1, j.paginas);
      if (j.soAtivos && j.pagina < total) {
        const parou = await lerPaginasPorTras(j, total);
        if (parou === -1) return;
        if (parou > 0) { // essa página não abriu por trás: continua abrindo normalmente a partir dela
          j.pagina = parou;
          await chrome.storage.local.set({ cuponsJob: j });
          location.href = `https://www.mercadolivre.com.br/cupons/filter?all=true&page=${j.pagina}`;
          return;
        }
        j.pagina = total;
      }
      caixa(`cupons: página ${j.pagina} de ${total} · ${Object.keys(j.cupons).length} cupons · ${Object.keys(j.esgotados).length} esgotados`);
      if (j.pagina < total) {
        j.pagina++;
        await chrome.storage.local.set({ cuponsJob: j });
        location.href = `https://www.mercadolivre.com.br/cupons/filter?all=true&page=${j.pagina}`;
        return;
      }
      // 2. Produtos dos cupons ativos (os que têm o link "Conferir")
      j.fila = Object.values(j.cupons).filter(c => c.link).slice(0, j.maxCupons).map(c => ({ id: c.id, link: c.link }));
      j.fase = 'produtos'; j.idx = 0;
      await chrome.storage.local.set({ cuponsJob: j });
      return lerProdutos(j);
    }

    // A guia recarregou no meio da leitura dos produtos
    if (j.fase === 'produtos' && location.hostname === 'www.mercadolivre.com.br') return lerProdutos(j);
  })();
})();
