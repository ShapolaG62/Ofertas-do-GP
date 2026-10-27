// Ofertou! Comissão extra ML — no painel de afiliado do Mercado Livre (Afiliados e Criadores).
// Faz o que você faria à mão (Ctrl+A, Ctrl+C e colar no Painel): pega a página como ela está na tela e entrega
// ao Painel do Ofertou!, que lê os produtos e a comissão do mesmo jeito da colagem manual.
//  • Aberto pelo botão "Buscar automaticamente" do Painel: liga o filtro "Ganhos extras", rola a página o número de
//    vezes escolhido no Painel e volta sozinho para o Painel;
//  • aberto por você: mostra um botão "Enviar ao Ofertou!" no canto (com o número de rolagens).
// Só clica no filtro de ganhos extras; não envia nada para lugar nenhum além do seu Painel.
(() => {
  'use strict';
  if (window.__ofertouMl) return;
  window.__ofertouMl = true;

  const produtos = () => new Set([...document.querySelectorAll('a[href*="MLB"]')].map(a => (decodeURIComponent(a.href).match(/MLB-?\d{6,}/i) || [''])[0])).size;
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const visivel = el => el && el.getClientRects().length > 0;
  const limitar = n => Math.min(Math.max(parseInt(n, 10) || 10, 1), 100);

  // Botão/aviso no canto (Shadow DOM: o estilo da página não interfere)
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646';
  const raiz = caixa.attachShadow({ mode: 'open' });
  raiz.innerHTML = `<style>
    .c { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; max-width: min(400px, calc(100vw - 32px)); padding: 10px 12px; border-radius: 14px;
      font: 600 13.5px/1.4 system-ui, sans-serif; background: #121714; color: #eef3f0; border: 1px solid #2bb673; box-shadow: 0 12px 30px rgba(0,0,0,.35); }
    b { color: #2bb673; } .t { flex: 1 1 100%; }
    label { display: flex; align-items: center; gap: 6px; color: #c8d1cb; font-weight: 600; }
    input { width: 56px; font: inherit; padding: 5px 6px; border-radius: 8px; border: 1px solid #343c36; background: #1b211d; color: inherit; }
    button { font: inherit; font-weight: 800; padding: 8px 14px; border-radius: 999px; border: 0; background: #2bb673; color: #fff; cursor: pointer; white-space: nowrap; }
    button:disabled { opacity: .6; cursor: default; }
    .x { background: none; color: #9aa79f; padding: 4px 6px; font-size: 16px; margin-left: auto; }
  </style><div class="c"><span class="t"><b>Ofertou!</b> Comissão extra</span>
    <label>Rolar <input type="number" class="n" min="1" max="100" value="10"> vezes</label>
    <button class="ir">Enviar ao Ofertou!</button><button class="x" title="Esconder">×</button></div>`;
  const $ = s => raiz.querySelector(s);
  const texto = t => { $('.t').innerHTML = '<b>Ofertou!</b> '; $('.t').append(t); };
  $('.x').addEventListener('click', () => caixa.remove());
  $('.n').addEventListener('change', () => { $('.n').value = limitar($('.n').value); chrome.storage.local.set({ rolagens: Number($('.n').value) }); });

  // ── Filtro "Ganhos extras" ──
  // Procura pelo texto um botão/aba/opção curto e fora dos cartões de produto; se já estiver marcado, não clica
  const RE_FILTRO = /^\s*(ganhos?\s+extras?|com\s+ganhos?\s+extras?|ganho\s+extra|comiss(ão|ao)\s+extra)\s*$/i;
  // Rótulo de cartão de produto, e não o filtro: dentro do link do produto (clicar abriria o produto) ou junto de uma
  // porcentagem ("Ganho extra +6%"); o botão do filtro não tem número do lado
  const dentroDeCartao = el => {
    if (el.closest('a[href*="MLB"]')) return true;
    return /\d\s*%/.test(el.parentElement?.innerText || '');
  };
  function acharFiltro() {
    // Parte só dos textos com "extra" e sobe até 3 níveis (medir o texto de todos os elementos travaria a página)
    const achados = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let no; (no = w.nextNode());) {
      if (!/extra/i.test(no.nodeValue || '') || no.nodeValue.length > 60) continue;
      let el = no.parentElement;
      for (let i = 0; i < 4 && el && el !== document.body; i++, el = el.parentElement) {
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (t.length > 40) break;
        if (RE_FILTRO.test(t) && visivel(el) && !dentroDeCartao(el)) achados.push(el);
      }
    }
    if (!achados.length) return null;
    // O mais "clicável" primeiro: botão/aba/opção antes de span/div; dentro do mesmo tipo, o mais externo
    const peso = el => (/^(BUTTON|A|LABEL|LI)$/.test(el.tagName) || el.getAttribute('role') ? 0 : 1);
    return achados.sort((a, b) => peso(a) - peso(b) || (a.contains(b) ? -1 : b.contains(a) ? 1 : 0))[0];
  }
  function marcado(el) {
    for (let i = 0; i < 3 && el; i++, el = el.parentElement) {
      if (['aria-pressed', 'aria-checked', 'aria-selected'].some(a => el.getAttribute?.(a) === 'true')) return true;
      if (/(^|[\s_-])(selected|active|checked|is-on|--on)([\s_-]|$)/i.test(el.className?.baseVal ?? el.className ?? '')) return true;
      const input = el.querySelector?.('input[type=checkbox], input[type=radio]');
      if (input?.checked) return true;
    }
    return false;
  }
  // Liga o filtro (até 15 s esperando ele aparecer) e espera a lista recarregar. Devolve 'aplicado', 'ja' ou 'nao-achei'
  async function aplicarFiltro() {
    let el = null;
    for (let i = 0; i < 10 && !(el = acharFiltro()); i++) await espera(1500);
    if (!el) return 'nao-achei';
    if (marcado(el)) return 'ja';
    texto('Ligando o filtro "Ganhos extras"…');
    const antes = document.body.innerText.length;
    el.click();
    for (let i = 0; i < 10; i++) { await espera(800); if (Math.abs(document.body.innerText.length - antes) > 50) break; } // lista mudou
    await espera(1500);
    return 'aplicado';
  }

  // Uma rolagem até o fim, seja qual for o jeito da página rolar: a janela, a maior área com barra de rolagem e o
  // último produto trazido para a tela (é isso que faz as listas "infinitas" carregarem mais)
  function rolarAteOFim() {
    // Ordem importa: o último produto primeiro e o fim da janela por último (senão a página volta para cima)
    const links = document.querySelectorAll('a[href*="MLB"]');
    links[links.length - 1]?.scrollIntoView({ block: 'end' });
    let maior = null;
    for (const el of document.querySelectorAll('main, section, div, ul')) {
      if (el.scrollHeight - el.clientHeight < 200) continue;
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && (!maior || el.scrollHeight > maior.scrollHeight)) maior = el;
    }
    if (maior) maior.scrollTop = maior.scrollHeight;
    window.scrollTo(0, document.documentElement.scrollHeight);
  }

  // Rola até o fim o número de vezes escolhido (para antes se a lista acabar: 3 rolagens sem produto novo)
  async function carregar(vezes) {
    let antes = produtos(), parado = 0;
    for (let i = 1; i <= vezes && parado < 3; i++) {
      rolarAteOFim();
      await espera(1500);
      const agora = produtos();
      texto(`Rolando a página ${i} de ${vezes}… (${agora} produtos)`);
      parado = agora === antes ? parado + 1 : 0;
      antes = agora;
    }
    window.scrollTo(0, 0);
  }

  async function enviar(filtro) {
    $('.ir').disabled = true;
    await carregar(limitar($('.n').value));
    const n = produtos();
    if (!n) {
      texto('Não encontrei produtos nesta página. Abra a lista de produtos com ganho extra e tente de novo.');
      $('.ir').disabled = false;
      return;
    }
    texto(`Enviando ${n} produto(s) para o Painel…`);
    const { painel } = await chrome.storage.local.get('painel');
    if (!painel) {
      texto('Abra o Painel do Ofertou! uma vez neste Chrome (para a extensão saber o endereço) e tente de novo.');
      $('.ir').disabled = false;
      return;
    }
    // Guarda a página (o Painel lê e apaga) e volta para o Painel nesta mesma guia
    await chrome.storage.local.set({ pagina: { html: document.body.outerHTML, url: location.href, filtro: filtro || null, em: Date.now() } });
    location.href = `${painel}/admin?ml-importar=1#mining`;
  }
  $('.ir').addEventListener('click', async () => {
    $('.ir').disabled = true;
    const filtro = await aplicarFiltro();
    if (filtro === 'nao-achei') texto('Não achei o filtro "Ganhos extras": enviando a página como está.');
    enviar(filtro);
  });

  (async () => {
    document.documentElement.appendChild(caixa);
    const { autoAte, rolagens } = await chrome.storage.local.get(['autoAte', 'rolagens']);
    $('.n').value = limitar(rolagens);
    // O botão do Painel deixa marcado por 10 min que a próxima abertura desta página é para buscar (sobrevive ao login)
    if (!(autoAte > Date.now())) return;
    await chrome.storage.local.remove('autoAte');
    texto('Esperando a página carregar…');
    for (let i = 0; i < 20 && !produtos() && !acharFiltro(); i++) await espera(1500);
    $('.ir').disabled = true;
    const filtro = await aplicarFiltro();
    if (filtro === 'nao-achei') texto('Não achei o filtro "Ganhos extras": seguindo com a página como está.');
    for (let i = 0; i < 10 && !produtos(); i++) await espera(1500);
    enviar(filtro);
  })();
})();
