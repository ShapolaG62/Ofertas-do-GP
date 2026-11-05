// Prints extras do motion graphics (cupom, painel do afiliado, comissão e membros) → video/telas-motion/*.png
// Uso: node video/capturar-afiliado.js <endereço do site> <token de sessão de um cliente da ferramenta>
// Use um banco de TESTE (cópia), nunca o do site no ar: os valores que aparecem são de exemplo.
const path = require('path');
const fs = require('fs');
const { abrirNavegador } = require('./cdp');

const SITE = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const CLIENTE = process.argv[3] || '';
const DIR = path.join(__dirname, 'telas-motion');
const espera = ms => new Promise(r => setTimeout(r, ms));
const LIMPAR = `document.querySelectorAll('.ad-slot, .app-aviso, .aviso-entrada, [aria-label="Aviso de cookies"], .instalar-app, .rodape-legal, .chat-flut, [class*="chatf-botao"], .ex-lembrete, #toast').forEach(e => e.remove()); 1`;
const FOTOS = "new Promise(ok => { const t = Date.now(); const f = () => { const i = [...document.images].filter(x => { const r = x.getBoundingClientRect(); return r.width && r.bottom > 0 && r.top < innerHeight; }); if (i.every(x => x.complete) || Date.now() - t > 8000) ok(1); else setTimeout(f, 300); }; f(); })";
fs.mkdirSync(DIR, { recursive: true });

(async () => {
  const b = await abrirNavegador({ largura: 1600, altura: 900, porta: 9376 });
  const tela = (w, h, celular, escala = 1) => b.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: escala, mobile: celular });
  const print = nome => b.print(path.join(DIR, `${nome}.png`));
  try {
    await b.cmd('Network.enable');
    await b.cmd('Network.clearBrowserCookies');
    await b.cookie('ofertou_cookies', 'nao', SITE);
    // Ofertas com cupom (celular)
    await tela(390, 844, true, 2);
    await b.ir(`${SITE}/?cupom=1`, 3500);
    await b.js(`OfertouTema.definir('escuro'); 1`); await espera(400);
    await b.js(LIMPAR);
    await b.js(`document.querySelector('#grid').scrollIntoView({ block: 'start' }); scrollBy(0, -120); 1`); await espera(600);
    await b.js(FOTOS); await b.js(LIMPAR);
    await print('cel-cupom');

    await b.cookie('gp_cliente', CLIENTE, SITE);
    const abrirAba = async aba => {
      await b.js(`document.querySelector('.tabs-line [data-tab="${aba}"]').click(); 1`); await espera(1300);
      await b.js(`scrollTo(0, 0); 1`); await b.js(LIMPAR);
    };
    await tela(1600, 900, false);
    await b.ir(`${SITE}/cliente`, 4000); await b.js(`OfertouTema.definir('escuro'); 1`); await espera(500); await b.js(LIMPAR);
    await print('pc-painel');
    await abrirAba('comissao'); await print('pc-comissao');
    await abrirAba('membros'); await print('pc-membros');
    await tela(390, 844, true, 2);
    await b.ir('about:blank', 50); await b.ir(`${SITE}/cliente`, 3500); await b.js(LIMPAR);
    await abrirAba('comissao');
    await b.js(`document.querySelector('[data-body="comissao"]').scrollIntoView({ block: 'start' }); scrollBy(0, -70); 1`); await espera(400);
    await print('cel-comissao');
    await abrirAba('membros');
    await print('cel-membros');
    console.log('prints prontos em', DIR);
  } finally { await b.fechar(); }
})().catch(e => { console.error(e); process.exit(1); });
