/* Página da ferramenta: conta simples com os números que a pessoa digita */
(() => {
  'use strict';
  const f = document.querySelector('#fr-calc');
  if (!f) return;
  const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const n = nome => Math.max(0, Number(f.elements[nome].value) || 0);
  const custoMes = () => (Number(f.dataset.preco) || 0) * (30 / (Number(f.dataset.dias) || 30));
  function calcular() {
    const hoje = n('membros') * n('hoje'), meta = n('membros') * n('meta');
    document.querySelector('#fr-hoje').textContent = brl(hoje);
    document.querySelector('#fr-meta').textContent = brl(meta);
    document.querySelector('#fr-dif').textContent = brl(meta - hoje - custoMes());
  }
  f.addEventListener('input', calcular);
  f.addEventListener('submit', e => e.preventDefault());
  calcular();
})();
