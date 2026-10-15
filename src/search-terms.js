// Termos de busca padrão da mineração, agrupados pela categoria do site em que os produtos devem entrar.
// Cada linha vira "termo | categoria" na configuração (Painel → Mineração).
const GRUPOS = {
  informatica: [
    'computador', 'computador desktop', 'notebook', 'laptop', 'ultrabook', 'placa de video', 'processador', 'placa mae',
    'memoria ram', 'ssd', 'ssd nvme', 'hd interno', 'hd externo', 'fonte atx', 'cooler', 'water cooler', 'gabinete',
    'pasta termica', 'monitor', 'monitor gamer', 'teclado', 'teclado mecanico', 'mouse', 'mouse gamer', 'mousepad',
    'headset', 'webcam', 'microfone usb', 'caixa de som pc', 'adaptador wifi', 'hub usb', 'pendrive', 'nobreak',
    'estabilizador', 'cabo hdmi', 'cabo displayport', 'suporte monitor',
  ],
  celulares: [
    'smartphone', 'celular', 'iphone', 'android', 'tablet', 'ipad', 'celular basico',
    'smartwatch', 'relogio inteligente', 'smartband', 'pulseira inteligente', 'relogio de pulso', 'relogio digital',
    'relogio analogico', 'capinha celular', 'pelicula de vidro', 'carregador celular', 'carregador por inducao',
    'cabo usb-c', 'cabo lightning', 'powerbank', 'suporte veicular celular',
  ],
  audio_tv: [
    'fone de ouvido', 'fone bluetooth', 'fone tws', 'airpods', 'caixa de som bluetooth', 'soundbar', 'headphone',
    'smart tv', 'tv 4k', 'tv oled', 'tv qled', 'projetor', 'suporte para tv', 'receiver', 'antena digital',
    'echo dot', 'alexa', 'assistente virtual', 'lampada inteligente', 'interruptor inteligente', 'tomada inteligente',
    'fechadura digital', 'camera de seguranca wifi', 'sensor de presenca', 'controle remoto universal infravermelho',
  ],
  games: [
    'playstation 5', 'ps5', 'playstation 4', 'ps4', 'xbox series x', 'xbox series s', 'nintendo switch', 'console retro',
    'jogo midia fisica', 'controle videogame', 'manete', 'volante gamer', 'cadeira gamer', 'dock switch',
    'carregador de controle', 'skin console',
  ],
  eletrodomesticos: [
    'geladeira', 'refrigerador', 'freezer', 'fogao', 'fogao 4 bocas', 'cooktop', 'forno eletrico', 'forno embutir',
    'coifa', 'depurador de ar', 'lava loucas', 'maquina de lavar', 'lava e seca', 'tanquinho', 'centrifuga de roupas',
    'secadora de roupas', 'ar condicionado', 'ar split', 'ar inverter', 'ventilador', 'ventilador de teto',
    'circulador de ar', 'aquecedor eletrico', 'climatizador', 'umidificador de ar', 'desumidificador',
  ],
  cozinha: [
    'air fryer', 'fritadeira eletrica', 'micro-ondas', 'liquidificador', 'batedeira', 'batedeira planetaria', 'cafeteira',
    'cafeteira de capsula', 'cafeteira espresso', 'chaleira eletrica', 'panela de arroz eletrica',
    'panela de pressao eletrica', 'sanduicheira', 'grill', 'torradeira', 'processador de alimentos', 'mixer',
    'aspirador de po', 'aspirador robo', 'aspirador vertical', 'ferro de passar', 'vaporizador de roupas',
  ],
  casa: [
    'cama', 'cama box', 'colchao', 'colchao de casal', 'colchao solteiro', 'guarda roupa', 'comoda', 'cabeceira',
    'mesa de cabeceira', 'travesseiro', 'jogo de lencol', 'edredom', 'cobertor', 'sofa', 'sofa retratil', 'poltrona',
    'rack tv', 'painel tv', 'mesa de centro', 'estante', 'mesa escritorio', 'escrivaninha', 'cadeira de escritorio',
    'cadeira ergonomica', 'armario de cozinha', 'mesa de jantar', 'cadeiras de jantar', 'banqueta', 'espelho',
    'gabinete banheiro', 'lampada', 'lampada led', 'fita led', 'luminaria', 'lustre', 'pendente', 'abajur', 'cortina',
    'tapete', 'quadro decorativo', 'almofada',
  ],
  ferramentas: [
    'furadeira', 'parafusadeira', 'martelete', 'serra circular', 'esmerilhadeira', 'politriz', 'jogo de chaves',
    'alicate', 'martelo', 'trena', 'trena laser', 'caixa de ferramentas', 'lavadora de alta pressao',
    'compressor de ar', 'chuveiro eletrico', 'torneira', 'fechadura', 'refletor led', 'escada articulada',
    'cortador de grama', 'rocadeira', 'mangueira', 'lavadora jardim',
  ],
  beleza: [
    'secador de cabelo', 'chapinha', 'prancha alisadora', 'escova secadora', 'babyliss', 'maquininha de cortar cabelo',
    'aparador de pelos', 'barbeador eletrico', 'skincare', 'protetor solar', 'hidratante', 'perfume importado',
    'perfume nacional', 'batom', 'base facial', 'paleta de sombras', 'rimel',
  ],
  saude: [
    'balanca digital', 'balanca bioimpedancia', 'termometro digital', 'aparelho de pressao', 'oximetro', 'inalador',
    'nebulizador', 'massageador',
  ],
  esporte: [
    'bicicleta', 'bicicleta ergometrica', 'esteira eletrica', 'halteres', 'kettlebell', 'elastico extensor',
    'tapete yoga', 'suplemento', 'whey protein', 'creatina', 'pre treino', 'patinete eletrico', 'skate',
    'barraca de camping', 'colchao inflavel', 'cooler termico',
  ],
  moda: [
    'camiseta', 'camisa social', 'calca jeans', 'bermuda', 'shorts', 'vestido', 'saia', 'moletom', 'jaqueta', 'casaco',
    'roupa intima', 'meias', 'tenis', 'tenis esportivo', 'tenis casual', 'sapato social', 'sandalia', 'chinelo', 'bota',
    'coturno', 'oculos de sol', 'bolsa feminina', 'mochila', 'mochila para notebook', 'mala de viagem', 'carteira',
    'cinto', 'joias', 'brinco', 'colar',
  ],
  brinquedos: [
    'carrinho de bebe', 'bebe conforto', 'cadeirinha para carro', 'berco', 'fralda descartavel', 'baba eletronica',
    'mamadeira', 'chupeta', 'lego', 'jogo de tabuleiro', 'boneca', 'carrinho de controle remoto', 'quebra-cabeca',
    'piscina de bolinhas', 'triciclo',
  ],
  automotivo: [
    'pneu', 'bateria de carro', 'oleo para motor', 'som automotivo', 'multimidia', 'camera de re', 'cera automotiva',
    'aspirador automotivo', 'capacete moto',
  ],
  pets: [
    'racao cao', 'racao gato', 'areia higienica', 'cama pet', 'coleira', 'guia peitoral', 'arranhador gato',
    'tapete higienico', 'comedouro',
  ],
};

const DEFAULT_SEARCH_TERMS = Object.entries(GRUPOS)
  .flatMap(([cat, termos]) => termos.map(t => `${t} | ${cat}`))
  .join('\n');

module.exports = { GRUPOS, DEFAULT_SEARCH_TERMS };
