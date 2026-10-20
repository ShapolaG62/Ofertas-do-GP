// Avisos na entrada: janelas com texto e imagem (cupom, novidade, produto, aviso) que aparecem para quem abre a tela de
// ofertas. Criados em Painel → Avisos na entrada; mostrados por public/js/avisos-entrada.js.
// Quantas vezes cada pessoa vê (uma vez, uma vez por dia ou toda visita) é controlado no navegador; editar um aviso
// muda a versão dele e quem já tinha visto vê de novo.
const db = require('./db');
const { assertPublicUrl } = require('./net');

db.db.exec(`
  CREATE TABLE IF NOT EXISTS avisos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL DEFAULT 'novidade',  -- cupom | novidade | produto | aviso
    titulo TEXT NOT NULL,
    texto TEXT,
    imagem TEXT,
    cupom TEXT,                             -- código do cupom (só no tipo cupom)
    botao_texto TEXT,
    link TEXT,                              -- https://… ou caminho do site (/loja/…)
    publico TEXT NOT NULL DEFAULT 'todos',  -- todos | consumidor | empresa | afiliado
    frequencia TEXT NOT NULL DEFAULT 'uma_vez', -- uma_vez | diaria | sempre
    inicio TEXT,                            -- UTC; nulo = desde já
    fim TEXT,                               -- UTC; nulo = sem data para sair
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    versao INTEGER NOT NULL DEFAULT 1,
    visualizacoes INTEGER NOT NULL DEFAULT 0,
    cliques INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const TIPOS = { cupom: 'Cupom', novidade: 'Novidade', produto: 'Produto', aviso: 'Aviso' };
const PUBLICOS = { todos: 'Todo mundo', consumidor: 'Consumidores', empresa: 'Lojas (empresas)', afiliado: 'Afiliados' };
const FREQUENCIAS = { uma_vez: 'Uma vez por pessoa', diaria: 'Uma vez por dia', sempre: 'Toda vez que entrar' };
const MAX_ATIVOS = 5; // no máximo 5 janelas seguidas para a mesma pessoa
const IMAGEM = /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, rotulo, { max, obrigatorio = false, linhas = false }) => {
  let s = String(v ?? '').replace(/\r/g, '');
  s = linhas ? s.split('\n').map(l => l.trim().replace(/\s+/g, ' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim() : s.trim().replace(/\s+/g, ' ');
  if (!s) { if (obrigatorio) throw fail(`Informe ${rotulo}.`); return null; }
  if (s.length > max) throw fail(`${rotulo[0].toUpperCase()}${rotulo.slice(1)}: no máximo ${max} caracteres.`);
  return s;
};
// Data "AAAA-MM-DD" (horário de Brasília) → UTC, no começo ou no fim do dia
const data = (v, rotulo, fimDoDia) => {
  const s = String(v || '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw fail(`Data de ${rotulo} inválida.`);
  return new Date(`${s}T${fimDoDia ? '23:59:59' : '00:00:00'}-03:00`).toISOString().replace('T', ' ').slice(0, 19);
};

function validar(b) {
  const tipo = TIPOS[b.tipo] ? b.tipo : 'novidade';
  const imagem = String(b.imagem || '').trim() || null;
  if (imagem && !IMAGEM.test(imagem)) {
    if (!/^https:\/\//i.test(imagem) || imagem.length > 500) throw fail('Imagem inválida: envie um arquivo ou use um link https://');
    assertPublicUrl(imagem);
  }
  let link = String(b.link || '').trim() || null;
  if (link) {
    if (/^\/(?!\/)/.test(link)) { if (link.length > 300) throw fail('Link muito longo.'); }
    else if (/^https:\/\//i.test(link) && link.length <= 500) assertPublicUrl(link);
    else throw fail('O link precisa começar com https:// ou ser um endereço do site começando com / (ex.: /loja/minha-loja).');
  }
  const a = {
    tipo,
    titulo: texto(b.titulo, 'o título', { max: 80, obrigatorio: true }),
    texto: texto(b.texto, 'o texto', { max: 600, linhas: true }),
    imagem,
    cupom: tipo === 'cupom' ? texto(b.cupom, 'o código do cupom', { max: 40, obrigatorio: true }) : null,
    botao_texto: texto(b.botao_texto, 'o texto do botão', { max: 30 }),
    link,
    publico: PUBLICOS[b.publico] ? b.publico : 'todos',
    frequencia: FREQUENCIAS[b.frequencia] ? b.frequencia : 'uma_vez',
    inicio: data(b.inicio, 'início', false),
    fim: data(b.fim, 'término', true),
    ordem: Math.max(0, Math.min(99, Math.round(Number(b.ordem) || 0))),
    ativo: b.ativo === false || b.ativo === '0' || b.ativo === 0 ? 0 : 1,
  };
  if (!a.texto && !a.imagem) throw fail('Escreva um texto ou envie uma imagem.');
  if (a.link && !a.botao_texto) a.botao_texto = { cupom: 'Usar o cupom', produto: 'Ver produto' }[tipo] || 'Saiba mais';
  if (a.inicio && a.fim && a.fim <= a.inicio) throw fail('A data de término precisa ser depois do início.');
  return a;
}

function salvar(b, id = null) {
  const a = validar(b || {});
  const cols = Object.keys(a);
  if (id) {
    // Mudou o conteúdo: nova versão (quem já viu vê de novo); só ligar/desligar ou mudar a ordem não conta
    const antes = db.get('SELECT * FROM avisos WHERE id = ?', id);
    if (!antes) throw fail('Aviso não encontrado.', 404);
    const mudou = ['tipo', 'titulo', 'texto', 'imagem', 'cupom', 'botao_texto', 'link'].some(k => (antes[k] ?? null) !== (a[k] ?? null));
    db.run(`UPDATE avisos SET ${cols.map(c => `${c} = ?`).join(', ')}${mudou ? ', versao = versao + 1' : ''} WHERE id = ?`, ...Object.values(a), id);
    return id;
  }
  return Number(db.run(`INSERT INTO avisos (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...Object.values(a)).lastInsertRowid);
}

const SITUACAO = `CASE WHEN ativo = 0 THEN 'pausado'
  WHEN inicio IS NOT NULL AND inicio > datetime('now') THEN 'agendado'
  WHEN fim IS NOT NULL AND fim < datetime('now') THEN 'encerrado'
  ELSE 'no_ar' END`;

const listar = () => db.all(`SELECT *, ${SITUACAO} AS situacao FROM avisos ORDER BY ativo DESC, ordem, id DESC`);
const excluir = id => db.run('DELETE FROM avisos WHERE id = ?', id).changes;
const ligar = (id, ativo) => db.run('UPDATE avisos SET ativo = ? WHERE id = ?', ativo ? 1 : 0, id);

// Avisos no ar para esta pessoa (u = conta do site logada, ou nulo)
function paraVisitante(u) {
  const tipo = u?.tipo === 'empresa' ? 'empresa' : u?.tipo === 'afiliado' || u?.cliente_id ? 'afiliado' : u ? 'consumidor' : null;
  return db.all(`SELECT id, tipo, titulo, texto, imagem, cupom, botao_texto, link, frequencia, versao FROM avisos
    WHERE ${SITUACAO} = 'no_ar' AND (publico = 'todos' OR publico = ?) ORDER BY ordem, id DESC LIMIT ?`, tipo || '-', MAX_ATIVOS);
}

// Estatísticas (uma contagem por navegador e por dia: o navegador só chama depois de mostrar ou clicar)
const vistos = new Map();
function contar(id, campo, chave) {
  const k = `${campo}:${id}:${chave}:${new Date().toISOString().slice(0, 10)}`;
  if (vistos.has(k)) return;
  if (vistos.size > 50000) vistos.clear();
  vistos.set(k, 1);
  db.run(`UPDATE avisos SET ${campo === 'clique' ? 'cliques = cliques + 1' : 'visualizacoes = visualizacoes + 1'} WHERE id = ?`, id);
}

module.exports = { TIPOS, PUBLICOS, FREQUENCIAS, MAX_ATIVOS, salvar, listar, excluir, ligar, paraVisitante, contar };
