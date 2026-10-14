// Classifica a oferta pelo título. Vence a regra cuja palavra-chave aparece PRIMEIRO no título
// (os títulos começam pelo produto: "SSD NVMe ... para Laptop", "Capa ... para iPhone"). Empate: ordem da lista.
const RULES = [
  ['ferramentas', /chaves? de (fenda|torque|precis)|parafusadeira|furadeira|jogo de chaves|kit de ferramentas/],
  ['moda', /smartwatch|smart ?band|rel[óo]gio inteligente|pulseira inteligente/],
  ['informatica', /notebook|laptop|macbook|chromebook|computador port[áa]til|\bmonitor\b|\bmouse\b|teclado|\bssd\b|nvme|hd interno|disco r[íi]gido/],
  ['audio_tv', /\bfones?\b|headphone|earbuds?|airpods|\btws\b|caixas? (de som|ac[úu]stica)|alto-falante|soundbar|smart ?tv|\btv\b|televis/],
  ['games', /playstation|\bps[45]\b|xbox|nintendo|joystick|gamepad|dualsense|controle (sem fio|gamer|xbox|ps)|headset|\bgamer\b|console/],
  ['celulares', /iphone|smartphone|smarphone|celular|galaxy [asmz]\d|redmi|poco |xiaomi (mi )?\d|motorola (moto|edge|g\d)|\bipad\b|tablet/],
  ['informatica', /\bhd\b externo|pen ?drive|placa de v[ií]deo|processador|mem[óo]ria ram|roteador|impressora|webcam|hub usb/],
  ['audio_tv', /projetor|c[âa]mera|gopro|\bjbl\b/],
  ['cozinha', /air ?fryer|fritadeira|panela|frigideira|cafeteira|liquidificador|batedeira|sanduicheira|chaleira|micro-?ondas|forno|cozinha|grill|mixer/],
  ['eletrodomesticos', /geladeira|refrigerador|fog[ãa]o|lava(dora|r)|secadora|ar.condicionado|ventilador|aspirador|purificador|lava.lou[cç]as/],
  ['moda', /t[êe]nis|sapato|sand[áa]lia|chinelo|bota\b|camis[ae]|cal[çc]a|vestido|blusa|jaqueta|moletom|short|bermuda|bolsa|mochila|rel[óo]gio|[óo]culos|cueca|calcinha|regata|t-shirt|legging|suti[ãa]|\bmeias?\b|cropped|saia|macac[ãa]o|pijama|bon[ée]\b/],
  ['beleza', /perfume|parfum|body splash|\bed[pt]\b|eau de|maquiagem|skincare|batom|shampoo|condicionador|hidratante|s[ée]rum|protetor solar|secador de cabelo|chapinha|barbeador|aparador/],
  ['saude', /whey|creatin|suplemento|vitamina|prote[íi]na|col[áa]geno|term[ôo]metro|medidor de press/],
  ['ferramentas', /ferramenta|maleta|alicate|serra|esmerilhadeira|trena/],
  ['casa', /cama|len[çc]ol|toalha|travesseiro|colch[ãa]o|cortina|tapete|lumin[áa]ria|banheiro|chuveiro|organizador/],
  ['limpeza', /sab[ãa]o|amaciante|detergente|desinfetante|papel higi[êe]nico|multiuso|alvejante/],
  ['alimentos', /caf[ée] (em|torrado|gr[ãa]os|sol[úu]vel)|c[áa]psula|chocolate|azeite|cerveja|vinho|energ[ée]tico|leite/],
  ['pets', /ra[çc][ãa]o|\bpet\b|cachorro|\bgato\b|coleira|areia sanit/],
  ['automotivo', /pneu|automotiv|carro|moto |capacete|som automotivo/],
  ['brinquedos', /lego|brinquedo|boneca|carrinho de controle|quebra-cabe[çc]a/],
];

const CATEGORIES = [...new Set(RULES.map(([cat]) => cat)), 'outros'];

// Tipos de produto dentro de cada categoria (usados para filtrar e ordenar por nome de produto).
const SUBCATEGORIES = {
  celulares: [
    ['Tablets', /tablet|\bipad\b|galaxy tab/],
    ['Acessórios', /\bcapa\b|capinha|pel[íi]cula|vidro|carregador|carregamento|\bcabo\b|suporte|power ?bank|protetor|para (iphone|celular|samsung|galaxy|xiaomi|redmi|motorola)/],
    ['iPhone', /iphone/],
    ['Samsung Galaxy', /galaxy|samsung/],
    ['Xiaomi', /xiaomi|redmi|poco/],
    ['Motorola', /motorola|moto [eg]\d|\bedge\b/],
  ],
  informatica: [
    ['Notebooks', /notebook|laptop|macbook|chromebook|computador port[áa]til/],
    ['Monitores', /monitor/],
    ['Teclados', /teclado/],
    ['Mouses', /\bmouse\b/],
    ['Armazenamento', /\bssd\b|\bhd\b|nvme|disco r[íi]gido|pen ?drive|cart[ãa]o de mem|mem[óo]ria interna|sandisk/],
    ['Impressoras', /impressora/],
    ['Redes e Wi-Fi', /roteador|repetidor|\bmesh\b|wi-?fi/],
    ['Componentes', /placa de v|processador|mem[óo]ria ram|placa.m[ãa]e|\bfonte\b|cooler/],
    ['Webcams', /webcam/],
  ],
  games: [
    // "Nintendo Switch 32GB com 2 controles" é um console, não um controle
    ['Consoles', /(console|nintendo switch|playstation ?5|\bps5\b|xbox series).{0,40}\b\d+ ?(gb|tb)\b|\b\d+ ?(gb|tb)\b.{0,40}(nintendo switch|playstation|xbox)|playstation ?5 (edi[çc][ãa]o|digital|slim|pro)/],
    ['Acessórios', /^para |adaptador|\bcabo\b|suporte|base de carregamento|\bcase\b|pel[íi]cula|carregador|leitor de disco|figuras?\b/],
    ['Jogos', /\bjogos? (nintendo|ps[45]|xbox|para)|ofertas de jogos|m[íi]dia f[íi]sica|edition|remaster|- (playstation|ps[45]|xbox|nintendo|switch)/],
    ['Controles', /controle|joystick|gamepad|dualsense|joy-con/],
    ['Headsets', /headset|fone|auricular/],
    ['Cadeiras gamer', /cadeira/],
    ['Consoles', /\bconsole\b|ps5 (slim|pro|digital)|xbox series [sx]|nintendo switch|playstation ?5/],
  ],
  audio_tv: [
    ['Caixas de som', /caixas? (de som|ac[úu]stica)|alto-falante|speaker|jbl (go|flip|charge|boombox|clip)/],
    ['Fones de ouvido', /\bfones?\b|headphone|earbuds?|airpods|\btws\b/],
    ['Soundbars', /soundbar/],
    ['TVs', /smart ?tv|\btv\b|televis|streaming/],
    ['Projetores', /projetor/],
    ['Câmeras', /c[âa]mera|gopro/],
  ],
  cozinha: [
    ['Air fryers', /air ?fryer|fritadeira/],
    ['Cafeteiras', /cafeteira|nespresso|dolce gusto|espresso/],
    ['Panelas', /panela|frigideira|ca[çc]arola/],
    ['Liquidificadores e mixers', /liquidificador|mixer|processador de alimentos|batedeira/],
    ['Fornos e micro-ondas', /micro-?ondas|forno/],
    ['Utensílios', /faca|t[áa]bua|utens[íi]lio|pote|garrafa/],
  ],
  eletrodomesticos: [
    ['Aspiradores', /aspirador|rob[ôo]/],
    ['Geladeiras', /geladeira|refrigerador|freezer/],
    ['Fogões', /fog[ãa]o|cooktop/],
    ['Máquinas de lavar', /lava(dora| e seca)|m[áa]quina de lavar|secadora/],
    ['Ar-condicionado', /ar.condicionado/],
    ['Ventiladores', /ventilador|climatizador/],
    ['Lava-louças', /lava.lou[cç]as/],
  ],
  moda: [
    ['Relógios e smartwatches', /rel[óo]gio|smartwatch|smart ?band|pulseira inteligente/],
    ['Tênis', /t[êe]nis/],
    ['Calçados', /sapato|sand[áa]lia|chinelo|bota\b|sapat[êe]nis/],
    ['Bolsas e mochilas', /bolsa|mochila|carteira/],
    ['Óculos', /[óo]culos/],
    ['Roupas íntimas', /cueca|calcinha|suti[ãa]|\bmeias?\b|pijama/],
    ['Roupas', /camis|cal[çc]a|vestido|blusa|jaqueta|moletom|short|bermuda|saia|regata|t-shirt|legging|cropped|macac[ãa]o/],
  ],
  beleza: [
    ['Perfumes', /perfume|col[ôo]nia|eau de|body splash|parfum|\bed[pt]\b/],
    ['Cabelos', /shampoo|condicionador|secador|chapinha|escova|m[áa]scara capilar/],
    ['Skincare', /hidratante|s[ée]rum|protetor|skincare|creme/],
    ['Maquiagem', /maquiagem|batom|base |r[íi]mel|paleta/],
    ['Barbear', /barbeador|aparador|barba/],
  ],
  saude: [
    ['Whey protein', /whey/],
    ['Creatina', /creatin/],
    ['Vitaminas', /vitamina|col[áa]geno|[ôo]mega/],
    ['Aparelhos', /term[ôo]metro|medidor|balan[çc]a|ox[íi]metro/],
  ],
  ferramentas: [
    ['Furadeiras e parafusadeiras', /furadeira|parafusadeira/],
    ['Chaves e kits', /chave|maleta|jogo de|kit|conjunto/],
    ['Serras e esmerilhadeiras', /serra|esmerilhadeira/],
  ],
  casa: [
    ['Cama e banho', /cama|len[çc]ol|toalha|travesseiro|colch[ãa]o|edredom/],
    ['Iluminação', /lumin[áa]ria|l[âa]mpada|abajur/],
    ['Decoração', /tapete|cortina|quadro|vaso/],
    ['Banheiro', /banheiro|chuveiro|torneira/],
    ['Organização', /organizador|caixa organizadora|cabide/],
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

function classifyCategory(title, hint) {
  return earliestMatch(normalizeTitle(title), RULES) || (hint && CATEGORIES.includes(hint) ? hint : 'outros');
}

function classifySubcategory(title, categoria) {
  return earliestMatch(normalizeTitle(title), SUBCATEGORIES[categoria] || []) || OTHER_SUB;
}

module.exports = { classifyCategory, classifySubcategory, CATEGORIES };
