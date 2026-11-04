// Login em duas etapas do administrador: depois da senha, um código de 6 dígitos do app autenticador (Google Authenticator,
// Authy, Microsoft Authenticator...), padrão TOTP. Fica desligado até o admin ativar em Painel → Conta e senha.
// Celular perdido: um dos 8 códigos de recuperação (uso único) ou, com acesso ao servidor, node scripts/desligar-2fa.js.
const crypto = require('crypto');
const settings = require('./settings');

const SEGREDO = 'admin_2fa_secret', PENDENTE = 'admin_2fa_pendente', RECUPERACAO = 'admin_2fa_codigos', ULTIMO = 'admin_2fa_ultimo';
const PASSO = 30; // segundos de cada código
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buf) {
  let bits = 0, valor = 0, s = '';
  for (const b of buf) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { s += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
    valor &= (1 << bits) - 1;
  }
  return bits ? s + ALFABETO[(valor << (5 - bits)) & 31] : s;
}
function deBase32(s) {
  let bits = 0, valor = 0;
  const out = [];
  for (const c of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    valor = (valor << 5) | ALFABETO.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; }
    valor &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

// Código de 6 dígitos de um contador de tempo (RFC 6238 / 4226)
function codigoDe(segredo, contador) {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(contador));
  const h = crypto.createHmac('sha1', deBase32(segredo)).update(c).digest();
  const i = h[h.length - 1] & 15;
  return String((h.readUInt32BE(i) & 0x7fffffff) % 1000000).padStart(6, '0');
}
const contadorAgora = (agora = Date.now()) => Math.floor(agora / 1000 / PASSO);
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const igual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const listaRecuperacao = () => { try { return JSON.parse(settings.get(RECUPERACAO) || '[]'); } catch { return []; } };

const ativo = () => Boolean(settings.get(SEGREDO));

function estado() {
  return { ativo: ativo(), codigos_restantes: listaRecuperacao().length };
}

// 1º passo de ativar: cria o segredo (ainda sem valer) e devolve o QR Code e a chave para digitar no app
async function iniciar() {
  const segredo = base32(crypto.randomBytes(20));
  settings.set(PENDENTE, segredo);
  const uri = `otpauth://totp/Ofertou!:admin?secret=${segredo}&issuer=Ofertou!&algorithm=SHA1&digits=6&period=${PASSO}`;
  const qr = await require('qrcode').toString(uri, { type: 'svg', margin: 2, width: 220 });
  return { segredo: segredo.replace(/(.{4})/g, '$1 ').trim(), uri, qr };
}

// 2º passo: o código do app confirma que ficou certo; só então passa a valer. Devolve os códigos de recuperação.
function confirmar(codigo) {
  const segredo = settings.get(PENDENTE);
  if (!segredo) throw new Error('Comece de novo: toque em "Ativar".');
  if (!confereTotp(segredo, codigo, false)) throw new Error('Código incorreto. Confira a hora do celular e tente de novo.');
  const codigos = Array.from({ length: 8 }, () => {
    const c = base32(crypto.randomBytes(5));
    return `${c.slice(0, 4)}-${c.slice(4, 8)}`;
  });
  settings.set(SEGREDO, segredo);
  settings.set(PENDENTE, '');
  settings.set(RECUPERACAO, JSON.stringify(codigos.map(c => hash(c.replace('-', '')))));
  settings.set(ULTIMO, String(contadorAgora()));
  return codigos;
}

function confereTotp(segredo, codigo, guardar = true, agora = Date.now()) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (c.length !== 6) return false;
  const atual = contadorAgora(agora);
  const ultimo = Number(settings.get(ULTIMO)) || 0;
  for (const n of [atual, atual - 1, atual + 1]) { // tolera ±30 s de diferença no relógio
    if (guardar && n <= ultimo) continue; // o mesmo código não entra duas vezes
    if (igual(codigoDe(segredo, n), c)) { if (guardar) settings.set(ULTIMO, String(n)); return true; }
  }
  return false;
}

// Confere o código do login (app ou recuperação; este último some depois de usado)
function conferir(codigo, agora = Date.now()) {
  const segredo = settings.get(SEGREDO);
  if (!segredo) return true;
  if (confereTotp(segredo, codigo, true, agora)) return true;
  const c = String(codigo || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (c.length !== 8) return false;
  const lista = listaRecuperacao();
  const i = lista.findIndex(h => igual(h, hash(c)));
  if (i < 0) return false;
  lista.splice(i, 1);
  settings.set(RECUPERACAO, JSON.stringify(lista));
  return true;
}

function desligar() {
  for (const k of [SEGREDO, PENDENTE, RECUPERACAO, ULTIMO]) settings.set(k, '');
}

module.exports = { ativo, estado, iniciar, confirmar, conferir, desligar, codigoDe, contadorAgora };
