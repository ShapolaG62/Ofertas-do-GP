// Login do painel administrativo: senha com hash (scrypt), sessão em cookie HttpOnly e limite de tentativas.
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');

const COOKIE = 'gp_admin';
const SESSION_DAYS = 7;
const MIN_PASSWORD = 8;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const attempts = new Map(); // ip -> { count, until }

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const hasPassword = () => Boolean(settings.get('admin_password_hash'));

function setPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  }
  settings.set('admin_password_hash', hashPassword(password));
  db.run('DELETE FROM sessions'); // derruba sessões antigas
}

// Na primeira execução, a senha pode vir da variável de ambiente ADMIN_PASSWORD.
function initFromEnv() {
  if (!hasPassword() && process.env.ADMIN_PASSWORD) {
    setPassword(process.env.ADMIN_PASSWORD);
    console.log('[ADMIN] Senha do painel definida a partir de ADMIN_PASSWORD.');
  }
}

const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieFlags(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return `Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

// Na Vercel o site roda em várias cópias, cada uma com seu banco temporário: uma sessão gravada no banco
// não é reconhecida pelas outras. Lá a sessão do admin é um cookie assinado com uma chave derivada de
// ADMIN_PASSWORD (igual em todas as cópias; trocar a variável derruba as sessões).
let statelessKey;
function sessionKey() {
  if (!process.env.VERCEL || !process.env.ADMIN_PASSWORD) return null;
  statelessKey ||= crypto.scryptSync(process.env.ADMIN_PASSWORD, 'ofertas-do-gp:sessao-admin', 32);
  return statelessKey;
}
const sign = (key, data) => crypto.createHmac('sha256', key).update(data).digest('hex');

function validStatelessToken(token, key) {
  const [v, exp, sig] = String(token).split('.');
  if (v !== 'v1' || !/^\d+$/.test(exp || '') || !/^[a-f0-9]{64}$/.test(sig || '')) return false;
  if (Number(exp) < Date.now()) return false;
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(sign(key, `v1.${exp}`), 'hex'));
}

function createSession(req, res) {
  const key = sessionKey();
  if (key) {
    const exp = Date.now() + SESSION_DAYS * 86400000;
    const token = `v1.${exp}.${sign(key, `v1.${exp}`)}`;
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}; ${cookieFlags(req)}`);
    return;
  }
  const token = crypto.randomBytes(32).toString('hex');
  db.run(
    `INSERT INTO sessions (token_hash, expires_at) VALUES (?, datetime('now', ?))`,
    tokenHash(token), `+${SESSION_DAYS} days`
  );
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}; ${cookieFlags(req)}`);
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${cookieFlags(req)}`);
}

function isLoggedIn(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return false;
  const key = sessionKey();
  if (key) return validStatelessToken(token, key);
  return Boolean(db.get(
    `SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')`, tokenHash(token)
  ));
}

function requireAdmin(req, res, next) {
  if (isLoggedIn(req)) return next();
  res.status(401).json({ error: 'Faça login no painel.' });
}

// Bloqueia o IP por alguns minutos depois de várias senhas erradas.
function checkRateLimit(ip) {
  const a = attempts.get(ip);
  if (a && a.until && a.until > Date.now()) {
    return Math.ceil((a.until - Date.now()) / 60000);
  }
  return 0;
}

function registerFailure(ip) {
  const a = attempts.get(ip) || { count: 0 };
  a.count++;
  if (a.count >= MAX_ATTEMPTS) { a.until = Date.now() + LOCK_MINUTES * 60000; a.count = 0; }
  attempts.set(ip, a);
}

const clearFailures = ip => attempts.delete(ip);

// O cadastro inicial da senha só é aceito no próprio computador (sem proxy na frente).
function isLocalRequest(req) {
  const addr = req.socket.remoteAddress || '';
  const local = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  return local && !req.headers['x-forwarded-for'];
}

function purgeExpiredSessions() {
  db.run(`DELETE FROM sessions WHERE expires_at <= datetime('now')`);
}

module.exports = {
  hasPassword, setPassword, verifyPassword, initFromEnv, createSession, destroySession, isLoggedIn,
  requireAdmin, checkRateLimit, registerFailure, clearFailures, isLocalRequest, purgeExpiredSessions, MIN_PASSWORD,
  hashPassword, tokenHash, parseCookies, cookieFlags,
};
