// Fotos das ofertas: baixa a foto da loja (na versão grande, quando a loja oferece) e monta o cartão da vitrine.
// As fotos são das lojas e vão como estão: o site não coloca marca d'água nem selo próprio nelas.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const db = require('./db');
const { safeGet } = require('./net');

const LOCAL_IMAGE = /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)/i;

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

// Cartão da vitrine da página inicial: a foto original inteira (sem recorte, nada do produto é cortado) num
// cartão branco de cantos arredondados. Sai em WebP com os cantos transparentes.
const CARTAO = 720;
async function cartao(foto) {
  const raio = 44, margem = 36;
  const produto = await sharp(foto, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 12 }) // tira a sobra branca em volta: o produto fica maior
    .resize(CARTAO - margem * 2, CARTAO - margem * 2, { fit: 'inside' }).toBuffer();
  const meta = await sharp(produto).metadata();
  const fundo = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARTAO}" height="${CARTAO}">
    <rect width="${CARTAO}" height="${CARTAO}" rx="${raio}" ry="${raio}" fill="#ffffff"/></svg>`);
  return sharp(fundo).composite([
    { input: produto, left: Math.round((CARTAO - meta.width) / 2), top: Math.round((CARTAO - meta.height) / 2) },
  ]).webp({ quality: 88, alphaQuality: 90, effort: 5 }).toBuffer();
}

module.exports = { baixarFoto, cartao };
