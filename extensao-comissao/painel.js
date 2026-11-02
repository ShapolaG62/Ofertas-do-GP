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
      const rolagens = Math.min(Math.max(parseInt(e.data.rolagens, 10) || 10, 1), 100);
      await chrome.storage.local.set({ autoAte: Date.now() + 10 * 60 * 1000, rolagens });
      avisar({ tipo: 'pode-ir' });
    }
    // Minerar cupons: páginas da central de cupons, quantos cupons ativos abrir e quantas páginas de produtos por cupom
    if (e.data.tipo === 'buscar-cupons') {
      const n = (v, min, max, pad) => Math.min(Math.max(parseInt(v, 10) || pad, min), max);
      await chrome.storage.local.set({ cuponsJob: {
        ate: Date.now() + 3 * 60 * 60 * 1000, painel: ORIGEM, fase: 'cupons', pagina: 1, cupons: {}, produtos: {},
        paginas: n(e.data.paginas, 1, 100, 70), maxCupons: n(e.data.cupons, 0, 2000, 60), paginasProd: n(e.data.paginasProd, 1, 10, 2),
        aplicar: e.data.aplicar === true, maxAplicar: n(e.data.maxAplicar, 0, 2000, 300), aplicados: 0,
      } });
      avisar({ tipo: 'pode-ir-cupons' });
    }
  });

  // "Ganho estimado" lido no painel do Mercado Livre: entrega ao Painel (que grava no site, substituindo o anterior)
  chrome.storage.local.get('ganhoEstimado').then(async ({ ganhoEstimado }) => {
    if (!ganhoEstimado) return;
    await chrome.storage.local.remove('ganhoEstimado');
    avisar({ tipo: 'ganho-estimado', valor: ganhoEstimado.valor, em: ganhoEstimado.em });
  });

  // Cupons do Mercado Livre trazidos pelo minerador de cupons (vale 30 min): entrega ao Painel uma vez só
  chrome.storage.local.get('cuponsResultado').then(async ({ cuponsResultado: r }) => {
    if (!r) return;
    await chrome.storage.local.remove('cuponsResultado');
    if (Date.now() - r.em > 30 * 60 * 1000) return;
    avisar({ tipo: 'cupons', cupons: r.cupons, produtos: r.produtos, motivo: r.motivo, aplicados: r.aplicados || 0 });
  });

  // Página do Mercado Livre trazida pela extensão (vale 15 min): entrega ao Painel uma vez só
  chrome.storage.local.get('pagina').then(async ({ pagina }) => {
    if (!pagina) return;
    await chrome.storage.local.remove('pagina');
    if (Date.now() - pagina.em > 15 * 60 * 1000) return;
    avisar({ tipo: 'pagina', html: pagina.html, filtro: pagina.filtro });
  });
})();
