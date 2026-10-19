// Gera as molduras ilustradas (SVG) da temporada e das datas comemorativas em public/images/molduras/.
// Uso: node video/molduras/gerar.js
// Desenho em 140×140: a foto ocupa o quadrado 20..120 (100 unidades), então a moldura passa 20% para fora da foto
// em cada lado (no CSS: inset de -20% do tamanho do avatar). O aro fica sobre a borda da foto e os enfeites, nos cantos.
const fs = require('fs');
const path = require('path');
const DESTINO = path.join(__dirname, '..', '..', 'public', 'images', 'molduras');
fs.mkdirSync(DESTINO, { recursive: true });

// Texturas: grão fino (metal, papel), pedra/nuvem (turbulência larga) e brilho
const DEFS = `
  <filter id="grao" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="7"/>
    <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 -.25"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="pedra" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="4" seed="3"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -.55"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="sombra" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-color="#000" flood-opacity=".55"/>
  </filter>`;

// Aro com chanfro: borda escura por fora, o material no meio, luz por dentro, e a textura por cima
function aro(material, { textura = 'grao', forca = .35, escuro = 'rgba(0,0,0,.55)', claro = 'rgba(255,255,255,.55)' } = {}) {
  return `
  <rect x="18" y="18" width="104" height="104" rx="22" fill="none" stroke="${escuro}" stroke-width="12"/>
  <rect x="18" y="18" width="104" height="104" rx="22" fill="none" stroke="${material}" stroke-width="9.5"/>
  <rect x="18" y="18" width="104" height="104" rx="22" fill="none" stroke="#fff" stroke-width="9.5" filter="url(#${textura})" opacity="${forca}"/>
  <rect x="22.6" y="22.6" width="94.8" height="94.8" rx="18" fill="none" stroke="${claro}" stroke-width=".9"/>
  <rect x="13.4" y="13.4" width="113.2" height="113.2" rx="26.5" fill="none" stroke="${claro}" stroke-width=".6" opacity=".6"/>`;
}
const svg = (defs, corpo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" width="140" height="140"><defs>${DEFS}${defs}</defs><g filter="url(#sombra)">${corpo}</g></svg>\n`;

// Folha (losango curvo) centrada em (x, y), girada
const folha = (x, y, ang, cor, tam = 1) => `<g transform="translate(${x} ${y}) rotate(${ang}) scale(${tam})"><path d="M0 0 C3 -3 9 -3 12 0 C9 3 3 3 0 0Z" fill="${cor}"/><path d="M0.5 0 L11 0" stroke="rgba(0,0,0,.25)" stroke-width=".5"/></g>`;
// Ramo de louro na borda de baixo, por fora da foto (lado: 1 = esquerdo, -1 = direito)
function louro(lado) {
  let s = '';
  for (let i = 0; i < 6; i++) {
    const x = 70 - lado * (14 + i * 7.6), y = 128.5 - Math.pow(i, 1.55) * 1.9;
    const base = lado === 1 ? 180 + i * 7 : -i * 7;
    s += folha(x, y, base - 28, 'url(#verde)', .95) + folha(x, y, base + 28, 'url(#verde)', .95);
  }
  return `<path d="M${70 - lado * 10} 129 Q ${70 - lado * 34} 131 ${70 - lado * 54} 113" stroke="#0a6b3a" stroke-width="1.2" fill="none"/>` + s;
}
// Estrela de 5 pontas
function estrela(cx, cy, r, cor, contorno = 'none') {
  const p = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; p.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`); }
  return `<polygon points="${p.join(' ')}" fill="${cor}" stroke="${contorno}" stroke-width=".8" stroke-linejoin="round"/>`;
}
// Placa com texto (embaixo, no centro)
const placa = (texto, fundo, cor, borda, largura = 38, y = 121) => `
  <rect x="${70 - largura / 2}" y="${y - 7}" width="${largura}" height="14" rx="7" fill="${fundo}" stroke="${borda}" stroke-width="1.2"/>
  <text x="70" y="${y + 3.4}" text-anchor="middle" font-family="Figtree, Arial, sans-serif" font-weight="800" font-size="9.5" fill="${cor}" letter-spacing=".6">${texto}</text>`;
// Explosão de fogos
function fogos(cx, cy, r, cores) {
  let s = '';
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, c = cores[i % cores.length];
    s += `<line x1="${(cx + r * .35 * Math.cos(a)).toFixed(1)}" y1="${(cy + r * .35 * Math.sin(a)).toFixed(1)}" x2="${(cx + r * Math.cos(a)).toFixed(1)}" y2="${(cy + r * Math.sin(a)).toFixed(1)}" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>`;
    s += `<circle cx="${(cx + r * 1.18 * Math.cos(a)).toFixed(1)}" cy="${(cy + r * 1.18 * Math.sin(a)).toFixed(1)}" r=".9" fill="${c}"/>`;
  }
  return s + `<circle cx="${cx}" cy="${cy}" r="1.6" fill="#fff"/>`;
}

const MOLDURAS = {
  // 1ª Temporada: aro de ouro trabalhado, ramos de louro, estrela e a placa "T1"
  'temporada-1': svg(`
    <linearGradient id="ouro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a5200"/><stop offset=".25" stop-color="#ffe69a"/><stop offset=".5" stop-color="#c8920e"/><stop offset=".75" stop-color="#fff1b8"/><stop offset="1" stop-color="#8a5f00"/></linearGradient>
    <linearGradient id="verde" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3be08f"/><stop offset="1" stop-color="#0a6b3a"/></linearGradient>`,
  `${aro('url(#ouro)', { forca: .45 })}
    <rect x="18" y="18" width="104" height="104" rx="22" fill="none" stroke="#5a3d00" stroke-width=".7" stroke-dasharray="1.2 3.2" opacity=".7"/>
    ${louro(1)}
    ${louro(-1)}
    ${estrela(70, 13, 8.5, 'url(#ouro)', '#6b4700')}
    ${placa('T1', '#0d1116', '#ffd75e', 'url(#ouro)', 30, 124)}`),

  // Ano Novo: aro azul-noite com pontinhos de luz, fogos nos cantos de cima e placa "2027"
  'ano-novo-2027': svg(`
    <linearGradient id="noite" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f1430"/><stop offset=".5" stop-color="#2a3170"/><stop offset="1" stop-color="#0f1430"/></linearGradient>
    <linearGradient id="dourado" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8860b"/><stop offset=".5" stop-color="#ffe08a"/><stop offset="1" stop-color="#b8860b"/></linearGradient>`,
  `${aro('url(#noite)', { forca: .25 })}
    <rect x="18" y="18" width="104" height="104" rx="22" fill="none" stroke="#ffe08a" stroke-width="1.6" stroke-dasharray=".1 6.4" stroke-linecap="round"/>
    <rect x="13.4" y="13.4" width="113.2" height="113.2" rx="26.5" fill="none" stroke="url(#dourado)" stroke-width="1.4"/>
    ${fogos(20, 18, 11, ['#ffd75e', '#ff6fb5', '#7fe0ff'])}
    ${fogos(121, 20, 9, ['#7fe0ff', '#ffd75e', '#b18cff'])}
    ${placa('2027', '#0f1430', '#ffe08a', 'url(#dourado)', 40, 123)}`),

  // Carnaval: aro arlequim (losangos coloridos), máscara no canto, plumas e confete
  'carnaval-2027': svg(`
    <pattern id="arlequim" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#9b2cff"/><rect x="6" width="6" height="6" fill="#ffd60a"/><rect y="6" width="6" height="6" fill="#00c853"/><rect x="6" y="6" width="6" height="6" fill="#ff2d95"/></pattern>`,
  `${aro('url(#arlequim)', { forca: .2 })}
    <g transform="translate(14 104) rotate(-35)"><path d="M0 0 C-4 -10 -2 -22 2 -30 C4 -20 5 -10 0 0Z" fill="#ff2d95"/><path d="M0 0 C-1 -8 1 -16 1 -22" stroke="#fff" stroke-width=".6" fill="none"/></g>
    <g transform="translate(20 110) rotate(-10)"><path d="M0 0 C-3 -9 -1 -19 3 -26 C4 -17 4 -9 0 0Z" fill="#00b0ff"/></g>
    <g transform="translate(103 4)">
      <path d="M2 10 C6 2 16 2 19 8 C22 2 32 2 36 10 C33 20 24 22 19 16 C14 22 5 20 2 10Z" fill="#ffd60a" stroke="#6b3fd4" stroke-width="1.4"/>
      <ellipse cx="11.5" cy="10.5" rx="4" ry="2.6" fill="#0d1116"/><ellipse cx="26.5" cy="10.5" rx="4" ry="2.6" fill="#0d1116"/>
      <path d="M36 10 L44 4" stroke="#6b3fd4" stroke-width="1.4"/></g>
    ${[[30, 9, '#ff2d95'], [52, 10, '#00c853'], [88, 9, '#00b0ff'], [128, 60, '#ffd60a'], [129, 92, '#9b2cff'], [10, 70, '#00c853'], [11, 40, '#ffd60a'], [100, 131, '#ff2d95'], [44, 131, '#00b0ff']]
      .map(([x, y, c], i) => `<rect x="${x}" y="${y}" width="3.2" height="1.8" rx=".5" fill="${c}" transform="rotate(${i * 37} ${x} ${y})"/>`).join('')}`),

  // Dia do Consumidor: aro verde com costura, etiqueta de preço e sacola
  'consumidor-2027': svg(`
    <linearGradient id="loja" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a7a43"/><stop offset=".5" stop-color="#2bd37f"/><stop offset="1" stop-color="#0a7a43"/></linearGradient>`,
  `${aro('url(#loja)', { forca: .3 })}
    <rect x="18" y="18" width="104" height="104" rx="22" fill="none" stroke="#eafff3" stroke-width=".9" stroke-dasharray="3 2.4"/>
    <g transform="translate(6 8) rotate(-18 15 10)"><path d="M6 2 H28 V20 H6 L0 11Z" fill="#ffd60a" stroke="#7a5d00" stroke-width="1.2"/><circle cx="5.5" cy="11" r="1.8" fill="#7a5d00"/>
      <text x="17.5" y="15" text-anchor="middle" font-family="Figtree, Arial, sans-serif" font-weight="800" font-size="9" fill="#5a4300">%</text></g>
    <g transform="translate(104 98)"><path d="M3 9 H29 L27 33 H5Z" fill="#1d5fd6" stroke="#0d2f6b" stroke-width="1.2"/><path d="M10 12 V7 C10 1 22 1 22 7 V12" fill="none" stroke="#0d2f6b" stroke-width="1.8"/>
      <path d="M5 16 H27" stroke="#5b9bff" stroke-width="1"/></g>`),

  // Páscoa: aro pastel como ovo pintado (listras onduladas), orelhas de coelho e ovos
  'pascoa-2027': svg(`
    <pattern id="ovo" width="14" height="10" patternUnits="userSpaceOnUse">
      <rect width="14" height="10" fill="#ffd1e3"/><path d="M0 3 Q3.5 0 7 3 T14 3" stroke="#c9b6ff" stroke-width="2" fill="none"/><path d="M0 7.5 Q3.5 4.5 7 7.5 T14 7.5" stroke="#b6f0d0" stroke-width="2" fill="none"/>
      <circle cx="10.5" cy="5.2" r=".9" fill="#fff3a6"/></pattern>`,
  `${aro('url(#ovo)', { forca: .2, escuro: 'rgba(120,70,120,.45)' })}
    <g transform="translate(92 -2)"><ellipse cx="9" cy="16" rx="5.5" ry="15" fill="#fff" stroke="#e9b8cc" stroke-width="1.2" transform="rotate(-14 9 16)"/><ellipse cx="9" cy="17" rx="2.6" ry="10" fill="#ffc2d8" transform="rotate(-14 9 17)"/>
      <ellipse cx="24" cy="17" rx="5.5" ry="15" fill="#fff" stroke="#e9b8cc" stroke-width="1.2" transform="rotate(12 24 17)"/><ellipse cx="24" cy="18" rx="2.6" ry="10" fill="#ffc2d8" transform="rotate(12 24 18)"/></g>
    <g transform="translate(6 104)"><ellipse cx="10" cy="14" rx="9" ry="12" fill="#c9b6ff" stroke="#7d5fd6" stroke-width="1.1"/><path d="M2 12 Q6 9 10 12 T18 12" stroke="#fff" stroke-width="1.6" fill="none"/><path d="M2.5 17 Q6 14 10 17 T17.5 17" stroke="#fff3a6" stroke-width="1.6" fill="none"/></g>
    <g transform="translate(110 108)"><ellipse cx="9" cy="12" rx="8" ry="10.5" fill="#b6f0d0" stroke="#3aa877" stroke-width="1.1"/><circle cx="6" cy="9" r="1.5" fill="#ffd1e3"/><circle cx="12" cy="13" r="1.5" fill="#ffd1e3"/><circle cx="7" cy="16" r="1.2" fill="#fff3a6"/></g>`),

  // Dia da Terra: aro de "pedra" verde-azulada com textura, ramo de folhas e um pequeno planeta
  'terra-2027': svg(`
    <linearGradient id="mar" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b6e3a"/><stop offset=".45" stop-color="#1e88e5"/><stop offset="1" stop-color="#3ac47d"/></linearGradient>
    <radialGradient id="globo" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#7fd0ff"/><stop offset="1" stop-color="#0d5aa7"/></radialGradient>`,
  `${aro('url(#mar)', { textura: 'pedra', forca: .55 })}
    <path d="M10 60 C6 40 12 22 30 12" stroke="#2e7d32" stroke-width="1.6" fill="none"/>
    ${[[9, 56, -100], [8, 45, -80], [11, 35, -60], [16, 26, -40], [23, 18, -25], [6, 50, 160], [8, 39, 150], [13, 29, 130]].map(([x, y, a]) => folha(x, y, a, '#43a047', 1.1)).join('')}
    <g transform="translate(108 106)"><circle cx="12" cy="12" r="11" fill="url(#globo)" stroke="#0a3d73" stroke-width="1"/>
      <path d="M5 8 C8 5 12 7 11 10 C10 13 6 12 5 8Z M13 14 C16 12 20 14 19 18 C16 21 13 18 13 14Z M14 4 C17 4 19 6 18 7 C16 8 14 6 14 4Z" fill="#43a047"/></g>`),

  // Dia das Mães: aro rosa com renda (festonê), flores e um coração
  'maes-2027': svg(`
    <linearGradient id="rosa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d63c74"/><stop offset=".5" stop-color="#ff9cc2"/><stop offset="1" stop-color="#d63c74"/></linearGradient>`,
  `<rect x="12.5" y="12.5" width="115" height="115" rx="27" fill="none" stroke="#fff" stroke-width="3.2" stroke-dasharray=".1 4.2" stroke-linecap="round" opacity=".95"/>
    ${aro('url(#rosa)', { forca: .25 })}
    <rect x="18" y="18" width="104" height="104" rx="22" fill="none" stroke="#fff" stroke-width=".8" stroke-dasharray="1 2.2" opacity=".8"/>
    ${[[18, 18, 1.15], [8, 33, .8], [33, 8, .8]].map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-5.5" rx="3.6" ry="5.6" fill="#ff7eb3" stroke="#b02a62" stroke-width=".7" transform="rotate(${a})"/>`).join('')}<circle r="2.6" fill="#ffd60a"/></g>`).join('')}
    ${folha(26, 30, 40, '#3aa877', 1)}${folha(30, 24, 10, '#3aa877', .9)}
    <path d="M112 112 C112 106 120 104 122 110 C124 104 132 106 132 112 C132 119 122 125 122 125 C122 125 112 119 112 112Z" fill="#ff4f8b" stroke="#a51d55" stroke-width="1.2"/>
    <path d="M115 110 C116 108 118 107.5 119 108.5" stroke="#fff" stroke-width="1.1" fill="none" stroke-linecap="round"/>`),

  // Halloween: aro de pedra roxa escura, teia de aranha, abóbora e morcegos
  'halloween-2027': svg(`
    <linearGradient id="bruxa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a0f3f"/><stop offset=".5" stop-color="#6a2fa0"/><stop offset="1" stop-color="#1c0a2b"/></linearGradient>
    <radialGradient id="abobora" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#d9590b"/></radialGradient>`,
  `${aro('url(#bruxa)', { textura: 'pedra', forca: .6, claro: 'rgba(255,170,90,.5)' })}
    <g stroke="#e8e8e8" stroke-width=".7" fill="none" opacity=".9">
      <path d="M4 4 L34 6 M4 4 L30 22 M4 4 L14 30 M4 4 L6 36"/>
      <path d="M13 5 Q11 10 12 15 Q8 13 5 13"/><path d="M22 6 Q19 13 20 20 Q14 18 9 21 Q7 17 5 22"/><path d="M31 6 Q27 16 27 22 Q19 22 13 29 Q9 26 6 32"/></g>
    <path d="M24 26 L24 34" stroke="#e8e8e8" stroke-width=".5"/><circle cx="24" cy="36" r="2.4" fill="#111"/><circle cx="24" cy="33.6" r="1.6" fill="#111"/>
    <g transform="translate(104 104)"><path d="M14 4 C15 0 18 0 19 1" stroke="#3a7d1e" stroke-width="2" fill="none"/>
      <ellipse cx="9" cy="15" rx="7" ry="10" fill="url(#abobora)"/><ellipse cx="23" cy="15" rx="7" ry="10" fill="url(#abobora)"/><ellipse cx="16" cy="15" rx="8" ry="11" fill="url(#abobora)" stroke="#a8430a" stroke-width=".8"/>
      <path d="M10 12 L13 9 L14 13Z M18 13 L19 9 L22 12Z" fill="#2a0f00"/><path d="M9 18 Q16 25 23 18 L20 19 L18 17 L16 20 L14 17 L12 19Z" fill="#2a0f00"/></g>
    ${[[96, 9, 1], [118, 30, .75], [80, 4, .6]].map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 4 C3 0 6 1 8 4 C9 2 10 2 11 4 C12 2 13 2 14 4 C16 1 19 0 22 4 C19 4 17 6 16 8 C14 6 12 7 11 9 C10 7 8 6 6 8 C5 6 3 4 0 4Z" fill="#111"/>`).join('')}`),

  // Black Friday: metal escovado preto com filetes dourados, etiqueta "-%" e placa "BLACK FRIDAY"
  'black-friday-2027': svg(`
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#050505"/><stop offset=".35" stop-color="#4a4a4a"/><stop offset=".5" stop-color="#151515"/><stop offset=".7" stop-color="#3a3a3a"/><stop offset="1" stop-color="#050505"/></linearGradient>
    <linearGradient id="ouro2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6b05"/><stop offset=".5" stop-color="#ffe08a"/><stop offset="1" stop-color="#9a6b05"/></linearGradient>`,
  `${aro('url(#metal)', { forca: .5, claro: 'rgba(255,224,138,.8)' })}
    <rect x="13.4" y="13.4" width="113.2" height="113.2" rx="26.5" fill="none" stroke="url(#ouro2)" stroke-width="1.3"/>
    <g transform="translate(100 2) rotate(20 16 12)"><path d="M6 2 H32 V24 H6 L0 13Z" fill="url(#ouro2)" stroke="#5a3d00" stroke-width="1.2"/><circle cx="5.5" cy="13" r="2" fill="#0d0d0d"/>
      <text x="20" y="17.5" text-anchor="middle" font-family="Figtree, Arial, sans-serif" font-weight="900" font-size="11" fill="#0d0d0d">-%</text></g>
    ${placa('BLACK FRIDAY', '#0d0d0d', '#ffe08a', 'url(#ouro2)', 80, 124)}`),

  // Natal: aro de bengala doce (listras vermelhas e brancas), neve no alto, azevinho e bola de Natal
  'natal-2027': svg(`
    <pattern id="bengala" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="#fff"/><rect width="4.5" height="9" fill="#d32f2f"/></pattern>
    <radialGradient id="bola" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ffd27a"/><stop offset=".5" stop-color="#e0a100"/><stop offset="1" stop-color="#8a5a00"/></radialGradient>`,
  `${aro('url(#bengala)', { forca: .15 })}
    <path d="M30 13.5 C34 9 40 12 44 9.5 C48 7 54 11 60 9 C66 7 72 11 78 9.5 C84 8 90 11 96 9.5 C100 8.5 106 11 110 14 L110 17 C104 16 98 18 92 16.5 C86 15 80 18 74 16.5 C68 15 62 18 56 16.5 C50 15 44 18 38 16.5 C34 15.5 31 17 29 17Z" fill="#fff" stroke="#cfe3f0" stroke-width=".8"/>
    ${[[50, 18], [74, 18.5], [94, 18]].map(([x, y]) => `<path d="M${x} ${y} q1 4 0 6 q-1 -2 0 -6Z" fill="#e8f4ff"/>`).join('')}
    <g transform="translate(4 4)">
      <path d="M12 4 L15 9 L20 7 L19 13 L25 14 L20 18 L22 23 L16 21 L12 26 L10 20 L4 20 L8 15 L3 11 L9 10Z" fill="#2e7d32" stroke="#1b4d1e" stroke-width=".9"/>
      <path d="M26 10 L28 15 L33 14 L31 19 L36 21 L31 23 L32 28 L27 26 L24 30 L23 24 L18 23 L22 20 L19 16 L24 16Z" fill="#388e3c" stroke="#1b4d1e" stroke-width=".9"/>
      <circle cx="21" cy="21" r="3.2" fill="#d32f2f" stroke="#7f1010" stroke-width=".8"/><circle cx="25.5" cy="24" r="2.8" fill="#e53935" stroke="#7f1010" stroke-width=".8"/><circle cx="20" cy="26" r="2.5" fill="#c62828" stroke="#7f1010" stroke-width=".8"/>
      <circle cx="20" cy="20" r=".9" fill="#fff" opacity=".8"/></g>
    <g transform="translate(108 104)"><rect x="9" y="0" width="6" height="4" rx="1" fill="#b0b0b0"/><path d="M12 0 C12 -4 16 -4 16 -1" stroke="#b0b0b0" stroke-width="1" fill="none"/>
      <circle cx="12" cy="15" r="11" fill="url(#bola)" stroke="#6b4500" stroke-width=".9"/><path d="M2 13 Q12 18 22 13" stroke="#d32f2f" stroke-width="2" fill="none"/>
      <circle cx="8" cy="10" r="2.4" fill="#fff" opacity=".6"/></g>`),
};

for (const [id, conteudo] of Object.entries(MOLDURAS)) fs.writeFileSync(path.join(DESTINO, `${id}.svg`), conteudo);
console.log(`${Object.keys(MOLDURAS).length} molduras em ${DESTINO}`);
