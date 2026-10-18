// Pedidos feitos às lojas parceiras pelo site, formas de pagamento, taxa de uso do site e contadores de acesso.
//  • O cliente paga por Pix ou cartão no MERCADO PAGO DO DONO DO OFERTOU! (o mesmo de Painel → Planos → Formas de
//    recebimento). A empresa escolhe se aceita Pix, cartão ou os dois (Minha conta → Vendas e pagamentos).
//  • Taxa de uso do site (padrão 1%, Painel → Atendimento): somada ao valor dos produtos na finalização; fica com o site.
//  • Pix: o QR code aparece na própria janela do pedido. Cartão: formulário do Mercado Pago dentro do site (Card
//    Payment Brick, com as parcelas); os dados do cartão vão direto ao Mercado Pago (o site só recebe um token).
//  • O pedido só aparece para a loja (e só entra na conversa entre os dois) depois do pagamento confirmado.
//  • A confirmação é automática (consulta à API do Mercado Pago: na tela do pedido, pelo aviso do Mercado Pago e a
//    cada 2 minutos no servidor). Pago → a empresa é avisada no site (🔔), na conversa e por e-mail, e o valor dos
//    produtos, menos a tarifa do Mercado Pago daquela venda, entra na carteira dela (ver carteira.js).
//  • Cada pedido é um ticket (PD-000123) com todos os eventos e as mensagens automáticas na conversa com a loja.
//  • "Finalização de compra" = pedido com pagamento confirmado. Aparece para o dono da loja e no painel.
//  • Contadores por dia: acessos à página da loja, produtos abertos no catálogo, cliques no site oficial e nos links.
const crypto = require('crypto');
const axios = require('axios');
const db = require('./db');
const chat = require('./chat');
const settings = require('./settings');
const carteira = require('./carteira');
const notificacoes = require('./notificacoes');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const MP = 'https://api.mercadopago.com';
const PIX_MINUTOS = 60;

for (const col of ['pag_pix_ativo INTEGER NOT NULL DEFAULT 0', 'pag_pix_tipo TEXT', 'pag_pix_chave TEXT', 'pag_pix_nome TEXT', 'pag_pix_cidade TEXT',
  'pag_cartao_ativo INTEGER NOT NULL DEFAULT 0', 'pag_cartao_link TEXT', 'pag_combinar INTEGER NOT NULL DEFAULT 1',
  'aceita_pedidos INTEGER NOT NULL DEFAULT 1', 'pedido_instrucoes TEXT',
  'mp_access_token TEXT', 'mp_refresh_token TEXT', 'mp_user_id TEXT', 'mp_conectado_em TEXT', 'mp_expira TEXT', 'taxa_aviso_em TEXT',
  // Formas que a loja aceita (pagas no Mercado Pago do Ofertou!) — Pix e cartão ligados por padrão
  'aceita_pix INTEGER NOT NULL DEFAULT 1', 'aceita_cartao INTEGER NOT NULL DEFAULT 1']) {
  try { db.db.exec(`ALTER TABLE lojas ADD COLUMN ${col}`); } catch { /* já existe */ }
}

const SQL_PEDIDOS = `
  CREATE TABLE IF NOT EXISTS pedidos_loja (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER NOT NULL,
    comprador TEXT NOT NULL,            -- 'u:<id>' | 'c:<id>' | 'admin'
    conversa_id INTEGER,
    oferta_id INTEGER,
    produto TEXT NOT NULL,              -- como estava na hora do pedido
    imagem TEXT,
    preco_unit REAL NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    subtotal REAL,                      -- produtos (preço x quantidade)
    taxa_pct REAL NOT NULL DEFAULT 0,   -- taxa de uso do site (%)
    taxa_valor REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,                -- subtotal + taxa (o que o cliente paga)
    taxa_modo TEXT,                     -- 'site' (pago no Mercado Pago do Ofertou!) | 'split' | 'debito' (pedidos antigos)
    taxa_quitada INTEGER NOT NULL DEFAULT 0,
    taxa_quitada_em TEXT,
    metodo TEXT NOT NULL CHECK (metodo IN ('mercadopago', 'pix', 'cartao', 'combinar')),
    mp_preference_id TEXT,
    mp_link TEXT,
    mp_payment_id TEXT,
    observacao TEXT,                    -- endereço, cor, tamanho… (escrito pelo cliente)
    status TEXT NOT NULL DEFAULT 'aguardando_pagamento'
      CHECK (status IN ('aguardando_pagamento', 'pagamento_informado', 'pago', 'enviado', 'concluido', 'cancelado')),
    pago_em TEXT,
    concluido_em TEXT,
    cancelado_por TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;
// Versão anterior da tabela (sem a taxa e sem o Mercado Pago): refaz mantendo os pedidos e o histórico
const antiga = db.get(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pedidos_loja'`);
if (antiga && !antiga.sql.includes('mercadopago')) {
  db.db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.db.exec(SQL_PEDIDOS.replace('pedidos_loja (', 'pedidos_loja_nova ('));
      const cols = 'id, loja_id, comprador, conversa_id, oferta_id, produto, imagem, preco_unit, quantidade, total, metodo, observacao, status, pago_em, concluido_em, cancelado_por, created_at, updated_at';
      db.db.exec(`INSERT INTO pedidos_loja_nova (${cols}, subtotal) SELECT ${cols}, total FROM pedidos_loja`);
      db.db.exec('DROP TABLE pedidos_loja');
      db.db.exec('ALTER TABLE pedidos_loja_nova RENAME TO pedidos_loja');
    });
  } finally { db.db.exec('PRAGMA foreign_keys = ON'); }
}
db.db.exec(`${SQL_PEDIDOS};
  CREATE INDEX IF NOT EXISTS idx_pedidos_loja ON pedidos_loja(loja_id, id);
  CREATE INDEX IF NOT EXISTS idx_pedidos_comprador ON pedidos_loja(comprador, id);
  CREATE TABLE IF NOT EXISTS pedido_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos_loja(id) ON DELETE CASCADE,
    quem TEXT,
    evento TEXT NOT NULL,
    detalhe TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS taxa_quitacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER NOT NULL,
    valor REAL NOT NULL,
    pedidos INTEGER NOT NULL,
    observacao TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS loja_metricas (
    loja_id INTEGER NOT NULL,
    dia TEXT NOT NULL,
    tipo TEXT NOT NULL,                 -- pagina | produto | site | link
    oferta_id INTEGER NOT NULL DEFAULT 0,
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (loja_id, dia, tipo, oferta_id)
  );
`);
// Pagamento pelo Mercado Pago do Ofertou! (gateway 'mp'), Pix gerado e tarifa cobrada pelo Mercado Pago
for (const col of ['gateway TEXT', 'pix_qr TEXT', 'pix_qr_base64 TEXT', 'pix_expira TEXT', 'tarifa_mp REAL']) {
  try { db.db.exec(`ALTER TABLE pedidos_loja ADD COLUMN ${col}`); } catch { /* já existe */ }
}

const codigo = id => `PD-${String(id).padStart(6, '0')}`;
const STATUS = {
  aguardando_pagamento: 'Aguardando pagamento', pagamento_informado: 'Pagamento informado', pago: 'Pago',
  enviado: 'Enviado', concluido: 'Concluído', cancelado: 'Cancelado',
};
const METODOS = { pix: 'Pix', cartao: 'Cartão de crédito ou débito', mercadopago: 'Mercado Pago', combinar: 'Combinado com a loja' };
const FINALIZADOS = ['pago', 'enviado', 'concluido'];
const brl = v => `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const txt = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const r2 = v => Math.round(v * 100) / 100;
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// Taxa de uso do site (%), configurada no painel (0 = sem taxa)
function taxaPct() {
  const n = Number(String(settings.get('taxa_site_pct') ?? '1').replace(',', '.'));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 20) : 1;
}
const siteUrl = () => String(settings.get('site_url') || '').replace(/\/+$/, '');
const sitePublico = () => /^https:\/\//i.test(siteUrl());
const parcelas = () => Math.min(Math.max(parseInt(settings.get('pag_mp_parcelas'), 10) || 1, 1), 12);

// ── Mercado Pago do Ofertou! ────────────────────────────────────────────────
const gatewayPronto = () => Boolean(settings.get('mp_access_token'));
const chavePublica = () => String(settings.get('mp_public_key') || '').trim();
async function mp(method, path, data, extraHeaders = {}) {
  const token = settings.get('mp_access_token');
  if (!token) throw fail('Os pagamentos ainda não foram configurados pelo administrador do site.', 503);
  const r = await axios({ method, url: `${MP}${path}`, data, timeout: 20000, validateStatus: () => true,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extraHeaders } });
  if (r.status >= 400) {
    const m = r.data?.message || r.data?.error || `HTTP ${r.status}`;
    throw fail(r.status === 401 ? 'O Mercado Pago recusou o Access Token (confira no painel).' : `Mercado Pago: ${m}`, 502);
  }
  return r.data;
}

// ── Formas de pagamento e chave para saques ─────────────────────────────────
const TIPOS_CHAVE = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'];
function normalizarChave(tipo, chave) {
  const c = String(chave || '').trim();
  const dig = c.replace(/\D/g, '');
  if (tipo === 'cpf') { if (dig.length !== 11) throw fail('Chave Pix (CPF) inválida.'); return dig; }
  if (tipo === 'cnpj') { if (dig.length !== 14) throw fail('Chave Pix (CNPJ) inválida.'); return dig; }
  if (tipo === 'email') { if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c) || c.length > 77) throw fail('Chave Pix (e-mail) inválida.'); return c.toLowerCase(); }
  if (tipo === 'telefone') {
    const n = dig.startsWith('55') && dig.length >= 12 ? dig : `55${dig}`;
    if (n.length < 12 || n.length > 13) throw fail('Chave Pix (telefone) inválida: use DDD + número.');
    return `+${n}`;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) throw fail('Chave aleatória inválida (formato 0000aaaa-00aa-…).');
  return c.toLowerCase();
}

function salvarPagamento(user, b) {
  const loja = db.get('SELECT * FROM lojas WHERE user_id = ?', user.id);
  if (!loja) throw fail('Crie sua loja antes de configurar os pagamentos.');
  const sim = v => v === true || v === 1 || v === '1' || v === 'on';
  const pix = sim(b.aceita_pix), cartao = sim(b.aceita_cartao), aceita = sim(b.aceita_pedidos);
  if (aceita && !pix && !cartao) throw fail('Escolha pelo menos uma forma: Pix ou cartão.');
  // Chave Pix da empresa: é para onde vão os saques da carteira
  const tipo = TIPOS_CHAVE.includes(b.pag_pix_tipo) ? b.pag_pix_tipo : null;
  let chave = null;
  if (String(b.pag_pix_chave || '').trim()) {
    if (!tipo) throw fail('Escolha o tipo da chave Pix.');
    chave = normalizarChave(tipo, b.pag_pix_chave);
  }
  const nome = txt(b.pag_pix_nome, 60);
  if (chave && nome.length < 3) throw fail('Informe o nome do titular da chave Pix.');
  db.run(`UPDATE lojas SET aceita_pix = ?, aceita_cartao = ?, aceita_pedidos = ?, pedido_instrucoes = ?,
          pag_pix_tipo = ?, pag_pix_chave = ?, pag_pix_nome = ? WHERE id = ?`,
  pix ? 1 : 0, cartao ? 1 : 0, aceita ? 1 : 0, txt(b.pedido_instrucoes, 400) || null, chave ? tipo : null, chave, chave ? nome : null, loja.id);
  return configPagamento(db.get('SELECT * FROM lojas WHERE id = ?', loja.id));
}

const configPagamento = l => ({
  aceita_pedidos: Boolean(l.aceita_pedidos), aceita_pix: Boolean(l.aceita_pix), aceita_cartao: Boolean(l.aceita_cartao),
  pedido_instrucoes: l.pedido_instrucoes || '', pag_pix_tipo: l.pag_pix_tipo || '', pag_pix_chave: l.pag_pix_chave || '', pag_pix_nome: l.pag_pix_nome || '',
  gateway_ok: gatewayPronto(), parcelas: parcelas(), taxa_pct: taxaPct(),
});

// O que o cliente pode escolher (só com o Mercado Pago do site configurado)
function metodosDaLoja(l) {
  if (!gatewayPronto()) return [];
  const m = [];
  if (l.aceita_pix) m.push({ id: 'pix', nome: 'Pix', desc: 'QR code e copia e cola na hora, confirmação automática' });
  if (l.aceita_cartao && chavePublica()) m.push({ id: 'cartao', nome: 'Cartão de crédito ou débito', desc: `Pelo Mercado Pago${parcelas() > 1 ? `, em até ${parcelas()}x` : ''}, confirmação automática` });
  return m;
}
const publicoLoja = l => ({ aceita_pedidos: Boolean(l.aceita_pedidos) && metodosDaLoja(l).length > 0, metodos: metodosDaLoja(l), instrucoes: l.pedido_instrucoes || '',
  taxa_pct: taxaPct(), mp_public_key: chavePublica() || null, parcelas: parcelas() });

// ── Pix "copia e cola" estático (usado no Pix da taxa de pedidos antigos) ────
function crc16(s) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const campo = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
const semAcento = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .-]/g, '').toUpperCase();
function pixCopiaECola({ chave, nome, cidade, valor, txid }) {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
  const corpo = campo('00', '01') + campo('26', conta) + campo('52', '0000') + campo('53', '986')
    + campo('54', Number(valor).toFixed(2)) + campo('58', 'BR') + campo('59', semAcento(nome).slice(0, 25) || 'LOJA')
    + campo('60', semAcento(cidade).slice(0, 15) || 'BRASIL') + campo('62', campo('05', String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'));
  const semCrc = `${corpo}6304`;
  return semCrc + crc16(semCrc);
}

// ── Pedidos ─────────────────────────────────────────────────────────────────
function evento(pedidoId, quem, ev, detalhe = null) {
  db.run('INSERT INTO pedido_eventos (pedido_id, quem, evento, detalhe) VALUES (?, ?, ?, ?)', pedidoId, quem, ev, detalhe);
}

async function criar(dono, b) {
  if (!dono) throw fail('Entre na sua conta para fazer o pedido.', 401);
  const o = db.get(`SELECT o.id, o.produto, o.preco_atual, o.imagem, o.loja_id, o.oculto, o.expires_at FROM offers o WHERE o.id = ?`, Number(b.oferta_id));
  if (!o || !o.loja_id || o.oculto || !require('./offers').isActive(o.id)) throw fail('Produto indisponível.', 404);
  const loja = db.get('SELECT * FROM lojas WHERE id = ?', o.loja_id);
  if (!loja || loja.oculta) throw fail('Loja indisponível.', 404);
  const formas = metodosDaLoja(loja);
  if (!loja.aceita_pedidos || !formas.length) throw fail('Esta loja não está recebendo pedidos pelo site no momento. Fale com ela pelo chat.');
  if (`u:${loja.user_id}` === dono) throw fail('Você não pode fazer pedido na sua própria loja.');
  const metodo = String(b.metodo || '');
  if (!formas.some(m => m.id === metodo)) throw fail('Escolha Pix ou cartão.');
  const qtd = Math.min(Math.max(parseInt(b.quantidade, 10) || 1, 1), 99);
  const subtotal = r2(o.preco_atual * qtd);
  const pct = taxaPct();
  const taxa = r2(subtotal * pct / 100);
  const total = r2(subtotal + taxa);
  const abertos = db.get(`SELECT COUNT(*) n FROM pedidos_loja WHERE comprador = ? AND status = 'aguardando_pagamento' AND created_at > datetime('now', '-1 day')`, dono).n;
  if (abertos >= 10) throw fail('Você tem muitos pedidos aguardando pagamento. Pague ou cancele os anteriores.', 429);
  const cartao = metodo === 'cartao' ? (b.cartao || {}) : null;
  // Cartão salvo (Minha conta → Meus cartões): o token vem do código de segurança + id do cartão; o resto vem do Mercado Pago
  const salvo = cartao?.card_id ? await require('./cartoes').paraPagamento(dono, cartao.card_id) : null;
  if (cartao && (!cartao.token || !(salvo || cartao.payment_method_id))) throw fail('Preencha os dados do cartão.');
  const resumoValor = taxa ? `${brl(subtotal)} + taxa do site ${brl(taxa)} = ${brl(total)}` : brl(total);
  let id;
  db.transaction(() => {
    id = Number(db.run(`INSERT INTO pedidos_loja (loja_id, comprador, oferta_id, produto, imagem, preco_unit, quantidade, subtotal,
                          taxa_pct, taxa_valor, total, taxa_modo, metodo, observacao, gateway)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'site', ?, ?, 'mp')`,
    loja.id, dono, o.id, o.produto, o.imagem, o.preco_atual, qtd, subtotal, pct, taxa, total, metodo, txt(b.observacao, 600) || null).lastInsertRowid);
    evento(id, dono, 'criado', `${qtd}x ${o.produto} — ${resumoValor} — ${METODOS[metodo]}`);
  });
  // Pagamento no Mercado Pago do Ofertou!
  const descricao = `${qtd}x ${o.produto}`.slice(0, 200);
  const ref = `ofertou-pd-${id}`;
  const notif = sitePublico() ? { notification_url: `${siteUrl()}/api/pedidos/mp-webhook?pedido=${id}` } : {};
  const email = chat.emailDe(dono) || `cliente${id}@ofertou.app`;
  const [primeiro, ...resto] = (chat.pessoa(dono).nome || 'Cliente').split(' ');
  let pay;
  try {
    if (metodo === 'pix') {
      const expira = new Date(Date.now() + PIX_MINUTOS * 60000);
      pay = await mp('post', '/v1/payments', {
        transaction_amount: total, description: `${descricao} — pedido ${codigo(id)} (Ofertou!)`, payment_method_id: 'pix', external_reference: ref,
        date_of_expiration: expira.toISOString().replace('Z', '+00:00'),
        payer: { email, first_name: primeiro, last_name: resto.join(' ') || primeiro }, ...notif,
      }, { 'X-Idempotency-Key': ref });
      const td = pay.point_of_interaction?.transaction_data || {};
      db.run('UPDATE pedidos_loja SET mp_payment_id = ?, pix_qr = ?, pix_qr_base64 = ?, pix_expira = ? WHERE id = ?',
        String(pay.id), td.qr_code || null, td.qr_code_base64 || null, expira.toISOString().replace('T', ' ').slice(0, 19), id);
    } else {
      const parc = Math.min(Math.max(parseInt(cartao.installments, 10) || 1, 1), parcelas());
      const doc = cartao.payer?.identification;
      const issuer = salvo ? salvo.issuer_id : cartao.issuer_id;
      pay = await mp('post', '/v1/payments', {
        transaction_amount: total, token: String(cartao.token), installments: parc, payment_method_id: String(salvo ? salvo.payment_method_id : cartao.payment_method_id),
        ...(issuer ? { issuer_id: String(issuer) } : {}),
        description: `${descricao} — pedido ${codigo(id)} (Ofertou!)`, external_reference: ref, statement_descriptor: 'OFERTOU',
        payer: salvo ? { type: 'customer', id: salvo.customer_id, email }
          : { email: String(cartao.payer?.email || email), ...(doc?.number ? { identification: { type: String(doc.type || 'CPF'), number: String(doc.number) } } : {}) }, ...notif,
      }, { 'X-Idempotency-Key': ref });
      db.run('UPDATE pedidos_loja SET mp_payment_id = ? WHERE id = ?', String(pay.id), id);
      evento(id, dono, 'cartao', `${salvo ? `Cartão salvo ${salvo.cartao.bandeira} final ${salvo.cartao.final}` : 'Cartão'} em ${parc}x — situação no Mercado Pago: ${pay.status}`);
    }
  } catch (err) {
    db.run(`UPDATE pedidos_loja SET status = 'cancelado', cancelado_por = 'sistema' WHERE id = ?`, id);
    evento(id, null, 'cancelar', `Mercado Pago: ${err.message}`);
    throw fail(metodo === 'pix' ? 'Não foi possível gerar o Pix agora. Tente de novo em instantes.' : 'Não foi possível processar o cartão agora. Confira os dados ou tente o Pix.', 502);
  }
  // Cartão: aprovado na hora, recusado (pedido cancelado) ou em análise (a conferência automática resolve)
  if (metodo === 'cartao') {
    if (pay.status === 'approved') await verificarMP(id, true);
    else if (pay.status === 'rejected' || pay.status === 'cancelled') {
      db.run(`UPDATE pedidos_loja SET status = 'cancelado', cancelado_por = 'sistema' WHERE id = ?`, id);
      evento(id, null, 'cancelar', `Cartão recusado (${pay.status_detail || pay.status})`);
      throw fail(motivoRecusa(pay.status_detail), 402);
    }
  }
  return detalhe(dono, id);
}

const RECUSAS = {
  cc_rejected_insufficient_amount: 'Limite insuficiente no cartão.', cc_rejected_bad_filled_security_code: 'Código de segurança (CVV) incorreto.',
  cc_rejected_bad_filled_date: 'Data de validade incorreta.', cc_rejected_bad_filled_card_number: 'Número do cartão incorreto.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão.', cc_rejected_call_for_authorize: 'O banco pediu autorização: libere a compra no app do banco e tente de novo.',
  cc_rejected_card_disabled: 'Cartão desativado: ative-o com o banco ou use outro.', cc_rejected_duplicated_payment: 'Pagamento repetido: você já pagou este valor agora há pouco.',
  cc_rejected_high_risk: 'Pagamento recusado por segurança. Tente outro cartão ou o Pix.', cc_rejected_max_attempts: 'Muitas tentativas com este cartão. Use outro cartão ou o Pix.',
};
const motivoRecusa = d => `Pagamento recusado. ${RECUSAS[d] || 'Tente outro cartão ou pague com Pix.'}`;

// Quem pode fazer o quê (e para qual situação vai). Pagamentos pelo Mercado Pago do site são confirmados sozinhos;
// "informar"/"confirmar pagamento" ficam só para pedidos antigos (de antes da confirmação automática).
const ACOES = {
  informar_pagamento: { quem: 'comprador', de: ['aguardando_pagamento'], para: 'pagamento_informado', msg: 'O cliente informou que pagou o pedido', antigo: true },
  confirmar_pagamento: { quem: 'loja', de: ['aguardando_pagamento', 'pagamento_informado'], para: 'pago', msg: 'A loja confirmou o pagamento do pedido', antigo: true },
  enviado: { quem: 'loja', de: ['pago'], para: 'enviado', msg: 'A loja marcou como enviado o pedido' },
  concluido: { quem: 'loja', de: ['pago', 'enviado'], para: 'concluido', msg: 'A loja concluiu o pedido' },
  recebido: { quem: 'comprador', de: ['enviado'], para: 'concluido', msg: 'O cliente confirmou que recebeu o pedido' },
  cancelar: { quem: 'ambos', de: ['aguardando_pagamento', 'pagamento_informado', 'pago', 'enviado'], para: 'cancelado', msg: 'Pedido cancelado' },
};
const disponivel = (p, nome, eu) => {
  const a = ACOES[nome];
  if (!a || !(a.quem === 'ambos' || a.quem === eu) || !a.de.includes(p.status)) return false;
  if (a.antigo && p.gateway === 'mp') return false;
  if (nome === 'cancelar' && eu === 'comprador' && !['aguardando_pagamento', 'pagamento_informado'].includes(p.status)) return false;
  return true;
};

function papel(dono, p) {
  const loja = db.get('SELECT user_id FROM lojas WHERE id = ?', p.loja_id);
  if (loja && `u:${loja.user_id}` === dono) return 'loja';
  if (p.comprador === dono) return 'comprador';
  return null;
}

// Muda a situação do pedido, registra o evento e avisa na conversa
function mudar(p, nome, quem, eu, motivo = '') {
  const a = ACOES[nome];
  const extra = { pago: ', pago_em = datetime(\'now\')', concluido: ', concluido_em = datetime(\'now\')' }[a.para] || '';
  db.transaction(() => {
    db.run(`UPDATE pedidos_loja SET status = ?, updated_at = datetime('now')${extra}${a.para === 'cancelado' ? ', cancelado_por = ?' : ''} WHERE id = ?`,
      ...(a.para === 'cancelado' ? [a.para, eu, p.id] : [a.para, p.id]));
    const det = txt(motivo, 300);
    evento(p.id, quem, nome, det || null);
    const msg = quem === 'mercadopago' ? 'Pagamento confirmado pelo Mercado Pago — pedido' : a.msg;
    if (p.conversa_id) chat.sistema(p.conversa_id, `${msg} ${codigo(p.id)}${a.para === 'cancelado' ? ` (${eu === 'loja' ? 'pela loja' : eu === 'sistema' ? 'automaticamente' : 'pelo cliente'})` : ''}.${det ? ` ${quem === 'mercadopago' ? '' : 'Motivo: '}${det}` : ''}`, p.id);
  });
  if (a.para === 'pago') {
    const loja = db.get('SELECT user_id, nome FROM lojas WHERE id = ?', p.loja_id);
    const donoLoja = `u:${loja.user_id}`;
    try { require('./perfis').registrarVenda(donoLoja, 'empresa', p.quantidade, `Pedido ${codigo(p.id)} pelo site`); } catch { /* sem perfil */ }
    // Aviso para a loja: no site (🔔), na conversa (acima) e por e-mail
    const texto = `${p.quantidade}x ${p.produto} — ${brl(p.subtotal ?? p.total)} em produtos. Prepare o envio e combine a entrega com o cliente pela conversa.`;
    notificacoes.criar(donoLoja, { tipo: 'pedido_pago', titulo: `Pedido ${codigo(p.id)} pago!`, texto, link: `/mensagens?c=${p.conversa_id}&pedido=${p.id}` });
    chat.avisarPorEmail(donoLoja, `Pedido ${codigo(p.id)} pago — ${loja.nome} — Ofertou!`, `O pagamento do pedido ${codigo(p.id)} foi confirmado.\n\n${texto}`);
    notificacoes.criar(p.comprador, { tipo: 'pedido_pago', titulo: `Pagamento do pedido ${codigo(p.id)} confirmado`, texto: `${p.produto} — ${loja.nome}`, link: `/mensagens?c=${p.conversa_id}&pedido=${p.id}` });
    chat.avisarPorEmail(p.comprador, `Pagamento confirmado — pedido ${codigo(p.id)} — Ofertou!`, `O pagamento do seu pedido ${codigo(p.id)} (${p.produto}) foi confirmado. A loja ${loja.nome} vai preparar o envio.`);
  }
  if (nome === 'informar_pagamento') {
    const l = db.get('SELECT user_id FROM lojas WHERE id = ?', p.loja_id);
    chat.avisarPorEmail(`u:${l.user_id}`, `Pagamento informado — pedido ${codigo(p.id)} — Ofertou!`, `O cliente informou que pagou o pedido ${codigo(p.id)} (${p.produto}, ${brl(p.total)}). Confira e confirme no site.`);
  }
}

// Confere no Mercado Pago se o pedido foi pago. Aprovado → pago, carteira da loja e avisos. Pix vencido → cancelado.
const conferidos = new Map();
async function verificarMP(pedidoId, forcar = false) {
  let p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', Number(pedidoId));
  if (!p || p.gateway !== 'mp' || p.status !== 'aguardando_pagamento') return p;
  if (!forcar && Date.now() - (conferidos.get(p.id) || 0) < 10000) return p;
  conferidos.set(p.id, Date.now());
  const ref = `ofertou-pd-${p.id}`;
  let pago = null;
  if (p.mp_payment_id) {
    const pay = await mp('get', `/v1/payments/${p.mp_payment_id}`).catch(() => null);
    if (pay && pay.status === 'approved' && pay.external_reference === ref) pago = pay;
    if (pay && ['rejected', 'cancelled'].includes(pay.status) && p.metodo === 'cartao') {
      db.run(`UPDATE pedidos_loja SET status = 'cancelado', cancelado_por = 'sistema' WHERE id = ? AND status = 'aguardando_pagamento'`, p.id);
      evento(p.id, null, 'cancelar', `Cartão recusado (${pay.status_detail || pay.status})`);
      return db.get('SELECT * FROM pedidos_loja WHERE id = ?', p.id);
    }
  } else {
    const r = await mp('get', `/v1/payments/search?external_reference=${ref}&sort=date_created&criteria=desc`).catch(() => null);
    pago = (r?.results || []).find(x => x.status === 'approved' && x.external_reference === ref) || null;
  }
  p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', p.id);
  if (p.status !== 'aguardando_pagamento') return p; // outra conferência já resolveu
  if (pago && Math.abs(Number(pago.transaction_amount) - p.total) < 0.01) {
    const tarifa = r2((pago.fee_details || []).reduce((s, f) => s + (Number(f.amount) || 0), 0));
    db.run('UPDATE pedidos_loja SET mp_payment_id = ?, tarifa_mp = ?, taxa_quitada = 1, taxa_quitada_em = datetime(\'now\') WHERE id = ?', String(pago.id), tarifa, p.id);
    p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', p.id);
    if (!p.conversa_id) {
      // O pedido entra na conversa da loja com o cliente só depois de pago
      let conv = null;
      try { conv = chat.conversaLoja(p.comprador, p.loja_id, p.oferta_id, { semEmail: true }); } catch { /* conversa bloqueada: o pedido segue sem chat */ }
      if (conv) {
        db.run('UPDATE pedidos_loja SET conversa_id = ? WHERE id = ?', conv.id, p.id);
        p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', p.id);
        const parc = Number(pago.installments) > 1 ? ` em ${pago.installments}x` : '';
        chat.sistema(conv.id, `Novo pedido ${codigo(p.id)}: ${p.quantidade}x ${p.produto} — total ${brl(p.total)} (${METODOS[p.metodo]}${parc}).${p.observacao ? ` Observações do cliente: ${p.observacao}` : ''}`, p.id);
      }
    }
    mudar(p, 'confirmar_pagamento', 'mercadopago', 'sistema', `Pagamento ${pago.id} aprovado (${METODOS[p.metodo]}).`);
    p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', p.id);
    carteira.creditarVenda(p, tarifa);
  } else if (p.metodo === 'pix' && p.pix_expira && p.pix_expira < nowSql()) {
    mudar(p, 'cancelar', null, 'sistema', 'O Pix venceu sem pagamento. Faça um novo pedido para gerar outro Pix.');
  }
  return db.get('SELECT * FROM pedidos_loja WHERE id = ?', p.id);
}

// No servidor: confere os pedidos esperando pagamento a cada 2 minutos (a loja é avisada mesmo sem ninguém na tela)
let timerConferencia = null;
function iniciar() {
  if (timerConferencia) return;
  timerConferencia = setInterval(async () => {
    if (!gatewayPronto()) return;
    for (const { id } of db.all(`SELECT id FROM pedidos_loja WHERE gateway = 'mp' AND status = 'aguardando_pagamento' AND created_at > datetime('now', '-3 days') LIMIT 50`)) {
      try { await verificarMP(id, true); } catch (err) { console.error('[PEDIDOS] conferência:', err.message); }
    }
  }, 2 * 60000);
  timerConferencia.unref?.();
}

async function acao(dono, pedidoId, nome, motivo = '') {
  let p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', Number(pedidoId));
  if (!p) throw fail('Pedido não encontrado.', 404);
  const eu = papel(dono, p);
  if (!eu) throw fail('Pedido não encontrado.', 404);
  if (!ACOES[nome]) throw fail('Ação inválida.');
  if (p.gateway === 'mp' && p.status === 'aguardando_pagamento') p = await verificarMP(p.id, true).catch(() => p); // pode ter acabado de pagar
  if (nome === 'cancelar' && eu === 'comprador' && !['aguardando_pagamento', 'pagamento_informado'].includes(p.status)) {
    throw fail('O pagamento já foi confirmado: peça o cancelamento à loja pelo chat.');
  }
  if (!disponivel(p, nome, eu)) throw fail(`Não dá para fazer isso com o pedido ${STATUS[p.status].toLowerCase()}.`);
  // Cancelar depois de pago (pelo Mercado Pago do site): devolve o dinheiro ao cliente e tira a venda da carteira
  if (nome === 'cancelar' && p.gateway === 'mp' && FINALIZADOS.includes(p.status) && p.mp_payment_id) {
    await mp('post', `/v1/payments/${p.mp_payment_id}/refunds`, {}, { 'X-Idempotency-Key': `estorno-${p.id}` })
      .catch(err => { throw fail(`Não foi possível devolver o pagamento pelo Mercado Pago (${err.message}). Fale com o administrador.`, 502); });
    carteira.estornarVenda(p);
    motivo = `${txt(motivo, 250) ? `${txt(motivo, 250)} — ` : ''}valor devolvido ao cliente pelo Mercado Pago`;
  }
  mudar(p, nome, dono, eu, motivo);
  return detalhe(dono, p.id);
}

function montar(p, eu = null) {
  const loja = db.get('SELECT * FROM lojas WHERE id = ?', p.loja_id) || {};
  const out = {
    id: p.id, codigo: codigo(p.id), status: p.status, status_nome: STATUS[p.status], produto: p.produto, imagem: p.imagem,
    oferta_id: p.oferta_id, preco_unit: p.preco_unit, quantidade: p.quantidade, subtotal: p.subtotal ?? p.total,
    taxa_pct: p.taxa_pct, taxa_valor: p.taxa_valor, total: p.total, taxa_modo: p.taxa_modo, taxa_quitada: Boolean(p.taxa_quitada),
    metodo: p.metodo, metodo_nome: METODOS[p.metodo], gateway: p.gateway || null, tarifa_mp: p.tarifa_mp,
    observacao: p.observacao, created_at: p.created_at, pago_em: p.pago_em, concluido_em: p.concluido_em, conversa_id: p.conversa_id,
    loja: { id: loja.id, nome: loja.nome, slug: loja.slug }, comprador: chat.pessoa(p.comprador), eu,
    acoes: eu ? Object.keys(ACOES).filter(n => disponivel(p, n, eu)) : [],
  };
  // Valor que vai para a carteira da loja (produtos menos a tarifa do Mercado Pago)
  if (eu === 'loja' || eu === null) out.valor_loja = r2((p.subtotal ?? p.total) - (p.tarifa_mp || 0));
  if (eu === 'loja' && p.pago_em && p.gateway === 'mp') {
    const libera = carteira.liberaEm(p);
    out.libera_em = libera ? new Date(libera).toISOString().replace('T', ' ').slice(0, 19) : null;
  }
  // Como pagar (só para quem comprou, enquanto não foi pago)
  if (eu === 'comprador' && p.status === 'aguardando_pagamento' && p.gateway === 'mp') {
    if (p.metodo === 'pix' && p.pix_qr) out.pagamento = { pix: p.pix_qr, qr: p.pix_qr_base64, expira: p.pix_expira };
    else if (p.metodo === 'cartao') out.pagamento = { cartao_analise: true };
  }
  if (eu === 'comprador' && p.status === 'aguardando_pagamento') out.instrucoes = loja.pedido_instrucoes || '';
  return out;
}

async function detalhe(dono, id) {
  let p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', Number(id));
  if (!p) throw fail('Pedido não encontrado.', 404);
  const eu = papel(dono, p);
  if (!eu || (eu === 'loja' && p.gateway === 'mp' && !p.pago_em)) throw fail('Pedido não encontrado.', 404);
  if (p.gateway === 'mp' && p.status === 'aguardando_pagamento') p = await verificarMP(p.id).catch(() => p);
  return { ...montar(p, eu), eventos: eventos(p.id) };
}

const eventos = id => db.all('SELECT quem, evento, detalhe, created_at FROM pedido_eventos WHERE pedido_id = ? ORDER BY id', id)
  .map(e => ({ ...e, quem_nome: e.quem === 'mercadopago' ? 'Mercado Pago' : e.quem ? chat.pessoa(e.quem).nome : 'Sistema' }));

const meusPedidos = dono => db.all('SELECT * FROM pedidos_loja WHERE comprador = ? ORDER BY id DESC LIMIT 200', dono).map(p => montar(p, 'comprador'));
function pedidosDaLoja(user) {
  const loja = db.get('SELECT id FROM lojas WHERE user_id = ?', user.id);
  return loja ? db.all('SELECT * FROM pedidos_loja WHERE loja_id = ? AND (pago_em IS NOT NULL OR gateway IS NULL) ORDER BY id DESC LIMIT 300', loja.id).map(p => montar(p, 'loja')) : [];
}

// ── Taxa de uso do site: quanto cada loja gerou (pedidos novos: já recebida no Mercado Pago do site) ──
const FIN_SQL = `status IN ('pago', 'enviado', 'concluido')`;
function taxas(lojaId) {
  const q = (where, ...p) => db.get(`SELECT COUNT(*) n, COALESCE(SUM(taxa_valor), 0) v FROM pedidos_loja WHERE loja_id = ? AND ${FIN_SQL} AND taxa_valor > 0 AND ${where}`, lojaId, ...p);
  const auto = q(`taxa_modo IN ('site', 'split')`), quitadas = q(`taxa_modo = 'debito' AND taxa_quitada = 1`), pendentes = q(`taxa_modo = 'debito' AND taxa_quitada = 0`);
  const loja = db.get('SELECT taxa_aviso_em FROM lojas WHERE id = ?', lojaId) || {};
  return {
    pct: taxaPct(), total: r2(auto.v + quitadas.v + pendentes.v),
    automaticas: { n: auto.n, valor: r2(auto.v) }, quitadas: { n: quitadas.n, valor: r2(quitadas.v) }, a_pagar: { n: pendentes.n, valor: r2(pendentes.v) },
    aviso_pagamento_em: loja.taxa_aviso_em || null,
  };
}
// Admin: dá baixa em taxas de pedidos antigos (de antes do pagamento pelo site) recebidas por Pix
function quitarTaxas(lojaId, observacao = '') {
  const t = taxas(Number(lojaId));
  if (!(t.a_pagar.valor > 0)) throw fail('Esta loja não tem taxa pendente.');
  db.transaction(() => {
    db.run(`UPDATE pedidos_loja SET taxa_quitada = 1, taxa_quitada_em = datetime('now') WHERE loja_id = ? AND ${FIN_SQL} AND taxa_modo = 'debito' AND taxa_quitada = 0 AND taxa_valor > 0`, Number(lojaId));
    db.run('INSERT INTO taxa_quitacoes (loja_id, valor, pedidos, observacao) VALUES (?, ?, ?, ?)', Number(lojaId), t.a_pagar.valor, t.a_pagar.n, txt(observacao, 200) || null);
    db.run('UPDATE lojas SET taxa_aviso_em = NULL WHERE id = ?', Number(lojaId));
  });
  return taxas(Number(lojaId));
}

// ── Contadores de acesso ────────────────────────────────────────────────────
const TIPOS_METRICA = ['pagina', 'produto', 'site', 'link'];
const vistos = new Map(); // ip|loja|tipo|oferta → quando (conta uma vez a cada 30 min por visitante)
function registrarVisita(lojaId, tipo, ofertaId, ip, dono) {
  if (!TIPOS_METRICA.includes(tipo)) return;
  const loja = db.get('SELECT id, user_id FROM lojas WHERE id = ?', Number(lojaId));
  if (!loja || (dono && dono === `u:${loja.user_id}`)) return; // o dono olhando a própria loja não conta
  const oferta = tipo === 'produto' || tipo === 'link' ? Number(ofertaId) || 0 : 0;
  if (oferta && !db.get('SELECT 1 FROM offers WHERE id = ? AND loja_id = ?', oferta, loja.id)) return;
  const chave = `${ip}|${loja.id}|${tipo}|${oferta}`;
  const agora = Date.now();
  if (vistos.get(chave) > agora - 30 * 60000) return;
  vistos.set(chave, agora);
  if (vistos.size > 50000) for (const [k, t] of vistos) if (t < agora - 30 * 60000) vistos.delete(k);
  db.run(`INSERT INTO loja_metricas (loja_id, dia, tipo, oferta_id, n) VALUES (?, date('now'), ?, ?, 1)
          ON CONFLICT (loja_id, dia, tipo, oferta_id) DO UPDATE SET n = n + 1`, loja.id, tipo, oferta);
}

function metricas(lojaId) {
  const soma = (tipo, dias) => db.get(`SELECT COALESCE(SUM(n), 0) n FROM loja_metricas WHERE loja_id = ? AND tipo = ?${dias ? ` AND dia >= date('now', '-${dias} days')` : ''}`, lojaId, tipo).n;
  const cont = {};
  for (const t of TIPOS_METRICA) cont[t] = { total: soma(t), d30: soma(t, 30), d7: soma(t, 7) };
  const fin = db.get(`SELECT COUNT(*) n, COALESCE(SUM(subtotal), 0) v FROM pedidos_loja WHERE loja_id = ? AND ${FIN_SQL}`, lojaId);
  const fin30 = db.get(`SELECT COUNT(*) n, COALESCE(SUM(subtotal), 0) v FROM pedidos_loja WHERE loja_id = ? AND ${FIN_SQL} AND pago_em >= datetime('now', '-30 days')`, lojaId);
  const porStatus = Object.fromEntries(db.all('SELECT status, COUNT(*) n FROM pedidos_loja WHERE loja_id = ? AND (pago_em IS NOT NULL OR gateway IS NULL) GROUP BY status', lojaId).map(r => [r.status, r.n]));
  const top = db.all(`SELECT m.oferta_id AS id, SUM(m.n) AS n, o.produto FROM loja_metricas m LEFT JOIN offers o ON o.id = m.oferta_id
                      WHERE m.loja_id = ? AND m.tipo = 'produto' AND m.dia >= date('now', '-30 days') GROUP BY m.oferta_id ORDER BY n DESC LIMIT 5`, lojaId);
  const dias = db.all(`SELECT dia, tipo, SUM(n) n FROM loja_metricas WHERE loja_id = ? AND dia >= date('now', '-13 days') GROUP BY dia, tipo ORDER BY dia`, lojaId);
  return {
    acessos: cont, finalizacoes: { total: fin.n, valor: r2(fin.v), d30: fin30.n, valor_d30: r2(fin30.v) },
    pedidos: { total: Object.values(porStatus).reduce((a, b) => a + b, 0), por_status: porStatus },
    conversas: db.get(`SELECT COUNT(*) n FROM conversas WHERE tipo = 'loja' AND loja_id = ?`, lojaId).n,
    taxas: taxas(lojaId), mais_vistos: top.filter(t => t.produto), dias,
  };
}

// ── Reputação da loja (cartão de parceiro na comunidade) ─────────────────────
// Calculada só com o que aconteceu no site: pedidos pagos, entregues e cancelados, e o tempo que a loja leva para
// responder os clientes no atendimento. Com menos de 3 pedidos pagos a loja aparece como "nova" (sem nota).
const cacheReputacao = new Map();
function reputacao(lojaId) {
  const c = cacheReputacao.get(lojaId);
  if (c && Date.now() - c.at < 10 * 60000) return c.dados;
  const vendidos = db.get(`SELECT COALESCE(SUM(quantidade), 0) n FROM pedidos_loja WHERE loja_id = ? AND ${FIN_SQL}`, lojaId).n;
  const pagos = db.get(`SELECT COUNT(*) n FROM pedidos_loja WHERE loja_id = ? AND (pago_em IS NOT NULL)`, lojaId).n;
  // Entrega: pedidos pagos há mais de 3 dias que já foram enviados ou concluídos
  const vencidos = db.get(`SELECT COUNT(*) n, SUM(status IN ('enviado', 'concluido')) ok FROM pedidos_loja WHERE loja_id = ? AND pago_em IS NOT NULL AND pago_em < datetime('now', '-3 days')`, lojaId);
  const entregaPct = vencidos.n ? Math.round((vencidos.ok || 0) * 100 / vencidos.n) : null;
  // Cancelamentos feitos pela loja (sobre todos os pedidos)
  const totalPed = db.get('SELECT COUNT(*) n FROM pedidos_loja WHERE loja_id = ?', lojaId).n;
  const cancLoja = db.get(`SELECT COUNT(*) n FROM pedidos_loja WHERE loja_id = ? AND status = 'cancelado' AND cancelado_por = 'loja'`, lojaId).n;
  // Atendimento: tempo até a loja responder a primeira mensagem do cliente (mediana, últimos 90 dias)
  const tempos = [];
  for (const conv of db.all(`SELECT id, a, b FROM conversas WHERE tipo = 'loja' AND loja_id = ? AND created_at > datetime('now', '-90 days')`, lojaId)) {
    const msgs = db.all('SELECT autor, created_at FROM mensagens WHERE conversa_id = ? AND autor IS NOT NULL ORDER BY id LIMIT 200', conv.id);
    let espera = null;
    for (const m of msgs) {
      const t = new Date(String(m.created_at).replace(' ', 'T') + 'Z').getTime();
      if (m.autor === conv.a && espera === null) espera = t;
      else if (m.autor === conv.b && espera !== null) { tempos.push((t - espera) / 60000); espera = null; }
    }
  }
  tempos.sort((x, y) => x - y);
  const mediana = tempos.length ? tempos[Math.floor(tempos.length / 2)] : null;
  const atendimento = mediana === null ? null : mediana <= 120 ? 'rapido' : mediana <= 1440 ? 'dia' : 'devagar';
  let nota = null; // 0 a 4 (Ruim → Ótimo)
  if (pagos >= 3) {
    const partes = [100 - (totalPed ? cancLoja * 100 / totalPed : 0)];
    if (entregaPct !== null) partes.push(entregaPct);
    if (atendimento) partes.push({ rapido: 100, dia: 70, devagar: 35 }[atendimento]);
    const media = partes.reduce((a, b) => a + b, 0) / partes.length;
    nota = media >= 90 ? 4 : media >= 75 ? 3 : media >= 60 ? 2 : media >= 40 ? 1 : 0;
  }
  const dados = {
    vendidos, nota, nova: nota === null,
    entrega: entregaPct === null ? null : entregaPct >= 80 ? 'No prazo' : entregaPct >= 50 ? 'Às vezes atrasa' : 'Costuma atrasar',
    atendimento: { rapido: 'Responde rápido', dia: 'Responde em até 1 dia', devagar: 'Demora a responder' }[atendimento] || null,
  };
  cacheReputacao.set(lojaId, { at: Date.now(), dados });
  return dados;
}

// ── Painel do administrador ─────────────────────────────────────────────────
function listarAdmin({ q = '', lojaId = null, dono = null, limite = 300 } = {}) {
  let sql = 'SELECT * FROM pedidos_loja WHERE 1 = 1';
  const p = [];
  if (lojaId) { sql += ' AND loja_id = ?'; p.push(lojaId); }
  if (dono) { sql += ' AND comprador = ?'; p.push(dono); }
  const termo = String(q || '').trim().toLowerCase().replace(/^pd-0*/, '');
  sql += ' ORDER BY id DESC LIMIT ?';
  p.push(termo ? 3000 : limite);
  let rows = db.all(sql, ...p).map(r => montar(r));
  if (termo) rows = rows.filter(r => String(r.id) === termo || `${r.produto} ${r.loja.nome} ${r.comprador.nome}`.toLowerCase().includes(termo)).slice(0, limite);
  return rows;
}
function detalheAdmin(id) {
  const p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', Number(id));
  if (!p) throw fail('Pedido não encontrado.', 404);
  return { ...montar(p), eventos: eventos(p.id) };
}

module.exports = {
  mp, parcelas, chavePublica, codigo, STATUS, METODOS, FINALIZADOS, taxaPct, gatewayPronto, salvarPagamento, configPagamento, publicoLoja, pixCopiaECola, criar, acao, detalhe,
  verificarMP, iniciar, reputacao, meusPedidos, pedidosDaLoja, registrarVisita, metricas, taxas, quitarTaxas, listarAdmin, detalheAdmin,
};
