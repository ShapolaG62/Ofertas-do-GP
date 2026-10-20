// Localização aproximada de IPs (cidade e estado no Brasil; só o país fora dele), sem mandar IP para ninguém:
// usa a base gratuita "IP to City Lite" da DB-IP (licença CC BY 4.0 — https://db-ip.com), baixada uma vez por mês
// e guardada em data/geoip.db (só as faixas, já resumidas). Atualizar: npm run geoip  (ou Painel → Acessos suspeitos).
// IP geolocation by DB-IP.
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');
const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('./db');

const ARQUIVO = path.join(path.dirname(DB_PATH), 'geoip.db');
const URL_BASE = 'https://download.db-ip.com/free/dbip-city-lite-';

const UF = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM', 'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
  'Federal District': 'DF', 'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG', 'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE', 'Piauí': 'PI', 'Rio de Janeiro': 'RJ',
  'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC',
  'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO',
};

// ── Endereços ──
function ipv4(ip) {
  const p = ip.split('.');
  if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return ((Number(p[0]) * 256 + Number(p[1])) * 256 + Number(p[2])) * 256 + Number(p[3]);
}
// IPv6 → 32 dígitos hexadecimais (comparáveis como texto)
function ipv6(ip) {
  if (!ip.includes(':')) return null;
  let [a, b] = ip.split('::');
  if (ip.split('::').length > 2) return null;
  const parte = s => (s ? s.split(':') : []);
  let ga = parte(a), gb = parte(b ?? '');
  const ultimo = (b !== undefined ? gb : ga).at(-1) || '';
  if (ultimo.includes('.')) { // final em IPv4 (::ffff:1.2.3.4)
    const n = ipv4(ultimo); if (n === null) return null;
    const hx = n.toString(16).padStart(8, '0'), troca = [hx.slice(0, 4), hx.slice(4)];
    if (b !== undefined) gb = [...gb.slice(0, -1), ...troca]; else ga = [...ga.slice(0, -1), ...troca];
  }
  const falta = 8 - ga.length - gb.length;
  if (b === undefined ? falta !== 0 : falta < 0) return null;
  const g = [...ga, ...Array(b === undefined ? 0 : falta).fill('0'), ...gb];
  if (g.some(x => !/^[0-9a-f]{1,4}$/i.test(x))) return null;
  return g.map(x => x.toLowerCase().padStart(4, '0')).join('');
}
const privado = ip => /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|fe80:|0\.)/i.test(ip) || ip === '::' || ip === 'localhost';

// ── Base ──
let base = null;
function abrir() {
  if (base) return base;
  if (!fs.existsSync(ARQUIVO)) return null;
  try {
    base = new DatabaseSync(ARQUIVO, { readOnly: true });
    base.q4 = base.prepare('SELECT * FROM f4 WHERE inicio <= ? ORDER BY inicio DESC LIMIT 1');
    base.q6 = base.prepare('SELECT * FROM f6 WHERE inicio <= ? ORDER BY inicio DESC LIMIT 1');
  } catch (err) { console.error('[GEOIP]', err.message); base = null; }
  return base;
}

function info() {
  const b = abrir();
  if (!b) return { pronta: false };
  const m = Object.fromEntries(b.prepare('SELECT chave, valor FROM info').all().map(r => [r.chave, r.valor]));
  return { pronta: true, versao: m.versao, atualizada_em: m.atualizada_em, faixas: Number(m.faixas || 0) };
}

// { pais, uf, cidade, lat, lon, local } ou null (base ausente / IP sem faixa)
const cache = new Map();
function localizar(ipBruto) {
  const ip = String(ipBruto || '').replace(/^::ffff:(?=\d+\.)/i, '').trim();
  if (!ip) return null;
  if (privado(ip)) return { pais: null, uf: null, cidade: null, local: true, texto: 'Rede local' };
  if (cache.has(ip)) return cache.get(ip);
  const b = abrir();
  if (!b) return null;
  let r = null;
  const n4 = ipv4(ip);
  if (n4 !== null) { const f = b.q4.get(n4); if (f && f.fim >= n4) r = f; }
  else { const n6 = ipv6(ip); if (n6) { const f = b.q6.get(n6); if (f && f.fim >= n6) r = f; } }
  const out = r ? { pais: r.pais, uf: r.uf || null, cidade: r.cidade || null, lat: r.lat, lon: r.lon,
    texto: r.pais === 'BR' ? [r.cidade, r.uf].filter(Boolean).join(' / ') || 'Brasil' : `Fora do Brasil (${r.pais})` } : null;
  if (cache.size > 20000) cache.clear();
  cache.set(ip, out);
  return out;
}

// Distância em km entre dois pontos (fórmula de haversine)
function distancia(a, b) {
  if (a?.lat == null || b?.lat == null) return null;
  const rad = x => (x * Math.PI) / 180, R = 6371;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── Atualização (baixa o CSV do mês, lê em fluxo e grava só o necessário) ──
function baixar(url) {
  return new Promise((ok, erro) => {
    https.get(url, { headers: { 'User-Agent': 'Ofertou-geoip/1.0' }, timeout: 60000 }, res => {
      if (res.statusCode !== 200) { res.resume(); return erro(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode })); }
      ok(res);
    }).on('error', erro).on('timeout', function () { this.destroy(new Error('Tempo esgotado ao baixar a base.')); });
  });
}
// Campos do CSV (com aspas quando o nome tem vírgula)
function campos(linha) {
  const out = []; let atual = '', aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) { if (c === '"') { if (linha[i + 1] === '"') { atual += '"'; i++; } else aspas = false; } else atual += c; }
    else if (c === '"') aspas = true;
    else if (c === ',') { out.push(atual); atual = ''; }
    else atual += c;
  }
  out.push(atual);
  return out;
}
const mesDe = d => d.toISOString().slice(0, 7);

let atualizando = null;
function atualizar({ aoProgresso } = {}) {
  if (atualizando) return atualizando;
  atualizando = (async () => {
    // Tenta o mês atual e, se ainda não saiu, o anterior
    const agora = new Date(), anterior = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 15));
    let res = null, versao = null;
    for (const m of [mesDe(agora), mesDe(anterior)]) {
      try { res = await baixar(`${URL_BASE}${m}.csv.gz`); versao = m; break; } catch (err) { if (err.status !== 404) throw err; }
    }
    if (!res) throw new Error('A base do mês ainda não está disponível na DB-IP. Tente mais tarde.');

    const tmp = `${ARQUIVO}.novo`;
    for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) { try { fs.unlinkSync(f); } catch { /* não existia */ } }
    const novo = new DatabaseSync(tmp);
    novo.exec(`PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;
      CREATE TABLE f4 (inicio INTEGER PRIMARY KEY, fim INTEGER NOT NULL, pais TEXT, uf TEXT, cidade TEXT, lat REAL, lon REAL);
      CREATE TABLE f6 (inicio TEXT PRIMARY KEY, fim TEXT NOT NULL, pais TEXT, uf TEXT, cidade TEXT, lat REAL, lon REAL);
      CREATE TABLE info (chave TEXT PRIMARY KEY, valor TEXT);`);
    const ins4 = novo.prepare('INSERT INTO f4 VALUES (?, ?, ?, ?, ?, ?, ?)');
    const ins6 = novo.prepare('INSERT INTO f6 VALUES (?, ?, ?, ?, ?, ?, ?)');
    let pend = null, faixas = 0, lidas = 0;
    // Junta faixas seguidas do mesmo lugar (fora do Brasil, basta o país)
    const gravar = () => { if (pend) { (pend.v6 ? ins6 : ins4).run(pend.ini, pend.fim, pend.pais, pend.uf, pend.cidade, pend.lat, pend.lon); faixas++; } };
    novo.exec('BEGIN');
    try {
      const rl = readline.createInterface({ input: res.pipe(zlib.createGunzip()), crlfDelay: Infinity });
      for await (const linha of rl) {
        if (!linha) continue;
        const [a, z, , pais, estado, cidade, lat, lon] = campos(linha);
        const v6 = a.includes(':');
        const ini = v6 ? ipv6(a) : ipv4(a), fim = v6 ? ipv6(z) : ipv4(z);
        if (ini === null || fim === null) continue;
        const br = pais === 'BR';
        const reg = { v6, ini, fim, pais: pais || null, uf: br ? UF[estado] || null : null, cidade: br ? cidade || null : null,
          lat: br ? Number(lat) || null : null, lon: br ? Number(lon) || null : null };
        if (pend && pend.v6 === v6 && pend.pais === reg.pais && pend.uf === reg.uf && pend.cidade === reg.cidade) pend.fim = fim;
        else { gravar(); pend = reg; }
        if (++lidas % 500000 === 0) aoProgresso?.(lidas);
      }
      gravar();
      const ins = novo.prepare('INSERT INTO info VALUES (?, ?)');
      ins.run('versao', versao); ins.run('atualizada_em', new Date().toISOString()); ins.run('faixas', String(faixas)); ins.run('linhas', String(lidas));
      novo.exec('COMMIT');
    } catch (err) { novo.exec('ROLLBACK'); novo.close(); try { fs.unlinkSync(tmp); } catch { /* */ } throw err; }
    novo.close();
    if (faixas < 100000) { try { fs.unlinkSync(tmp); } catch { /* */ } throw new Error('A base baixada veio incompleta. Tente de novo.'); }
    if (base) { try { base.close(); } catch { /* */ } base = null; }
    fs.renameSync(tmp, ARQUIVO);
    cache.clear();
    return { versao, faixas, linhas: lidas };
  })().finally(() => { atualizando = null; });
  return atualizando;
}

module.exports = { localizar, distancia, info, atualizar, atualizandoAgora: () => Boolean(atualizando), ipv4, ipv6 };

// npm run geoip
if (require.main === module) {
  console.log('Baixando a base da DB-IP (IP to City Lite)…');
  atualizar({ aoProgresso: n => console.log(`  ${(n / 1e6).toFixed(1)} milhões de linhas…`) })
    .then(r => console.log(`Pronto: base ${r.versao}, ${r.faixas} faixas (${r.linhas} linhas lidas).`))
    .catch(err => { console.error('Erro:', err.message); process.exit(1); });
}
