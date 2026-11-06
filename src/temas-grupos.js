// Tipos de produto para os grupos: juntam as categorias do site em nomes fáceis (Tecnologia, Casa, Automóveis…), dizem de
// que tipo é cada oferta e sugerem o tipo de um grupo pelo nome dele.
const TEMAS = [
  { id: 'tecnologia', nome: 'Tecnologia', icone: '💻', categorias: ['informatica', 'celulares', 'audio_tv', 'games'],
    palavras: ['tecnologia', 'tech', 'informatica', 'eletronico', 'celular', 'smartphone', 'iphone', 'android', 'notebook', 'computador', 'pc gamer', 'hardware', 'tv', 'audio', 'games', 'gamer', 'playstation', 'xbox', 'nintendo'] },
  { id: 'casa', nome: 'Casa', icone: '🏠', categorias: ['casa', 'cozinha', 'eletrodomesticos', 'limpeza'],
    palavras: ['casa', 'lar', 'decoracao', 'cozinha', 'eletrodomestico', 'moveis', 'limpeza', 'utilidades', 'cama', 'mesa e banho'] },
  { id: 'automoveis', nome: 'Automóveis', icone: '🚗', categorias: ['automotivo'],
    palavras: ['automovel', 'automoveis', 'automotivo', 'carro', 'carros', 'moto', 'motos', 'veiculo', 'pneu', 'auto pecas', 'autopecas'] },
  { id: 'moda', nome: 'Moda', icone: '👗', categorias: ['moda'],
    palavras: ['moda', 'roupa', 'roupas', 'calcado', 'calcados', 'tenis', 'sapato', 'look', 'feminina', 'masculina', 'shein'] },
  { id: 'beleza', nome: 'Beleza e saúde', icone: '💄', categorias: ['beleza', 'saude'],
    palavras: ['beleza', 'maquiagem', 'perfume', 'perfumaria', 'cosmetico', 'skincare', 'cabelo', 'saude', 'farmacia', 'bem estar', 'suplemento'] },
  { id: 'esporte', nome: 'Esporte', icone: '🏋️', categorias: ['esporte'],
    palavras: ['esporte', 'esportes', 'fitness', 'academia', 'treino', 'corrida', 'bike', 'bicicleta', 'futebol'] },
  { id: 'bebes', nome: 'Bebês e brinquedos', icone: '🧸', categorias: ['brinquedos'],
    palavras: ['bebe', 'bebes', 'crianca', 'criancas', 'infantil', 'brinquedo', 'brinquedos', 'mamae', 'maternidade', 'kids'] },
  { id: 'pets', nome: 'Pets', icone: '🐾', categorias: ['pets'],
    palavras: ['pet', 'pets', 'cachorro', 'gato', 'racao', 'animal', 'animais'] },
  { id: 'ferramentas', nome: 'Ferramentas', icone: '🔧', categorias: ['ferramentas'],
    palavras: ['ferramenta', 'ferramentas', 'construcao', 'reforma', 'obra', 'jardim', 'bricolagem'] },
  { id: 'alimentos', nome: 'Alimentos', icone: '🛒', categorias: ['alimentos'],
    palavras: ['alimento', 'alimentos', 'mercado', 'supermercado', 'bebida', 'bebidas', 'comida', 'cafe', 'vinho'] },
];

// Lojas que cada grupo pode escolher
const LOJAS = [
  { id: 'mercadolivre', nome: 'Mercado Livre' }, { id: 'shopee', nome: 'Shopee' }, { id: 'amazon', nome: 'Amazon' },
  { id: 'magalu', nome: 'Magalu' }, { id: 'kabum', nome: 'KaBuM!' },
];
const listarLojas = () => LOJAS.map(l => ({ ...l }));

const semAcento = v => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const paraTela = t => ({ id: t.id, nome: t.nome, icone: t.icone, categorias: t.categorias });
const listar = () => TEMAS.map(paraTela);

// De que tipo é uma oferta (pela categoria dela)
function temaDaCategoria(categoria) {
  const t = TEMAS.find(x => x.categorias.includes(categoria));
  return t ? paraTela(t) : { id: 'outros', nome: 'Outros', icone: '🏷️', categorias: [] };
}
// Tipos que o nome do grupo indica ("Ofertas Tech 2" → Tecnologia). Palavra inteira, para "lar" não bater em "popular".
function temasDoNome(nome) {
  const limpo = ` ${semAcento(nome).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  return TEMAS.filter(t => t.palavras.some(p => limpo.includes(` ${p} `))).map(t => t.id);
}
const categoriasDoNome = nome => temasDoNome(nome).flatMap(id => TEMAS.find(t => t.id === id).categorias);

// Grupos para a tela: com os tipos salvos ou, se ainda não foi escolhido, o que o nome sugere
function paraTelaGrupos(grupos, escolhidos, baseFoto) {
  const salvos = new Map(escolhidos.map(g => [g.id, g]));
  return grupos.map(g => {
    const salvo = salvos.get(g.id);
    return {
      id: g.id, nome: g.nome, membros: g.membros ?? null, foto: `${baseFoto}${encodeURIComponent(g.id)}`, salvo: Boolean(salvo),
      categorias: salvo ? salvo.categorias : [], lojas: salvo?.lojas || [], sugestao: salvo ? [] : temasDoNome(g.nome),
    };
  });
}

module.exports = { listarLojas, listar, temaDaCategoria, temasDoNome, categoriasDoNome, paraTelaGrupos };
