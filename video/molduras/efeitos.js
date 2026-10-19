// Gera as texturas (SVG que se repetem) dos efeitos de perfil em public/images/efeitos/. O movimento é feito no CSS
// (site.css, .pf-efeito-*), deslocando a textura em múltiplos exatos do tamanho dela para o laço não dar "pulo".
// Uso: node video/molduras/efeitos.js
const fs = require('fs');
const path = require('path');
const DESTINO = path.join(__dirname, '..', '..', 'public', 'images', 'efeitos');
fs.mkdirSync(DESTINO, { recursive: true });

let semente = 5;
const rnd = () => { semente = (semente * 9301 + 49297) % 233280; return semente / 233280; };
const f = n => Number(n.toFixed(1));
const svg = (w, h, corpo, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${corpo}</svg>\n`;
// Repete o desenho nas bordas para a textura emendar sem corte
const emenda = (w, h, desenho) => [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h]].map(([dx, dy]) => `<g transform="translate(${dx} ${dy})">${desenho}</g>`).join('');

const EFEITOS = {};

semente = 5;
EFEITOS.neve = svg(200, 200, emenda(200, 200, Array.from({ length: 22 }, () => {
  const r = f(1 + rnd() * 2.6);
  return `<circle cx="${f(rnd() * 200)}" cy="${f(rnd() * 200)}" r="${r}" fill="#fff" opacity="${f(.45 + rnd() * .5)}"/>`;
}).join('')));

semente = 9;
EFEITOS.bolhas = svg(220, 220, emenda(220, 220, Array.from({ length: 9 }, () => {
  const x = f(rnd() * 220), y = f(rnd() * 220), r = f(4 + rnd() * 10);
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#bolha)" stroke="#bfefff" stroke-opacity=".7" stroke-width="1"/>
    <ellipse cx="${f(x - r * .35)}" cy="${f(y - r * .4)}" rx="${f(r * .3)}" ry="${f(r * .18)}" fill="#fff" opacity=".8" transform="rotate(-35 ${f(x - r * .35)} ${f(y - r * .4)})"/>`;
}).join('')), '<radialGradient id="bolha" cx=".5" cy=".5" r=".5"><stop offset=".6" stop-color="#9ee7ff" stop-opacity="0"/><stop offset="1" stop-color="#ff9cf0" stop-opacity=".35"/></radialGradient>');

semente = 13;
EFEITOS.confete = svg(200, 200, emenda(200, 200, Array.from({ length: 26 }, () => {
  const cores = ['#ff5fd2', '#ffd84d', '#5cf2a8', '#58b4ff', '#ff7a45', '#b47bff'];
  const x = f(rnd() * 200), y = f(rnd() * 200), c = cores[Math.floor(rnd() * cores.length)];
  return rnd() < .7 ? `<rect x="${x}" y="${y}" width="${f(3 + rnd() * 4)}" height="${f(1.6 + rnd() * 2)}" rx=".6" fill="${c}" transform="rotate(${f(rnd() * 180)} ${x} ${y})"/>`
    : `<circle cx="${x}" cy="${y}" r="${f(1.4 + rnd())}" fill="${c}"/>`;
}).join('')));

semente = 17;
EFEITOS.estrelas = svg(240, 240, emenda(240, 240, Array.from({ length: 40 }, () => {
  const r = f(.4 + rnd() * 1.1);
  return `<circle cx="${f(rnd() * 240)}" cy="${f(rnd() * 240)}" r="${r}" fill="${rnd() < .2 ? '#cfe3ff' : '#fff'}" opacity="${f(.35 + rnd() * .6)}"/>`;
}).join('')));

semente = 21;
EFEITOS.vagalumes = svg(220, 220, emenda(220, 220, Array.from({ length: 12 }, () => {
  const x = f(rnd() * 220), y = f(rnd() * 220);
  return `<circle cx="${x}" cy="${y}" r="7" fill="url(#luz)"/><circle cx="${x}" cy="${y}" r="1.6" fill="#fffbd1"/>`;
}).join('')), '<radialGradient id="luz"><stop offset="0" stop-color="#fff59d" stop-opacity=".95"/><stop offset=".4" stop-color="#ffd54f" stop-opacity=".45"/><stop offset="1" stop-color="#ffd54f" stop-opacity="0"/></radialGradient>');

semente = 25;
const petala = (x, y, a, s, c) => `<path transform="translate(${x} ${y}) rotate(${a}) scale(${s})" d="M0 0 C3 -4 9 -4 10 0 C9 2 6 4 3 4 L2 2 L0 3Z" fill="${c}" opacity=".9"/>`;
EFEITOS.sakura = svg(220, 220, emenda(220, 220, Array.from({ length: 14 }, () =>
  petala(f(rnd() * 220), f(rnd() * 220), f(rnd() * 360), f(.8 + rnd() * .7), rnd() < .5 ? '#ffb7d5' : '#ffd6e7')).join('')));

semente = 29;
const LETRAS = 'アイウエオカキクケコサシスセソ0123456789ﾊﾋﾌﾍﾎ';
EFEITOS.matrix = svg(160, 240, Array.from({ length: 10 }, (_, col) => {
  const x = 8 + col * 16, inicio = Math.floor(rnd() * 15);
  return Array.from({ length: 15 }, (_, i) => {
    const pos = (i + 15 - inicio) % 15, brilho = pos === 14 ? '#e8ffe8' : '#22e06b';
    return `<text x="${x}" y="${12 + i * 16}" font-family="monospace" font-size="13" fill="${brilho}" opacity="${f(.15 + (pos / 14) * .8)}" text-anchor="middle">${LETRAS[Math.floor(rnd() * LETRAS.length)]}</text>`;
  }).join('');
}).join(''));

// ── Segunda leva (temas de "pacote de efeitos" e "fundo animado": neon, Y2K, geométrico, retícula) ──
// Ondas de neon: três fitas onduladas que emendam na horizontal (a onda fecha um ciclo inteiro em 240)
const onda = (y, amp, cor, larg) => {
  let d = `M-10 ${y}`;
  for (let x = -10; x <= 250; x += 5) d += ` L${x} ${f(y + Math.sin((x / 240) * Math.PI * 2) * amp)}`;
  return `<path d="${d}" stroke="${cor}" stroke-width="${larg}" fill="none" stroke-linecap="round"/>`;
};
EFEITOS['neon-ondas'] = svg(240, 120, `<g filter="url(#brilho)">${onda(30, 12, '#2bf0ff', 2.2)}${onda(62, 16, '#ff3df2', 2.2)}${onda(92, 10, '#8b5cf6', 2)}</g>
  ${onda(30, 12, '#e6fdff', .8)}${onda(62, 16, '#ffe1fd', .8)}${onda(92, 10, '#ede4ff', .8)}`, '<filter id="brilho" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>');

// Brilhos Y2K: estrelas de 4 pontas e "+" espalhados, em cores de cromo e rosa/azul
semente = 37;
const estrela4 = (x, y, r, cor) => `<path transform="translate(${x} ${y})" d="M0 ${-r} C${f(r * .15)} ${f(-r * .15)} ${f(r * .15)} ${f(-r * .15)} ${r} 0 C${f(r * .15)} ${f(r * .15)} ${f(r * .15)} ${f(r * .15)} 0 ${r} C${f(-r * .15)} ${f(r * .15)} ${f(-r * .15)} ${f(r * .15)} ${-r} 0 C${f(-r * .15)} ${f(-r * .15)} ${f(-r * .15)} ${f(-r * .15)} 0 ${-r}Z" fill="${cor}"/>`;
EFEITOS.y2k = svg(220, 220, emenda(220, 220, Array.from({ length: 16 }, () => {
  const x = f(rnd() * 220), y = f(rnd() * 220), cores = ['#ffffff', '#ffb3f5', '#a5f3ff', '#d9c2ff', '#fff3a6'], c = cores[Math.floor(rnd() * cores.length)];
  return rnd() < .75 ? estrela4(x, y, f(3 + rnd() * 6), c) : `<path d="M${x - 3} ${y} h6 M${x} ${y - 3} v6" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>`;
}).join('')));

// Padrão geométrico: losangos e triângulos em linhas finas (tile 80×80, emenda sozinho)
EFEITOS.padrao = svg(80, 80, `<g fill="none" stroke-width="1.4" stroke-linejoin="round">
  <path d="M40 8 L56 24 L40 40 L24 24Z" stroke="#7c5cff" opacity=".8"/><path d="M0 48 L16 64 L0 80 M80 48 L64 64 L80 80" stroke="#22d3ee" opacity=".7"/>
  <path d="M8 8 L18 8 L13 17Z M62 52 L72 52 L67 61Z" stroke="#ff4fd8" opacity=".75"/><circle cx="40" cy="64" r="5" stroke="#f2c94c" opacity=".7"/></g>`);

// Retícula (halftone): grade de pontos; o CSS faz uma onda de luz passar por cima
EFEITOS.pontilhado = svg(24, 24, '<circle cx="12" cy="12" r="2.1" fill="#ffffff"/>');

for (const [id, conteudo] of Object.entries(EFEITOS)) fs.writeFileSync(path.join(DESTINO, `${id}.svg`), conteudo);
console.log(`${Object.keys(EFEITOS).length} texturas em ${DESTINO}`);
