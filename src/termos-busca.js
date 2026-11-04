// Busca de quem visita o site vira mineração: termo que não está na lista de mineração entra nela e é minerado na hora,
// e a página avisa quando as ofertas ficam prontas. "tênis" e "tênis nike" são termos diferentes (uma ou várias palavras);
// "nike tênis" e "tênis de nike" são o mesmo. Termo que nenhuma loja encontrou sai da lista: seria um pedido à toa nas
// rodadas seguintes (ex.: erro de digitação). Como qualquer pessoa dispara, há limite por IP e uma fila curta.
const db = require('./db');
const settings = require('./settings');
const { createLimiter } = require('./ratelimit');
const { classifyCategory } = require('./categorize');

db.db.exec(`CREATE TABLE IF NOT EXISTS termos_auto (
  chave TEXT PRIMARY KEY,
  termo TEXT NOT NULL,
  encontradas INTEGER NOT NULL DEFAULT 0,
  gravadas INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'e', 'a', 'o', 'em', 'p']);
const MAX_SIMULTANEAS = 2, MAX_FILA = 30, GUARDA_MS = 30 * 60 * 1000;
const porIp = createLimiter(10, 60); // cada IP dispara até 10 minerações por hora
const trabalhos = new Map(); // chave -> { termo, status, encontradas, gravadas, em }
const fila = [];
let rodando = 0;

const limpo = q => String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Mesma chave para a mesma busca: sem acento, sem "de/para/com", sem plural e em qualquer ordem
const chaveDe = q => [...new Set(limpo(q).split(' ').filter(w => w && !PALAVRAS_VAZIAS.has(w)).map(w => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)))].sort().join(' ');

function valido(q) {
  const t = String(q || '').replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > 60 || t.startsWith('#') || /[<>{}|\\]|:\/\/|^www\./i.test(t)) return false;
  const palavras = limpo(t).split(' ').filter(Boolean);
  return palavras.length >= 1 && palavras.length <= 8 && /[a-z]/.test(palavras.join('')) && chaveDe(t).length >= 2;
}

const cadastrado = chave => settings.getSearchTerms().some(t => chaveDe(t.query) === chave);

function acrescentar(termo) {
  const atual = String(settings.get('search_terms') || '').replace(/\s+$/, '');
  const cat = classifyCategory(termo);
  settings.set('search_terms', `${atual}\n${termo.replace(/\s+/g, ' ').trim()}${cat && cat !== 'outros' ? ` | ${cat}` : ''}`);
}
function retirar(chave) {
  const linhas = String(settings.get('search_terms') || '').split(/\r?\n/);
  settings.set('search_terms', linhas.filter(l => chaveDe(l.split('|')[0]) !== chave).join('\n'));
}

async function processar() {
  while (rodando < MAX_SIMULTANEAS && fila.length) {
    const chave = fila.shift();
    const job = trabalhos.get(chave);
    if (!job) continue;
    rodando++;
    job.status = 'minerando';
    require('./miner').minerarTermo(job.termo).then(r => {
      job.encontradas = r.encontradas; job.gravadas = r.gravadas;
      if (r.encontradas || r.falhas) {
        db.run(`INSERT INTO termos_auto (chave, termo, encontradas, gravadas) VALUES (?, ?, ?, ?)
                ON CONFLICT(chave) DO UPDATE SET encontradas = excluded.encontradas, gravadas = excluded.gravadas`, chave, job.termo, r.encontradas, r.gravadas);
      } else {
        retirar(chave); // todas as lojas responderam e nenhuma tem: não fica gastando as próximas rodadas
      }
      if (r.gravadas) require('./busca-ofertas').montar(); // a lista já sai pronta quando a pessoa recarregar
      job.status = r.gravadas ? 'pronto' : 'sem_ofertas';
    }).catch(err => {
      console.error('[TERMOS]', err.message);
      job.status = 'sem_ofertas';
    }).finally(() => {
      rodando--;
      setTimeout(() => trabalhos.delete(chave), GUARDA_MS).unref?.();
      processar();
    });
  }
}

const publico = job => ({ status: job.status, termo: job.termo, gravadas: job.gravadas });

// Quem pesquisou algo: decide se precisa minerar. status: cadastrado | minerando | pronto | sem_ofertas | limite | ignorado
function pedir(q, ip) {
  if (!valido(q)) return { status: 'ignorado' };
  const termo = String(q).replace(/\s+/g, ' ').trim();
  const chave = chaveDe(termo);
  const job = trabalhos.get(chave);
  // Já minerado: quem recarregou (ou chegou depois) vê as ofertas, sem o aviso de recarregar de novo. Só quem esperou
  // recebe o "pronto", perguntando em situacao().
  if (job) return job.status === 'pronto' ? { status: 'cadastrado' } : publico(job);
  if (cadastrado(chave)) return { status: 'cadastrado' };
  if (fila.length >= MAX_FILA || porIp.hit(ip)) return { status: 'limite' };
  const novo = { termo, status: 'minerando', encontradas: 0, gravadas: 0 };
  trabalhos.set(chave, novo);
  acrescentar(termo);
  fila.push(chave);
  processar();
  return publico(novo);
}

function situacao(q) {
  const job = trabalhos.get(chaveDe(q));
  return job ? publico(job) : { status: 'cadastrado' };
}

const recentes = () => db.all('SELECT termo, encontradas, gravadas, criado_em FROM termos_auto ORDER BY criado_em DESC LIMIT 30');

module.exports = { pedir, situacao, chaveDe, valido, recentes };
