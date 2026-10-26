// Ofertou! Ganhos — no painel do Ofertou!. Avisa a página que a extensão está instalada e, quando você clica em
// "Portal ↗" num cartão de saldo, guarda para onde voltar: o portal abre na mesma guia, a extensão lê o saldo e
// os produtos com comissão extra e traz você de volta para Painel → Ganhos de afiliados.
(() => {
  'use strict';
  document.documentElement.dataset.ofertouGanhos = '1';
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-gn-portal]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; // Ctrl+clique: abre em outra guia, normal
    e.preventDefault();
    const ir = () => { location.href = a.href; };
    // Espera a extensão guardar a volta (no máximo 1 s) e só então abre o portal nesta guia
    Promise.race([
      chrome.runtime.sendMessage({ tipo: 'ir-portal', plataforma: a.dataset.gnPortal, voltar: `${location.origin}${location.pathname}` }),
      new Promise(r => setTimeout(r, 1000)),
    ]).catch(() => {}).finally(ir);
  }, true);
})();
