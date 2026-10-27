// Ofertou! Comissão extra ML — no painel de afiliado do Mercado Livre (Afiliados e Criadores).
// Faz o que você faria à mão (Ctrl+A, Ctrl+C e colar no Painel): pega a página como ela está na tela e entrega
// ao Painel do Ofertou!, que lê os produtos e a comissão do mesmo jeito da colagem manual.
//  • Aberto pelo botão "Buscar automaticamente" do Painel: rola até o fim para carregar todos os produtos e volta
//    sozinho para o Painel;
//  • aberto por você: mostra um botão "Enviar ao Ofertou!" no canto.
// Não clica em nada da página do Mercado Livre e não envia nada para lugar nenhum além do seu Painel.
(() => {
  'use strict';
  if (window.__ofertouMl) return;
  window.__ofertouMl = true;

  const produtos = () => new Set([...document.querySelectorAll('a[href*="MLB"]')].map(a => (decodeURIComponent(a.href).match(/MLB-?\d{6,}/i) || [''])[0])).size;
  const espera = ms => new Promise(r => setTimeout(r, ms));

  // Botão/aviso no canto (Shadow DOM: o estilo da página não interfere)
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646';
  const raiz = caixa.attachShadow({ mode: 'open' });
  raiz.innerHTML = `<style>
    .c { display: flex; align-items: center; gap: 10px; max-width: min(380px, calc(100vw - 32px)); padding: 10px 12px; border-radius: 14px;
      font: 600 13.5px/1.4 system-ui, sans-serif; background: #121714; color: #eef3f0; border: 1px solid #2bb673; box-shadow: 0 12px 30px rgba(0,0,0,.35); }
    b { color: #2bb673; }
    button { font: inherit; font-weight: 800; padding: 8px 14px; border-radius: 999px; border: 0; background: #2bb673; color: #fff; cursor: pointer; white-space: nowrap; }
    button:disabled { opacity: .6; cursor: default; }
    .x { background: none; color: #9aa79f; padding: 4px 6px; font-size: 16px; }
  </style><div class="c"><span class="t"><b>Ofertou!</b> Comissão extra</span><button class="ir">Enviar ao Ofertou!</button><button class="x" title="Esconder">×</button></div>`;
  const $ = s => raiz.querySelector(s);
  const texto = t => { $('.t').innerHTML = '<b>Ofertou!</b> '; $('.t').append(t); };
  $('.x').addEventListener('click', () => caixa.remove());

  // Rola até o fim enquanto aparecerem produtos novos (a lista carrega aos poucos), no máximo 90 s
  async function carregarTudo() {
    let antes = -1, iguais = 0;
    const fim = Date.now() + 90000;
    while (Date.now() < fim && iguais < 4) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await espera(1500);
      const agora = produtos();
      texto(`Carregando os produtos… (${agora})`);
      iguais = agora === antes ? iguais + 1 : 0;
      antes = agora;
    }
    window.scrollTo(0, 0);
  }

  async function enviar() {
    $('.ir').disabled = true;
    await carregarTudo();
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
    await chrome.storage.local.set({ pagina: { html: document.body.outerHTML, url: location.href, em: Date.now() } });
    location.href = `${painel}/admin?ml-importar=1#mining`;
  }
  $('.ir').addEventListener('click', enviar);

  (async () => {
    document.documentElement.appendChild(caixa);
    // O botão do Painel deixa marcado por 10 min que a próxima abertura desta página é para buscar (sobrevive ao login)
    const { autoAte } = await chrome.storage.local.get('autoAte');
    if (!(autoAte > Date.now())) return;
    await chrome.storage.local.remove('autoAte');
    // Veio do botão "Buscar automaticamente": espera a lista aparecer (até 30 s) e envia sozinho
    texto('Esperando a página carregar…');
    for (let i = 0; i < 20 && !produtos(); i++) await espera(1500);
    enviar();
  })();
})();
