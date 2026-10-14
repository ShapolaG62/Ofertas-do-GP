// Acesso seguro a links informados por usuários (feeds de lojas, imagens).
// Bloqueia endereços internos (localhost, rede local, nuvem) para que ninguém use o servidor
// para acessar a sua rede (ataque conhecido como SSRF).
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const { http: client } = require('./util');

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8')
    || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb') || v6.startsWith('ff');
}

// Resolve o nome e recusa a conexão se qualquer endereço for interno (vale também para redirecionamentos).
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);
    const list = Array.isArray(address) ? address : [{ address, family }];
    if (list.some(a => isPrivateIp(a.address))) {
      return callback(Object.assign(new Error('Endereço não permitido'), { code: 'EBLOCKED' }));
    }
    callback(null, address, family);
  });
}

const httpAgent = new http.Agent({ lookup: guardedLookup });
const httpsAgent = new https.Agent({ lookup: guardedLookup });

function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Link inválido.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('O link precisa começar com https://');
  if (url.username || url.password) throw new Error('Link inválido.');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Porta não permitida.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Endereço não permitido.');
  if (net.isIP(host) && isPrivateIp(host)) throw new Error('Endereço não permitido.');
  return url;
}

// GET seguindo no máximo 3 redirecionamentos, todos verificados.
async function safeGet(raw, opts = {}) {
  let current = raw;
  for (let i = 0; i < 4; i++) {
    assertPublicUrl(current);
    const res = await client.get(current, {
      ...opts,
      httpAgent, httpsAgent,
      maxRedirects: 0,
      maxContentLength: opts.maxContentLength || 8 * 1024 * 1024,
      validateStatus: () => true,
    });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = new URL(res.headers.location, current).href;
      continue;
    }
    return res;
  }
  throw new Error('Redirecionamentos demais.');
}

module.exports = { safeGet, assertPublicUrl, isPrivateIp };
