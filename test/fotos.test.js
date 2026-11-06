// Fotos pequenas dos cartões: cópia leve em WebP, guardada no disco, e a Magalu pedindo o tamanho no próprio endereço.
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ofertou-fotos-'));
const sharp = require('sharp');
const cache = require('../src/img-cache');

const foto = lado => sharp({ create: { width: lado, height: lado, channels: 3, background: '#0a7a43' } }).jpeg({ quality: 100 }).toBuffer();

test('foto grande vira WebP pequeno, baixa uma vez e fica guardada', async () => {
  const original = await foto(1200);
  let baixou = 0;
  const pegar = async () => { baixou++; return { tipo: 'image/jpeg', dados: original }; };
  const [a, b] = await Promise.all([cache.miniatura(1, pegar), cache.miniatura(1, pegar)]);
  assert.deepEqual(a, b);
  assert.equal(baixou, 1, 'pedidos iguais ao mesmo tempo esperam o mesmo trabalho');
  const m = await sharp(a).metadata();
  assert.deepEqual([m.format, m.width, m.height], ['webp', cache.LADO_MINIATURA, cache.LADO_MINIATURA]);
  assert.ok(a.length < original.length);
  await cache.miniatura(1, pegar);
  assert.equal(baixou, 1, 'depois vem do disco');
});

test('foto retangular mantém a proporção e foto pequena não é ampliada', async () => {
  const alta = await sharp({ create: { width: 800, height: 1600, channels: 3, background: '#fff' } }).jpeg().toBuffer();
  const m = await sharp(await cache.miniatura(2, async () => ({ tipo: 'image/jpeg', dados: alta }))).metadata();
  assert.deepEqual([m.width, m.height], [200, 400]);
  const n = await sharp(await cache.miniatura(3, async () => ({ tipo: 'image/jpeg', dados: await foto(100) }))).metadata();
  assert.equal(n.width, 100);
});

test('arquivo que não é imagem dá erro e não fica guardado', async () => {
  await assert.rejects(cache.miniatura(4, async () => ({ tipo: 'image/jpeg', dados: Buffer.from('não é foto') })));
  assert.equal(fs.existsSync(path.join(cache.PASTA, '4-p.webp')), false);
});

test('Magalu: pede a foto no tamanho menor, sem passar pelo servidor', () => {
  assert.equal(cache.magaluPequena('https://a-static.mlcdn.com.br/800x800/fone/kabum/1/x.jpeg'), `https://a-static.mlcdn.com.br/${cache.LADO_MINIATURA}x${cache.LADO_MINIATURA}/fone/kabum/1/x.jpeg`);
  assert.equal(cache.magaluPequena('https://a-static.mlcdn.com.br/sem-tamanho/x.jpeg'), 'https://a-static.mlcdn.com.br/sem-tamanho/x.jpeg');
});
