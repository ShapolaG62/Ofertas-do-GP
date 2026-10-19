// Gera as molduras ANIMADAS (estilo decoração de avatar do Discord) em public/images/molduras/anim-*.svg.
// Uso: node video/molduras/animadas.js
// Mesmo desenho das outras molduras (140×140, foto no quadrado 20..120). As animações são CSS dentro do próprio SVG
// (funcionam como imagem de fundo) e param para quem pediu menos movimento no sistema (prefers-reduced-motion).
const fs = require('fs');
const path = require('path');
const DESTINO = path.join(__dirname, '..', '..', 'public', 'images', 'molduras');
fs.mkdirSync(DESTINO, { recursive: true });

const f = n => Number(n.toFixed(2));
// Ponto no contorno do aro (retângulo 18..122 com cantos de raio 22), t de 0 a 1 no sentido horário a partir do topo-esquerdo.
// Devolve a posição e o ângulo da normal para fora (graus; 0 = para cima).
function ponto(t, afasta = 0) {
  const L = 60, A = Math.PI * 22 / 2, total = 4 * (L + A);
  let d = ((t % 1) + 1) % 1 * total;
  const lados = [
    { x0: 40, y0: 18, dx: 1, dy: 0, cx: 100, cy: 40, a0: -90 },   // topo, depois canto superior direito
    { x0: 122, y0: 40, dx: 0, dy: 1, cx: 100, cy: 100, a0: 0 },   // direita, depois inferior direito
    { x0: 100, y0: 122, dx: -1, dy: 0, cx: 40, cy: 100, a0: 90 }, // baixo, depois inferior esquerdo
    { x0: 18, y0: 100, dx: 0, dy: -1, cx: 40, cy: 40, a0: 180 },  // esquerda, depois superior esquerdo
  ];
  for (const s of lados) {
    if (d <= L) {
      const nx = s.dy === 0 ? 0 : -s.dy * 0 + (s.dx === 0 ? (s.dy > 0 ? 1 : -1) : 0), ny = s.dx === 0 ? 0 : (s.dx > 0 ? -1 : 1);
      return { x: f(s.x0 + s.dx * d + nx * afasta), y: f(s.y0 + s.dy * d + ny * afasta), ang: s.a0 + 90 };
    }
    d -= L;
    if (d <= A) {
      const a = (s.a0 + (d / A) * 90) * Math.PI / 180;
      return { x: f(s.cx + (22 + afasta) * Math.cos(a)), y: f(s.cy + (22 + afasta) * Math.sin(a)), ang: s.a0 + (d / A) * 90 + 90 };
    }
    d -= A;
  }
  return { x: 40, y: 18, ang: 0 };
}

const PARAR = '@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }';
const svg = (estilo, defs, corpo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" width="140" height="140">
<style>${estilo} ${PARAR}</style><defs>${defs}</defs>${corpo}</svg>\n`;
const ARO = 'x="18" y="18" width="104" height="104" rx="22" fill="none"';
const estrela4 = (r) => `M0 ${-r} C${r * .18} ${-r * .18} ${r * .18} ${-r * .18} ${r} 0 C${r * .18} ${r * .18} ${r * .18} ${r * .18} 0 ${r} C${-r * .18} ${r * .18} ${-r * .18} ${r * .18} ${-r} 0 C${-r * .18} ${-r * .18} ${-r * .18} ${-r * .18} 0 ${-r}Z`;
// Número "aleatório" fixo (o desenho sai sempre igual)
let semente = 11;
const rnd = () => { semente = (semente * 9301 + 49297) % 233280; return semente / 233280; };

const MOLDURAS = {};

// 1) Brilhos: aro fino de arco-íris girando e estrelinhas piscando em volta
semente = 11;
MOLDURAS['anim-brilhos'] = svg(`
  .gira { animation: cores 5s linear infinite; }
  .pisca { animation: pisca 1.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes cores { to { filter: hue-rotate(360deg); } }
  @keyframes pisca { 0%, 100% { opacity: .15; transform: scale(.4) rotate(0deg); } 50% { opacity: 1; transform: scale(1) rotate(45deg); } }`,
`<linearGradient id="arco" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5fd2"/><stop offset=".25" stop-color="#ffd84d"/><stop offset=".5" stop-color="#5cf2a8"/><stop offset=".75" stop-color="#58b4ff"/><stop offset="1" stop-color="#b47bff"/></linearGradient>
 <filter id="luz" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>`,
`<g class="gira"><rect ${ARO} stroke="url(#arco)" stroke-width="5" filter="url(#luz)" opacity=".8"/><rect ${ARO} stroke="url(#arco)" stroke-width="2.6"/></g>
 ${Array.from({ length: 16 }, (_, i) => {
    const p = ponto(i / 16 + rnd() * .03, 5 + rnd() * 9), cores = ['#fff', '#ffd84d', '#ff5fd2', '#5cf2a8', '#58b4ff'], r = 2.2 + rnd() * 3;
    return `<g transform="translate(${p.x} ${p.y})"><path class="pisca" style="animation-delay:-${f(rnd() * 1.8)}s" d="${estrela4(r)}" fill="${cores[i % cores.length]}"/></g>`;
  }).join('')}`);

// 2) Neon: aro ciano com brilho pulsando e duas luzes correndo em volta
MOLDURAS['anim-neon'] = svg(`
  .pulsa { animation: pulsa 2.4s ease-in-out infinite; }
  .corre { animation: corre 2.6s linear infinite; }
  @keyframes pulsa { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
  @keyframes corre { to { stroke-dashoffset: -100; } }`,
`<filter id="neon" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>`,
`<rect ${ARO} stroke="#0c2a33" stroke-width="9"/>
 <g class="pulsa"><rect ${ARO} stroke="#29f0ff" stroke-width="7" filter="url(#neon)"/></g>
 <rect ${ARO} stroke="#9ffbff" stroke-width="2.2"/>
 <rect x="12.5" y="12.5" width="115" height="115" rx="27" fill="none" stroke="#29f0ff" stroke-width=".8" opacity=".5"/>
 <rect class="corre" ${ARO} stroke="#fff" stroke-width="3.4" stroke-linecap="round" pathLength="100" stroke-dasharray="9 41" filter="url(#neon)"/>
 <rect class="corre" ${ARO} stroke="#fff" stroke-width="1.8" stroke-linecap="round" pathLength="100" stroke-dasharray="9 41"/>`);

// 3) Chamas: aro de brasa incandescente com calor pulsando; labaredas em duas camadas (fora vermelho-alaranjado,
//    miolo amarelo) subindo pelas laterais e pelo alto, mais altas embaixo, e fagulhas subindo por fora da foto.
semente = 23;
const labareda = 'M0 0 C-6 -2 -7.5 -10 -3.5 -16 C-3.2 -11.5 -1.2 -10.5 0 -12.5 C-1.2 -18.5 2 -25 5.5 -29 C4.2 -21 9.5 -16.5 8.4 -8.5 C7.8 -3.2 4.2 0 0 0Z';
const miolo = 'M0.6 0 C-3 -1.5 -3.6 -6.5 -1.2 -10.5 C-0.8 -7.5 0.6 -7 1.4 -8.6 C0.8 -12.5 2.6 -16 4.6 -18 C4 -12.5 6.6 -9.5 5.8 -5 C5.4 -1.8 3.2 0 0.6 0Z';
function chama(p, ang, s, cor) {
  const dur = f(.55 + rnd() * .5), atraso = f(rnd());
  return `<g transform="translate(${p.x} ${p.y}) rotate(${f(ang)}) scale(${s})">
    <path class="chama" style="animation-delay:-${atraso}s;animation-duration:${dur}s" d="${labareda}" fill="url(#${cor})"/>
    <path class="chama miolo" style="animation-delay:-${f(atraso + .2)}s;animation-duration:${f(dur * .8)}s" d="${miolo}" fill="url(#nucleo)"/></g>`;
}
MOLDURAS['anim-chamas'] = svg(`
  .chama { animation: chama .8s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: 50% 100%; }
  .miolo { opacity: .95; }
  .calor { animation: calor 1.4s ease-in-out infinite; }
  .brasa { animation: brasa 2.2s linear infinite; }
  .fagulha { animation: sobe 2.6s linear infinite; }
  @keyframes chama { 0% { transform: scale(.82, .7) skewX(-6deg); } 40% { transform: scale(1.04, 1.08) skewX(4deg); } 100% { transform: scale(.94, 1.28) skewX(-3deg); } }
  @keyframes calor { 0%, 100% { opacity: .55; } 50% { opacity: .95; } }
  @keyframes brasa { to { stroke-dashoffset: -60; } }
  @keyframes sobe { 0% { transform: translate(0, 0); opacity: 0; } 12% { opacity: 1; } 100% { transform: translate(4px, -38px); opacity: 0; } }`,
`<linearGradient id="fogo" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#c41d00"/><stop offset=".45" stop-color="#ff4d00"/><stop offset=".85" stop-color="#ff9800"/><stop offset="1" stop-color="#ffcc66" stop-opacity=".9"/></linearGradient>
 <linearGradient id="fogo2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e53900"/><stop offset=".6" stop-color="#ff7a00"/><stop offset="1" stop-color="#ffd54f"/></linearGradient>
 <linearGradient id="nucleo" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#ffd54f"/><stop offset="1" stop-color="#ffab00" stop-opacity=".2"/></linearGradient>
 <linearGradient id="carvao" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a0600"/><stop offset=".3" stop-color="#8a1c00"/><stop offset=".5" stop-color="#ff5a00"/><stop offset=".7" stop-color="#8a1c00"/><stop offset="1" stop-color="#2a0600"/></linearGradient>
 <filter id="calor" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>`,
`<g class="calor"><rect ${ARO} stroke="#ff5a00" stroke-width="15" filter="url(#calor)"/></g>
 <rect ${ARO} stroke="#140300" stroke-width="10"/>
 <rect ${ARO} stroke="url(#carvao)" stroke-width="6"/>
 <rect class="brasa" ${ARO} stroke="#ffd180" stroke-width="1" stroke-dasharray="2 6 1 8 3 5" stroke-linecap="round" opacity=".5"/>
 ${Array.from({ length: 30 }, (_, i) => {
    // Camada de trás: labaredas maiores em volta (para cima no alto, inclinadas para cima nas laterais, curtas embaixo)
    const p = ponto(i / 30 + .008, 3);
    const lado = p.x < 70 ? -1 : 1;
    let ang, s;
    if (p.y < 26) { ang = (p.x - 70) * .3; s = .4 + rnd() * .2; }                         // alto: para cima
    else if (p.y > 116) { ang = lado * (150 - rnd() * 20); s = .32 + rnd() * .14; }           // baixo: lambidas curtas
    else { ang = lado * (46 - (p.y - 26) * .18); s = .55 + (p.y - 26) / 210 + rnd() * .2; }    // laterais: sobem
    return chama(p, ang, f(s), rnd() < .5 ? 'fogo' : 'fogo2');
  }).join('')}
 ${Array.from({ length: 12 }, () => {
    const lado = rnd() < .5, x = f(lado ? 3 + rnd() * 13 : 124 + rnd() * 13), y = f(70 + rnd() * 60);
    return `<circle class="fagulha" style="animation-delay:-${f(rnd() * 2.6)}s" cx="${x}" cy="${y}" r="${f(.6 + rnd() * .9)}" fill="${rnd() < .5 ? '#ffd54f' : '#ff9100'}"/>`;
  }).join('')}`);

// 4) Raios: aro roxo elétrico e raios que estalam nos cantos, um de cada vez
semente = 37;
function raio(x, y, ang, tam) {
  let d = 'M0 0', px = 0;
  for (let i = 1; i <= 5; i++) { px = (i % 2 ? 1 : -1) * (2 + rnd() * 3); d += ` L${f(px)} ${-i * tam / 5}`; }
  return `<g transform="translate(${x} ${y}) rotate(${ang})"><path d="${d}" stroke="#e9d5ff" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="${d}" stroke="#b46bff" stroke-width="4" fill="none" opacity=".45" filter="url(#eletrico)"/></g>`;
}
MOLDURAS['anim-raios'] = svg(`
  .zap { opacity: 0; animation: zap 2.4s steps(1) infinite; }
  .pulsa { animation: pulsa 1.2s ease-in-out infinite; }
  @keyframes zap { 0% { opacity: 1; } 6% { opacity: 0; } 9% { opacity: 1; } 14%, 100% { opacity: 0; } }
  @keyframes pulsa { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }`,
`<filter id="eletrico" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.8"/></filter>
 <linearGradient id="roxo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b0a5c"/><stop offset=".5" stop-color="#7c3aed"/><stop offset="1" stop-color="#2b0a5c"/></linearGradient>`,
`<rect ${ARO} stroke="url(#roxo)" stroke-width="9"/>
 <g class="pulsa"><rect ${ARO} stroke="#c084fc" stroke-width="3" filter="url(#eletrico)"/></g>
 <rect ${ARO} stroke="#e9d5ff" stroke-width="1.1" stroke-dasharray="6 3 2 3"/>
 ${[[24, 24, -45], [116, 24, 45], [116, 116, 135], [24, 116, -135], [70, 15, 0], [125, 70, 90]].map(([x, y, a], i) =>
    `<g class="zap" style="animation-delay:${f(i * .4)}s">${raio(x, y, a, 18)}${raio(x, y, a + 25, 11)}</g>`).join('')}`);

// 5) Espinhos: galho escuro cheio de espinhos em volta, com brilho vermelho pulsando
semente = 41;
MOLDURAS['anim-espinhos'] = svg(`
  .aura { animation: aura 2.2s ease-in-out infinite; }
  .gota { animation: gota 3s ease-in infinite; }
  @keyframes aura { 0%, 100% { opacity: .35; } 50% { opacity: .95; } }
  @keyframes gota { 0%, 60% { transform: translateY(0); opacity: 0; } 65% { opacity: 1; } 100% { transform: translateY(14px); opacity: 0; } }`,
`<filter id="sangue" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.6"/></filter>`,
`<g class="aura"><rect ${ARO} stroke="#ff1744" stroke-width="10" filter="url(#sangue)"/></g>
 <rect ${ARO} stroke="#1a0006" stroke-width="7"/>
 <path d="${Array.from({ length: 41 }, (_, i) => { const p = ponto(i / 40, Math.sin(i * 1.7) * 2.2); return `${i ? 'L' : 'M'}${p.x} ${p.y}`; }).join(' ')}" stroke="#5c0a1a" stroke-width="2.6" fill="none"/>
 <path d="${Array.from({ length: 41 }, (_, i) => { const p = ponto(i / 40 + .012, Math.cos(i * 1.3) * 2.4); return `${i ? 'L' : 'M'}${p.x} ${p.y}`; }).join(' ')}" stroke="#8b1026" stroke-width="1.4" fill="none"/>
 ${Array.from({ length: 30 }, (_, i) => {
    const p = ponto(i / 30 + rnd() * .01, 3), lado = i % 2 ? 1 : -1, c = f(4 + rnd() * 4);
    return `<g transform="translate(${p.x} ${p.y}) rotate(${f(p.ang + lado * (25 + rnd() * 30))})"><path d="M-1.4 0 L0 ${-c} L1.4 0Z" fill="#2b0010" stroke="#a3112e" stroke-width=".4"/></g>`;
  }).join('')}
 ${[[46, 124], [92, 125], [123, 84]].map(([x, y], i) => `<path class="gota" style="animation-delay:${i}s" d="M${x} ${y} q1.6 2.6 0 4 q-1.6 -1.4 0 -4Z" fill="#ff1744"/>`).join('')}`);

// 6) Galáxia: aro de nebulosa e estrelas e planetinhas girando em órbita
semente = 59;
MOLDURAS['anim-galaxia'] = svg(`
  .orbita { animation: gira 14s linear infinite; transform-origin: 70px 70px; }
  .orbita2 { animation: gira 22s linear infinite reverse; transform-origin: 70px 70px; }
  .cintila { animation: cintila 2s ease-in-out infinite; }
  @keyframes gira { to { transform: rotate(360deg); } }
  @keyframes cintila { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }`,
`<linearGradient id="nebula" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1446"/><stop offset=".35" stop-color="#6b3fd4"/><stop offset=".6" stop-color="#d63c8a"/><stop offset="1" stop-color="#14254f"/></linearGradient>
 <radialGradient id="planeta" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#ffd6a5"/><stop offset="1" stop-color="#e76f51"/></radialGradient>
 <radialGradient id="planeta2" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#a5f3ff"/><stop offset="1" stop-color="#1d6fd6"/></radialGradient>
 <filter id="nevoa" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>`,
`<rect ${ARO} stroke="url(#nebula)" stroke-width="12" filter="url(#nevoa)" opacity=".85"/>
 <rect ${ARO} stroke="url(#nebula)" stroke-width="5"/>
 ${Array.from({ length: 22 }, () => { const p = ponto(rnd(), -2 + rnd() * 4); return `<circle class="cintila" style="animation-delay:-${f(rnd() * 2)}s" cx="${p.x}" cy="${p.y}" r="${f(.4 + rnd() * .7)}" fill="#fff"/>`; }).join('')}
 <g class="orbita">
   <circle cx="70" cy="5" r="4.6" fill="url(#planeta)"/><ellipse cx="70" cy="5" rx="7.5" ry="1.8" fill="none" stroke="#ffe8c2" stroke-width=".8" transform="rotate(-18 70 5)"/>
   ${Array.from({ length: 5 }, (_, i) => { const a = (i * 72 + 36) * Math.PI / 180; return `<circle cx="${f(70 + 65 * Math.sin(a))}" cy="${f(70 - 65 * Math.cos(a))}" r="1.1" fill="#ffe8ff"/>`; }).join('')}</g>
 <g class="orbita2"><circle cx="70" cy="136" r="3.4" fill="url(#planeta2)"/>
   ${Array.from({ length: 4 }, (_, i) => { const a = (i * 90 + 60) * Math.PI / 180; return `<path transform="translate(${f(70 + 64 * Math.sin(a))} ${f(70 - 64 * Math.cos(a))})" d="${estrela4(2.4)}" fill="#fff6c9"/>`; }).join('')}</g>`);


// ── Segunda leva: no mesmo nível de detalhe dos efeitos de perfil ──
// Floco de neve de 6 pontas centrado em (0, 0)
const floco = (r, cor, larg = 1.1) => Array.from({ length: 6 }, (_, i) => `<g transform="rotate(${i * 60})"><path d="M0 0 L0 ${-r} M0 ${-r * .55} L${-r * .22} ${-r * .75} M0 ${-r * .55} L${r * .22} ${-r * .75}" stroke="${cor}" stroke-width="${larg}" stroke-linecap="round" fill="none"/></g>`).join('');
// Flor de cerejeira (5 pétalas) centrada em (0, 0)
const flor = (r, cor, miolo = '#ffe08a') => `${Array.from({ length: 5 }, (_, i) => `<path transform="rotate(${i * 72})" d="M0 0 C${-r * .55} ${-r * .35} ${-r * .5} ${-r} 0 ${-r * 1.05} C${r * .1} ${-r * .85} ${r * .25} ${-r * .95} ${r * .3} ${-r * .9} C${r * .55} ${-r * .6} ${r * .4} ${-r * .3} 0 0Z" fill="${cor}" stroke="#e58fb3" stroke-width=".4"/>`).join('')}
  <circle r="${f(r * .22)}" fill="${miolo}"/>${Array.from({ length: 5 }, (_, i) => { const a = (i * 72 + 36) * Math.PI / 180; return `<circle cx="${f(Math.sin(a) * r * .38)}" cy="${f(-Math.cos(a) * r * .38)}" r=".45" fill="#c2185b"/>`; }).join('')}`;

// 7) Gelo: aro de cristal com um reflexo correndo, flocos girando nos cantos e neve caindo pelas laterais
semente = 71;
MOLDURAS['anim-gelo'] = svg(`
  .reflexo { animation: corre 3.2s linear infinite; }
  .gira { animation: gira 9s linear infinite; transform-box: fill-box; transform-origin: center; }
  .pulsa { animation: pulsa 2.6s ease-in-out infinite; }
  .cai { animation: cai 4s linear infinite; }
  @keyframes corre { to { stroke-dashoffset: -100; } }
  @keyframes gira { to { transform: rotate(360deg); } }
  @keyframes pulsa { 0%, 100% { opacity: .45; } 50% { opacity: .9; } }
  @keyframes cai { 0% { transform: translateY(-20px); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: translateY(60px); opacity: 0; } }`,
`<linearGradient id="cristal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8fbff"/><stop offset=".3" stop-color="#7fd3ff"/><stop offset=".55" stop-color="#ffffff"/><stop offset=".8" stop-color="#4fb3e8"/><stop offset="1" stop-color="#d9f6ff"/></linearGradient>
 <filter id="frio" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>`,
`<g class="pulsa"><rect ${ARO} stroke="#8fdcff" stroke-width="13" filter="url(#frio)"/></g>
 <rect ${ARO} stroke="#0b2a3d" stroke-width="10"/>
 <rect ${ARO} stroke="url(#cristal)" stroke-width="7"/>
 <rect x="22" y="22" width="96" height="96" rx="18" fill="none" stroke="#ffffff" stroke-width=".7" opacity=".7"/>
 <rect class="reflexo" ${ARO} stroke="#fff" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="6 94" opacity=".9"/>
 ${Array.from({ length: 14 }, (_, i) => { const p = ponto(i / 14 + .02, 0); return `<path transform="translate(${p.x} ${p.y}) rotate(${f(p.ang)})" d="M-2 1 L0 -5 L2 1Z" fill="#e8fbff" opacity=".9"/>`; }).join('')}
 ${[[18, 18, 9], [122, 18, 7.5], [122, 122, 9], [18, 122, 7.5]].map(([x, y, r], i) => `<g transform="translate(${x} ${y})"><g class="gira" style="animation-duration:${8 + i * 2}s${i % 2 ? ';animation-direction:reverse' : ''}">${floco(r, '#ffffff', 1.3)}<circle r="1.6" fill="#bfefff"/></g></g>`).join('')}
 ${Array.from({ length: 12 }, () => { const lado = rnd() < .5, x = f(lado ? 3 + rnd() * 12 : 125 + rnd() * 12), y = f(10 + rnd() * 70); return `<circle class="cai" style="animation-delay:-${f(rnd() * 4)}s;animation-duration:${f(3 + rnd() * 2.5)}s" cx="${x}" cy="${y}" r="${f(.7 + rnd() * 1.1)}" fill="#fff"/>`; }).join('')}`);

// 8) Sakura: galho de cerejeira em volta, flores abrindo e fechando e pétalas caindo com o vento
semente = 83;
MOLDURAS['anim-sakura'] = svg(`
  .respira { animation: respira 3s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .petala { animation: voa 6s linear infinite; }
  @keyframes respira { 0%, 100% { transform: scale(.92) rotate(0deg); } 50% { transform: scale(1.06) rotate(8deg); } }
  @keyframes voa { 0% { transform: translate(0, -10px) rotate(0deg); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translate(-28px, 70px) rotate(300deg); opacity: 0; } }`,
`<linearGradient id="casca" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5d3a2e"/><stop offset=".5" stop-color="#8d5a4a"/><stop offset="1" stop-color="#4a2c22"/></linearGradient>
 <filter id="rosado" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>`,
`<rect ${ARO} stroke="#ffb7d5" stroke-width="11" filter="url(#rosado)" opacity=".55"/>
 <rect ${ARO} stroke="#2a1712" stroke-width="8"/>
 <path d="${Array.from({ length: 61 }, (_, i) => { const p = ponto(i / 60, Math.sin(i * .9) * 1.4); return `${i ? 'L' : 'M'}${p.x} ${p.y}`; }).join(' ')}" stroke="url(#casca)" stroke-width="5" fill="none" stroke-linejoin="round"/>
 <path d="M24 26 C16 18 12 12 6 10 M40 18 C38 10 34 6 30 2 M116 114 C124 120 128 126 134 128 M100 122 C104 130 106 134 110 138" stroke="url(#casca)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
 ${[[18, 18, 6.5], [8, 11, 4.5], [31, 5, 4.2], [40, 17, 4.8], [9, 34, 4.4], [122, 122, 6.5], [132, 128, 4.5], [110, 136, 4.3], [100, 123, 4.6], [131, 106, 4.4], [122, 18, 4.2], [18, 122, 4.2]]
    .map(([x, y, r], i) => `<g transform="translate(${x} ${y})"><g class="respira" style="animation-delay:-${f(i * .37)}s">${flor(r, i % 3 ? '#ffd1e3' : '#ffb7d5')}</g></g>`).join('')}
 ${Array.from({ length: 10 }, () => { const x = f(30 + rnd() * 110), y = f(rnd() * 30); return `<path class="petala" style="animation-delay:-${f(rnd() * 6)}s;animation-duration:${f(5 + rnd() * 3)}s" transform="translate(${x} ${y})" d="M0 0 C1.6 -2.2 4.5 -2.2 5.2 0 C4.4 1.2 2.6 2 1.2 1.8Z" fill="#ffc4dc"/>`; }).join('')}`);

// 9) Oceano: aro de água com ondas correndo, espuma no alto e bolhas subindo
semente = 97;
MOLDURAS['anim-oceano'] = svg(`
  .onda { animation: corre 4s linear infinite; }
  .onda2 { animation: corre 6s linear infinite reverse; }
  .balanca { animation: balanca 3s ease-in-out infinite; }
  .bolha { animation: sobe 4s ease-in infinite; }
  @keyframes corre { to { stroke-dashoffset: -100; } }
  @keyframes balanca { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
  @keyframes sobe { 0% { transform: translate(0, 0); opacity: 0; } 15% { opacity: .9; } 100% { transform: translate(3px, -50px); opacity: 0; } }`,
`<linearGradient id="mar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fc3f7"/><stop offset=".5" stop-color="#0277bd"/><stop offset="1" stop-color="#01386b"/></linearGradient>
 <filter id="agua" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>`,
`<rect ${ARO} stroke="#29b6f6" stroke-width="12" filter="url(#agua)" opacity=".55"/>
 <rect ${ARO} stroke="#012a4a" stroke-width="10"/>
 <rect ${ARO} stroke="url(#mar)" stroke-width="7"/>
 <rect class="onda" ${ARO} stroke="#b3ecff" stroke-width="1.6" pathLength="100" stroke-dasharray="3 2 1 4" stroke-linecap="round" opacity=".8"/>
 <rect class="onda2" x="21.5" y="21.5" width="97" height="97" rx="19" fill="none" stroke="#81d4fa" stroke-width="1" pathLength="100" stroke-dasharray="1 3 5 3" stroke-linecap="round" opacity=".6"/>
 <g class="balanca"><path d="M20 15 q5 -6 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0" stroke="#e1f5fe" stroke-width="2.4" fill="none" stroke-linecap="round"/>
   ${Array.from({ length: 10 }, (_, i) => `<circle cx="${25 + i * 10}" cy="${f(10.5 + rnd() * 2)}" r="${f(.9 + rnd())}" fill="#ffffff" opacity=".9"/>`).join('')}</g>
 ${Array.from({ length: 14 }, () => { const lado = rnd() < .5, x = f(lado ? 4 + rnd() * 11 : 125 + rnd() * 11), y = f(80 + rnd() * 50), r = f(1 + rnd() * 2.2);
    return `<g class="bolha" style="animation-delay:-${f(rnd() * 4)}s;animation-duration:${f(3 + rnd() * 2)}s"><circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#b3ecff" stroke-width=".8"/><circle cx="${f(x - r * .35)}" cy="${f(y - r * .35)}" r="${f(r * .3)}" fill="#fff"/></g>`; }).join('')}`);

// 10) Matrix: aro preto com código verde correndo e colunas de caracteres caindo pelas laterais
semente = 101;
const SIMBOLOS = 'アイウエオカキクケコ01ﾊﾋﾌ';
MOLDURAS['anim-matrix'] = svg(`
  .corre { animation: corre 2.8s linear infinite; }
  .coluna { animation: desce 2.6s linear infinite; }
  .pisca { animation: pisca 1.2s steps(2) infinite; }
  @keyframes corre { to { stroke-dashoffset: -100; } }
  @keyframes desce { 0% { transform: translateY(-46px); opacity: 0; } 15% { opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(46px); opacity: 0; } }
  @keyframes pisca { 50% { opacity: .35; } }`,
`<filter id="verde" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>`,
`<rect ${ARO} stroke="#00ff66" stroke-width="10" filter="url(#verde)" opacity=".35"/>
 <rect ${ARO} stroke="#020a04" stroke-width="10"/>
 <rect class="corre" ${ARO} stroke="#22e06b" stroke-width="5" pathLength="100" stroke-dasharray="1.2 .8 .6 1.4 2 .9" />
 <rect class="pisca" ${ARO} stroke="#b9ffcf" stroke-width=".8" pathLength="100" stroke-dasharray=".4 3"/>
 ${Array.from({ length: 6 }, (_, c) => {
    const x = c < 3 ? 4 + c * 5.2 : 124 + (c - 3) * 5.2;
    return `<g class="coluna" style="animation-delay:-${f(rnd() * 2.6)}s;animation-duration:${f(1.8 + rnd() * 1.6)}s">${Array.from({ length: 7 }, (_, i) =>
      `<text x="${f(x)}" y="${44 + i * 8}" font-family="monospace" font-size="7" text-anchor="middle" fill="${i === 6 ? '#e8ffe8' : '#22e06b'}" opacity="${f(.25 + i * .12)}">${SIMBOLOS[Math.floor(rnd() * SIMBOLOS.length)]}</text>`).join('')}</g>`;
  }).join('')}`);

// 11) Aurora: aro que muda de cor como a aurora boreal, luzes flutuando e estrelas cintilando
semente = 113;
MOLDURAS['anim-aurora'] = svg(`
  .cor { animation: cor 8s ease-in-out infinite alternate; }
  .flutua { animation: flutua 7s ease-in-out infinite alternate; }
  .cintila { animation: cintila 2.2s ease-in-out infinite; }
  @keyframes cor { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(120deg); } }
  @keyframes flutua { 0% { transform: translate(-6px, 3px); opacity: .5; } 100% { transform: translate(8px, -4px); opacity: .9; } }
  @keyframes cintila { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }`,
`<linearGradient id="aurora" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2bd37f"/><stop offset=".35" stop-color="#22d3ee"/><stop offset=".65" stop-color="#8b5cf6"/><stop offset="1" stop-color="#2bd37f"/></linearGradient>
 <filter id="nuvem" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>`,
`<g class="cor"><rect ${ARO} stroke="url(#aurora)" stroke-width="14" filter="url(#nuvem)" opacity=".7"/>
   <rect ${ARO} stroke="#071321" stroke-width="9"/>
   <rect ${ARO} stroke="url(#aurora)" stroke-width="5"/>
   <g class="flutua"><ellipse cx="40" cy="12" rx="26" ry="5" fill="#2bd37f" filter="url(#nuvem)" opacity=".8"/><ellipse cx="104" cy="128" rx="24" ry="5" fill="#8b5cf6" filter="url(#nuvem)" opacity=".8"/></g>
   <g class="flutua" style="animation-duration:9s;animation-direction:alternate-reverse"><ellipse cx="128" cy="44" rx="5" ry="22" fill="#22d3ee" filter="url(#nuvem)" opacity=".7"/><ellipse cx="12" cy="96" rx="5" ry="22" fill="#a78bfa" filter="url(#nuvem)" opacity=".7"/></g></g>
 ${Array.from({ length: 18 }, () => { const p = ponto(rnd(), 6 + rnd() * 8); return `<circle class="cintila" style="animation-delay:-${f(rnd() * 2.2)}s" cx="${p.x}" cy="${p.y}" r="${f(.5 + rnd() * .8)}" fill="#fff"/>`; }).join('')}`);

// 12) Ouro real: aro de ouro trabalhado com um reflexo passando, joias brilhando e coroa no alto
semente = 127;
const joia = (x, y, cor, claro) => `<g transform="translate(${x} ${y})"><path d="M0 -4.6 L4 0 L0 4.6 L-4 0Z" fill="${cor}" stroke="#6b4700" stroke-width=".8"/><path d="M0 -4.6 L1.6 0 L0 4.6" fill="${claro}" opacity=".55"/></g>`;
MOLDURAS['anim-ouro'] = svg(`
  .reflexo { animation: corre 2.8s linear infinite; }
  .brilho { animation: brilho 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .pulsa { animation: pulsa 3s ease-in-out infinite; }
  @keyframes corre { to { stroke-dashoffset: -100; } }
  @keyframes brilho { 0%, 100% { transform: scale(.2) rotate(0deg); opacity: 0; } 50% { transform: scale(1) rotate(45deg); opacity: 1; } }
  @keyframes pulsa { 0%, 100% { opacity: .35; } 50% { opacity: .75; } }`,
`<linearGradient id="ouro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a5200"/><stop offset=".25" stop-color="#ffe69a"/><stop offset=".5" stop-color="#c8920e"/><stop offset=".75" stop-color="#fff1b8"/><stop offset="1" stop-color="#8a5f00"/></linearGradient>
 <filter id="dourado" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>`,
`<g class="pulsa"><rect ${ARO} stroke="#ffcc33" stroke-width="13" filter="url(#dourado)"/></g>
 <rect ${ARO} stroke="#3d2900" stroke-width="11"/>
 <rect ${ARO} stroke="url(#ouro)" stroke-width="8"/>
 <rect ${ARO} stroke="#5a3d00" stroke-width=".7" stroke-dasharray="1 2.6" opacity=".8"/>
 <rect class="reflexo" ${ARO} stroke="#fffbe6" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="4 96" opacity=".85"/>
 ${joia(70, 122, '#e53935', '#ffcdd2')}${joia(18, 70, '#1e88e5', '#bbdefb')}${joia(122, 70, '#43a047', '#c8e6c9')}${joia(18, 18, '#8e24aa', '#e1bee7')}${joia(122, 18, '#8e24aa', '#e1bee7')}${joia(18, 122, '#e53935', '#ffcdd2')}${joia(122, 122, '#1e88e5', '#bbdefb')}
 <g transform="translate(70 9)"><path d="M-14 6 L-14 -4 L-7 1 L0 -8 L7 1 L14 -4 L14 6Z" fill="url(#ouro)" stroke="#6b4700" stroke-width="1"/>
   <circle cx="-14" cy="-4.5" r="1.6" fill="#fff1b8"/><circle cx="0" cy="-8.5" r="1.9" fill="#fff1b8"/><circle cx="14" cy="-4.5" r="1.6" fill="#fff1b8"/>${joia(0, 2, '#e53935', '#ffcdd2').replace('translate(0 2)', 'translate(0 2) scale(.55)')}</g>
 ${[[30, 13], [112, 128], [128, 40], [12, 100], [96, 12], [44, 128]].map(([x, y], i) => `<g transform="translate(${x} ${y})"><path class="brilho" style="animation-delay:-${f(i * .4)}s" d="M0 -4 C.4 -.4 .4 -.4 4 0 C.4 .4 .4 .4 0 4 C-.4 .4 -.4 .4 -4 0 C-.4 -.4 -.4 -.4 0 -4Z" fill="#fffbe6"/></g>`).join('')}`);


// ── Terceira leva (temas de "pacote de efeitos" e "fundo animado") ──
// 13) Holográfica: aro furta-cor que muda de tom, com um reflexo de luz passando e brilhos de 4 pontas
semente = 131;
MOLDURAS['anim-holografica'] = svg(`
  .tom { animation: tom 6s linear infinite; }
  .reflexo { animation: corre 2.6s linear infinite; }
  .brilho { animation: brilho 2.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes tom { to { filter: hue-rotate(360deg); } }
  @keyframes corre { to { stroke-dashoffset: -100; } }
  @keyframes brilho { 0%, 100% { transform: scale(.2); opacity: 0; } 50% { transform: scale(1) rotate(45deg); opacity: 1; } }`,
`<linearGradient id="holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9ad5"/><stop offset=".2" stop-color="#a5b4ff"/><stop offset=".4" stop-color="#7ef0ff"/><stop offset=".6" stop-color="#b8ffcf"/><stop offset=".8" stop-color="#fff3a6"/><stop offset="1" stop-color="#ff9ad5"/></linearGradient>
 <filter id="halo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.6"/></filter>`,
`<g class="tom"><rect ${ARO} stroke="url(#holo)" stroke-width="13" filter="url(#halo)" opacity=".6"/>
   <rect ${ARO} stroke="#1a1430" stroke-width="10"/>
   <rect ${ARO} stroke="url(#holo)" stroke-width="7"/>
   <rect x="22.5" y="22.5" width="95" height="95" rx="18" fill="none" stroke="#ffffff" stroke-width=".7" opacity=".7"/></g>
 <rect class="reflexo" ${ARO} stroke="#ffffff" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="5 45" opacity=".75"/>
 ${[[12, 30, 5], [128, 22, 4], [126, 112, 5.5], [16, 118, 4], [70, 132, 3.5], [132, 70, 3.5]].map(([x, y, r], i) => `<g transform="translate(${x} ${y})"><path class="brilho" style="animation-delay:-${f(i * .37)}s" d="${estrela4(r)}" fill="#ffffff"/></g>`).join('')}`);

// 14) Fita de luz: aro escuro com três fitas de luz coloridas (rosa, ciano, roxo) correndo em volta, como "light painting"
MOLDURAS['anim-fita'] = svg(`
  .fita { animation: corre 3s linear infinite; }
  .fita2 { animation: corre 3.8s linear infinite reverse; }
  .fita3 { animation: corre 5s linear infinite; }
  @keyframes corre { to { stroke-dashoffset: -100; } }`,
`<filter id="luz" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>`,
`<rect ${ARO} stroke="#0b0f1a" stroke-width="10"/>
 ${[['fita', '#ff3df2', 0], ['fita2', '#2bf0ff', 2.4], ['fita3', '#8b5cf6', -2.4]].map(([c, cor, d]) => `
   <rect class="${c}" x="${18 + d}" y="${18 + d}" width="${104 - d * 2}" height="${104 - d * 2}" rx="${22 - d}" fill="none" stroke="${cor}" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="22 78" filter="url(#luz)"/>
   <rect class="${c}" x="${18 + d}" y="${18 + d}" width="${104 - d * 2}" height="${104 - d * 2}" rx="${22 - d}" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" pathLength="100" stroke-dasharray="22 78" opacity=".9"/>`).join('')}`);

// 15) Líquida: aro de gradiente que escorre (cores se movendo) com bolhas de tinta crescendo e sumindo nas bordas
semente = 149;
MOLDURAS['anim-liquida'] = svg(`
  .escorre { animation: corre 4.5s linear infinite; }
  .gota { animation: gota 3.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes corre { to { stroke-dashoffset: -100; } }
  @keyframes gota { 0%, 100% { transform: scale(.3); opacity: 0; } 40%, 60% { transform: scale(1); opacity: .95; } }`,
`<linearGradient id="tinta" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff5fa2"/><stop offset=".5" stop-color="#ffb24d"/><stop offset="1" stop-color="#7b61ff"/></linearGradient>
 <filter id="gosma" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>`,
`<rect ${ARO} stroke="#1a0f24" stroke-width="11"/>
 <rect class="escorre" ${ARO} stroke="#ff5fa2" stroke-width="8" pathLength="100" stroke-dasharray="34 66"/>
 <rect class="escorre" ${ARO} stroke="#ffb24d" stroke-width="8" pathLength="100" stroke-dasharray="33 67" stroke-dashoffset="-33"/>
 <rect class="escorre" ${ARO} stroke="#7b61ff" stroke-width="8" pathLength="100" stroke-dasharray="33 67" stroke-dashoffset="-66"/>
 <rect ${ARO} stroke="#ffffff" stroke-width="1" opacity=".35"/>
 ${Array.from({ length: 10 }, (_, i) => { const p = ponto(i / 10 + rnd() * .04, 6 + rnd() * 4), cores = ['#ff5fa2', '#ffb24d', '#7b61ff'];
    return `<circle class="gota" style="animation-delay:-${f(rnd() * 3.4)}s" cx="${p.x}" cy="${p.y}" r="${f(3 + rnd() * 3.5)}" fill="${cores[i % 3]}" filter="url(#gosma)"/>`; }).join('')}`);

// 16) Y2K cromada: aro de cromo espelhado com reflexo passando, estrelas de 4 pontas piscando e "+" girando
semente = 157;
MOLDURAS['anim-y2k'] = svg(`
  .reflexo { animation: corre 2.4s linear infinite; }
  .pisca { animation: pisca 1.9s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .gira { animation: gira 4s linear infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes corre { to { stroke-dashoffset: -100; } }
  @keyframes pisca { 0%, 100% { transform: scale(.35); opacity: .3; } 50% { transform: scale(1); opacity: 1; } }
  @keyframes gira { to { transform: rotate(360deg); } }`,
`<linearGradient id="cromo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#9aa6b8"/><stop offset=".5" stop-color="#e9eef6"/><stop offset=".65" stop-color="#6c778a"/><stop offset="1" stop-color="#dfe6f0"/></linearGradient>`,
`<rect ${ARO} stroke="#1c2230" stroke-width="11"/>
 <rect ${ARO} stroke="url(#cromo)" stroke-width="7.5"/>
 <rect x="22.5" y="22.5" width="95" height="95" rx="18" fill="none" stroke="#ffffff" stroke-width=".8" opacity=".8"/>
 <rect class="reflexo" ${ARO} stroke="#ffffff" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="3 47"/>
 ${[[14, 14, 7, '#ffb3f5'], [128, 24, 5, '#a5f3ff'], [126, 126, 7.5, '#d9c2ff'], [12, 112, 5, '#ffffff'], [70, 6, 4.5, '#fff3a6'], [134, 76, 4, '#ffb3f5']].map(([x, y, r, c], i) =>
    `<g transform="translate(${x} ${y})"><path class="pisca" style="animation-delay:-${f(i * .33)}s" d="${estrela4(r)}" fill="${c}"/></g>`).join('')}
 ${[[34, 132], [106, 8], [4, 60]].map(([x, y], i) => `<g transform="translate(${x} ${y})"><path class="gira" style="animation-delay:-${i}s" d="M-3.5 0 H3.5 M0 -3.5 V3.5" stroke="#e9eef6" stroke-width="1.6" stroke-linecap="round"/></g>`).join('')}`);

for (const [id, conteudo] of Object.entries(MOLDURAS)) fs.writeFileSync(path.join(DESTINO, `${id}.svg`), conteudo);
console.log(`${Object.keys(MOLDURAS).length} molduras animadas em ${DESTINO}`);
