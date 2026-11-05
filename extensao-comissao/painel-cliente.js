// Ofertou! — no painel do afiliado (/cliente): só entrega o "Ganho estimado" lido no painel do Mercado Livre.
// Não mexe em mais nada e não envia nada para outro lugar.
(() => {
  'use strict';
  const ORIGEM = location.origin;
  const avisar = msg => window.postMessage({ ofertouExt: true, ...msg }, ORIGEM);
  chrome.storage.local.set({ soGanhoCliente: true }); // no Mercado Livre não mostra o botão de enviar produtos ao Painel do site
  avisar({ tipo: 'instalada' });
  chrome.storage.local.get('ganhoEstimado').then(async ({ ganhoEstimado }) => {
    if (!ganhoEstimado) return;
    await chrome.storage.local.remove('ganhoEstimado');
    avisar({ tipo: 'ganho-estimado', valor: ganhoEstimado.valor, em: ganhoEstimado.em });
  });
})();
