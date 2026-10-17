// Pedidos feitos às lojas parceiras pelo site, formas de pagamento de cada loja, taxa de uso do site e contadores.
//  • A empresa configura como recebe (Minha conta → Vendas e pagamentos): Mercado Pago conectado (Pix ou cartão
//    com confirmação automática), Pix pela chave dela (o site gera o "copia e cola" com o valor do pedido),
//    e/ou cartão pelo link de pagamento dela. Sem nenhuma forma configurada, a loja não recebe pedidos pelo site.
//  • TAXA DE USO DO SITE (Painel → Atendimento; padrão 1%): somada ao valor do produto na finalização do pedido.
//      – Mercado Pago conectado: o pagamento é dividido pelo próprio Mercado Pago (marketplace_fee) e a taxa cai
//        direto no saldo da conta Mercado Pago do dono do site, na aprovação.
//      – Demais formas: o cliente paga produto + taxa à empresa e a taxa fica registrada como débito da empresa;
//        ela paga por Pix para a chave do dono do site (Painel → Planos → Formas de recebimento) e o admin dá baixa.
//  • Cada pedido é um ticket (PD-000123) com todos os eventos e as mensagens automáticas na conversa com a loja.
//  • "Finalização de compra" = pedido com pagamento confirmado. Aparece para o dono da loja e no painel.
//  • Contadores por dia: acessos à página da loja, produtos abertos no catálogo, cliques no site oficial e nos links.
const crypto = require('crypto');
const axios = require('axios');
const db = require('./db');
const chat = require('./chat');
const settings = require('./settings');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const MP = 'https://api.mercadopago.com';

for (const col of ['pag_pix_ativo INTEGER NOT NULL DEFAULT 0', 'pag_pix_tipo TEXT', 'pag_pix_chave TEXT', 'pag_pix_nome TEXT', 'pag_pix_cidade TEXT',
  'pag_cartao_ativo INTEGER NOT NULL DEFAULT 0', 'pag_cartao_link TEXT', 'pag_combinar INTEGER NOT NULL DEFAULT 1',
  'aceita_pedidos INTEGER NOT NULL DEFAULT 1', 'pedido_instrucoes TEXT',
  // Mercado Pago da empresa (conectado pelo OAuth do app do dono do site) — nunca sai do servidor
  'mp_access_token TEXT', 'mp_refresh_token TEXT', 'mp_user_id TEXT', 'mp_conectado_em TEXT', 'mp_expira TEXT', 'taxa_aviso_em TEXT']) {
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
    taxa_modo TEXT,                     -- 'split' (Mercado Pago dividiu) | 'debito' (a empresa repassa)
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

const codigo = id => `PD-${String(id).padStart(6, '0')}`;
const STATUS = {
  aguardando_pagamento: 'Aguardando pagamento', pagamento_informado: 'Pagamento informado', pago: 'Pago',
  enviado: 'Enviado', concluido: 'Concluído', cancelado: 'Cancelado',
};
const METODOS = { mercadopago: 'Pix ou cartão (Mercado Pago)', pix: 'Pix', cartao: 'Cartão (link de pagamento)', combinar: 'Combinar pelo chat' };
const FINALIZADOS = ['pago', 'enviado', 'concluido'];
const brl = v => `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const txt = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const r2 = v => Math.round(v * 100) / 100;

// Taxa de uso do site (%), configurada no painel (0 = sem taxa)
function taxaPct() {
  const n = Number(String(settings.get('taxa_site_pct') ?? '1').replace(',', '.'));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 20) : 1;
}
const siteUrl = () => String(settings.get('site_url') || '').replace(/\/+$/, '');
const sitePublico = () => /^https:\/\//i.test(siteUrl());

// ── Mercado Pago da empresa (OAuth do app "marketplace" do dono do site) ────
const mpAppPronto = (s = settings.getAll()) => Boolean(s.mp_mkt_client_id && s.mp_mkt_client_secret);
const mpRedirect = () => `${siteUrl()}/api/mp/oauth/retorno`;
const estadosOAuth = new Map(); // state → { userId, at }

function linkConectarMP(user) {
  const s = settings.getAll();
  if (!mpAppPronto(s)) throw fail('O administrador ainda não configurou a conexão com o Mercado Pago.');
  if (!sitePublico()) throw fail('A conexão com o Mercado Pago funciona quando o site estiver online com endereço https (VPS).');
  const loja = db.get('SELECT id FROM lojas WHERE user_id = ?', user.id);
  if (!loja) throw fail('Crie sua loja antes de conectar o Mercado Pago.');
  const state = crypto.randomBytes(16).toString('hex');
  estadosOAuth.set(state, { userId: user.id, at: Date.now() });
  for (const [k, v] of estadosOAuth) if (Date.now() - v.at > 15 * 60000) estadosOAuth.delete(k);
  const q = new URLSearchParams({ client_id: s.mp_mkt_client_id, response_type: 'code', platform_id: 'mp', state, redirect_uri: mpRedirect() });
  return `https://auth.mercadopago.com/authorization?${q}`;
}

async function tokenMP(params) {
  const s = settings.getAll();
  const r = await axios.post(`${MP}/oauth/token`, { client_id: s.mp_mkt_client_id, client_secret: s.mp_mkt_client_secret, ...params },
    { timeout: 20000, validateStatus: () => true });
  if (r.status >= 400 || !r.data?.access_token) throw fail(`Mercado Pago recusou a conexão: ${r.data?.message || r.data?.error || `HTTP ${r.status}`}`, 502);
  return r.data;
}
const expiraEm = seg => new Date(Date.now() + (Number(seg) || 15552000) * 1000).toISOString().replace('T', ' ').slice(0, 19);

async function retornoMP(code, state) {
  const e = estadosOAuth.get(String(state || ''));
  if (!e || Date.now() - e.at > 15 * 60000) throw fail('Link de conexão expirado. Tente conectar de novo.');
  estadosOAuth.delete(String(state));
  const t = await tokenMP({ grant_type: 'authorization_code', code: String(code || ''), redirect_uri: mpRedirect() });
  db.run(`UPDATE lojas SET mp_access_token = ?, mp_refresh_token = ?, mp_user_id = ?, mp_conectado_em = datetime('now'), mp_expira = ? WHERE user_id = ?`,
    t.access_token, t.refresh_token || null, String(t.user_id || ''), expiraEm(t.expires_in), e.userId);
  return e.userId;
}

function desconectarMP(user) {
  db.run('UPDATE lojas SET mp_access_token = NULL, mp_refresh_token = NULL, mp_user_id = NULL, mp_conectado_em = NULL, mp_expira = NULL WHERE user_id = ?', user.id);
}

// Chamada à API com o token da loja (renova o token vencido uma vez)
async function mpLoja(loja, method, path, data) {
  const chamar = token => axios({ method, url: `${MP}${path}`, data, timeout: 20000, validateStatus: () => true,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  let r = await chamar(loja.mp_access_token);
  if (r.status === 401 && loja.mp_refresh_token) {
    const t = await tokenMP({ grant_type: 'refresh_token', refresh_token: loja.mp_refresh_token });
    db.run('UPDATE lojas SET mp_access_token = ?, mp_refresh_token = ?, mp_expira = ? WHERE id = ?', t.access_token, t.refresh_token || loja.mp_refresh_token, expiraEm(t.expires_in), loja.id);
    loja.mp_access_token = t.access_token;
    r = await chamar(t.access_token);
  }
  if (r.status >= 400) throw fail(`Mercado Pago: ${r.data?.message || r.data?.error || `HTTP ${r.status}`}`, 502);
  return r.data;
}

// ── Formas de pagamento da loja ─────────────────────────────────────────────
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
  const pix = sim(b.pag_pix_ativo), cartao = sim(b.pag_cartao_ativo), combinar = sim(b.pag_combinar);
  const tipo = TIPOS_CHAVE.includes(b.pag_pix_tipo) ? b.pag_pix_tipo : null;
  let chave = null;
  if (pix || String(b.pag_pix_chave || '').trim()) {
    if (!tipo) throw fail('Escolha o tipo da chave Pix.');
    chave = normalizarChave(tipo, b.pag_pix_chave);
  }
  const nome = txt(b.pag_pix_nome, 60), cidade = txt(b.pag_pix_cidade, 40);
  if (pix && (nome.length < 3 || cidade.length < 2)) throw fail('Informe o nome do recebedor e a cidade do Pix (aparecem no app do banco).');
  const link = txt(b.pag_cartao_link, 400);
  if (link && !/^https:\/\/[^\s]+\.[^\s]+$/i.test(link)) throw fail('O link de pagamento precisa começar com https://');
  if (cartao && !link) throw fail('Cole o link de pagamento do cartão (Mercado Pago, PagBank, InfinitePay…).');
  db.run(`UPDATE lojas SET pag_pix_ativo = ?, pag_pix_tipo = ?, pag_pix_chave = ?, pag_pix_nome = ?, pag_pix_cidade = ?,
          pag_cartao_ativo = ?, pag_cartao_link = ?, pag_combinar = ?, aceita_pedidos = ?, pedido_instrucoes = ? WHERE id = ?`,
  pix ? 1 : 0, tipo, chave, nome || null, cidade || null, cartao ? 1 : 0, link || null, combinar ? 1 : 0,
  sim(b.aceita_pedidos) ? 1 : 0, txt(b.pedido_instrucoes, 400) || null, loja.id);
  return configPagamento(db.get('SELECT * FROM lojas WHERE id = ?', loja.id));
}

const configPagamento = l => ({
  aceita_pedidos: Boolean(l.aceita_pedidos), pag_pix_ativo: Boolean(l.pag_pix_ativo), pag_pix_tipo: l.pag_pix_tipo || '',
  pag_pix_chave: l.pag_pix_chave || '', pag_pix_nome: l.pag_pix_nome || '', pag_pix_cidade: l.pag_pix_cidade || '',
  pag_cartao_ativo: Boolean(l.pag_cartao_ativo), pag_cartao_link: l.pag_cartao_link || '', pag_combinar: Boolean(l.pag_combinar),
  pedido_instrucoes: l.pedido_instrucoes || '',
  mp: { conectado: Boolean(l.mp_access_token), desde: l.mp_conectado_em || null, disponivel: mpAppPronto() && sitePublico(),
    motivo: !mpAppPronto() ? 'O administrador ainda não ativou a conexão com o Mercado Pago.' : !sitePublico() ? 'Disponível quando o site estiver online com https.' : '' },
});

// O que o cliente vê na página da loja (sem expor a chave antes do pedido)
function metodosDaLoja(l) {
  const m = [];
  if (l.mp_access_token) m.push({ id: 'mercadopago', nome: 'Pix ou cartão pelo Mercado Pago', desc: 'Pague no Mercado Pago, com confirmação automática', automatico: true });
  if (l.pag_pix_ativo && l.pag_pix_chave) m.push({ id: 'pix', nome: 'Pix', desc: 'Código Pix "copia e cola" com o valor do pedido' });
  if (l.pag_cartao_ativo && l.pag_cartao_link) m.push({ id: 'cartao', nome: 'Cartão', desc: 'Pague pelo link de pagamento da loja' });
  return m;
}
const publicoLoja = l => ({ aceita_pedidos: Boolean(l.aceita_pedidos) && metodosDaLoja(l).length > 0, metodos: metodosDaLoja(l), instrucoes: l.pedido_instrucoes || '', taxa_pct: taxaPct() });

// ── Pix "copia e cola" (BR Code estático do Banco Central) ──────────────────
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
  if (!loja.aceita_pedidos || !metodosDaLoja(loja).length) throw fail('Esta loja não está recebendo pedidos pelo site no momento. Fale com ela pelo chat.');
  if (`u:${loja.user_id}` === dono) throw fail('Você não pode fazer pedido na sua própria loja.');
  const metodo = String(b.metodo || '');
  if (!metodosDaLoja(loja).some(m => m.id === metodo)) throw fail('Forma de pagamento indisponível nesta loja.');
  const qtd = Math.min(Math.max(parseInt(b.quantidade, 10) || 1, 1), 99);
  const subtotal = r2(o.preco_atual * qtd);
  const pct = taxaPct();
  const taxa = r2(subtotal * pct / 100);
  const total = r2(subtotal + taxa);
  // Pedidos em aberto demais seguidos (proteção contra abuso)
  const abertos = db.get(`SELECT COUNT(*) n FROM pedidos_loja WHERE comprador = ? AND status = 'aguardando_pagamento' AND created_at > datetime('now', '-1 day')`, dono).n;
  if (abertos >= 10) throw fail('Você tem muitos pedidos aguardando pagamento. Pague ou cancele os anteriores.', 429);
  const conv = chat.conversaLoja(dono, loja.id, o.id);
  const resumoValor = taxa ? `${brl(subtotal)} + taxa do site ${brl(taxa)} = ${brl(total)}` : brl(total);
  let id;
  db.transaction(() => {
    id = Number(db.run(`INSERT INTO pedidos_loja (loja_id, comprador, conversa_id, oferta_id, produto, imagem, preco_unit, quantidade, subtotal,
                          taxa_pct, taxa_valor, total, taxa_modo, metodo, observacao)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    loja.id, dono, conv.id, o.id, o.produto, o.imagem, o.preco_atual, qtd, subtotal, pct, taxa, total,
    metodo === 'mercadopago' ? 'split' : 'debito', metodo, txt(b.observacao, 600) || null).lastInsertRowid);
    evento(id, dono, 'criado', `${qtd}x ${o.produto} — ${resumoValor} — ${METODOS[metodo]}`);
    chat.sistema(conv.id, `Pedido ${codigo(id)} criado: ${qtd}x ${o.produto} — ${resumoValor} — pagamento: ${METODOS[metodo]}.`, id);
  });
  // Mercado Pago: cria o pagamento na conta da loja, com a taxa do site separada automaticamente (marketplace_fee)
  if (metodo === 'mercadopago') {
    try {
      const volta = `${siteUrl()}/mensagens?c=${conv.id}&pedido=${id}`;
      const pref = await mpLoja(loja, 'post', '/checkout/preferences', {
        items: [{ id: String(o.id), title: `${o.produto}`.slice(0, 250), quantity: 1, unit_price: total, currency_id: 'BRL',
          description: `${qtd}x ${o.produto} — pedido ${codigo(id)} (inclui taxa de uso do site)`.slice(0, 250) }],
        marketplace_fee: taxa,
        external_reference: `ofertou-pd-${id}`,
        statement_descriptor: String(loja.nome || 'LOJA').normalize('NFD').replace(/[^\w ]/g, '').slice(0, 22),
        ...(sitePublico() ? {
          notification_url: `${siteUrl()}/api/pedidos/mp-webhook?pedido=${id}`,
          back_urls: { success: volta, pending: volta, failure: volta }, auto_return: 'approved',
        } : {}),
      });
      db.run('UPDATE pedidos_loja SET mp_preference_id = ?, mp_link = ? WHERE id = ?', String(pref.id), pref.init_point, id);
    } catch (err) {
      db.run(`UPDATE pedidos_loja SET status = 'cancelado', cancelado_por = 'sistema' WHERE id = ?`, id);
      evento(id, null, 'cancelar', `Mercado Pago indisponível: ${err.message}`);
      chat.sistema(conv.id, `Pedido ${codigo(id)} cancelado: não foi possível gerar o pagamento no Mercado Pago. Tente outra forma de pagamento.`, id);
      throw fail('Não foi possível gerar o pagamento no Mercado Pago da loja. Tente outra forma de pagamento ou fale com a loja.', 502);
    }
  }
  chat.avisarPorEmail(`u:${loja.user_id}`, `Novo pedido ${codigo(id)} na sua loja ${loja.nome} — Ofertou!`,
    `Você recebeu o pedido ${codigo(id)}: ${qtd}x ${o.produto}, ${resumoValor}, pagamento: ${METODOS[metodo]}.`);
  return detalhe(dono, id);
}

// Quem pode fazer o quê (e para qual situação vai)
const ACOES = {
  informar_pagamento: { quem: 'comprador', de: ['aguardando_pagamento'], para: 'pagamento_informado', msg: 'O cliente informou que pagou o pedido' },
  confirmar_pagamento: { quem: 'loja', de: ['aguardando_pagamento', 'pagamento_informado'], para: 'pago', msg: 'A loja confirmou o pagamento do pedido' },
  enviado: { quem: 'loja', de: ['pago'], para: 'enviado', msg: 'A loja marcou como enviado o pedido' },
  concluido: { quem: 'loja', de: ['pago', 'enviado'], para: 'concluido', msg: 'A loja concluiu o pedido' },
  recebido: { quem: 'comprador', de: ['enviado'], para: 'concluido', msg: 'O cliente confirmou que recebeu o pedido' },
  cancelar: { quem: 'ambos', de: ['aguardando_pagamento', 'pagamento_informado', 'pago', 'enviado'], para: 'cancelado', msg: 'Pedido cancelado' },
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
    const msg = quem === 'mercadopago' ? 'O Mercado Pago confirmou o pagamento do pedido' : a.msg;
    if (p.conversa_id) chat.sistema(p.conversa_id, `${msg} ${codigo(p.id)}${a.para === 'cancelado' ? ` (${eu === 'loja' ? 'pela loja' : 'pelo cliente'})` : ''}.${det ? ` Motivo: ${det}` : ''}`, p.id);
  });
  if (a.para === 'pago') {
    // Conquistas de vendas da empresa
    try { require('./perfis').registrarVenda(`u:${db.get('SELECT user_id FROM lojas WHERE id = ?', p.loja_id).user_id}`, 'empresa', p.quantidade, `Pedido ${codigo(p.id)} pelo site`); } catch { /* sem perfil */ }
    chat.avisarPorEmail(p.comprador, `Pagamento confirmado — pedido ${codigo(p.id)} — Ofertou!`, `O pagamento do seu pedido ${codigo(p.id)} (${p.produto}) foi confirmado.`);
  }
  if (nome === 'informar_pagamento') {
    const l = db.get('SELECT user_id FROM lojas WHERE id = ?', p.loja_id);
    chat.avisarPorEmail(`u:${l.user_id}`, `Pagamento informado — pedido ${codigo(p.id)} — Ofertou!`, `O cliente informou que pagou o pedido ${codigo(p.id)} (${p.produto}, ${brl(p.total)}). Confira e confirme no site.`);
  }
}

// Mercado Pago: confere se o pedido foi pago (pela API, com o token da loja). Aprovado → pago e taxa já dividida.
const conferidos = new Map();
async function verificarMP(pedidoId, forcar = false) {
  const p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', Number(pedidoId));
  if (!p || p.metodo !== 'mercadopago' || !['aguardando_pagamento', 'pagamento_informado'].includes(p.status)) return p;
  if (!forcar && Date.now() - (conferidos.get(p.id) || 0) < 15000) return p;
  conferidos.set(p.id, Date.now());
  const loja = db.get('SELECT * FROM lojas WHERE id = ?', p.loja_id);
  if (!loja?.mp_access_token) return p;
  const r = await mpLoja(loja, 'get', `/v1/payments/search?external_reference=ofertou-pd-${p.id}&sort=date_created&criteria=desc`).catch(() => null);
  const pago = (r?.results || []).find(x => x.status === 'approved' && x.external_reference === `ofertou-pd-${p.id}` && Math.abs(Number(x.transaction_amount) - p.total) < 0.01);
  if (pago) {
    db.run(`UPDATE pedidos_loja SET mp_payment_id = ?, taxa_modo = 'split', taxa_quitada = 1, taxa_quitada_em = datetime('now') WHERE id = ?`, String(pago.id), p.id);
    mudar(p, 'confirmar_pagamento', 'mercadopago', 'loja', `Pagamento ${pago.id} aprovado no Mercado Pago; taxa do site de ${brl(p.taxa_valor)} separada automaticamente.`);
  }
  return db.get('SELECT * FROM pedidos_loja WHERE id = ?', p.id);
}

async function acao(dono, pedidoId, nome, motivo = '') {
  let p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', Number(pedidoId));
  if (!p) throw fail('Pedido não encontrado.', 404);
  const eu = papel(dono, p);
  if (!eu) throw fail('Pedido não encontrado.', 404);
  const a = ACOES[nome];
  if (!a) throw fail('Ação inválida.');
  if (a.quem !== 'ambos' && a.quem !== eu) throw fail('Esta ação não é sua.', 403);
  // Mercado Pago: antes de confirmar à mão, consulta o pagamento
  if (nome === 'confirmar_pagamento' && p.metodo === 'mercadopago') {
    p = await verificarMP(p.id, true);
    if (p.status === 'pago') return detalhe(dono, p.id);
    db.run(`UPDATE pedidos_loja SET taxa_modo = 'debito' WHERE id = ?`, p.id); // confirmado fora do Mercado Pago: a loja repassa a taxa
  }
  if (nome === 'cancelar' && eu === 'comprador' && !['aguardando_pagamento', 'pagamento_informado'].includes(p.status)) {
    throw fail('O pagamento já foi confirmado: peça o cancelamento à loja pelo chat.');
  }
  if (!a.de.includes(p.status)) throw fail(`Não dá para fazer isso com o pedido ${STATUS[p.status].toLowerCase()}.`);
  mudar(p, nome, dono, eu, motivo);
  return detalhe(dono, p.id);
}

function montar(p, eu = null) {
  const loja = db.get('SELECT * FROM lojas WHERE id = ?', p.loja_id) || {};
  const out = {
    id: p.id, codigo: codigo(p.id), status: p.status, status_nome: STATUS[p.status], produto: p.produto, imagem: p.imagem,
    oferta_id: p.oferta_id, preco_unit: p.preco_unit, quantidade: p.quantidade, subtotal: p.subtotal ?? p.total,
    taxa_pct: p.taxa_pct, taxa_valor: p.taxa_valor, total: p.total, taxa_modo: p.taxa_modo, taxa_quitada: Boolean(p.taxa_quitada),
    metodo: p.metodo, metodo_nome: METODOS[p.metodo],
    observacao: p.observacao, created_at: p.created_at, pago_em: p.pago_em, concluido_em: p.concluido_em, conversa_id: p.conversa_id,
    loja: { id: loja.id, nome: loja.nome, slug: loja.slug }, comprador: chat.pessoa(p.comprador), eu,
    acoes: eu ? Object.entries(ACOES).filter(([n, a]) => (a.quem === 'ambos' || a.quem === eu) && a.de.includes(p.status)
      && !(n === 'cancelar' && eu === 'comprador' && !['aguardando_pagamento', 'pagamento_informado'].includes(p.status))
      && !(n === 'informar_pagamento' && p.metodo === 'mercadopago')).map(([n]) => n) : [],
  };
  // Como pagar (só para quem comprou, enquanto não foi pago)
  if (eu === 'comprador' && ['aguardando_pagamento', 'pagamento_informado'].includes(p.status)) {
    if (p.metodo === 'mercadopago' && p.mp_link) out.pagamento = { mercadopago: p.mp_link };
    else if (p.metodo === 'pix' && loja.pag_pix_chave) {
      out.pagamento = { pix: pixCopiaECola({ chave: loja.pag_pix_chave, nome: loja.pag_pix_nome || loja.nome, cidade: loja.pag_pix_cidade || 'BRASIL', valor: p.total, txid: codigo(p.id) }),
        recebedor: loja.pag_pix_nome || loja.nome };
    } else if (p.metodo === 'cartao' && loja.pag_cartao_link) out.pagamento = { link: loja.pag_cartao_link };
    out.instrucoes = loja.pedido_instrucoes || '';
  }
  return out;
}

async function detalhe(dono, id) {
  let p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', Number(id));
  if (!p) throw fail('Pedido não encontrado.', 404);
  const eu = papel(dono, p);
  if (!eu) throw fail('Pedido não encontrado.', 404);
  if (p.metodo === 'mercadopago') p = await verificarMP(p.id).catch(() => p);
  return { ...montar(p, eu), eventos: eventos(p.id) };
}

const eventos = id => db.all('SELECT quem, evento, detalhe, created_at FROM pedido_eventos WHERE pedido_id = ? ORDER BY id', id)
  .map(e => ({ ...e, quem_nome: e.quem === 'mercadopago' ? 'Mercado Pago' : e.quem ? chat.pessoa(e.quem).nome : 'Sistema' }));

const meusPedidos = dono => db.all('SELECT * FROM pedidos_loja WHERE comprador = ? ORDER BY id DESC LIMIT 200', dono).map(p => montar(p, 'comprador'));
function pedidosDaLoja(user) {
  const loja = db.get('SELECT id FROM lojas WHERE user_id = ?', user.id);
  return loja ? db.all('SELECT * FROM pedidos_loja WHERE loja_id = ? ORDER BY id DESC LIMIT 300', loja.id).map(p => montar(p, 'loja')) : [];
}

// ── Taxa de uso do site: quanto cada loja gerou, quanto já chegou e quanto falta repassar ──
const FIN_SQL = `status IN ('pago', 'enviado', 'concluido')`;
function taxas(lojaId) {
  const q = (where, ...p) => db.get(`SELECT COUNT(*) n, COALESCE(SUM(taxa_valor), 0) v FROM pedidos_loja WHERE loja_id = ? AND ${FIN_SQL} AND taxa_valor > 0 AND ${where}`, lojaId, ...p);
  const auto = q(`taxa_modo = 'split'`), quitadas = q(`taxa_modo = 'debito' AND taxa_quitada = 1`), pendentes = q(`taxa_modo = 'debito' AND taxa_quitada = 0`);
  const loja = db.get('SELECT taxa_aviso_em FROM lojas WHERE id = ?', lojaId) || {};
  return {
    pct: taxaPct(), total: r2(auto.v + quitadas.v + pendentes.v),
    automaticas: { n: auto.n, valor: r2(auto.v) }, quitadas: { n: quitadas.n, valor: r2(quitadas.v) }, a_pagar: { n: pendentes.n, valor: r2(pendentes.v) },
    aviso_pagamento_em: loja.taxa_aviso_em || null,
    historico: db.all('SELECT valor, pedidos, observacao, created_at FROM taxa_quitacoes WHERE loja_id = ? ORDER BY id DESC LIMIT 20', lojaId),
  };
}

// Pix da taxa para a chave do dono do site (Painel → Planos → Formas de recebimento)
function pixDaTaxa(lojaId) {
  const t = taxas(lojaId);
  const s = settings.getAll();
  if (!(t.a_pagar.valor > 0) || !s.pix_chave || !TIPOS_CHAVE.includes(s.pix_tipo)) return null;
  let chave;
  try { chave = normalizarChave(s.pix_tipo, s.pix_chave); } catch { return null; }
  return { valor: t.a_pagar.valor, recebedor: s.pix_nome || 'Ofertou!',
    pix: pixCopiaECola({ chave, nome: s.pix_nome || 'OFERTOU', cidade: s.pix_cidade || 'BRASIL', valor: t.a_pagar.valor, txid: `TAXA${lojaId}${Date.now().toString(36)}`.toUpperCase() }) };
}

function painelTaxas(user) {
  const loja = db.get('SELECT id FROM lojas WHERE user_id = ?', user.id);
  if (!loja) return null;
  return { ...taxas(loja.id), pagar: pixDaTaxa(loja.id) };
}

// A empresa avisa que pagou a taxa: o admin recebe um aviso para conferir e dar baixa
function avisarTaxaPaga(user) {
  const loja = db.get('SELECT id, nome FROM lojas WHERE user_id = ?', user.id);
  if (!loja) throw fail('Loja não encontrada.', 404);
  const t = taxas(loja.id);
  if (!(t.a_pagar.valor > 0)) throw fail('Não há taxa a pagar.');
  db.run(`UPDATE lojas SET taxa_aviso_em = datetime('now') WHERE id = ?`, loja.id);
  try {
    require('./ganhos').notificar({ chave: `taxa:${loja.id}:${Date.now()}`, tipo: 'taxa', titulo: `${loja.nome} informou que pagou a taxa do site`,
      texto: `${brl(t.a_pagar.valor)} referentes a ${t.a_pagar.n} pedido(s). Confira o Pix na sua conta e dê baixa em Painel → Atendimento.`, link: '/admin' });
  } catch { /* sem aviso */ }
  return painelTaxas(user);
}

// Admin: dá baixa nas taxas pendentes de uma loja (recebidas por Pix)
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
  const porStatus = Object.fromEntries(db.all('SELECT status, COUNT(*) n FROM pedidos_loja WHERE loja_id = ? GROUP BY status', lojaId).map(r => [r.status, r.n]));
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
  codigo, STATUS, METODOS, FINALIZADOS, taxaPct, salvarPagamento, configPagamento, publicoLoja, pixCopiaECola, criar, acao, detalhe,
  verificarMP, linkConectarMP, retornoMP, desconectarMP, mpAppPronto, mpRedirect,
  reputacao, meusPedidos, pedidosDaLoja, registrarVisita, metricas, taxas, painelTaxas, avisarTaxaPaga, quitarTaxas, listarAdmin, detalheAdmin,
};
