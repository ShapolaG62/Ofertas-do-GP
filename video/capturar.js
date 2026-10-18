// Tira os prints do site usados no vídeo de apresentação (video/telas/*.png).
// Uso: node video/capturar.js <endereço do site> <token de sessão de um usuário consumidor>
const path = require('path');
const fs = require('fs');
const { abrirNavegador } = require('./cdp');

const SITE = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const TOKEN = process.argv[3] || '';
const DIR = path.join(__dirname, 'telas');
// Espera as fotos visíveis terminarem de carregar
const FOTOS = "new Promise(ok => { const t = Date.now(); const f = () => { const imgs = [...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }); if (imgs.every(i => i.complete) || Date.now() - t > 12000) ok(imgs.length); else setTimeout(f, 300); }; f(); })";
fs.mkdirSync(DIR, { recursive: true });

(async () => {
  const b = await abrirNavegador({ largura: 1600, altura: 900, porta: 9334 });
  try {
    await b.cmd('Network.enable');
    // 1. Página de entrada (sem login)
    await b.ir(`${SITE}/conta`, 2500);
    await b.print(path.join(DIR, 'entrada.png'));
    // Daqui em diante: logado como consumidor
    if (TOKEN) await b.cookie('gp_user', TOKEN, SITE);
    // 2. Ofertas (topo e grade)
    await b.ir(`${SITE}/`, 4000);
    await b.js(`document.querySelector('#expired-notice')?.remove(); document.querySelectorAll('.ad-slot').forEach(e => e.remove()); 1`);
    await new Promise(r => setTimeout(r, 2500)); await b.js(FOTOS); await new Promise(r => setTimeout(r, 3000)); await b.js(FOTOS); await b.print(path.join(DIR, 'inicio.png'));
    await b.js(`window.scrollTo(0, document.querySelector('#ofertas').getBoundingClientRect().top + scrollY - 80); 1`);
    await new Promise(r => setTimeout(r, 1200)); await b.js(FOTOS); await new Promise(r => setTimeout(r, 3000)); await b.js(FOTOS);
    await b.print(path.join(DIR, 'grade.png'));
    // 3. Busca
    await b.ir(`${SITE}/?q=air+fryer`, 3500);
    await b.js(`document.querySelectorAll('.ad-slot').forEach(e => e.remove()); window.scrollTo(0, document.querySelector('#ofertas').getBoundingClientRect().top + scrollY - 80); 1`);
    await new Promise(r => setTimeout(r, 1200)); await b.js(FOTOS); await new Promise(r => setTimeout(r, 3000)); await b.js(FOTOS);
    await b.print(path.join(DIR, 'busca.png'));
    // 4. Categoria com tipos
    await b.ir(`${SITE}/?cat=celulares&ordem=desconto`, 3500);
    await b.js(`document.querySelectorAll('.ad-slot').forEach(e => e.remove()); window.scrollTo(0, document.querySelector('#ofertas').getBoundingClientRect().top + scrollY - 80); 1`);
    await new Promise(r => setTimeout(r, 1200)); await b.js(FOTOS); await new Promise(r => setTimeout(r, 3000)); await b.js(FOTOS);
    await b.print(path.join(DIR, 'categoria.png'));
    // 5. Suporte no painel de Mensagens
    await b.ir(`${SITE}/?sac=1`, 4000);
    await b.print(path.join(DIR, 'suporte.png'));
    // 6. Celular
    await b.tela({ largura: 390, altura: 844, celular: true });
    await b.ir(`${SITE}/`, 4000);
    await b.js(`document.querySelectorAll('.ad-slot').forEach(e => e.remove()); 1`);
    await b.js(FOTOS); await new Promise(r => setTimeout(r, 3000)); await b.js(FOTOS); await b.print(path.join(DIR, 'celular.png'));
    await b.js(`window.scrollTo(0, document.querySelector('#ofertas').getBoundingClientRect().top + scrollY - 60); 1`);
    await new Promise(r => setTimeout(r, 1200)); await b.js(FOTOS); await new Promise(r => setTimeout(r, 3000)); await b.js(FOTOS);
    await b.print(path.join(DIR, 'celular-grade.png'));
    console.log('prints prontos em', DIR, fs.readdirSync(DIR));
  } finally { await b.fechar(); }
})().catch(e => { console.error(e); process.exit(1); });
