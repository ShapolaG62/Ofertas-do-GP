// Página do grupo (tanoofertou.com.br/grupo): um link só para divulgar em bio, stories e anúncios. Cada pessoa vai
// para o primeiro grupo da lista que ainda não chegou no limite de entradas; quando todos lotam, vai para o último.
// Lista em Painel → Redes sociais → Página do grupo (um por linha: "Nome | link de convite | limite").
const settings = require('./settings');

const CONTAGEM = 'grupos_convite_entradas'; // { link: entradas } (chave interna)
function lista() {
  return String(settings.get('grupos_convite') || '').split(/\r?\n/).map(l => l.split('|').map(x => x.trim()))
    .map(([nome, link, limite]) => ({ nome: nome || 'Grupo', link, limite: Math.max(0, parseInt(limite, 10) || 0) }))
    .filter(g => /^https:\/\/(chat\.whatsapp\.com|t\.me|whatsapp\.com\/channel)\//i.test(g.link || ''));
}
function contagem() { try { return JSON.parse(settings.get(CONTAGEM) || '{}') || {}; } catch { return {}; } }

// Escolhe o grupo da vez e conta a entrada
function proximo() {
  const grupos = lista();
  if (!grupos.length) return null;
  const c = contagem();
  const g = grupos.find(x => !x.limite || (c[x.link] || 0) < x.limite) || grupos[grupos.length - 1];
  c[g.link] = (c[g.link] || 0) + 1;
  settings.set(CONTAGEM, JSON.stringify(c));
  return g;
}
function resumo() {
  const c = contagem();
  return lista().map(g => ({ ...g, entradas: c[g.link] || 0, lotado: Boolean(g.limite) && (c[g.link] || 0) >= g.limite }));
}
function zerar() { settings.set(CONTAGEM, '{}'); }

module.exports = { lista, proximo, resumo, zerar };
