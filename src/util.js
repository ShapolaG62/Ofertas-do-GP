const axios = require('axios');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
};

const http = axios.create({ timeout: 15000, headers: BROWSER_HEADERS, maxRedirects: 5 });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Converte "R$ 1.299,90", "1299.90", "1.000" etc. em número.
function parseBRL(str) {
  if (str == null) return null;
  if (typeof str === 'number') return Number.isFinite(str) ? str : null;
  let clean = String(str).replace(/[^\d.,]/g, '');
  if (!clean) return null;
  if (clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes('.')) {
    const parts = clean.split('.');
    if (!(parts.length === 2 && parts[1].length <= 2)) clean = clean.replace(/\./g, '');
  }
  const val = parseFloat(clean);
  return Number.isFinite(val) ? val : null;
}

const round2 = n => Math.round(n * 100) / 100;

// Calcula o desconto e diz se a oferta é aceitável (preço anterior real maior que o atual).
function discountOf(current, previous) {
  if (!current || !previous || previous <= current) return 0;
  return Math.round(((previous - current) / previous) * 100);
}

// Extrai um JSON (objeto ou array) começando na posição "start" de um texto,
// respeitando strings, para ler dados embutidos nas páginas.
function extractJsonAt(text, start) {
  const open = text[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  return null;
}

function absoluteUrl(url, base) {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${base}${url}`;
  return url.replace(/^http:\/\//, 'https://');
}

module.exports = { http, sleep, parseBRL, round2, discountOf, extractJsonAt, absoluteUrl, BROWSER_HEADERS };
