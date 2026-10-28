// Prints do site para o vídeo tutorial (video/tutorial.html) → video/telas-tutorial/*.png (tema escuro, 1600×900)
// Uso: node video/capturar-tutorial.js <endereço> <token de consumidor> <token de cliente da ferramenta>
// Use um banco de TESTE (cópia), nunca o do site no ar.
const path = require('path');
const fs = require('fs');
const { abrirNavegador } = require('./cdp');

const SITE = (process.argv[2] || 'http://127.0.0.1:3995').replace(/\/+$/, '');
const [, , , USUARIO = '', CLIENTE = ''] = process.argv;
const DIR = path.join(__dirname, 'telas-tutorial');
const FOTOS = "new Promise(ok => { const t = Date.now(); const f = () => { const imgs = [...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }); if (imgs.every(i => i.complete) || Date.now() - t > 15000) ok(imgs.length); else setTimeout(f, 300); }; f(); })";
// Some com anúncios, avisos e janelas que atrapalham o print
const LIMPAR = `document.querySelectorAll('.ad-slot, #expired-notice, .app-aviso, .aviso-entrada, .instalar-app, [class*="instalar"], dialog[open]:not([data-manter]), [aria-label="Aviso de cookies"], .oui-fundo').forEach(e => e.tagName === 'DIALOG' ? e.close() : e.remove()); document.querySelectorAll('#comu-card, #comu-sug').forEach(e => e.style.display = 'none'); document.querySelectorAll('.rodape-legal, .site-footer, footer').forEach(e => e.remove()); 1`; // sem o rodapé legal (dados pessoais do responsável)
const espera = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(DIR, { recursive: true });

(async () => {
  const b = await abrirNavegador({ largura: 1600, altura: 900, porta: 9341 });
  const tema = async () => { await b.js(`window.OfertouTema?.definir('escuro'); 1`); await espera(400); };
  const fotos = async () => { await b.js(FOTOS); await espera(2000); await b.js(FOTOS); };
  const print = nome => b.print(path.join(DIR, `${nome}.png`));
  const rolarAte = (sel, folga) => b.js(`(() => { const e = document.querySelector('${sel}'); if (e) window.scrollTo(0, e.getBoundingClientRect().top + scrollY - ${folga}); return 1; })()`);
  const abrir = async (url, ms = 3500) => { await b.ir(url, ms); await tema(); await b.js(LIMPAR); };
  try {
    await b.cmd('Network.enable');
    await b.cmd('Network.clearBrowserCookies');
    await b.cookie('ofertou_cookies', 'nao', SITE);

    // Sem login: entrada, criar conta e planos
    await abrir(`${SITE}/conta`); await rolarAte('#entrar', 40); await espera(600); await b.js(LIMPAR);
    await print('pc-entrar');
    await abrir(`${SITE}/conta`); await rolarAte('#planos', 30); await espera(900); await b.js(LIMPAR);
    await print('pc-planos');
    await abrir(`${SITE}/anuncie`); await fotos(); await b.js(LIMPAR);
    await print('pc-anuncie');
    await abrir(`${SITE}/ajuda`); await b.js(LIMPAR);
    await print('pc-ajuda');

    // Consumidor logado: página inicial, ofertas e busca
    if (USUARIO) {
      await b.cookie('gp_user', USUARIO, SITE);
      await abrir(`${SITE}/`); await fotos(); await b.js(LIMPAR);
      await print('pc-inicio');
      await rolarAte('#ofertas', 70); await espera(900); await fotos(); await b.js(LIMPAR);
      await print('pc-ofertas');
      await abrir(`${SITE}/?q=air%20fryer`); await rolarAte('#ofertas', 70); await espera(900); await fotos(); await b.js(LIMPAR);
      await print('pc-busca');
    }
    // Cliente da ferramenta (Afiliado Pro): painel
    if (CLIENTE) {
      await b.cmd('Network.clearBrowserCookies');
      await b.cookie('ofertou_cookies', 'nao', SITE);
      await b.cookie('gp_cliente', CLIENTE, SITE);
      await abrir(`${SITE}/cliente`, 7000); await b.js(LIMPAR);
      await print('pc-cliente');
      await abrir(`${SITE}/postagens`, 4000); await fotos(); await b.js(LIMPAR);
      await print('pc-postagens');
    }
    console.log('ok', fs.readdirSync(DIR).join(', '));
  } finally { await b.fechar(); }
})().catch(e => { console.error(e); process.exit(1); });
