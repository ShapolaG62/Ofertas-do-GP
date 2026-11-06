/* Menus dos painéis no celular: em vez de uma faixa que rola para o lado (com itens fora da tela), um botão mostra onde a
   pessoa está e abre a lista inteira, com os grupos. No computador, nada muda. */
(() => {
  'use strict';
  const ITEM_ATIVO = '[aria-selected="true"], [aria-current="true"], .tab.active';
  const SETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const TRES = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';

  function preparar(nav) {
    if (nav.dataset.menuCelular) return;
    nav.dataset.menuCelular = '1';
    nav.classList.add('menu-cel');
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'menu-cel-btn';
    botao.setAttribute('aria-expanded', 'false');
    botao.innerHTML = `${TRES}<span class="menu-cel-nome">Menu</span>${SETA}`;
    nav.parentNode.insertBefore(botao, nav);
    const nome = botao.querySelector('.menu-cel-nome');
    const atualizar = () => {
      const ativo = nav.querySelector(ITEM_ATIVO);
      const texto = (ativo?.querySelector('span:not(.count-badge)') || ativo)?.textContent?.trim();
      if (texto && nome.textContent !== texto) nome.textContent = texto;
    };
    const abrir = sim => {
      nav.classList.toggle('menu-cel-aberto', sim);
      botao.setAttribute('aria-expanded', String(sim));
    };
    botao.addEventListener('click', () => abrir(!nav.classList.contains('menu-cel-aberto')));
    // Escolheu um item: fecha e volta para o começo da tela nova
    nav.addEventListener('click', e => {
      if (!e.target.closest('button, a') || !nav.classList.contains('menu-cel-aberto')) return;
      abrir(false);
      setTimeout(() => { atualizar(); botao.scrollIntoView({ block: 'start' }); }, 0);
    });
    new MutationObserver(atualizar).observe(nav, { attributes: true, childList: true, subtree: true, attributeFilter: ['aria-selected', 'aria-current', 'class'] });
    atualizar();
  }
  const iniciar = () => document.querySelectorAll('.tabs-line.cli-nav, #account-nav, .side').forEach(preparar);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
