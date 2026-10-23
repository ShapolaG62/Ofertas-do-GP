// Prints do site para o motion graphics (video/motion.html) → video/telas-motion/*.png
// Uso: node video/capturar-motion.js <endereço do site> <token de sessão de um usuário consumidor>
// Use um banco de TESTE (cópia), nunca o do site no ar: o print fica logado com o usuário do token.
const path = require('path');
const fs = require('fs');
const { abrirNavegador } = require('./cdp');

const SITE = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const TOKEN = process.argv[3] || '';
const DIR = path.join(__dirname, 'telas-motion');
const FOTOS = "new Promise(ok => { const t = Date.now(); const f = () => { const imgs = [...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }); if (imgs.every(i => i.complete) || Date.now() - t > 12000) ok(imgs.length); else setTimeout(f, 300); }; f(); })";
// Some com anúncios, avisos e banners que atrapalham o print
const LIMPAR = `document.querySelectorAll('.ad-slot, #expired-notice, .app-aviso, .aviso-entrada, dialog[open]:not(#filters-dialog):not([data-manter]), [aria-label="Aviso de cookies"]').forEach(e => e.tagName === 'DIALOG' ? e.close() : e.remove()); document.querySelectorAll('#comu-card, #comu-sug').forEach(e => e.style.display = "none"); 1`;
const espera = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(DIR, { recursive: true });

(async () => {
  const b = await abrirNavegador({ largura: 1600, altura: 900, porta: 9337 });
  const tela = (w, h, celular, escala = 1) => b.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: escala, mobile: celular });
  const tema = async t => { await b.js(`OfertouTema.definir('${t}'); 1`); await espera(400); };
  const fotos = async () => { await b.js(FOTOS); await espera(2500); await b.js(FOTOS); };
  const print = nome => b.print(path.join(DIR, `${nome}.png`));
  const rolarAte = (sel, folga) => b.js(`window.scrollTo(0, document.querySelector('${sel}').getBoundingClientRect().top + scrollY - ${folga}); 1`);
  try {
    await b.cmd('Network.enable');
    await b.cmd('Network.clearBrowserCookies');
    await b.cookie('ofertou_cookies', 'nao', SITE); // sem o aviso de cookies nos prints
    // Cadastro rápido (sem login), no celular
    await tela(390, 844, true, 2);
    await b.ir(`${SITE}/conta`, 2500);
    await tema('escuro');
    await b.js(`[...document.querySelectorAll('button, a')].find(e => /cadastro r[aá]pido/i.test(e.textContent))?.click(); 1`);
    await espera(800); await print('cel-cadastro');
    if (TOKEN) await b.cookie('gp_user', TOKEN, SITE);

    for (const t of ['escuro', 'claro']) {
      // Computador
      await tela(1600, 900, false, 1);
      await b.ir(`${SITE}/`, 3500); await tema(t); await b.js(LIMPAR); await fotos(); await b.js(LIMPAR);
      await print(`pc-inicio-${t}`);
      await rolarAte('#ofertas', 80); await espera(900); await fotos(); await b.js(LIMPAR);
      await print(`pc-grade-${t}`);
      // Celular
      await tela(390, 844, true, 2);
      await b.ir(`${SITE}/`, 3500); await tema(t); await b.js(LIMPAR); await fotos(); await b.js(LIMPAR);
      await print(`cel-inicio-${t}`);
      await rolarAte('#ofertas', 60); await espera(900); await fotos(); await b.js(LIMPAR);
      await print(`cel-grade-${t}`);
    }
    // Celular (escuro): filtros e alertas no WhatsApp
    await tela(390, 844, true, 2);
    await b.ir(`${SITE}/`, 3500); await tema('escuro'); await b.js(LIMPAR);
    await rolarAte('#ofertas', 60); await espera(600); await fotos(); await b.js(LIMPAR);
    await b.js(`document.querySelector('#open-filters')?.click(); 1`); await espera(1200);
    await print('cel-filtros');
    await b.ir(`${SITE}/?alertas=1`, 3500); await tema('escuro'); await espera(1500);
    await print('cel-alertas');
    // Banner de instalar o app
    await b.ir(`${SITE}/`, 6000); await tema('escuro'); await fotos();
    await b.js(`document.querySelectorAll('.ad-slot, #expired-notice').forEach(e => e.remove()); document.querySelectorAll('#comu-card, #comu-sug').forEach(e => e.style.display = 'none'); 1`);
    await print('cel-app');
    // Busca no computador
    await tela(1600, 900, false, 1);
    await b.ir(`${SITE}/?q=air+fryer`, 3500); await tema('escuro'); await b.js(LIMPAR);
    await rolarAte('#ofertas', 80); await espera(900); await fotos(); await b.js(LIMPAR);
    await print('pc-busca');
    console.log('prints prontos em', DIR, fs.readdirSync(DIR).join(' '));
  } finally { await b.fechar(); }
})().catch(e => { console.error(e); process.exit(1); });
