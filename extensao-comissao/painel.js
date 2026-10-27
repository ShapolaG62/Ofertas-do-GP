// Ofertou! Comissão extra ML — no Painel do Ofertou!. Conversa com a página do Painel por mensagens na própria
// janela (window.postMessage): avisa que a extensão está instalada, marca a busca automática quando você clica em
// "Buscar automaticamente" e entrega a página do Mercado Livre que a extensão trouxe (o Painel lê e importa).
(() => {
  'use strict';
  const ORIGEM = location.origin;
  chrome.storage.local.set({ painel: ORIGEM }); // endereço do Painel, para voltar depois de buscar

  const avisar = msg => window.postMessage({ ofertouExt: true, ...msg }, ORIGEM);
  avisar({ tipo: 'instalada' });

  window.addEventListener('message', async e => {
    if (e.source !== window || e.origin !== ORIGEM || !e.data || e.data.ofertouPainel !== true) return;
    if (e.data.tipo === 'ola') avisar({ tipo: 'instalada' });
    if (e.data.tipo === 'buscar') {
      await chrome.storage.local.set({ autoAte: Date.now() + 10 * 60 * 1000 });
      avisar({ tipo: 'pode-ir' });
    }
  });

  // Página do Mercado Livre trazida pela extensão (vale 15 min): entrega ao Painel uma vez só
  chrome.storage.local.get('pagina').then(async ({ pagina }) => {
    if (!pagina) return;
    await chrome.storage.local.remove('pagina');
    if (Date.now() - pagina.em > 15 * 60 * 1000) return;
    avisar({ tipo: 'pagina', html: pagina.html });
  });
})();
