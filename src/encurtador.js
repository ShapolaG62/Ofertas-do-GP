// Links curtos para as postagens, SEM serviço de fora (TinyURL e parecidos mudam a cara do link e às vezes
// mostram tela de "não sou um robô"). O link continua sendo o da própria loja, só sem o nome do produto
// no meio do endereço; os parâmetros de afiliado (tag, matt_word…) ficam intactos.
// Com o site público (https), as postagens usam o link curto do próprio site (/o/<id>) — ver social.postLink.
const REGRAS = [
  // Magalu (Magazine Você e Magazine Luiza): /<loja>/<nome-do-produto>/p/<código>/<categoria>/<sub>/ → /<loja>/p/<código>/
  [/^(https:\/\/(?:www\.)?magazinevoce\.com\.br\/[^/?#]+)\/[^?#]*?\/p\/([a-z0-9]+)\/[^?#]*/i, '$1/p/$2/'],
  [/^(https:\/\/(?:www\.)?magazineluiza\.com\.br)\/[^?#]*?\/p\/([a-z0-9]+)\/[^?#]*/i, '$1/p/$2/'],
  // KaBuM!: /produto/<id>/<nome-do-produto> → /produto/<id>
  [/^(https:\/\/(?:www\.)?kabum\.com\.br\/produto\/\d+)\/[^?#]*/i, '$1'],
  // Amazon: qualquer endereço de produto → /dp/<ASIN>
  [/^(https:\/\/(?:www\.)?amazon\.com\.br)\/(?:[^?#]*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})[^?#]*/i, '$1/dp/$2'],
  // Mercado Livre: /MLB-<id>-<nome-do-produto>-_JM → /MLB-<id>
  [/^(https:\/\/produto\.mercadolivre\.com\.br\/MLB-?\d+)-[^?#]*/i, '$1'],
  // AliExpress: só o número do item
  [/^(https:\/\/(?:pt\.|www\.)?aliexpress\.com\/item\/\d+\.html)[^?#]*/i, '$1'],
];

function curto(url) {
  url = String(url || '').trim();
  for (const [re, troca] of REGRAS) if (re.test(url)) return url.replace(re, troca);
  return url;
}
const curtos = urls => urls.map(curto);

module.exports = { curto, curtos };
