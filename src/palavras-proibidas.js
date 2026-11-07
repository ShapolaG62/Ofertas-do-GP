// Palavras que a mineração não pode trazer para o site (Painel → Mineração → Palavras proibidas na mineração).
// Vale para tudo que chega sozinho (mineração, radar e extensão do Chrome); ofertas cadastradas à mão e produtos de lojas parceiras não passam aqui.
// A comparação é por palavra inteira, sem acento e aceitando o plural: "arma" barra "armas", mas não "armário" nem "farmácia".
const db = require('./db');
const settings = require('./settings');

const CHAVE = 'mineracao_palavras_proibidas';
const MIN_LETRAS = 2, MAX_LETRAS = 60, MAX_PALAVRAS = 1000;

if (!db.all('PRAGMA table_info(offers)').some(c => c.name === 'oculto_palavra')) {
  db.db.exec('ALTER TABLE offers ADD COLUMN oculto_palavra INTEGER NOT NULL DEFAULT 0');
}

const normalizar = v => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function separar(texto) {
  const vistas = new Set();
  return String(texto || '').split(/[,;\r\n]+/).map(p => p.replace(/\s+/g, ' ').trim()).filter(p => {
    const n = normalizar(p);
    if (!n || vistas.has(n)) return false;
    vistas.add(n);
    return true;
  });
}

const ordenar = lista => [...lista].sort((a, b) => normalizar(a).localeCompare(normalizar(b)));
const listar = () => ordenar(separar(settings.get(CHAVE)));

// A expressão só muda quando a lista muda: a mineração confere muitas ofertas por rodada
let cache = { texto: null, regex: null };
function expressao() {
  const texto = String(settings.get(CHAVE) || '');
  if (cache.texto !== texto) {
    const termos = separar(texto).map(normalizar);
    cache = { texto, regex: termos.length ? new RegExp(`(?:^| )(?:${termos.join('|')})(?:s|es)?(?: |$)`) : null };
  }
  return cache.regex;
}

function bloqueia(produto) {
  const regex = expressao();
  return Boolean(regex && regex.test(normalizar(produto)));
}

// Tira do ar as ofertas mineradas que caem na lista e devolve as que saíram só por uma palavra retirada.
// Nada é apagado, e uma oferta escondida à mão continua escondida.
function aplicar() {
  const regex = expressao();
  const caiu = produto => Boolean(regex && regex.test(normalizar(produto)));
  return db.transaction(() => {
    let ocultadas = 0, devolvidas = 0;
    for (const o of db.all(`SELECT id, produto FROM offers WHERE fonte = 'auto' AND oculto = 0`)) {
      if (caiu(o.produto)) { db.run('UPDATE offers SET oculto = 1, oculto_palavra = 1 WHERE id = ?', o.id); ocultadas++; }
    }
    for (const o of db.all('SELECT id, produto FROM offers WHERE oculto_palavra = 1 AND oculto = 1')) {
      if (!caiu(o.produto)) { db.run('UPDATE offers SET oculto = 0, oculto_palavra = 0 WHERE id = ?', o.id); devolvidas++; }
    }
    return { ocultadas, devolvidas };
  });
}

const foraDoAr = () => db.get('SELECT COUNT(*) AS n FROM offers WHERE oculto_palavra = 1 AND oculto = 1').n;
const estado = () => ({ palavras: listar(), fora_do_ar: foraDoAr() });

function erro(mensagem) { const e = new Error(mensagem); e.status = 400; return e; }

function gravar(lista) {
  settings.set(CHAVE, ordenar(lista).join(', '));
  const feito = aplicar();
  require('./busca-ofertas').atualizar().catch(() => {});
  return { ...estado(), ...feito };
}

function adicionar(texto) {
  const novas = separar(texto);
  if (!novas.length) throw erro('Digite uma palavra.');
  for (const p of novas) {
    const n = normalizar(p).length;
    if (n < MIN_LETRAS || n > MAX_LETRAS) throw erro(`"${p.slice(0, MAX_LETRAS)}" precisa ter de ${MIN_LETRAS} a ${MAX_LETRAS} letras.`);
  }
  const atual = listar();
  const tem = new Set(atual.map(normalizar));
  const entram = novas.filter(p => !tem.has(normalizar(p)));
  if (!entram.length) throw erro(novas.length > 1 ? 'Essas palavras já estão na lista.' : 'Essa palavra já está na lista.');
  if (atual.length + entram.length > MAX_PALAVRAS) throw erro(`A lista aceita até ${MAX_PALAVRAS} palavras.`);
  return { ...gravar([...atual, ...entram]), adicionadas: entram };
}

function remover(palavra) {
  const alvo = normalizar(palavra);
  const atual = listar();
  const fica = atual.filter(p => normalizar(p) !== alvo);
  if (fica.length === atual.length) throw erro('Essa palavra não está na lista.');
  return gravar(fica);
}

module.exports = { CHAVE, bloqueia, aplicar, estado, listar, adicionar, remover, normalizar };
