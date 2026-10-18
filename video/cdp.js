// Controle do Microsoft Edge sem janela (headless) pelo protocolo DevTools, sem instalar nada:
// abre páginas, tira prints e roda scripts. Usado para gerar o vídeo de apresentação do site.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
  .find(p => fs.existsSync(p));

async function abrirNavegador({ largura = 1920, altura = 1080, porta = 9333 } = {}) {
  if (!EDGE) throw new Error('Microsoft Edge não encontrado.');
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'ofertou-video-'));
  const proc = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`, `--window-size=${largura},${altura}`,
    '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', ...(process.env.CDP_SOM ? [] : ['--mute-audio']), '--no-first-run', '--disable-extensions',
    '--force-device-scale-factor=1', 'about:blank',
  ], { stdio: 'ignore' });
  let alvo;
  for (let i = 0; i < 50 && !alvo; i++) {
    await new Promise(r => setTimeout(r, 200));
    try { alvo = (await (await fetch(`http://127.0.0.1:${porta}/json`)).json()).find(t => t.type === 'page'); } catch { /* ainda abrindo */ }
  }
  if (!alvo) throw new Error('O Edge não abriu.');
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((ok, erro) => { ws.onopen = ok; ws.onerror = erro; });
  let seq = 0;
  const pendentes = new Map();
  const ouvintes = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pendentes.has(m.id)) { const p = pendentes.get(m.id); pendentes.delete(m.id); m.error ? p.erro(new Error(m.error.message)) : p.ok(m.result); }
    else if (m.method) ouvintes.forEach(f => f(m));
  };
  const cmd = (method, params = {}) => new Promise((ok, erro) => { const id = ++seq; pendentes.set(id, { ok, erro }); ws.send(JSON.stringify({ id, method, params })); });
  await cmd('Page.enable');
  // Como um navegador normal (algumas lojas não mandam as fotos para navegadores sem janela)
  await cmd('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0' });
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 1, mobile: false });

  const esperarCarregar = () => new Promise(ok => { const f = m => { if (m.method === 'Page.loadEventFired') { ouvintes.splice(ouvintes.indexOf(f), 1); ok(); } }; ouvintes.push(f); });
  return {
    cmd,
    async ir(url, espera = 1500) { const c = esperarCarregar(); await cmd('Page.navigate', { url }); await c; await new Promise(r => setTimeout(r, espera)); },
    async js(expr) { const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'erro no script'); return r.result.value; },
    async tela({ largura: w = largura, altura: h = altura, celular = false } = {}) {
      await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: celular });
    },
    async print(arquivo, opcoes = {}) { const r = await cmd('Page.captureScreenshot', { format: 'png', ...opcoes }); fs.writeFileSync(arquivo, Buffer.from(r.data, 'base64')); },
    async cookie(nome, valor, url) { await cmd('Network.setCookie', { name: nome, value: valor, url }); },
    async fechar() { try { ws.close(); } catch { /* ok */ } proc.kill(); setTimeout(() => { try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* o Windows ainda segura a pasta: fica na pasta temporária */ } }, 1500); },
  };
}

module.exports = { abrirNavegador };
