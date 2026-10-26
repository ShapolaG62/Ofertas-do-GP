/* Ofertou! — calculadora "quanto rende o seu grupo" (página inicial, seção #calculadora).
   Conta usada no mercado de afiliados: renda por membro por mês (em geral entre R$ 1,50 e R$ 3,00). Com mais ofertas
   boas no ar, cada membro rende mais: cresce com a raiz da proporção de ofertas, limitado a R$ 3,00 por membro.
   É só uma simulação, não promessa de resultado. */
(() => {
  'use strict';
  const raiz = document.getElementById('calculadora');
  if (!raiz) return;
  const TETO = 3;
  const $ = s => raiz.querySelector(s);
  const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: v >= 100 ? 0 : 2 });
  const num = v => v.toLocaleString('pt-BR');
  const campos = ['membros', 'renda', 'hoje', 'com'];

  function calcular() {
    const membros = Number($('[name=membros]').value);
    const renda = Number($('[name=renda]').value);
    const hoje = Math.max(1, Number($('[name=hoje]').value));
    const com = Math.max(hoje, Number($('[name=com]').value));
    const rendaNova = Math.min(TETO, Math.max(renda, renda * Math.sqrt(com / hoje)));
    const atual = membros * renda, nova = membros * rendaNova;
    $('[data-v=membros]').textContent = num(membros);
    $('[data-v=renda]').textContent = brl(renda);
    $('[data-v=hoje]').textContent = num(hoje);
    $('[data-v=com]').textContent = num(com);
    $('[data-r=atual]').textContent = brl(atual);
    $('[data-r=atual-membro]').textContent = `${brl(renda)} por membro`;
    $('[data-r=nova]').textContent = brl(nova);
    $('[data-r=nova-membro]').textContent = `${brl(rendaNova)} por membro · +${brl(nova - atual)}/mês`;
    // Barras proporcionais
    const max = Math.max(nova, 1);
    $('[data-b=atual]').style.width = `${Math.max(4, (atual / max) * 100)}%`;
    $('[data-b=nova]').style.width = '100%';
  }
  for (const c of campos) $(`[name=${c}]`).addEventListener('input', () => {
    if (c === 'hoje' && Number($('[name=com]').value) < Number($('[name=hoje]').value)) $('[name=com]').value = $('[name=hoje]').value;
    calcular();
  });
  calcular();
})();
