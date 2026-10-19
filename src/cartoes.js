// Cartões salvos dos clientes, guardados no Mercado Pago do Ofertou! (Customers & Cards). Servem para pagar os planos
// do Ofertou! (os pedidos às lojas são cobrados no Mercado Pago de cada loja, onde estes cartões não existem).
// O site NÃO guarda nada do cartão: só o código do cliente no Mercado Pago (para listar, salvar e usar os cartões).
// Número, validade e código de segurança são digitados nos campos seguros do Mercado Pago e nunca passam pelo site.
const db = require('./db');
const chat = require('./chat');

db.db.exec(`
  CREATE TABLE IF NOT EXISTS mp_clientes (
    dono TEXT PRIMARY KEY,               -- 'u:<id>' | 'c:<id>'
    mp_customer_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const MAX_CARTOES = 5;
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
let mpChamada = null; // permite trocar a chamada ao Mercado Pago nos testes
const mp = (method, path, data, headers = {}) => (mpChamada
  || ((m, p, d, h) => require('./pagamentos').mp(m, p, d, require('./settings').getAll(), h)))(method, path, data, headers);

function resumo(c) {
  return {
    id: String(c.id),
    bandeira: c.payment_method?.name || c.payment_method?.id || 'Cartão',
    imagem: c.payment_method?.secure_thumbnail || c.payment_method?.thumbnail || null,
    tipo: c.payment_method?.payment_type_id === 'debit_card' ? 'débito' : 'crédito',
    final: c.last_four_digits || '',
    bin: c.first_six_digits || '',
    validade: c.expiration_month && c.expiration_year ? `${String(c.expiration_month).padStart(2, '0')}/${c.expiration_year}` : '',
    vencido: Boolean(c.expiration_year && new Date(c.expiration_year, c.expiration_month || 12, 1) <= new Date()),
    titular: c.cardholder?.name || '',
    payment_method_id: c.payment_method?.id || null,
    issuer_id: c.issuer?.id ? String(c.issuer.id) : null,
  };
}

const clienteSalvo = dono => db.get('SELECT mp_customer_id FROM mp_clientes WHERE dono = ?', dono)?.mp_customer_id || null;

// Encontra (ou cria) o cliente desta conta no Mercado Pago
async function garantirCliente(dono) {
  const salvo = clienteSalvo(dono);
  if (salvo) return salvo;
  const email = chat.emailDe(dono);
  if (!email) throw fail('Sua conta precisa de um e-mail para salvar cartões.');
  const busca = await mp('get', `/v1/customers/search?email=${encodeURIComponent(email)}`);
  let id = busca?.results?.[0]?.id;
  if (!id) {
    const nome = chat.pessoa(dono).nome || '';
    const [primeiro, ...resto] = nome.split(' ');
    id = (await mp('post', '/v1/customers', { email, ...(primeiro ? { first_name: primeiro, last_name: resto.join(' ') || undefined } : {}) })).id;
  }
  db.run('INSERT OR REPLACE INTO mp_clientes (dono, mp_customer_id) VALUES (?, ?)', dono, String(id));
  return String(id);
}

async function listar(dono) {
  const cid = clienteSalvo(dono);
  if (!cid) return [];
  const r = await mp('get', `/v1/customers/${cid}/cards`);
  return (Array.isArray(r) ? r : r?.results || []).map(resumo);
}

// token: criado pelos campos seguros do Mercado Pago no navegador
async function adicionar(dono, token) {
  if (!/^[\w-]{8,}$/.test(String(token || ''))) throw fail('Não recebemos os dados do cartão. Tente de novo.');
  const cid = await garantirCliente(dono);
  if ((await listar(dono)).length >= MAX_CARTOES) throw fail(`Você pode salvar até ${MAX_CARTOES} cartões. Remova um para adicionar outro.`);
  const c = await mp('post', `/v1/customers/${cid}/cards`, { token: String(token) });
  return resumo(c);
}

async function cartaoDoDono(dono, cardId) {
  const c = (await listar(dono)).find(x => x.id === String(cardId));
  if (!c) throw fail('Cartão não encontrado na sua conta.', 404);
  return c;
}

async function remover(dono, cardId) {
  await cartaoDoDono(dono, cardId);
  await mp('delete', `/v1/customers/${clienteSalvo(dono)}/cards/${encodeURIComponent(String(cardId))}`);
  return true;
}

// Para pagar com um cartão salvo: confere que é da conta e devolve o que o pagamento precisa
async function paraPagamento(dono, cardId) {
  const c = await cartaoDoDono(dono, cardId);
  if (c.vencido) throw fail('Este cartão está vencido. Use outro cartão.');
  return { customer_id: clienteSalvo(dono), payment_method_id: c.payment_method_id, issuer_id: c.issuer_id, cartao: c };
}

module.exports = { listar, adicionar, remover, paraPagamento, MAX_CARTOES, _trocarMp: f => { mpChamada = f; } };
