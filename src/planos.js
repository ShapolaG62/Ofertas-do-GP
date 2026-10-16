// Planos pagos mostrados na página de login. Nome, preço, dias de acesso e se está à venda vêm do painel.
const settings = require('./settings');

const PLANOS = {
  consumidor: {
    conta: 'usuario', perfil: 'consumidor', chamada: 'Para quem quer economizar',
    beneficios: [
      'Acesso imediato, sem esperar aprovação',
      'Milhares de ofertas reais de Amazon, Mercado Livre, AliExpress, KaBuM! e mais',
      'Preços conferidos várias vezes por dia',
      'Busca, filtros por loja, categoria, preço e desconto',
      'Histórico de preço para não cair em desconto falso',
    ],
  },
  empresa: {
    conta: 'usuario', perfil: 'empresa', chamada: 'Para lojas que querem vender mais',
    beneficios: [
      'Tudo do plano Caçador de Ofertas',
      'Sua loja dentro do site, com página própria',
      'Criador de anúncios com fotos, cupom e frete',
      'Importação automática do catálogo (Shopify, WooCommerce ou feed XML)',
      'Seus produtos com desconto aparecem para todos os visitantes',
    ],
  },
  pro: {
    conta: 'cliente', perfil: null, chamada: 'Para quem divulga ofertas e ganha comissão', destaque: true,
    beneficios: [
      'Painel próprio com os SEUS links de afiliado (Amazon, Mercado Livre, KaBuM!, AliExpress, Shopee, Magalu)',
      'Mais de 20 mil ofertas reais mineradas para você postar',
      'Postagem automática no seu WhatsApp, Telegram, Facebook, Instagram e X',
      'Agendamento: ofertas nos seus grupos de manhã, à tarde e à noite',
      'Marca d\'água com o seu nome nas imagens',
    ],
  },
};

function plano(id, s = settings.getAll()) {
  const p = PLANOS[id];
  if (!p) return null;
  return {
    id,
    ...p,
    nome: s[`plano_${id}_nome`] || id,
    preco: Math.round(Number(String(s[`plano_${id}_preco`] || '0').replace(',', '.')) * 100) / 100,
    dias: Math.min(Math.max(parseInt(s[`plano_${id}_dias`], 10) || 30, 1), 3650),
    ativo: s[`plano_${id}_ativo`] !== '0',
  };
}

const listar = (s = settings.getAll()) => Object.keys(PLANOS).map(id => plano(id, s)).filter(p => p.ativo && p.preco > 0);

module.exports = { PLANOS, plano, listar };
