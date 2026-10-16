// Catálogo de conquistas dos perfis. Cada família tem degraus (bronze → diamante) ligados a uma métrica;
// as especiais valem uma vez só. XP das conquistas define o nível do perfil (como na Steam).

const TIERS = {
  inicio: { nome: 'Início', xp: 25 },
  bronze: { nome: 'Bronze', xp: 50 },
  prata: { nome: 'Prata', xp: 150 },
  ouro: { nome: 'Ouro', xp: 400 },
  diamante: { nome: 'Diamante', xp: 1000 },
  especial: { nome: 'Especial', xp: 200 },
};

// para: quem pode ganhar ('todos', 'afiliado', 'empresa', 'admin'). O admin vê e pode ganhar tudo.
const FAMILIAS = [
  {
    id: 'membro', nome: 'Membro', icone: '🗓️', metrica: 'dias_conta', para: 'todos', unidade: 'dias de conta',
    degraus: [[1, 'inicio', 'Chegou chegando'], [30, 'bronze', 'Frequentador'], [180, 'prata', 'Veterano'], [365, 'ouro', 'Lenda da casa'], [730, 'diamante', 'Patrimônio do Ofertou!']],
  },
  {
    id: 'cacador', nome: 'Caçador de ofertas', icone: '🎯', metrica: 'idas_loja', para: 'todos', unidade: 'idas à loja pelo site',
    degraus: [[1, 'inicio', 'Primeira caçada'], [25, 'bronze', 'Faro apurado'], [100, 'prata', 'Caçador nato'], [500, 'ouro', 'Mestre da pechincha'], [2000, 'diamante', 'Lenda das ofertas']],
  },
  {
    id: 'comprador', nome: 'Comprador', icone: '🛍️', metrica: 'compras_codigo', para: 'todos', unidade: 'compras confirmadas pelo código do Ofertou!',
    degraus: [[1, 'inicio', 'Primeira compra'], [5, 'bronze', 'Cliente fiel'], [25, 'prata', 'Carrinho cheio'], [100, 'ouro', 'Compra que compra'], [500, 'diamante', 'Black Friday ambulante']],
  },
  {
    id: 'divulgador', nome: 'Divulgador', icone: '📣', metrica: 'postagens', para: 'afiliado', unidade: 'ofertas postadas',
    degraus: [[1, 'inicio', 'Primeiro post'], [50, 'bronze', 'Megafone'], [250, 'prata', 'Rádio das ofertas'], [1000, 'ouro', 'Canal oficial'], [5000, 'diamante', 'Transmissão 24h']],
  },
  {
    id: 'influencia', nome: 'Influência', icone: '👆', metrica: 'cliques_links', para: 'afiliado', unidade: 'cliques nos seus links',
    degraus: [[10, 'inicio', 'Alguém clicou!'], [100, 'bronze', 'Chamou atenção'], [1000, 'prata', 'Influente'], [10000, 'ouro', 'Viralizou'], [50000, 'diamante', 'Fenômeno']],
  },
  {
    id: 'vendedor', nome: 'Vendas como afiliado', icone: '💰', metrica: 'vendas_afiliado', para: 'afiliado', unidade: 'vendas confirmadas com o seu link',
    degraus: [[1, 'inicio', 'Primeira comissão'], [10, 'bronze', 'Vendedor'], [50, 'prata', 'Vendedor de elite'], [250, 'ouro', 'Máquina de vendas'], [1000, 'diamante', 'Rei das comissões']],
  },
  {
    id: 'lojista', nome: 'Lojista', icone: '🏪', metrica: 'anuncios', para: 'empresa', unidade: 'anúncios publicados',
    degraus: [[1, 'inicio', 'Portas abertas'], [10, 'bronze', 'Vitrine montada'], [50, 'prata', 'Loja cheia'], [200, 'ouro', 'Megaloja']],
  },
  {
    id: 'vitrine', nome: 'Vitrine visitada', icone: '👀', metrica: 'cliques_anuncios', para: 'empresa', unidade: 'cliques nos seus anúncios',
    degraus: [[10, 'inicio', 'Primeiros clientes'], [100, 'bronze', 'Movimento na porta'], [1000, 'prata', 'Loja badalada'], [10000, 'ouro', 'Ponto de referência']],
  },
  {
    id: 'vendas-loja', nome: 'Vendas da loja', icone: '📦', metrica: 'vendas_empresa', para: 'empresa', unidade: 'vendas confirmadas pelo Ofertou!',
    degraus: [[1, 'inicio', 'Primeira venda'], [10, 'bronze', 'Caixa girando'], [50, 'prata', 'Sucesso de vendas'], [250, 'ouro', 'Campeã de vendas'], [1000, 'diamante', 'Império']],
  },
];

const ESPECIAIS = [
  { id: 'perfil-completo', nome: 'Cara nova', icone: '🪪', descricao: 'Colocou foto e descrição no perfil.', metrica: 'perfil_completo', para: 'todos' },
  { id: 'assinante', nome: 'Assinante', icone: '⭐', descricao: 'Tem um plano pago ativo.', metrica: 'assinante', para: 'todos' },
  { id: 'afiliado-pro', nome: 'Afiliado Pro', icone: '🚀', descricao: 'Usa a ferramenta de afiliado.', metrica: 'ferramenta', para: 'afiliado' },
  { id: 'pioneiro', nome: 'Pioneiro', icone: '🧭', descricao: 'Uma das 100 primeiras contas do Ofertou!.', metrica: 'pioneiro', para: 'todos' },
  { id: 'fundador', nome: 'Fundador', icone: '👑', descricao: 'Criou o Ofertou!.', metrica: 'admin', para: 'admin' },
];

// "1 dias de conta" → "1 dia de conta"
const SINGULAR = {
  'dias de conta': 'dia de conta',
  'idas à loja pelo site': 'ida à loja pelo site',
  'compras confirmadas pelo código do Ofertou!': 'compra confirmada pelo código do Ofertou!',
  'ofertas postadas': 'oferta postada',
  'vendas confirmadas com o seu link': 'venda confirmada com o seu link',
  'anúncios publicados': 'anúncio publicado',
  'vendas confirmadas pelo Ofertou!': 'venda confirmada pelo Ofertou!',
};
const singular = u => SINGULAR[u] || u;

// Lista plana: { id, nome, descricao, icone, tier, xp, metrica, alvo, familia, para }
const LISTA = [
  ...FAMILIAS.flatMap(f => f.degraus.map(([alvo, tier, nome], i) => ({
    id: `${f.id}-${i + 1}`, nome, icone: f.icone, tier, xp: TIERS[tier].xp, metrica: f.metrica, alvo,
    familia: f.id, familia_nome: f.nome, para: f.para,
    descricao: `${alvo.toLocaleString('pt-BR')} ${alvo === 1 ? singular(f.unidade) : f.unidade}${f.unidade.endsWith('!') ? '' : '.'}`,
  }))),
  ...ESPECIAIS.map(e => ({ ...e, tier: 'especial', xp: TIERS.especial.xp, alvo: 1, familia: 'especiais', familia_nome: 'Especiais' })),
];
const POR_ID = Object.fromEntries(LISTA.map(c => [c.id, c]));

// Nível a partir do XP: nível n exige 100·n·(n+1)/2 XP no total (cada nível pede um pouco mais).
function nivel(xp) {
  const n = Math.floor((Math.sqrt(1 + (8 * xp) / 100) - 1) / 2);
  const base = (100 * n * (n + 1)) / 2;
  const prox = (100 * (n + 1) * (n + 2)) / 2;
  return { nivel: n, xp, xp_nivel: xp - base, xp_proximo: prox - base };
}

module.exports = { TIERS, FAMILIAS, LISTA, POR_ID, nivel };
