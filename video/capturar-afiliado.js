// Prints dos painéis para os vídeos (cupom, afiliado, comissão, membros, loja parceira e central) → video/telas-motion/*.png
// Uso: node video/capturar-afiliado.js <endereço do site> <token de sessão do administrador>
// Use um banco de TESTE (cópia), nunca o do site no ar. Os painéis abrem no modo de visualização da central:
// os dados que aparecem são os de exemplo (public/js/visualizacao.js), sem nada de cliente real.
const path = require('path');
const fs = require('fs');
const { abrirNavegador } = require('./cdp');

const SITE = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const ADMIN = process.argv[3] || '';
const DIR = path.join(__dirname, 'telas-motion');
const espera = ms => new Promise(r => setTimeout(r, ms));
const LIMPAR = `document.querySelectorAll('.ad-slot, .app-aviso, .aviso-entrada, [aria-label="Aviso de cookies"], .instalar-app, .rodape-legal, .chat-flut, [class*="chatf-botao"], .ex-lembrete, #toast').forEach(e => e.remove()); 1`;
const FOTOS = "new Promise(ok => { const t = Date.now(); const f = () => { const i = [...document.images].filter(x => { const r = x.getBoundingClientRect(); return r.width && r.bottom > 0 && r.top < innerHeight; }); if (i.every(x => x.complete) || Date.now() - t > 8000) ok(1); else setTimeout(f, 300); }; f(); })";
// Dentro do quadro visível da central: tira a faixa, troca as fotos de exemplo pelos desenhos dos produtos fictícios e limpa avisos
const NO_QUADRO = c => `(()=>{const w=[...document.querySelectorAll('iframe')].find(x=>!x.hidden).contentWindow;return (function(document,window,scrollTo,scrollBy){return ${c}})(w.document,w,w.scrollTo.bind(w),w.scrollBy.bind(w))})()`;
const AJUSTAR = `(()=>{
  [...document.querySelectorAll('[role=status]')].filter(x=>x.textContent.includes('Modo de visualização')).forEach(x=>x.remove());
  const nomes=['airfryer','fone','monitor','garrafa','tenis','relogio'];
  document.querySelectorAll('img[src*="/img/o/9000"]').forEach(i=>{const n=Number(/9000(\\d+)/.exec(i.getAttribute('src'))[1]);i.src='/images/exemplos/'+nomes[(n-1)%nomes.length]+'.svg';});
  ${LIMPAR.replace(/ 1$/, '')}
  return 1})()`;
// Tela de ofertas como quem divulga vê: sem as ferramentas do administrador
const OFERTAS = `(()=>{const s=document.createElement('style');s.textContent='.poster-only,.awa-faixa,.header-actions,.ad-slot{display:none!important}';document.head.append(s);document.querySelector('#ofertas')?.scrollIntoView({block:'start'});scrollBy(0,-90);return 1})()`;
fs.mkdirSync(DIR, { recursive: true });

(async () => {
  const b = await abrirNavegador({ largura: 1600, altura: 900, porta: 9376 });
  const tela = (w, h, celular, escala = 1) => b.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: escala, mobile: celular });
  const print = nome => b.print(path.join(DIR, `${nome}.png`));
  const area = async (id, ms = 3200) => {
    await b.js(`document.querySelector('[data-area=${id}]').click(); 1`); await espera(ms);
    await b.js(NO_QUADRO(AJUSTAR)); await espera(500); await b.js(NO_QUADRO(FOTOS));
    await b.js(LIMPAR); // o aviso de instalar o app fica na central
  };
  const abrirAba = async aba => {
    await b.js(NO_QUADRO(`(document.querySelector('.tabs-line [data-tab="${aba}"]').click(),1)`)); await espera(1300);
    await b.js(NO_QUADRO(AJUSTAR)); await b.js(NO_QUADRO(`(scrollTo(0,0),1)`)); await espera(300);
  };
  const entrar = async () => {
    await b.ir(`${SITE}/admin`, 16000); // o painel admin deixa o servidor ocupado por alguns segundos ao abrir
    await b.js(`OfertouTema.definir('escuro'); document.querySelector('[data-area=admin]')?.remove(); 1`); await espera(300);
  };
  try {
    await b.cmd('Network.enable');
    await b.cmd('Network.setCacheDisabled', { cacheDisabled: true });
    await b.cmd('Network.clearBrowserCookies');
    await b.cookie('ofertou_cookies', 'nao', SITE);
    // Ofertas com cupom (celular, visitante)
    await tela(390, 844, true, 2);
    await b.ir(`${SITE}/?cupom=1`, 3500);
    await b.js(`OfertouTema.definir('escuro'); 1`); await espera(400);
    await b.js(LIMPAR);
    await b.js(`document.querySelector('#grid').scrollIntoView({ block: 'start' }); scrollBy(0, -120); 1`); await espera(600);
    await b.js(FOTOS); await b.js(LIMPAR);
    await print('cel-cupom');

    await b.cookie('gp_admin', ADMIN, SITE);
    // Computador
    await tela(1600, 900, false);
    await entrar();
    await area('afiliado', 4000);
    await print('pc-painel');
    await b.js(NO_QUADRO(`(document.querySelector('#cli-alta').scrollIntoView({block:'start'}),scrollBy(0,-90),1)`)); await espera(500); await b.js(NO_QUADRO(AJUSTAR)); await espera(500);
    await print('pc-alta');
    await abrirAba('comissao'); await print('pc-comissao');
    await abrirAba('membros'); await print('pc-membros');
    await area('loja', 4000);
    await print('pc-loja');
    await b.js(NO_QUADRO(`(document.querySelector('.dash-grade .dash-graf-card').scrollIntoView({block:'start'}),scrollBy(0,-120),1)`)); await espera(500);
    await print('pc-loja-funil');
    await area('ofertas', 4500);
    await b.js(NO_QUADRO(OFERTAS));
    await print('pc-central-ofertas');
    // Celular
    await tela(390, 844, true, 2);
    await b.ir('about:blank', 50); await entrar();
    await area('afiliado', 3500);
    await print('cel-painel');
    await abrirAba('comissao');
    await b.js(NO_QUADRO(`(document.querySelector('[data-body="comissao"]').scrollIntoView({block:'start'}),scrollBy(0,-20),1)`)); await espera(400);
    await print('cel-comissao');
    await abrirAba('membros');
    await print('cel-membros');
    await b.js(NO_QUADRO(`(document.querySelector('.tabs-line [data-tab="inicio"]').click(),1)`)); await espera(800);
    await b.js(NO_QUADRO(`(document.querySelector('#cli-alta').scrollIntoView({block:'start'}),scrollBy(0,-20),1)`)); await espera(500); await b.js(NO_QUADRO(AJUSTAR)); await espera(500);
    await print('cel-alta');
    await area('loja', 3500);
    await print('cel-loja');
    await area('ofertas', 4500);
    await b.js(NO_QUADRO(OFERTAS));
    await espera(400);
    await print('cel-central-ofertas');
    console.log('prints prontos em', DIR);
  } finally { await b.fechar(); }
})().catch(e => { console.error(e); process.exit(1); });
