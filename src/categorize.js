// Classifica a oferta pelo título. Vence a regra cuja palavra-chave aparece PRIMEIRO no título
// (os títulos começam pelo produto: "SSD NVMe ... para Laptop", "Capa ... para iPhone"). Empate: ordem da lista,
// por isso as expressões específicas ("processador de alimentos", "cama pet") vêm antes das genéricas.
const RULES = [
  // ── Expressões específicas que contêm palavras de outras categorias ──
  ['cozinha', /processador de alimentos|multiprocessador|forno micro-?ondas|centr[íi]fuga de (frutas|sucos|alimentos)|balan[çc]a de cozinha/],
  ['automotivo', /aspirador (automotivo|veicular|para carro)|c[âa]mera de r[ée]|bateria (de|para) (carro|moto|autom)|som automotivo|multim[íi]dia (automotiv|veicular|para carro)|cera automotiva|[óo]leo (de |para )?motor/],
  ['pets', /cama (pet|para (cachorro|gato|c[ãa]es))|tapete higi[êe]nico|areia (higi[êe]nica|sanit[áa]ria)|arranhador|comedouro|bebedouro (pet|para (cachorro|gato))|guia peitoral|caixa de transporte/],
  ['esporte', /tapete (de )?yoga|colch[ãa]o infl[áa]vel|cooler t[ée]rmico|caixa t[ée]rmica|esteira (el[ée]trica|ergom|de corrida|dobr[áa]vel)|bicicleta ergom/],
  ['ferramentas', /lavadora de alta press[ãa]o|lavadora (de |para )?jardim|lavajato|caixa de ferramentas|maleta de ferramentas|kit de ferramentas|jogo de (chaves|soquetes|brocas|ferramentas)|cortador de grama|chuveiro el[ée]trico/],
  ['audio_tv', /suporte (articulado )?(para |de )?(tv|televis)|l[âa]mpada (inteligente|smart|wi-?fi)|interruptor (inteligente|smart|wi-?fi)|tomada (inteligente|smart|wi-?fi)|fechadura (digital|eletr[ôo]nica|biom[ée]trica|inteligente)|c[âa]mera (de seguran[çc]a|ip\b|wi-?fi|de vigil)|sensor de presen[çc]a|controle remoto universal|echo (dot|show|pop)|\balexa\b|google (nest|home)|assistente virtual/],
  ['informatica', /cabo (hdmi|displayport|vga|de rede)|suporte (articulado )?(para |de )?monitor|caixa de som (para )?(pc|computador)|microfone (usb|condensador|para (pc|computador))|adaptador (wi-?fi|usb|bluetooth)|pasta t[ée]rmica|fonte (atx|para pc|real|\d{3,4} ?w)|fonte de alimenta[çc][ãa]o|\bfonte\b.{0,40}\b(atx|80 plus)\b|\bmini ?pc\b|water ?cooler|cooler (para |do )?(processador|cpu|gabinete)|\bfan\b|\bcooler\b|gabinete (gamer|mid|full|atx|micro)/],
  ['games', /cadeira gamer|volante (gamer|para (ps|xbox|pc))|dock (station )?(para )?(nintendo )?switch|(carregador|base|doca|esta[çc][ãa]o)\b.{0,50}\b(controles?|dualsense|joy-?cons?)\b|skin (para )?(console|controle|ps[45]|xbox)|jogo (de )?m[íi]dia f[íi]sica|jogos? (para |de )?(ps[45]|playstation|xbox|nintendo|switch)/],
  ['casa', /gabinete (de |para )?banheiro|cadeira (de escrit[óo]rio|ergon[ôo]mica|presidente|diretor)|cadeiras? (de )?jantar|mesa (de escrit[óo]rio|para escrit[óo]rio|escrit[óo]rio|de jantar|de centro|de cabeceira|para computador|gamer)|painel (para )?tv|rack (para )?tv|cama box|jogo de (len[çc]ol|cama|banho|toalhas|panelas)/],
  ['brinquedos', /carrinho de (beb[êe]|controle)|beb[êe] conforto|jogo de tabuleiro|piscina de bolinhas|(notebook|laptop|tablet|celular|computador) (infantil|educativo|de brinquedo)|brinquedo educativo/],
  ['beleza', /maquin(inh)?a de cortar cabelo|cortador de cabelo|secador de cabelo|escova (secadora|alisadora|rotativa)|prancha (alisadora|de cabelo)|protetor solar|base (facial|l[íi]quida)|paleta de sombras/],
  ['saude', /balan[çc]a (digital|de banheiro|corporal|bioimped)|aparelho de press[ãa]o|medidor de press[ãa]o/],

  // ── 1. Informática ──
  ['informatica', /notebook|laptop|ultrabook|macbook|chromebook|computador|\bdesktop\b|\bpc gamer\b|placa de v[íi]deo|\brtx ?\d|geforce|radeon|processador|placa[ -]m[ãa]e|mem[óo]ria ram|\bddr[345]\b|\bssd\b|nvme|\bhd (interno|externo)\b|disco r[íi]gido|\bmonitor\b|teclado|\bmouse\b|mousepad|headset|webcam|microfone|hub usb|pen ?drive|nobreak|no-break|estabilizador|roteador|repetidor|impressora|cartucho|toner|gabinete/],
  // ── 2. Celulares, tablets e relógios ──
  ['celulares', /iphone|smartphone|\bandroid\b(?! ?tv)|smart ?watch|smarphone|celular|galaxy [asmz]\d|redmi|poco |xiaomi (mi )?\d|motorola (moto|edge|g\d)|\bipad\b|tablet|smartwatch|smart ?band|rel[óo]gio|pulseira inteligente|capinha|\bcapa (para |de )?(celular|iphone|galaxy|samsung|motorola|xiaomi|redmi)|pel[íi]cula|power ?bank|carregador|cabo (usb|tipo|lightning)|suporte veicular|suporte (para |de )?celular/],
  // ── 3. Games ──
  ['games', /playstation|\bps[45]\b|xbox|nintendo|console|joystick|gamepad|dualsense|manete|controle (sem fio|gamer|xbox|ps[45]|(de |para )?videogame)/],
  // ── 4. TV, áudio e casa inteligente ──
  ['audio_tv', /\bfones?\b|headphone|earbuds?|\bbuds\b|airpods|\btws\b|caixas? (de som|ac[úu]stica)|alto-falante|soundbar|home theater|receiver|smart ?tv|\btv\b|televis|projetor|antena digital|\bjbl\b|c[âa]mera|gopro/],
  // ── 5. Eletrodomésticos ──
  ['eletrodomesticos', /geladeira|refrigerador|freezer|frigobar|fog[ãa]o|cooktop|forno|coifa|depurador|lava.?lou[cç]as|m[áa]quina de lavar|lavadora|lava e seca|tanquinho|centr[íi]fuga|secadora|ar.condicionado|ar split|split inverter|ar inverter|ventilador|circulador de ar|aquecedor|climatizador|umidificador|desumidificador|purificador|bebedouro/],
  // ── 6. Cozinha e eletroportáteis ──
  ['cozinha', /air ?fryer|fritadeira|micro-?ondas|liquidificador|batedeira|cafeteira|nespresso|dolce gusto|m[áa]quina de caf[ée]|m[áa]quina (el[ée]trica )?de (leite|p[ãa]o|sorvete|waffle|algod[ãa]o doce|pipoca)|pipoqueira|iogurteira|chaleira|panela|frigideira|sanduicheira|\bgrill\b|torradeira|mixer|espremedor|aspirador|rob[ôo] aspirador|ferro de passar|vaporizador/],
  // ── 7. Casa, móveis e decoração ──
  ['casa', /\bcama\b|(?<!\b(de|para|da|stand) )(?<!\bsuporte\b.{0,25})\bmesas?\b(?! (digitalizadora|de som|de luz|controladora))|colch[ãa]o|guarda.?roupa|c[ôo]moda|cabeceira|travesseiro|len[çc]ol|edredom|cobertor|\bmanta\b|sof[áa]|poltrona|\brack\b|\bestante|escrivaninha|arm[áa]rio|banqueta|espelho|l[âa]mpada|fita led|lumin[áa]ria|\blustre|\bpendente|abajur|cortina|tapete|quadro|almofada|toalha|organizador|cabide|prateleira|nicho/],
  // ── 8. Ferramentas, jardim e construção ──
  ['ferramentas', /furadeira|parafusadeira|martelete|serra|esmerilhadeira|politriz|chaves? (de fenda|de boca|catraca|de impacto|allen|torx)|alicate|martelo|trena|compressor|torneira|fechadura|refletor|escada|ro[çc]adeira|mangueira|ferramenta|n[íi]vel a laser|soprador/],
  // ── 9. Beleza e cuidados pessoais ──
  ['beleza', /perfume|parfum|body splash|\bed[pt]\b|eau de|col[ôo]nia|maquiagem|skincare|batom|r[íi]mel|shampoo|condicionador|hidratante|s[ée]rum|chapinha|babyliss|barbeador|aparador|depilador/],
  // ── Saúde e bem-estar ──
  ['saude', /term[ôo]metro|ox[íi]metro|inalador|nebulizador|massageador|vitamina|col[áa]geno|\b[ôo]mega ?3\b|balan[çc]a/],
  // ── 10. Esporte e fitness ──
  ['esporte', /whey|creatin|suplemento|pr[ée].?treino|bcaa|prote[íi]na|bicicleta|\bbike\b|esteira|halter|kettlebell|anilha|el[áa]stico extensor|colchonete|patinete|\bskate\b|barraca|camping|bola de (futebol|basquete|v[ôo]lei)|luva de boxe/],
  // ── 11. Moda e acessórios ──
  ['moda', /t[êe]nis|sapato|sand[áa]lia|chinelo|\bbotas?\b|coturno|camis[ae]|cal[çc]a|vestido|blusa|jaqueta|casaco|moletom|short|bermuda|bolsa|mochila|mala de viagem|\bmalas?\b|carteira|\bcinto\b|[óo]culos|cueca|calcinha|roupa [íi]ntima|regata|t-shirt|legging|suti[ãa]|\bmeias?\b|cropped|saia|macac[ãa]o|pijama|bon[ée]\b|chap[ée]u|\bj[óo]ias?\b|brincos?|\bcolar\b|\banel\b|pulseira/],
  // ── 12. Bebês e brinquedos ──
  ['brinquedos', /beb[êe]|cadeirinha|ber[çc]o|fralda|bab[áa] eletr[ôo]nica|mamadeira|chupeta|lego|brinquedo|boneca|quebra-?cabe[çc]a|triciclo|pel[úu]cia/],
  // ── 13. Automotivo e pets ──
  ['automotivo', /pneu|automotiv|multim[íi]dia|\bcarro\b|\bmotos?\b|capacete|para-?brisa|calota/],
  ['pets', /\bra[çc][ãa]o|\bpet\b|cachorro|\bc[ãa]es\b|\bgatos?\b|coleira/],
  // ── Outros ──
  ['limpeza', /sab[ãa]o|amaciante|detergente|desinfetante|papel higi[êe]nico|limpador multiuso|multiuso (spray|limpeza|\d)|alvejante/],
  ['alimentos', /caf[ée] (em|torrado|gr[ãa]os|sol[úu]vel)|c[áa]psulas? de caf|chocolate|azeite|cerveja|vinho|energ[ée]tico|\bleite (em p[óo]|integral|desnatado|semidesnatado|condensado|zero lactose)/],
];

// Ordem em que as categorias aparecem nos menus.
const CATEGORIES = ['informatica', 'celulares', 'games', 'audio_tv', 'eletrodomesticos', 'cozinha', 'casa', 'ferramentas',
  'beleza', 'saude', 'esporte', 'moda', 'brinquedos', 'automotivo', 'pets', 'limpeza', 'alimentos', 'outros'];

// Tipos de produto dentro de cada categoria (usados para filtrar e ordenar por nome de produto).
const SUBCATEGORIES = {
  informatica: [
    ['Notebooks', /notebook|laptop|ultrabook|macbook|chromebook/],
    ['Computadores', /computador|\bdesktop\b|\bpc gamer\b|\bmini ?pc\b|all in one/],
    ['Monitores', /monitor/],
    ['Componentes', /placa de v|\brtx\b|geforce|radeon|processador|mem[óo]ria ram|\bddr[345]\b|placa[ -]m[ãa]e|\bfonte\b|cooler|\bfan\b|gabinete|pasta t[ée]rmica/],
    ['Armazenamento', /\bssd\b|\bhd\b|nvme|disco r[íi]gido|pen ?drive|cart[ãa]o de mem|sandisk/],
    ['Teclados e mouses', /teclado|\bmouse\b|mousepad/],
    ['Headsets e microfones', /headset|microfone/],
    ['Webcams', /webcam/],
    ['Redes e Wi-Fi', /roteador|repetidor|\bmesh\b|adaptador wi-?fi|wi-?fi/],
    ['Energia', /nobreak|no-break|estabilizador/],
    ['Impressoras', /impressora|cartucho|toner/],
    ['Cabos e acessórios', /\bcabo\b|\bhub\b|adaptador|suporte|caixa de som/],
  ],
  celulares: [
    ['Tablets', /tablet|\bipad\b|galaxy tab/],
    ['Smartwatches e relógios', /smartwatch|smart ?band|rel[óo]gio|pulseira inteligente/],
    ['Acessórios', /capinha|\bcapa\b|pel[íi]cula|vidro|carregador|carregamento|\bcabo\b|suporte|power ?bank|protetor|para (iphone|celular|samsung|galaxy|xiaomi|redmi|motorola)/],
    ['iPhone', /iphone/],
    ['Samsung Galaxy', /galaxy|samsung/],
    ['Xiaomi', /xiaomi|redmi|poco/],
    ['Motorola', /motorola|moto [eg]\d|\bedge\b/],
    ['Celulares', /celular|smartphone|android/],
  ],
  games: [
    // "Nintendo Switch 32GB com 2 controles" é um console, não um controle
    ['Consoles', /(console|nintendo switch|playstation ?5|\bps5\b|xbox series).{0,40}\b\d+ ?(gb|tb)\b|\b\d+ ?(gb|tb)\b.{0,40}(nintendo switch|playstation|xbox)|playstation ?5 (edi[çc][ãa]o|digital|slim|pro)/],
    ['Cadeiras gamer', /cadeira/],
    ['Volantes', /volante/],
    ['Acessórios', /^para |adaptador|\bcabo\b|suporte|\bbase\b|carregamento|\bdock\b|\bskin\b|\bcase\b|pel[íi]cula|carregador|cooler|ventilador|\bcapa\b|bolsa|leitor de disco|figuras?\b/],
    ['Jogos', /\bjogos? |m[íi]dia f[íi]sica|edition|remaster|- (playstation|ps[45]|xbox|nintendo|switch)/],
    ['Controles', /controle|joystick|gamepad|dualsense|joy-con|manete/],
    ['Consoles', /\bconsole\b|ps5 (slim|pro|digital)|xbox series [sx]|nintendo switch|playstation ?[45]|\bps[45]\b|\bretr[ôo]\b/],
  ],
  audio_tv: [
    ['TVs', /smart ?tv|\btv\b|televis/],
    ['Suportes de TV', /suporte/],
    ['Caixas de som', /caixas? (de som|ac[úu]stica)|alto-falante|speaker|jbl (go|flip|charge|boombox|clip|partybox)/],
    ['Fones de ouvido', /\bfones?\b|headphone|earbuds?|\bbuds\b|airpods|\btws\b/],
    ['Soundbars e home theater', /soundbar|home theater|receiver/],
    ['Projetores', /projetor/],
    ['Casa inteligente', /echo|alexa|google (nest|home)|assistente virtual|inteligente|smart|wi-?fi|fechadura|sensor|controle remoto/],
    ['Câmeras', /c[âa]mera|gopro/],
    ['Antenas', /antena/],
  ],
  eletrodomesticos: [
    ['Geladeiras e freezers', /geladeira|refrigerador|freezer|frigobar/],
    ['Fogões e cooktops', /fog[ãa]o|cooktop/],
    ['Fornos', /forno/],
    ['Coifas', /coifa|depurador/],
    ['Lava-louças', /lava.?lou[cç]as/],
    ['Máquinas de lavar', /lava(dora| e seca)|m[áa]quina de lavar|tanquinho|centr[íi]fuga|secadora/],
    ['Ar-condicionado', /ar.condicionado|ar split|split|inverter/],
    ['Ventiladores e climatizadores', /ventilador|circulador|climatizador/],
    ['Aquecedores', /aquecedor/],
    ['Umidificadores e purificadores', /umidificador|desumidificador|purificador|bebedouro/],
  ],
  cozinha: [
    ['Air fryers', /air ?fryer|fritadeira/],
    ['Micro-ondas', /micro-?ondas/],
    ['Cafeteiras', /cafeteira|nespresso|dolce gusto|espresso|m[áa]quina de caf/],
    ['Liquidificadores e mixers', /liquidificador|mixer|processador de alimentos|multiprocessador|batedeira|espremedor|centr[íi]fuga/],
    ['Panelas elétricas', /panela (el[ée]trica|de arroz|de press[ãa]o el)/],
    ['Panelas', /panela|frigideira|ca[çc]arola/],
    ['Chaleiras', /chaleira/],
    ['Sanduicheiras e grills', /sanduicheira|\bgrill\b|torradeira/],
    ['Aspiradores', /aspirador|rob[ôo]/],
    ['Ferros e vaporizadores', /ferro de passar|vaporizador/],
    ['Utensílios', /faca|t[áa]bua|utens[íi]lio|pote|garrafa|balan[çc]a/],
  ],
  casa: [
    ['Camas e colchões', /\bcama\b|cama box|colch[ãa]o|cabeceira|ber[çc]o/],
    ['Cama, mesa e banho', /len[çc]ol|edredom|cobertor|\bmanta\b|travesseiro|toalha|jogo de (cama|banho)/],
    ['Guarda-roupas e cômodas', /guarda.?roupa|c[ôo]moda|arm[áa]rio/],
    ['Sofás e poltronas', /sof[áa]|poltrona/],
    ['Racks e estantes', /\brack\b|painel|\bestante|prateleira|nicho/],
    ['Mesas e cadeiras', /mesa|escrivaninha|cadeira|banqueta/],
    ['Iluminação', /l[âa]mpada|fita led|lumin[áa]ria|\blustre|\bpendente|abajur/],
    ['Decoração', /tapete|cortina|quadro|almofada|espelho|vaso/],
    ['Banheiro', /banheiro/],
    ['Organização', /organizador|caixa organizadora|cabide/],
  ],
  ferramentas: [
    ['Furadeiras e parafusadeiras', /furadeira|parafusadeira|martelete/],
    ['Serras e esmerilhadeiras', /serra|esmerilhadeira|politriz/],
    ['Ferramentas manuais', /chave|alicate|martelo|trena|n[íi]vel|jogo de|kit|maleta|caixa de ferramentas/],
    ['Lavadoras e compressores', /lavadora|lavajato|compressor|soprador/],
    ['Jardim', /cortador de grama|ro[çc]adeira|mangueira|jardim/],
    ['Construção e elétrica', /chuveiro|torneira|fechadura|refletor|escada/],
  ],
  beleza: [
    ['Perfumes', /perfume|col[ôo]nia|eau de|body splash|parfum|\bed[pt]\b/],
    ['Cabelos', /shampoo|condicionador|secador|chapinha|prancha|escova|babyliss|m[áa]scara capilar/],
    ['Barbear e aparadores', /barbeador|aparador|barba|cortar cabelo|cortador de cabelo|depilador/],
    ['Skincare', /hidratante|s[ée]rum|protetor|skincare|creme/],
    ['Maquiagem', /maquiagem|batom|base |r[íi]mel|paleta|sombra/],
  ],
  saude: [
    ['Balanças', /balan[çc]a/],
    ['Aparelhos de medição', /term[ôo]metro|medidor|aparelho de press|ox[íi]metro/],
    ['Inaladores', /inalador|nebulizador/],
    ['Massageadores', /massageador/],
    ['Vitaminas', /vitamina|col[áa]geno|[ôo]mega/],
  ],
  esporte: [
    ['Suplementos', /whey|creatin|suplemento|pr[ée].?treino|bcaa|prote[íi]na/],
    ['Bicicletas', /bicicleta|\bbike\b/],
    ['Aparelhos de ginástica', /esteira|ergom|halter|kettlebell|anilha|el[áa]stico|colchonete|tapete/],
    ['Patinetes e skates', /patinete|\bskate\b/],
    ['Camping', /barraca|camping|colch[ãa]o infl|cooler|caixa t[ée]rmica/],
  ],
  moda: [
    ['Tênis', /t[êe]nis/],
    ['Calçados', /sapato|sand[áa]lia|chinelo|\bbotas?\b|coturno|sapat[êe]nis/],
    ['Bolsas, mochilas e malas', /bolsa|mochila|mala|carteira/],
    ['Óculos', /[óo]culos/],
    ['Joias e bijuterias', /j[óo]ia|brinco|\bcolar\b|\banel\b|pulseira/],
    ['Roupas íntimas', /cueca|calcinha|suti[ãa]|\bmeias?\b|pijama|roupa [íi]ntima/],
    ['Roupas', /camis|cal[çc]a|vestido|blusa|jaqueta|casaco|moletom|short|bermuda|saia|regata|t-shirt|legging|cropped|macac[ãa]o/],
    ['Acessórios', /\bcinto\b|bon[ée]|chap[ée]u/],
  ],
  brinquedos: [
    ['Carrinhos e cadeirinhas de bebê', /carrinho de beb|beb[êe] conforto|cadeirinha/],
    ['Berços', /ber[çc]o/],
    ['Fraldas e higiene', /fralda/],
    ['Alimentação do bebê', /mamadeira|chupeta/],
    ['Babás eletrônicas', /bab[áa] eletr/],
    ['LEGO', /lego/],
    ['Jogos e quebra-cabeças', /jogo|quebra-?cabe/],
    ['Bonecas e pelúcias', /boneca|pel[úu]cia/],
    ['Carrinhos de controle', /controle remoto|carrinho/],
    ['Brinquedos de bebê', /piscina de bolinhas|triciclo|andador|m[óo]bile|tapete de atividades/],
  ],
  automotivo: [
    ['Pneus', /pneu/],
    ['Som e multimídia', /som|multim[íi]dia|c[âa]mera de r/],
    ['Baterias e óleo', /bateria|[óo]leo/],
    ['Limpeza automotiva', /cera|aspirador|lavagem|shampoo/],
    ['Motos', /capacete|\bmotos?\b/],
  ],
  pets: [
    ['Rações', /\bra[çc][ãa]o/],
    ['Higiene e beleza', /areia|tapete higi|shampoo|col[ôo]nia|perfume|creme|condicionador|escova|sabonete/],
    ['Saúde', /antipulgas|pulga|carrapato|verm[íi]fugo|suplemento|vitamina|clorexidina|antibacteriano|antif[úu]ngico/],
    ['Camas e casinhas', /cama|casinha/],
    ['Coleiras e guias', /coleira|guia|peitoral/],
    ['Comedouros', /comedouro|bebedouro/],
    ['Arranhadores', /arranhador/],
  ],
};

const OTHER_SUB = 'Outros';

const normalizeTitle = title => String(title || '').toLowerCase().replace(/[®™©]/g, '').replace(/\s+/g, ' ');

// Retorna o rótulo da regra cuja palavra-chave aparece mais cedo no título.
function earliestMatch(title, rules) {
  let best = null, bestPos = Infinity;
  for (const [label, re] of rules) {
    const m = re.exec(title);
    if (m && m.index < bestPos) { best = label; bestPos = m.index; }
  }
  return best;
}

// Produto de higiene, beleza ou casa feito para animais vai para Pets ("Shampoo para cães", "Colônia cão e gato").
// Aparelhos (robô aspirador "para pelos de pets") continuam na categoria do aparelho.
const PARA_PETS = /\b(para|p\/) (c[ãa]es|cachorros?|gatos?|pets?)\b|\bc[ãa]es e gatos\b|\bc[ãa]o e gato\b|\bcachorro e gato\b/;
const VIRA_PETS = ['beleza', 'saude', 'casa', 'limpeza', 'outros', null];

function classifyCategory(title, hint) {
  const t = normalizeTitle(title);
  const cat = earliestMatch(t, RULES);
  if (VIRA_PETS.includes(cat) && PARA_PETS.test(t)) return 'pets';
  return cat || (hint && CATEGORIES.includes(hint) ? hint : 'outros');
}

function classifySubcategory(title, categoria) {
  return earliestMatch(normalizeTitle(title), SUBCATEGORIES[categoria] || []) || OTHER_SUB;
}

module.exports = { classifyCategory, classifySubcategory, CATEGORIES };
