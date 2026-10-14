// Validação dos dados cadastrais de pessoas e empresas.
const IDADE_MINIMA = 18;

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ',
  'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const RAMOS = ['Moda e acessórios', 'Eletrônicos e informática', 'Celulares e telefonia', 'Casa e decoração',
  'Eletrodomésticos', 'Beleza e cuidados pessoais', 'Saúde e suplementos', 'Esportes e lazer', 'Alimentos e bebidas',
  'Infantil e brinquedos', 'Pet shop', 'Automotivo', 'Ferramentas e construção', 'Papelaria e escritório', 'Outros'];

const fail = msg => Object.assign(new Error(msg), { status: 400 });
const digits = s => String(s ?? '').replace(/\D/g, '');

function text(value, label, { min = 1, max = 120, required = true } = {}) {
  const v = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!v) {
    if (required) throw fail(`Informe ${label}.`);
    return null;
  }
  if (v.length < min || v.length > max) throw fail(`${label[0].toUpperCase()}${label.slice(1)}: entre ${min} e ${max} caracteres.`);
  return v;
}

function validCpf(raw) {
  const c = digits(raw);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = len => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

function validCnpj(raw) {
  const c = digits(raw);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = len => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) { sum += Number(c[len - i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

function cpf(value) {
  const c = digits(value);
  if (!validCpf(c)) throw fail('CPF inválido.');
  return c;
}

function cnpj(value) {
  const c = digits(value);
  if (!validCnpj(c)) throw fail('CNPJ inválido.');
  return c;
}

function telefone(value, label = 'um telefone', required = true) {
  const t = digits(value);
  if (!t) {
    if (required) throw fail(`Informe ${label} com DDD.`);
    return null;
  }
  if (t.length < 10 || t.length > 11 || t[0] === '0') throw fail(`${label[0].toUpperCase()}${label.slice(1)} inválido: use DDD + número.`);
  return t;
}

function dataNascimento(value) {
  const v = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw fail('Informe sua data de nascimento.');
  const d = new Date(`${v}T00:00:00Z`);
  if (isNaN(d) || d.toISOString().slice(0, 10) !== v) throw fail('Data de nascimento inválida.');
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - d.getUTCFullYear();
  const m = hoje.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && hoje.getUTCDate() < d.getUTCDate())) idade--;
  if (idade < IDADE_MINIMA) throw fail(`É preciso ter pelo menos ${IDADE_MINIMA} anos para criar uma conta.`);
  if (idade > 120) throw fail('Data de nascimento inválida.');
  return v;
}

// Endereço com prefixo opcional ("emp_" para o endereço da empresa).
function endereco(body, prefix = '', quem = '') {
  const g = k => body[`${prefix}${k}`];
  const cep = digits(g('cep'));
  if (cep.length !== 8) throw fail(`CEP${quem} inválido.`);
  const uf = String(g('uf') || '').trim().toUpperCase();
  if (!UFS.includes(uf)) throw fail(`Selecione o estado (UF)${quem}.`);
  return {
    [`${prefix}cep`]: cep,
    [`${prefix}logradouro`]: text(g('logradouro'), `a rua/avenida${quem}`, { min: 2, max: 120 }),
    [`${prefix}numero`]: text(g('numero'), `o número${quem}`, { max: 10 }),
    [`${prefix}complemento`]: text(g('complemento'), `o complemento${quem}`, { max: 60, required: false }),
    [`${prefix}bairro`]: text(g('bairro'), `o bairro${quem}`, { min: 2, max: 60 }),
    [`${prefix}cidade`]: text(g('cidade'), `a cidade${quem}`, { min: 2, max: 60 }),
    [`${prefix}uf`]: uf,
  };
}

// Dados pessoais (consumidor e responsável pela empresa).
function dadosPessoa(body, { exigirDocumento = true } = {}) {
  const out = {
    nome: text(body.nome, 'seu nome completo', { min: 5, max: 100 }),
    data_nascimento: dataNascimento(body.data_nascimento),
    telefone: telefone(body.telefone, 'seu celular'),
    ...endereco(body),
  };
  if (!/\s/.test(out.nome)) throw fail('Informe nome e sobrenome.');
  if (exigirDocumento) out.cpf = cpf(body.cpf);
  return out;
}

function dadosEmpresa(body, { exigirDocumento = true } = {}) {
  const ramo = String(body.ramo || '');
  if (!RAMOS.includes(ramo)) throw fail('Selecione o ramo de atividade da empresa.');
  const site = String(body.site_empresa || '').trim();
  if (site && (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(site) || site.length > 200)) throw fail('Site da empresa inválido (use https://...).');
  const mesmo = body.mesmo_endereco === true || body.mesmo_endereco === 'on' || body.mesmo_endereco === '1';
  const empEnd = mesmo
    ? Object.fromEntries(['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'].map(k => [`emp_${k}`, body[k]]))
    : body;
  const out = {
    razao_social: text(body.razao_social, 'a razão social', { min: 3, max: 150 }),
    empresa_nome: text(body.empresa_nome, 'o nome fantasia', { min: 2, max: 80 }),
    inscricao_estadual: text(body.inscricao_estadual, 'a inscrição estadual', { max: 20, required: false }),
    telefone_empresa: telefone(body.telefone_empresa, 'o telefone da empresa'),
    ramo,
    site_empresa: site || null,
    ...endereco(empEnd, 'emp_', ' da empresa'),
  };
  if (exigirDocumento) out.cnpj = cnpj(body.cnpj);
  return out;
}

module.exports = { UFS, RAMOS, IDADE_MINIMA, digits, validCpf, validCnpj, dadosPessoa, dadosEmpresa };
