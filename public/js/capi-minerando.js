// A Capi minerando ofertas: animação curta (≈8 s) que aparece em momentos aleatórios pelo site
// enquanto a mineração está rodando no servidor (/api/mineracao/status).
// Para ver sem esperar uma mineração: abra qualquer página com ?capi=teste no endereço.
(() => {
  if (window.CapiMinerando) return;
  const DURACAO = 8200;
  const CONSULTA_MS = 45000;          // de quanto em quanto tempo pergunta se está minerando
  const PRIMEIRA = [4000, 20000];     // espera antes da 1ª aparição (aleatória, em ms)
  const ENTRE = [70000, 180000];      // espera entre uma aparição e outra
  const MAX_POR_MINERACAO = 3;
  const TAGS = ['-40%', '-25%', '-60%', '-15%', 'R$ 49', 'R$ 129', '🔥', '%', 'Oferta!', '-33%', 'Frete grátis', '-50%'];

  const css = document.createElement('style');
  css.textContent = `
  .cm { position: fixed; z-index: 2147483000; left: calc(16px + env(safe-area-inset-left, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    width: 250px; height: 170px; pointer-events: none; font-family: Figtree, system-ui, sans-serif;
    animation: cm-entra .6s cubic-bezier(.2,1.4,.4,1) both, cm-sai .55s ease-in ${DURACAO - 600}ms forwards; }
  .cm-x { pointer-events: auto; position: absolute; right: 2px; top: 2px; width: 26px; height: 26px; border-radius: 50%; border: 0; cursor: pointer;
    background: rgba(14,18,16,.75); color: #fff; font-size: 15px; line-height: 26px; padding: 0; opacity: .85; }
  .cm-x:hover, .cm-x:focus-visible { opacity: 1; outline: 2px solid #2bb673; }
  .cm-balao { position: absolute; left: 70px; top: 0; max-width: 150px; background: #fff; color: #161b18; border-radius: 14px; padding: 7px 11px;
    font-size: 13px; font-weight: 700; line-height: 1.25; box-shadow: 0 6px 20px -6px rgba(0,0,0,.35); transform-origin: 10% 100%;
    animation: cm-pop .35s .5s cubic-bezier(.2,1.6,.4,1) both; }
  .cm-balao::after { content: ""; position: absolute; left: 18px; bottom: -7px; border: 8px solid transparent; border-top-color: #fff; border-bottom: 0; }
  .cm-balao b { color: #0c8f4f; }
  .cm-cena { position: absolute; left: 0; right: 0; bottom: 0; height: 120px; }
  .cm-sombra { position: absolute; left: 14px; bottom: 2px; width: 210px; height: 14px; border-radius: 50%; background: radial-gradient(rgba(0,0,0,.35), transparent 70%); }
  .cm-capi { position: absolute; z-index: 2; left: 6px; bottom: 6px; width: 96px; height: 96px; transform-origin: 50% 100%; animation: cm-capi .75s ease-in-out 8; }
  .cm-capi img { width: 100%; height: 100%; display: block; filter: drop-shadow(0 4px 6px rgba(0,0,0,.3)); }
  .cm.feliz .cm-capi { animation: cm-pulo .5s ease-in-out 2; }
  .cm-picareta { position: absolute; z-index: 1; left: 72px; bottom: 22px; width: 80px; height: 80px; transform-origin: 47.5% 96%; transform: rotate(-10deg);
    filter: drop-shadow(0 3px 3px rgba(0,0,0,.35)); animation: cm-golpe .75s cubic-bezier(.5,0,.3,1) 8; }
  .cm.feliz .cm-picareta { animation: cm-ergue .5s ease-out forwards; }
  .cm-pedra { position: absolute; left: 138px; bottom: 6px; width: 100px; height: 72px; transform-origin: 50% 100%; animation: cm-treme .75s 8; }
  .cm-faisca { position: absolute; left: 150px; bottom: 50px; width: 8px; height: 8px; border-radius: 50%; background: #ffd34d; box-shadow: 0 0 8px #ffb300;
    opacity: 0; animation: cm-faisca .75s 8; }
  .cm-faisca:nth-child(2) { animation-delay: .02s; --dx: -18px; --dy: -26px; }
  .cm-faisca:nth-child(3) { animation-delay: .04s; --dx: 14px; --dy: -30px; }
  .cm-faisca:nth-child(4) { animation-delay: .03s; --dx: 24px; --dy: -10px; }
  .cm-tag { position: absolute; left: 168px; bottom: 44px; padding: 3px 8px; border-radius: 999px; background: #0c8f4f; color: #fff; font-size: 12.5px; font-weight: 800;
    white-space: nowrap; box-shadow: 0 4px 10px -3px rgba(0,0,0,.4); animation: cm-tag 1.5s cubic-bezier(.2,.8,.3,1) forwards; }
  .cm-tag.ouro { background: #e6a300; color: #1d1400; }
  .cm-tag.verm { background: #d23b2a; }
  @keyframes cm-entra { from { transform: translateY(140%) scale(.8); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes cm-sai { to { transform: translateY(130%) scale(.85); opacity: 0; } }
  @keyframes cm-pop { from { transform: scale(0); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes cm-capi { 0%,100% { transform: rotate(0) } 45% { transform: rotate(-5deg) translateY(-3px) } 62% { transform: rotate(5deg) scaleY(.95) } }
  @keyframes cm-pulo { 0%,100% { transform: none } 50% { transform: translateY(-18px) rotate(-6deg) } }
  @keyframes cm-golpe { 0% { transform: rotate(-10deg) } 45% { transform: rotate(-24deg) } 62% { transform: rotate(46deg) } 72% { transform: rotate(38deg) } 100% { transform: rotate(-10deg) } }
  @keyframes cm-ergue { from { transform: rotate(-10deg) } to { transform: rotate(4deg) translateY(-12px) } }
  @keyframes cm-treme { 0%,58%,100% { transform: none } 64% { transform: translateX(3px) rotate(2deg) scaleY(.96) } 72% { transform: translateX(-2px) rotate(-1deg) } }
  @keyframes cm-faisca { 0%,58% { opacity: 0; transform: none } 62% { opacity: 1; transform: none } 90% { opacity: 0; transform: translate(var(--dx, 6px), var(--dy, -34px)) scale(.4) } 100% { opacity: 0 } }
  @keyframes cm-tag { 0% { transform: translate(0,0) scale(.3); opacity: 0 } 15% { opacity: 1; transform: translate(calc(var(--tx) * .3), -24px) scale(1.1) }
    70% { opacity: 1 } 100% { transform: translate(var(--tx), -95px) scale(.9) rotate(var(--rot)); opacity: 0 } }
  @media (max-width: 480px) { .cm { transform-origin: 0 100%; scale: .82; } }
  @media (prefers-reduced-motion: reduce) {
    .cm, .cm * { animation-duration: 1ms !important; animation-iteration-count: 1 !important; }
    .cm-faisca, .cm-tag { display: none; }
  }`;
  document.head.appendChild(css);

  const PICARETA = `<svg viewBox="0 0 80 80" class="cm-picareta" aria-hidden="true">
    <rect x="34.5" y="14" width="7" height="64" rx="3.5" fill="#9a6431" stroke="#4a2f14" stroke-width="2"/>
    <rect x="34.5" y="58" width="7" height="12" fill="#5a3a1a"/>
    <path d="M4 22 Q38 0 76 22 Q58 15 38 15 Q18 15 4 22 Z" fill="#d5ddd8" stroke="#3b4540" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="31" y="10" width="14" height="11" rx="3" fill="#8a968f" stroke="#3b4540" stroke-width="2"/></svg>`;
  const PEDRA = `<svg viewBox="0 0 100 72" class="cm-pedra" aria-hidden="true">
    <path d="M6 70 L14 34 L34 12 L62 6 L86 22 L96 48 L92 70 Z" fill="#6f7a74" stroke="#2f3733" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M14 34 L40 30 L62 6 M40 30 L52 52 L96 48 M52 52 L44 70" fill="none" stroke="#3f4843" stroke-width="2"/>
    <path d="M26 46 l6 -8 l6 8 l-6 6 z" fill="#2bd37f" stroke="#0c6b3c" stroke-width="1.5"/>
    <path d="M66 28 l5 -7 l5 7 l-5 5 z" fill="#ffd34d" stroke="#9a6800" stroke-width="1.5"/>
    <path d="M70 56 l4 -6 l4 6 l-4 4 z" fill="#ff7b6b" stroke="#8a2318" stroke-width="1.5"/></svg>`;

  let aberto = null;
  function mostrar() {
    if (aberto || document.hidden) return;
    const el = document.createElement('div');
    el.className = 'cm';
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="cm-balao">Minerando <b>ofertas</b>… ⛏️</div>
      <button class="cm-x" type="button" aria-label="Fechar a animação">×</button>
      <div class="cm-cena"><div class="cm-sombra"></div>${PEDRA}<span class="cm-faisca"></span><span class="cm-faisca"></span><span class="cm-faisca"></span><span class="cm-faisca"></span>
        <div class="cm-capi"><img src="/images/pet-capi.png" alt="Capi, o mascote do Ofertou!"></div>${PICARETA}</div>`;
    document.body.appendChild(el);
    aberto = el;
    const timers = [];
    const cena = el.querySelector('.cm-cena');
    // Uma etiqueta de oferta sai da pedra a cada golpe (o golpe acerta em ~62% de cada ciclo de 0,75 s)
    for (let i = 0; i < 8; i++) {
      timers.push(setTimeout(() => {
        const t = document.createElement('span');
        t.className = `cm-tag${i % 3 === 1 ? ' ouro' : i % 3 === 2 ? ' verm' : ''}`;
        t.textContent = TAGS[Math.floor(Math.random() * TAGS.length)];
        t.style.setProperty('--tx', `${Math.round(Math.random() * 60 + 10)}px`);
        t.style.setProperty('--rot', `${Math.round(Math.random() * 30 - 15)}deg`);
        cena.appendChild(t);
        setTimeout(() => t.remove(), 1600);
      }, 470 + i * 750));
    }
    timers.push(setTimeout(() => {
      el.classList.add('feliz');
      el.querySelector('.cm-balao').innerHTML = 'Achei <b>promoções</b> novas! 🎉';
    }, 6400));
    const fechar = () => { timers.forEach(clearTimeout); el.remove(); if (aberto === el) aberto = null; };
    timers.push(setTimeout(fechar, DURACAO));
    el.querySelector('.cm-x').addEventListener('click', () => {
      fechar();
      try { sessionStorage.setItem('cm-fechou', '1'); } catch { /* sem armazenamento: só fecha */ }
    });
  }

  // ── Quando aparecer: só durante uma mineração, em momentos aleatórios ──
  const sorteio = ([a, b]) => a + Math.random() * (b - a);
  let minerando = false, desde = null, vezes = 0, agendada = null;
  const fechouNaSessao = () => { try { return sessionStorage.getItem('cm-fechou') === '1'; } catch { return false; } };

  function agendar(faixa) {
    clearTimeout(agendada);
    agendada = setTimeout(() => {
      if (!minerando || fechouNaSessao() || vezes >= MAX_POR_MINERACAO) return;
      if (document.hidden) return agendar([3000, 8000]); // espera a pessoa voltar para a aba
      mostrar();
      vezes++;
      if (vezes < MAX_POR_MINERACAO) agendar(ENTRE);
    }, sorteio(faixa));
  }

  async function consultar() {
    if (document.hidden) return;
    try {
      const r = await fetch('/api/mineracao/status', { cache: 'no-store' }).then(x => x.json());
      if (r.minerando && (!minerando || r.desde !== desde)) { // começou uma mineração
        minerando = true; desde = r.desde; vezes = 0;
        agendar(PRIMEIRA);
      } else if (!r.minerando && minerando) {
        minerando = false; clearTimeout(agendada);
      }
    } catch { /* sem conexão: tenta na próxima */ }
  }

  window.CapiMinerando = { mostrar };
  if (/[?&]capi=teste\b/.test(location.search)) { setTimeout(mostrar, 600); setInterval(mostrar, 9500); } // prévia: repete
  consultar();
  setInterval(consultar, CONSULTA_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) consultar(); });
})();
