/* Ofertou! — página de entrar: demonstrações curtas e tocáveis do que o site faz.
   Tudo aqui é ilustração (marcada como "Exemplo"), feita só com HTML e CSS: leve, sem vídeo para baixar.
   Trocam sozinhas enquanto estão na tela; ao tocar em algo, a troca automática para. */
(() => {
  'use strict';
  const palco = document.querySelector('#dm-palco');
  const lista = document.querySelector('#dm-lista');
  if (!palco || !lista) return;
  const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LOGOS = [['mercadolivre', 'mercadolivre-escuro.webp', 'Mercado Livre'], ['amazon', 'amazon-escuro.webp', 'Amazon'], ['shopee', 'shopee.svg', 'Shopee'], ['magalu', 'magalu.svg', 'Magalu'], ['aliexpress', 'aliexpress.webp', 'AliExpress'], ['kabum', 'kabum-escuro.svg', 'KaBuM!']];
  const reais = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const EX = '<span class="dm-ex">Exemplo</span>';

  const DEMOS = [
    { id: 'garimpo', tit: 'A Capi garimpa', sub: 'As lojas, várias vezes por dia',
      html: () => {
        const total = document.querySelector('#lp-ao-vivo')?.textContent.match(/[\d.]+/)?.[0];
        return `<div class="dm-garimpo">
          <div class="dm-logos">${LOGOS.map(([id, arq, nome], i) => `<span class="dm-logo" style="--i:${i}"><img src="/images/lojas/${arq}" alt="${nome}" class="marca-${id}"></span>`).join('')}</div>
          <img class="dm-capi" src="/images/capi-faixa.webp" alt="" width="409" height="320">
          <p class="dm-num"><b data-conta="${total ? Number(total.replace(/\./g, '')) : 0}">${total || 'Milhares'}</b> <span>${total ? 'ofertas no ar agora' : 'de ofertas no ar'}</span></p>
        </div>`;
      },
      vida: el => { // contagem até o total real
        const b = el.querySelector('[data-conta]'), alvo = Number(b.dataset.conta);
        if (!alvo || calmo) return;
        const ini = performance.now();
        let vivo = true;
        const passo = agora => {
          if (!vivo) return;
          const p = Math.min(1, (agora - ini) / 1600);
          b.textContent = Math.round(alvo * (1 - (1 - p) ** 3)).toLocaleString('pt-BR');
          if (p < 1) requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
        return () => { vivo = false; };
      } },

    { id: 'desconto', tit: 'Desconto de mentira, não', sub: 'O histórico mostra a verdade',
      html: () => `<div class="dm-hist">${EX}
        <div class="dm-seg" role="group" aria-label="Tipo de desconto">
          <button type="button" data-hist="real" aria-pressed="true">Desconto real</button><button type="button" data-hist="falso" aria-pressed="false">Desconto suspeito</button>
        </div>
        <svg viewBox="0 0 320 120" class="dm-graf" role="img" aria-label="Preço do produto nos últimos dias"><path class="dm-grade" d="M0 30H320M0 75H320"/><polyline id="dm-linha" fill="none" points=""/></svg>
        <p class="dm-resposta" id="dm-resposta"></p></div>`,
      vida: el => {
        const P = { real: ['10,40 70,40 130,42 190,41 250,44 275,90 310,92', 'O preço caiu de verdade. <b>Fica em destaque.</b>'], falso: ['10,92 70,90 130,91 190,92 225,18 275,86 310,88', 'O preço subiu antes da "promoção". <b>Vai para o fim da lista.</b>'] };
        const mostrar = k => {
          const l = el.querySelector('#dm-linha');
          l.setAttribute('points', P[k][0]);
          l.style.animation = 'none'; void l.getBoundingClientRect(); l.style.animation = '';
          el.querySelector('#dm-resposta').innerHTML = P[k][1];
          el.querySelectorAll('[data-hist]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hist === k)));
          l.dataset.tipo = k;
        };
        el.querySelector('.dm-seg').addEventListener('click', e => { const b = e.target.closest('[data-hist]'); if (b) mostrar(b.dataset.hist); });
        mostrar('real');
      } },

    { id: 'cupom', tit: 'Cupom já na conta', sub: 'Toque e veja o preço final',
      html: () => `<div class="dm-cupom">${EX}
        <article class="dm-produto"><span class="dm-off" id="dm-off">-39%</span><img src="/images/pet-capi-head.png" alt="" width="84" height="84"><div>
          <b>Produto de exemplo</b><p class="dm-preco" id="dm-preco"></p><small id="dm-sem"></small></div></article>
        <button class="dm-tag" type="button" id="dm-tag" aria-pressed="false"><span>Cupom</span> <b>OFERTA10</b> <em id="dm-tag-txt">Toque para aplicar</em></button></div>`,
      vida: el => {
        let on = false;
        const pintar = () => {
          el.querySelector('#dm-preco').textContent = reais(on ? 89.91 : 99.90);
          el.querySelector('#dm-sem').textContent = on ? `ou ${reais(99.90)} sem cupom` : `de ${reais(163.90)}`;
          el.querySelector('#dm-off').textContent = on ? '-45%' : '-39%';
          const t = el.querySelector('#dm-tag'); t.setAttribute('aria-pressed', String(on));
          el.querySelector('#dm-tag-txt').textContent = on ? 'Aplicado: 10% a menos' : 'Toque para aplicar';
        };
        el.querySelector('#dm-tag').addEventListener('click', () => { on = !on; pintar(); });
        pintar();
      } },

    { id: 'filtros', tit: 'Ache rápido', sub: 'Filtre por preço e desconto',
      html: () => `<div class="dm-filtros">${EX}
        <div class="dm-chips"><button type="button" data-f="ate100" aria-pressed="false">Até R$ 100</button><button type="button" data-f="d30" aria-pressed="false">30% ou mais</button><button type="button" data-f="cupom" aria-pressed="false">Com cupom</button></div>
        <p class="dm-conta" id="dm-conta"></p><ul class="dm-itens" id="dm-itens"></ul></div>`,
      vida: el => {
        const I = [['Fone sem fio', 89.9, 45, 1], ['Air fryer 5 L', 249.9, 38, 0], ['Mouse gamer', 59.9, 22, 0], ['Smartwatch', 99.9, 64, 1], ['Monitor 24"', 699, 31, 1], ['Garrafa térmica', 39.9, 12, 0]];
        const on = new Set();
        const pintar = () => {
          const l = I.filter(x => (!on.has('ate100') || x[1] <= 100) && (!on.has('d30') || x[2] >= 30) && (!on.has('cupom') || x[3]));
          el.querySelector('#dm-conta').textContent = `${l.length} de ${I.length} ofertas`;
          el.querySelector('#dm-itens').innerHTML = l.map((x, i) => `<li style="--i:${i}"><span>${x[0]}</span><i>-${x[2]}%</i><b>${reais(x[1])}</b></li>`).join('') || '<li class="dm-vazio">Nada com esses filtros. Tire um deles.</li>';
        };
        el.querySelector('.dm-chips').addEventListener('click', e => {
          const b = e.target.closest('[data-f]'); if (!b) return;
          on.has(b.dataset.f) ? on.delete(b.dataset.f) : on.add(b.dataset.f);
          b.setAttribute('aria-pressed', String(on.has(b.dataset.f)));
          pintar();
        });
        pintar();
      } },

    { id: 'postar', tit: 'Para afiliados: posta sozinho', sub: 'Com o seu link, no seu horário',
      html: () => `<div class="dm-postar">${EX}
        <div class="dm-horas" role="group" aria-label="Horário do envio"><button type="button" data-h="09:00" aria-pressed="true">09:00</button><button type="button" data-h="14:00" aria-pressed="false">14:00</button><button type="button" data-h="20:00" aria-pressed="false">20:00</button></div>
        <div class="dm-chat" id="dm-chat"></div></div>`,
      vida: el => {
        const M = { '09:00': ['Fone sem fio', 89.9, 149.9], '14:00': ['Air fryer 5 L', 249.9, 399.9], '20:00': ['Smartwatch', 99.9, 279.9] };
        const mostrar = h => {
          const [n, p, de] = M[h];
          el.querySelector('#dm-chat').innerHTML = `<div class="dm-bolha"><b>${n}</b><span>De <s>${reais(de)}</s></span><span>Por <b>${reais(p)}</b></span><span class="dm-link">seu-link-de-afiliado</span><small>${h} ✓✓</small></div>`;
          el.querySelectorAll('[data-h]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.h === h)));
        };
        el.querySelector('.dm-horas').addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (b) mostrar(b.dataset.h); });
        mostrar('09:00');
      } },

    { id: 'reserva', tit: 'Número reserva', sub: 'Um número parou? O outro segue',
      html: () => `<div class="dm-reserva">${EX}
        <ul><li id="dm-n1"><i></i><div><b>Número principal</b><small id="dm-n1-txt"></small></div></li><li id="dm-n2"><i></i><div><b>Número reserva</b><small id="dm-n2-txt"></small></div></li></ul>
        <button class="btn" type="button" id="dm-cair"></button><p class="dm-resposta" id="dm-res-txt"></p></div>`,
      vida: el => {
        let caiu = false;
        const pintar = () => {
          el.querySelector('#dm-n1').className = caiu ? 'off' : 'on';
          el.querySelector('#dm-n1-txt').textContent = caiu ? 'Parou' : 'Enviando';
          el.querySelector('#dm-n2').className = 'on';
          el.querySelector('#dm-n2-txt').textContent = caiu ? 'Assumiu todos os envios' : 'Reveza com o principal';
          el.querySelector('#dm-cair').textContent = caiu ? 'Reconectar o principal' : 'Simular a queda do número';
          el.querySelector('#dm-res-txt').innerHTML = caiu ? '<b>As ofertas continuam saindo.</b> Você reconecta com calma.' : 'Os dois números se revezam a cada mensagem.';
        };
        el.querySelector('#dm-cair').addEventListener('click', () => { caiu = !caiu; pintar(); });
        pintar();
      } },

    { id: 'painel', tit: 'Comissão e membros', sub: 'Veja o que está dando resultado',
      html: () => `<div class="dm-painel">${EX}
        <div class="dm-seg" role="group" aria-label="Relatório"><button type="button" data-p="comissao" aria-pressed="true">Comissão</button><button type="button" data-p="membros" aria-pressed="false">Membros</button></div>
        <div class="dm-kpis" id="dm-kpis"></div><div class="dm-barras" id="dm-barras"></div></div>`,
      vida: el => {
        const D = { comissao: [[['Disponível', 'R$ 58,00'], ['A liberar', 'R$ 105,94']], [20, 45, 30, 70, 55, 90, 65]], membros: [[['Entraram', '+84'], ['Saíram', '-12']], [35, 50, 40, 80, 60, 75, 95]] };
        const mostrar = k => {
          el.querySelector('#dm-kpis').innerHTML = D[k][0].map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('');
          el.querySelector('#dm-barras').innerHTML = D[k][1].map((h, i) => `<i style="--h:${h}%;--i:${i}"></i>`).join('');
          el.querySelectorAll('[data-p]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.p === k)));
        };
        el.querySelector('.dm-seg').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) mostrar(b.dataset.p); });
        mostrar('comissao');
      } },
  ];

  lista.innerHTML = DEMOS.map((d, i) => `<button type="button" role="tab" data-demo="${i}" aria-selected="false" aria-controls="dm-palco"><b>${d.tit}</b><small>${d.sub}</small><i class="dm-prog"></i></button>`).join('');
  let atual = 0, limpar = null, timer = null, automatico = !calmo, naTela = false;
  const DURACAO = 7000;

  function abrir(i) {
    atual = i;
    limpar?.();
    palco.innerHTML = `<div class="dm-cena" data-cena="${DEMOS[i].id}">${DEMOS[i].html()}</div>`;
    limpar = DEMOS[i].vida?.(palco.firstElementChild) || null;
    lista.querySelectorAll('[data-demo]').forEach((b, n) => {
      b.setAttribute('aria-selected', String(n === i));
      b.classList.toggle('rodando', n === i && automatico);
    });
    const ativo = lista.querySelector(`[data-demo="${i}"]`);
    if (lista.scrollWidth > lista.clientWidth) lista.scrollTo({ left: ativo.offsetLeft - 16, behavior: calmo ? 'auto' : 'smooth' });
    agendar();
  }
  function agendar() {
    clearTimeout(timer);
    if (automatico && naTela) timer = setTimeout(() => abrir((atual + 1) % DEMOS.length), DURACAO);
  }
  function pararAutomatico() {
    automatico = false; clearTimeout(timer);
    lista.querySelectorAll('.rodando').forEach(b => b.classList.remove('rodando'));
  }
  lista.addEventListener('click', e => {
    const b = e.target.closest('[data-demo]');
    if (!b) return;
    pararAutomatico();
    abrir(Number(b.dataset.demo));
  });
  palco.addEventListener('click', e => { if (e.target.closest('button')) pararAutomatico(); });
  new IntersectionObserver(([x]) => {
    naTela = x.isIntersecting;
    if (naTela) agendar(); else clearTimeout(timer);
  }, { threshold: 0.35 }).observe(palco);
  abrir(0);
  // O total de ofertas chega depois: refaz a primeira cena com o número real
  const aoVivo = document.querySelector('#lp-ao-vivo');
  if (aoVivo) new MutationObserver(() => { if (atual === 0) abrir(0); }).observe(aoVivo, { childList: true, characterData: true, subtree: true });
})();
