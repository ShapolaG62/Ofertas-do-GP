// Consulta pública de CNPJ (dados abertos da Receita Federal) para preencher o cadastro das lojas parceiras.
// Fonte principal: BrasilAPI; reserva: CNPJ.ws. Só dados de empresa (públicos por lei); CPF não é consultado,
// porque dados de pessoa física não são públicos (LGPD).
const axios = require('axios');
const { validCnpj, digits, RAMOS } = require('./cadastro');

const cache = new Map(); // cnpj → { at, dados }
const TITULO = s => String(s || '').toLowerCase().replace(/(^|[\s\-/(])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(De|Da|Do|Das|Dos|E|Em|Para|Com)\b/g, w => w.toLowerCase()).replace(/\b(S\/a|Ltda|Me|Epp|Eireli|S\.a\.)\b/gi, w => w.toUpperCase()).trim();

// Ramo do site a partir da atividade principal (CNAE)
const RAMO_POR_PALAVRA = [
  [/vestu|roupa|calçad|moda|acess[oó]ri|bijuter|joia|bolsa|ótica|otica/i, 'Moda e acessórios'],
  [/inform[aá]tica|computador|eletr[oô]nic|software|games|jogos eletr/i, 'Eletrônicos e informática'],
  [/celular|telefon|telecomunica/i, 'Celulares e telefonia'],
  [/m[oó]veis|decora|cama, mesa|utilidades dom[eé]stic|artigos do lar|colch/i, 'Casa e decoração'],
  [/eletrodom[eé]stic|magazine|lojas de departamento/i, 'Eletrodomésticos'],
  [/cosm[eé]tic|perfum|beleza|higiene|cabeleireir|est[eé]tica/i, 'Beleza e cuidados pessoais'],
  [/farm|medicamento|suplement|sa[uú]de|ortop[eé]d|hospitalar/i, 'Saúde e suplementos'],
  [/esport|academia|bicicleta|camping|pesca|lazer/i, 'Esportes e lazer'],
  [/aliment|bebida|mercado|padaria|confeit|restaurante|lanchonete|a[cç]ougue|hortifruti|doce/i, 'Alimentos e bebidas'],
  [/brinquedo|infantil|beb[eê]/i, 'Infantil e brinquedos'],
  [/\bpet\b|animais|veterin|ra[cç][aã]o/i, 'Pet shop'],
  [/ve[ií]culo|autope[cç]a|pe[cç]as.*autom|automotiv|pneu|motocicleta/i, 'Automotivo'],
  [/ferrament|constru[cç][aã]o|material el[eé]tric|ferragem|tinta|madeira/i, 'Ferramentas e construção'],
  [/papelaria|escrit[oó]rio|livr/i, 'Papelaria e escritório'],
];
const ramoDe = cnae => (RAMO_POR_PALAVRA.find(([re]) => re.test(cnae || '')) || [null, 'Outros'])[1];

function montar(c) {
  const tel = digits(c.telefone).replace(/^0+/, '');
  return {
    cnpj: c.cnpj, razao_social: TITULO(c.razao), empresa_nome: TITULO(c.fantasia || c.razao),
    situacao: c.situacao || null, ativa: /ativa/i.test(c.situacao || ''),
    atividade: c.cnae || null, ramo: RAMOS.includes(ramoDe(c.cnae)) ? ramoDe(c.cnae) : 'Outros',
    telefone_empresa: tel.length >= 10 && tel.length <= 11 ? tel : null,
    emp_cep: digits(c.cep).slice(0, 8) || null,
    emp_logradouro: TITULO([c.tipo_log, c.log].filter(Boolean).join(' ')) || null,
    emp_numero: c.numero && !/^s\/?n$/i.test(c.numero) ? String(c.numero).slice(0, 10) : 'S/N',
    emp_complemento: TITULO(c.complemento) || null, emp_bairro: TITULO(c.bairro) || null,
    emp_cidade: TITULO(c.municipio) || null, emp_uf: c.uf || null,
  };
}

async function brasilApi(cnpj) {
  const r = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { timeout: 12000, validateStatus: () => true });
  if (r.status === 404) return { naoExiste: true };
  if (r.status !== 200 || !r.data?.razao_social) throw new Error(`BrasilAPI ${r.status}`);
  const d = r.data;
  return montar({ cnpj, razao: d.razao_social, fantasia: d.nome_fantasia, situacao: d.descricao_situacao_cadastral, cnae: d.cnae_fiscal_descricao,
    telefone: d.ddd_telefone_1, cep: d.cep, tipo_log: d.descricao_tipo_de_logradouro, log: d.logradouro, numero: d.numero,
    complemento: d.complemento, bairro: d.bairro, municipio: d.municipio, uf: d.uf });
}
async function cnpjWs(cnpj) {
  const r = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpj}`, { timeout: 12000, validateStatus: () => true });
  if (r.status === 404) return { naoExiste: true };
  if (r.status !== 200 || !r.data?.razao_social) throw new Error(`CNPJ.ws ${r.status}`);
  const d = r.data, e = d.estabelecimento || {};
  return montar({ cnpj, razao: d.razao_social, fantasia: e.nome_fantasia, situacao: e.situacao_cadastral, cnae: e.atividade_principal?.descricao,
    telefone: `${e.ddd1 || ''}${e.telefone1 || ''}`, cep: e.cep, tipo_log: e.tipo_logradouro, log: e.logradouro, numero: e.numero,
    complemento: e.complemento, bairro: e.bairro, municipio: e.cidade?.nome, uf: e.estado?.sigla });
}

async function consultar(valor) {
  const cnpj = digits(valor);
  if (!validCnpj(cnpj)) throw Object.assign(new Error('CNPJ inválido. Confira os números.'), { status: 400 });
  const c = cache.get(cnpj);
  if (c && Date.now() - c.at < 24 * 3600 * 1000) return c.dados;
  let dados = null, erro = null;
  for (const fonte of [brasilApi, cnpjWs]) {
    try { dados = await fonte(cnpj); if (dados) break; } catch (err) { erro = err; }
  }
  if (!dados) throw Object.assign(new Error('Não foi possível consultar o CNPJ agora. Preencha os dados da empresa manualmente.'), { status: 503, causa: erro?.message });
  if (dados.naoExiste) throw Object.assign(new Error('CNPJ não encontrado na Receita Federal. Confira os números.'), { status: 404 });
  cache.set(cnpj, { at: Date.now(), dados });
  return dados;
}

module.exports = { consultar };
