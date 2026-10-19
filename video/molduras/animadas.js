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

// 3) Chamas: brasa no aro e labaredas tremulando por fora (mais fortes embaixo), com fagulhas subindo
semente = 23;
const labareda = 'M0 0 C-5 -2 -6 -9 -3 -14 C-2 -10 0 -9 0 -9 C-1 -14 1 -19 4 -22 C3 -16 7 -12 6 -6 C6 -2 3 0 0 0Z';
MOLDURAS['anim-chamas'] = svg(`
  .chama { animation: chama .9s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: 50% 100%; }
  .brasa { animation: brasa 1.6s ease-in-out infinite; }
  .fagulha { animation: sobe 2.4s linear infinite; }
  @keyframes chama { 0% { transform: scale(.85, .75) skewX(-4deg); } 50% { transform: scale(1.05, 1.15) skewX(3deg); } 100% { transform: scale(.95, 1.3) skewX(-2deg); } }
  @keyframes brasa { 0%, 100% { opacity: .7; } 50% { opacity: 1; } }
  @keyframes sobe { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-34px); opacity: 0; } }`,
`<linearGradient id="fogo" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3d00"/><stop offset=".5" stop-color="#ff9100"/><stop offset="1" stop-color="#ffe082"/></linearGradient>
 <linearGradient id="carvao" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b0a00"/><stop offset=".5" stop-color="#b33000"/><stop offset="1" stop-color="#3b0a00"/></linearGradient>
 <filter id="calor" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>`,
`<rect ${ARO} stroke="#1a0500" stroke-width="10"/>
 <g class="brasa"><rect ${ARO} stroke="#ff6d00" stroke-width="8" filter="url(#calor)"/></g>
 <rect ${ARO} stroke="url(#carvao)" stroke-width="5"/>
 ${Array.from({ length: 34 }, (_, i) => {
    // Fogo nas laterais e embaixo, subindo: nas laterais a chama se inclina para cima; no alto, só pontinhas
    const p = ponto(i / 34, 2.5);
    if (p.y < 32) return '';
    const lado = p.x < 70 ? -1 : 1, ang = p.y > 112 ? lado * 25 : p.ang === 180 ? 0 : lado * (90 - Math.min(55, (p.y - 30) * .8));
    const s = f((.55 + rnd() * .35) * (p.y > 112 ? .8 : .6 + (p.y - 30) / 160));
    return `<g transform="translate(${p.x} ${p.y}) rotate(${f(ang)}) scale(${s})"><path class="chama" style="animation-delay:-${f(rnd())}s;animation-duration:${f(.6 + rnd() * .6)}s" d="${labareda}" fill="url(#fogo)" opacity=".92"/></g>`;
  }).join('')}
 ${Array.from({ length: 10 }, () => {
    const lado = rnd() < .5, x = f(lado ? 4 + rnd() * 12 : 124 + rnd() * 12), y = f(90 + rnd() * 40); // nas laterais, por fora da foto
    return `<circle class="fagulha" style="animation-delay:-${f(rnd() * 2.4)}s" cx="${x}" cy="${y}" r="${f(.6 + rnd() * .9)}" fill="#ffd54f"/>`;
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

for (const [id, conteudo] of Object.entries(MOLDURAS)) fs.writeFileSync(path.join(DESTINO, `${id}.svg`), conteudo);
console.log(`${Object.keys(MOLDURAS).length} molduras animadas em ${DESTINO}`);
