// Classifica a oferta pela palavra-chave do título. A ordem importa: a primeira regra que bater vence.
const RULES = [
  ['games', /playstation|\bps[45]\b|xbox|nintendo|joystick|gamepad|controle (sem fio|dualsense|xbox|ps)|headset gamer|\bgamer\b|console/],
  ['celulares', /iphone|smartphone|celular|galaxy [asmz]\d|redmi|poco |motorola (moto|edge|g\d)|\bipad\b|tablet/],
  ['informatica', /notebook|laptop|macbook|\bmouse\b|teclado|monitor|\bssd\b|\bhd\b externo|pen ?drive|placa de v[ií]deo|processador|roteador|impressora|webcam|hub usb/],
  ['audio_tv', /fone|headphone|earbuds?|airpods|caixa de som|\bjbl\b|soundbar|smart tv|\btv\b|televis|projetor|c[âa]mera/],
  ['cozinha', /air ?fryer|fritadeira|panela|cafeteira|liquidificador|batedeira|sanduicheira|chaleira|micro-?ondas|forno|cozinha|grill/],
  ['eletrodomesticos', /geladeira|refrigerador|fog[ãa]o|lava(dora|r)|secadora|ar.condicionado|ventilador|aspirador|purificador|lava.lou[cç]as/],
  ['moda', /t[êe]nis|sapato|sand[áa]lia|chinelo|camis[ae]|cal[çc]a|vestido|blusa|jaqueta|moletom|bolsa|mochila|rel[óo]gio|smartwatch|[óo]culos/],
  ['beleza', /perfume|maquiagem|skincare|batom|shampoo|condicionador|hidratante|s[ée]rum|protetor solar|secador de cabelo|chapinha|barbeador/],
  ['saude', /whey|creatina|suplemento|vitamina|prote[íi]na|col[áa]geno|term[ôo]metro|medidor de press/],
  ['ferramentas', /furadeira|parafusadeira|ferramenta|maleta|alicate|serra|esmerilhadeira|trena/],
  ['casa', /cama|len[çc]ol|toalha|travesseiro|colch[ãa]o|cortina|tapete|lumin[áa]ria|banheiro|chuveiro|organizador/],
  ['limpeza', /sab[ãa]o|amaciante|detergente|desinfetante|papel higi[êe]nico|multiuso|alvejante/],
  ['alimentos', /caf[ée] (em|torrado|gr[ãa]os|sol[úu]vel)|c[áa]psula|chocolate|azeite|cerveja|vinho|energ[ée]tico|leite/],
  ['pets', /ra[çc][ãa]o|\bpet\b|cachorro|\bgato\b|coleira|areia sanit/],
  ['automotivo', /pneu|automotiv|carro|moto |capacete|som automotivo/],
  ['brinquedos', /lego|brinquedo|boneca|carrinho de controle|quebra-cabe[çc]a/],
];

const CATEGORIES = [...RULES.map(([cat]) => cat), 'outros'];

function classifyCategory(title, hint) {
  const t = String(title || '').toLowerCase();
  for (const [cat, re] of RULES) if (re.test(t)) return cat;
  return hint && CATEGORIES.includes(hint) ? hint : 'outros';
}

module.exports = { classifyCategory, CATEGORIES };
