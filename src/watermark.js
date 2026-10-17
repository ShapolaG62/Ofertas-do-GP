// Marca d'água nas imagens das postagens: a foto da oferta vai para um quadrado 1080×1080 (fundo branco,
// formato que fica melhor no WhatsApp, Telegram e Instagram) com o selo do site num canto.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const db = require('./db');
const settings = require('./settings');
const { safeGet } = require('./net');

const SIZE = 1080;
const CACHE_DIR = path.join(path.dirname(db.UPLOADS_DIR), 'marca');
const LOGO = path.join(__dirname, '..', 'public', 'images', 'pet-capi-head.png');
const LOCAL_IMAGE = /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)/i;
fs.mkdirSync(CACHE_DIR, { recursive: true });

const POSICOES = ['inferior-direito', 'inferior-esquerdo', 'superior-direito', 'superior-esquerdo', 'centro'];
const ativa = (s = settings.getAll()) => s.marca_ativa !== '0';
// Trocar a imagem da Capi refaz as imagens já guardadas.
const logoVersao = () => { try { return String(fs.statSync(LOGO).mtimeMs); } catch { return ''; } };

const escXml = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// As lojas guardam a mesma foto em vários tamanhos; a busca devolve miniaturas. Pede a versão grande.
function fotoGrande(url) {
  if (/media-amazon\.com|images-amazon\.com/i.test(url)) return url.replace(/\._[A-Z0-9_,]+_\.(jpe?g|png|webp)$/i, '._AC_SL1000_.$1');
  if (/mlstatic\.com/i.test(url)) return url.replace(/-[A-Z]\.(jpe?g|webp)$/i, '-O.$1');
  return url;
}

async function baixar(url) {
  const r = await safeGet(url, {
    responseType: 'arraybuffer', timeout: 10000, maxContentLength: 8 * 1024 * 1024,
    headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
  });
  if (r.status !== 200 || !IMAGE_TYPES.test(String(r.headers['content-type'] || ''))) throw new Error('Não consegui baixar a foto da loja.');
  return Buffer.from(r.data);
}

async function baixarFoto(imagem) {
  if (LOCAL_IMAGE.test(imagem || '')) return fs.promises.readFile(path.join(db.UPLOADS_DIR, path.basename(imagem)));
  if (!/^https:\/\//i.test(imagem || '')) throw new Error('A oferta não tem foto.');
  const grande = fotoGrande(imagem);
  if (grande !== imagem) {
    try { return await baixar(grande); } catch { /* volta para a foto original */ }
  }
  return baixar(imagem);
}

// Selo: Capi + nome do site (e o endereço, se houver) numa etiqueta escura arredondada.
// Selo de cliente da ferramenta (marca_logo = '0'): só o texto dele, sem a Capi e sem o endereço do site.
async function selo(s) {
  const semLogo = s.marca_logo === '0';
  const texto = String(s.marca_texto || (semLogo ? '' : 'Ofertou!')).trim().slice(0, 40) || (semLogo ? 'Ofertas' : 'Ofertou!');
  const site = semLogo ? '' : String(s.site_url || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '').slice(0, 40);
  const op = Math.min(Math.max(Number(s.marca_opacidade) || 90, 30), 100) / 100;
  const logo = semLogo ? -16 : 92, padX = semLogo ? 30 : 22, h = 120;
  const largTexto = Math.max(texto.length * 20.5, site.length * 13.5) + 6;
  const w = padX + logo + 16 + largTexto + padX;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0" y="0" width="${w}" height="${h}" rx="26" ry="26" fill="#0e1a14" fill-opacity="${(0.82 * op).toFixed(2)}"/>
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="24" ry="24" fill="none" stroke="#2bb673" stroke-opacity="${op.toFixed(2)}" stroke-width="3"/>
    <text x="${padX + logo + 16}" y="${site ? 58 : 73}" font-family="Figtree, Segoe UI, Arial, sans-serif" font-size="40" font-weight="800"
      fill="#ffffff" fill-opacity="${op.toFixed(2)}">${escXml(texto)}</text>
    ${site ? `<text x="${padX + logo + 16}" y="92" font-family="Figtree, Segoe UI, Arial, sans-serif" font-size="25" font-weight="600" fill="#9be3bf" fill-opacity="${op.toFixed(2)}">${escXml(site)}</text>` : ''}
  </svg>`;
  if (semLogo) return sharp(Buffer.from(svg)).png().toBuffer();
  const capi = await sharp(LOGO).resize(logo, logo, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha(op).png().toBuffer();
  return sharp(Buffer.from(svg)).composite([{ input: capi, left: padX, top: Math.round((h - logo) / 2) }]).png().toBuffer();
}

async function compor(foto, s) {
  const margem = 40;
  const produto = await sharp(foto, { failOn: 'none' }).rotate()
    .resize(SIZE - 120, SIZE - 260, { fit: 'inside', withoutEnlargement: false })
    .flatten({ background: '#ffffff' }).toBuffer();
  const meta = await sharp(produto).metadata();
  const marca = await selo(s);
  const m = await sharp(marca).metadata();
  const pos = POSICOES.includes(s.marca_posicao) ? s.marca_posicao : 'inferior-direito';
  const left = pos.endsWith('esquerdo') ? margem : pos === 'centro' ? Math.round((SIZE - m.width) / 2) : SIZE - m.width - margem;
  const top = pos.startsWith('superior') ? margem : pos === 'centro' ? Math.round((SIZE - m.height) / 2) : SIZE - m.height - margem;
  // Produto centralizado na área livre (sobra espaço para o selo não cobrir a foto, exceto no "centro").
  const areaTop = pos.startsWith('superior') ? m.height + margem : 30;
  const areaH = SIZE - (pos === 'centro' ? 60 : m.height + margem + 30);
  return sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: '#ffffff' } })
    .composite([
      { input: produto, left: Math.round((SIZE - meta.width) / 2), top: Math.max(0, Math.round(areaTop + (areaH - meta.height) / 2)) },
      { input: marca, left, top },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

// Cartão da vitrine da página inicial: a foto original inteira (sem recorte, nada do produto é cortado) num
// cartão branco de cantos arredondados, com o selo do site embaixo. Sai em WebP com os cantos transparentes.
const CARTAO = 720;
async function cartao(foto, s = settings.getAll()) {
  const raio = 44, faixaSelo = 84;
  const produto = await sharp(foto, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 12 }) // tira a sobra branca em volta: o produto fica maior
    .resize(CARTAO - 90, CARTAO - 60 - faixaSelo, { fit: 'inside' }).toBuffer();
  const meta = await sharp(produto).metadata();
  const marca = await sharp(await selo({ ...s, marca_opacidade: 100 })).resize({ height: 62 }).toBuffer();
  const mm = await sharp(marca).metadata();
  const fundo = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARTAO}" height="${CARTAO}">
    <rect width="${CARTAO}" height="${CARTAO}" rx="${raio}" ry="${raio}" fill="#ffffff"/></svg>`);
  const areaH = CARTAO - faixaSelo - 30;
  return sharp(fundo).composite([
    { input: produto, left: Math.round((CARTAO - meta.width) / 2), top: Math.round(30 + (areaH - meta.height) / 2) },
    { input: marca, left: CARTAO - mm.width - 26, top: CARTAO - mm.height - 22 },
  ]).webp({ quality: 88, alphaQuality: 90, effort: 5 }).toBuffer();
}

// Imagem com marca d'água de uma oferta (guardada em disco; refeita se a foto ou a configuração mudar).
async function paraOferta(o, s = settings.getAll()) {
  const chave = crypto.createHash('sha1')
    .update([o.imagem, s.marca_texto, s.marca_posicao, s.marca_opacidade, s.site_url, s.marca_logo, logoVersao()].join('|')).digest('hex').slice(0, 12);
  const arquivo = path.join(CACHE_DIR, `${o.id}-${chave}.jpg`);
  try { return await fs.promises.readFile(arquivo); } catch { /* ainda não existe */ }
  const buf = await compor(await baixarFoto(o.imagem), s);
  await fs.promises.writeFile(arquivo, buf);
  return buf;
}

// Apaga do disco as imagens geradas há mais de 7 dias.
function limparCache() {
  const limite = Date.now() - 7 * 86400000;
  for (const f of fs.readdirSync(CACHE_DIR)) {
    const p = path.join(CACHE_DIR, f);
    try { if (fs.statSync(p).mtimeMs < limite) fs.unlinkSync(p); } catch { /* ignora */ }
  }
}

module.exports = { ativa, paraOferta, cartao, limparCache, baixarFoto, POSICOES };
