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

for (const [id, conteudo] of Object.entries(EFEITOS)) fs.writeFileSync(path.join(DESTINO, `${id}.svg`), conteudo);
console.log(`${Object.keys(EFEITOS).length} texturas em ${DESTINO}`);
