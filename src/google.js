// Login com Google (OAuth 2.0 / OpenID Connect, fluxo "authorization code" com PKCE).
// Requer um ID do cliente OAuth criado no Google Cloud, configurado no painel (aba Usuários).
const crypto = require('crypto');
const settings = require('./settings');
const { http } = require('./util');
const { parseCookies } = require('./auth');

const STATE_COOKIE = 'gp_oauth';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function isEnabled() {
  const s = settings.getAll();
  return Boolean(s.google_client_id && s.google_client_secret);
}

function baseUrl(req) {
  const configured = String(settings.get('site_url') || '').trim();
  if (/^https?:\/\/[^\s/]+/i.test(configured)) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

const redirectUri = req => `${baseUrl(req)}/auth/google/callback`;

function stateCookie(req, value, maxAge) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  // SameSite=Lax: o navegador precisa enviar este cookie na volta do Google (navegação vinda de outro site).
  return `${STATE_COOKIE}=${value}; Path=/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

// Monta o endereço do Google e guarda state + verificador PKCE num cookie de 10 minutos.
function startUrl(req, res) {
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  res.setHeader('Set-Cookie', stateCookie(req, `${state}.${verifier}`, 600));
  const params = new URLSearchParams({
    client_id: settings.get('google_client_id'),
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${AUTH_URL}?${params}`;
}

// Valida a volta do Google e devolve { sub, email, name, picture }.
async function finish(req, res) {
  const saved = parseCookies(req.headers.cookie)[STATE_COOKIE] || '';
  res.setHeader('Set-Cookie', stateCookie(req, '', 0));
  const [state, verifier] = saved.split('.');
  if (req.query.error) throw new Error('Login com Google cancelado.');
  if (!state || !verifier || state !== req.query.state) throw new Error('Sessão de login expirada. Tente de novo.');
  if (!req.query.code) throw new Error('Resposta inválida do Google.');

  const tokenRes = await http.post(TOKEN_URL, new URLSearchParams({
    code: String(req.query.code),
    client_id: settings.get('google_client_id'),
    client_secret: settings.get('google_client_secret'),
    redirect_uri: redirectUri(req),
    grant_type: 'authorization_code',
    code_verifier: verifier,
  }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true });
  if (tokenRes.status !== 200 || !tokenRes.data?.access_token) {
    throw new Error(`O Google recusou o login (${tokenRes.data?.error_description || tokenRes.data?.error || tokenRes.status}).`);
  }

  const info = await http.get(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }, validateStatus: () => true,
  });
  const p = info.data || {};
  if (info.status !== 200 || !p.sub || !p.email) throw new Error('Não foi possível ler os dados da conta Google.');
  if (p.email_verified === false) throw new Error('Este e-mail do Google não está verificado.');
  return { sub: String(p.sub), email: String(p.email).toLowerCase(), name: p.name || '', picture: p.picture || null };
}

module.exports = { isEnabled, startUrl, finish, redirectUri };
