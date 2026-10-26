// Página de captação do grupo (/grupo): para divulgar em bio, stories e anúncios pagos. Mostra a chamada e o botão
// "Entrar no grupo"; o clique (/grupo/entrar) leva ao próximo grupo que ainda não lotou (src/grupos-convite.js).
// Com o Pixel da Meta configurado no painel, registra a visita (PageView) e o clique no botão (Lead).
const h = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function pagina(s, total) {
  const titulo = s.grupo_titulo || 'Entre no grupo de ofertas do Ofertou!';
  const texto = s.grupo_texto || 'Promoções de verdade das maiores lojas do Brasil, conferidas várias vezes por dia. É grátis e você sai quando quiser.';
  const pixel = /^\d{6,20}$/.test(String(s.grupo_pixel_meta || '').trim()) ? String(s.grupo_pixel_meta).trim() : '';
  const pixelJs = pixel ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');</script>` : '';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${h(titulo)}</title>
<meta name="description" content="${h(texto)}">
<meta property="og:title" content="${h(titulo)}"><meta property="og:description" content="${h(texto)}">
<meta property="og:image" content="/images/icon-512.png"><meta name="theme-color" content="#0e1210">
<link rel="icon" href="/images/favicon-32x32.png">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@500;700;800;900&display=swap" rel="stylesheet">
${pixelJs}
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px; font-family: Figtree, system-ui, sans-serif;
    color: #eef3f0; background: radial-gradient(900px 500px at 80% 0%, rgba(43,212,125,.22), transparent 60%),
    radial-gradient(700px 500px at 0% 100%, rgba(245,185,66,.14), transparent 60%), #0b0f0d; }
  main { width: min(440px, 100%); text-align: center; display: grid; gap: 18px; justify-items: center; }
  .capi { width: 132px; height: 132px; filter: drop-shadow(0 12px 30px rgba(0,0,0,.45)); animation: pulo 2.4s ease-in-out infinite; }
  @keyframes pulo { 50% { transform: translateY(-6px) rotate(-2deg); } }
  h1 { margin: 0; font-size: clamp(28px, 7vw, 38px); line-height: 1.1; letter-spacing: -.02em; font-weight: 900; }
  h1 em { font-style: normal; color: #2bd47d; }
  p { margin: 0; color: #a9bab1; font-size: 16.5px; line-height: 1.55; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; text-align: left; width: 100%; }
  li { display: flex; gap: 10px; align-items: center; padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); font-weight: 700; font-size: 15px; }
  li span { font-size: 20px; }
  .btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 18px; border-radius: 999px; border: 0;
    background: #25d366; color: #062b17; font: 900 19px Figtree, system-ui, sans-serif; text-decoration: none; cursor: pointer;
    box-shadow: 0 10px 30px rgba(37,211,102,.35); animation: brilho 2s ease-in-out infinite; }
  @keyframes brilho { 50% { box-shadow: 0 10px 40px rgba(37,211,102,.6); } }
  .btn svg { width: 24px; height: 24px; }
  small { color: #7d8f86; font-size: 12.5px; }
  .prova { color: #2bd47d; font-weight: 800; font-size: 14px; }
</style></head><body><main>
  <img class="capi" src="/images/pet-capi.png" alt="Capi, a mascote do Ofertou!" width="132" height="132">
  <h1>${h(titulo).replace(/Ofertou!/, '<em>Ofertou!</em>')}</h1>
  <p>${h(texto)}</p>
  <ul>
    <li><span>🔥</span> Só desconto que a própria loja mostra</li>
    <li><span>✅</span> Preço conferido várias vezes por dia</li>
    <li><span>🛒</span> Mercado Livre, Amazon, Shopee, Magalu e mais</li>
  </ul>
  ${total >= 50 ? `<p class="prova">${total.toLocaleString('pt-BR')} pessoas já entraram pelo nosso link</p>` : ''}
  <a class="btn" href="/grupo/entrar" id="entrar" rel="nofollow"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.4 13.9c-.2.6-1.3 1.2-1.8 1.3-.5.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1 1 2 1.3 2.3 1.4.3.2.5.1.6 0l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.6-.1 1.2z"/></svg>Entrar no grupo</a>
  <small>Você vai para o WhatsApp. Sem spam: só ofertas, e você sai quando quiser.</small>
</main>
${pixel ? `<script>document.getElementById('entrar').addEventListener('click', function () { try { fbq('track', 'Lead'); } catch (e) {} });</script>` : ''}
</body></html>`;
}

module.exports = { pagina };
