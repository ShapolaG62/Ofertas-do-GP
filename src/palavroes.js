// Filtro de xingamentos das mensagens (chat entre usuários/lojas e Suporte).
// Troca cada xingamento por * do mesmo tamanho e diz quais palavras foram encontradas.
// Compara a PALAVRA INTEIRA já "limpa" (sem acento, sem letras repetidas, com números trocados por letras:
// p0rr4 → porra), para pegar as variações sem estragar palavras normais ("cuidado", "computador", "disputa").
// Para acrescentar palavras: EXATAS (só a palavra) ou RAIZES (a palavra e as variações: merda, merdinha…).

// Palavras que só contam quando escritas sozinhas
const EXATAS = [
  'porra', 'caralho', 'caralha', 'krl', 'crl', 'merda', 'bosta', 'puta', 'puto', 'putas', 'putos', 'putaria', 'puteiro',
  'fdp', 'pqp', 'vsf', 'vtnc', 'tnc', 'tmnc', 'pnc', 'cu', 'cuzao', 'cuzona', 'cuzinho', 'buceta', 'boceta', 'xoxota', 'xota',
  'xereca', 'xereka', 'piroca', 'cacete', 'arrombado', 'arrombada', 'arrombados', 'arrombadas',
  'desgracado', 'desgracada', 'desgracados', 'babaca', 'babacas', 'otario', 'otaria', 'otarios', 'otarias', 'imbecil', 'imbecis',
  'idiota', 'idiotas', 'retardado', 'retardada', 'retardados', 'vagabundo', 'vagabunda', 'vagabundos', 'vadia', 'vadias',
  'corno', 'corna', 'cornos', 'viado', 'viadinho', 'bicha', 'sapatao', 'traveco', 'escroto', 'escrota', 'escrotos',
  'filhodaputa', 'foda', 'fodase', 'fodas', 'foder', 'fodeu', 'fode', 'fodido', 'fodida', 'fuder', 'fudeu', 'fudido', 'fudida',
  'punheta', 'punheteiro', 'broxa', 'cretino', 'cretina', 'canalha', 'canalhas', 'safado', 'safada', 'lazarento', 'lazarenta',
  'quenga', 'rapariga', 'mongoloide',
];
// Começo de palavra: pega a palavra e as variações (merdinha, caralhada, porrada, fodendo…)
const RAIZES = ['porr', 'caralh', 'merd', 'bost', 'fod', 'fud', 'punhet', 'arrombad', 'desgracad', 'cuzao', 'bucet', 'bocet',
  'xoxot', 'xerec', 'pirok', 'pirocudo', 'putari', 'putinh', 'vagabund', 'escrot', 'babac', 'otari', 'imbeci', 'retardad', 'viadag'];
// Palavras normais que começam igual a uma raiz e não podem ser trocadas
const PERMITIDAS = new Set(['boston', 'bostoniano', 'bostonianos', 'fodder', 'porrete', 'fuderal', 'merdeiro']);

const EXATAS_SET = new Set(EXATAS);
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };

// Deixa a palavra comparável: minúsculas, sem acento, números/símbolos trocados por letras e sem letras repetidas
function limpar(palavra) {
  const s = palavra.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[01345789@$!]/g, c => LEET[c] || c)
    .replace(/[^a-z]/g, '');
  return s.replace(/(.)\1+/g, '$1'); // "merdaaa" → "merda", "porraaa" → "pora" (ver abaixo)
}

// "porra" vira "pora" ao tirar repetidas: compara as duas formas
function ehXingamento(palavra) {
  const bruto = palavra.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[01345789@$!]/g, c => LEET[c] || c).replace(/[^a-z]/g, '');
  if (bruto.length < 2) return false;
  const semRep = limpar(palavra);
  const formas = new Set([bruto, semRep, bruto.replace(/(.)\1{2,}/g, '$1$1'), bruto.replace(/(.)\1{2,}/g, '$1')]);
  for (const f of formas) {
    if (PERMITIDAS.has(f)) return false;
    if (EXATAS_SET.has(f)) return true;
    if (RAIZES.some(r => f.startsWith(r) && f.length <= r.length + 7)) return true;
  }
  // "porra" sem repetidas fica "pora": confere as exatas também sem repetidas
  return EXATAS.some(e => e.replace(/(.)\1+/g, '$1') === semRep && semRep.length >= 3);
}

// Palavra = letras, números e alguns símbolos usados para disfarçar (p0rr@, m3rd4, p.o.r.r.a não)
const PALAVRA = /[\p{L}\p{N}@$!]+/gu;

// Devolve { texto (com ****), palavras: [originais encontradas] }
function censurar(texto) {
  const palavras = [];
  const filtrado = String(texto ?? '').replace(PALAVRA, p => {
    if (!/[\p{L}]/u.test(p) && !/[@$]/.test(p)) return p; // só números
    // "!" no fim é pontuação ("porra!"): separa antes de conferir
    const fim = p.match(/!+$/)?.[0] || '';
    const miolo = fim ? p.slice(0, -fim.length) : p;
    if (miolo && ehXingamento(miolo)) { palavras.push(miolo); return '*'.repeat([...miolo].length) + fim; }
    return p;
  });
  return { texto: filtrado, palavras };
}

module.exports = { censurar, ehXingamento };
