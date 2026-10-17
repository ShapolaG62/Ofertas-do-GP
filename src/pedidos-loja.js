// Pedidos feitos às lojas parceiras pelo site, formas de pagamento de cada loja e contadores de acesso.
//  • A empresa configura como recebe (Minha conta → Pedidos e pagamentos): Pix (chave dela; o site gera o "copia e
//    cola" com o valor do pedido), cartão (link de pagamento dela: Mercado Pago, PagBank, InfinitePay…) e/ou
//    "combinar pelo chat". O dinheiro vai direto para a empresa; o site só registra.
//  • Cada pedido é um ticket (PD-000123) com todos os eventos (criado, pagamento informado, confirmado, enviado,
//    concluído, cancelado) e as mensagens automáticas na conversa de atendimento entre o cliente e a loja.
//  • "Finalização de compra" = pedido com pagamento confirmado pela loja. Aparece para o dono da loja e no painel.
//  • Contadores por dia: acessos à página da loja, produtos abertos no catálogo, cliques no site oficial e nos
//    links dos produtos.
const db = require('./db');
const chat = require('./chat');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

for (const col of ['pag_pix_ativo INTEGER NOT NULL DEFAULT 0', 'pag_pix_tipo TEXT', 'pag_pix_chave TEXT', 'pag_pix_nome TEXT', 'pag_pix_cidade TEXT',
  'pag_cartao_ativo INTEGER NOT NULL DEFAULT 0', 'pag_cartao_link TEXT', 'pag_combinar INTEGER NOT NULL DEFAULT 1',
  'aceita_pedidos INTEGER NOT NULL DEFAULT 1', 'pedido_instrucoes TEXT']) {
  try { db.db.exec(`ALTER TABLE lojas ADD COLUMN ${col}`); } catch { /* já existe */ }
}
db.db.exec(`
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
    total REAL NOT NULL,
    metodo TEXT NOT NULL CHECK (metodo IN ('pix', 'cartao', 'combinar')),
    observacao TEXT,                    -- endereço, cor, tamanho… (escrito pelo cliente)
    status TEXT NOT NULL DEFAULT 'aguardando_pagamento'
      CHECK (status IN ('aguardando_pagamento', 'pagamento_informado', 'pago', 'enviado', 'concluido', 'cancelado')),
    pago_em TEXT,
    concluido_em TEXT,
    cancelado_por TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
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
const METODOS = { pix: 'Pix', cartao: 'Cartão (link de pagamento)', combinar: 'Combinar pelo chat' };
const FINALIZADOS = ['pago', 'enviado', 'concluido'];
const brl = v => `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const txt = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

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
});

// O que o cliente vê na página da loja (sem expor a chave antes do pedido)
function metodosDaLoja(l) {
  const m = [];
  if (l.pag_pix_ativo && l.pag_pix_chave) m.push({ id: 'pix', nome: 'Pix', desc: 'Código Pix "copia e cola" com o valor do pedido' });
  if (l.pag_cartao_ativo && l.pag_cartao_link) m.push({ id: 'cartao', nome: 'Cartão', desc: 'Pague pelo link de pagamento da loja' });
  if (l.pag_combinar || !m.length) m.push({ id: 'combinar', nome: 'Combinar pelo chat', desc: 'A loja passa as opções de pagamento na conversa' });
  return m;
}
const publicoLoja = l => ({ aceita_pedidos: Boolean(l.aceita_pedidos), metodos: metodosDaLoja(l), instrucoes: l.pedido_instrucoes || '' });

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

function criar(dono, b) {
  if (!dono) throw fail('Entre na sua conta para fazer o pedido.', 401);
  const o = db.get(`SELECT o.id, o.produto, o.preco_atual, o.imagem, o.loja_id, o.oculto, o.expires_at FROM offers o WHERE o.id = ?`, Number(b.oferta_id));
  if (!o || !o.loja_id || o.oculto || !require('./offers').isActive(o.id)) throw fail('Produto indisponível.', 404);
  const loja = db.get('SELECT * FROM lojas WHERE id = ?', o.loja_id);
  if (!loja || loja.oculta) throw fail('Loja indisponível.', 404);
  if (!loja.aceita_pedidos) throw fail('Esta loja não está recebendo pedidos pelo site no momento. Fale com ela pelo chat.');
  if (`u:${loja.user_id}` === dono) throw fail('Você não pode fazer pedido na sua própria loja.');
  const metodo = String(b.metodo || '');
  if (!metodosDaLoja(loja).some(m => m.id === metodo)) throw fail('Forma de pagamento indisponível nesta loja.');
  const qtd = Math.min(Math.max(parseInt(b.quantidade, 10) || 1, 1), 99);
  const total = Math.round(o.preco_atual * qtd * 100) / 100;
  // Pedidos em aberto demais seguidos (proteção contra abuso)
  const abertos = db.get(`SELECT COUNT(*) n FROM pedidos_loja WHERE comprador = ? AND status = 'aguardando_pagamento' AND created_at > datetime('now', '-1 day')`, dono).n;
  if (abertos >= 10) throw fail('Você tem muitos pedidos aguardando pagamento. Pague ou cancele os anteriores.', 429);
  const conv = chat.conversaLoja(dono, loja.id, o.id);
  let id;
  db.transaction(() => {
    id = Number(db.run(`INSERT INTO pedidos_loja (loja_id, comprador, conversa_id, oferta_id, produto, imagem, preco_unit, quantidade, total, metodo, observacao)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    loja.id, dono, conv.id, o.id, o.produto, o.imagem, o.preco_atual, qtd, total, metodo, txt(b.observacao, 600) || null).lastInsertRowid);
    evento(id, dono, 'criado', `${qtd}x ${o.produto} — ${brl(total)} — ${METODOS[metodo]}`);
    chat.sistema(conv.id, `Pedido ${codigo(id)} criado: ${qtd}x ${o.produto} — total ${brl(total)} — pagamento: ${METODOS[metodo]}.`, id);
  });
  chat.avisarPorEmail(`u:${loja.user_id}`, `Novo pedido ${codigo(id)} na sua loja ${loja.nome} — Ofertou!`,
    `Você recebeu o pedido ${codigo(id)}: ${qtd}x ${o.produto}, total ${brl(total)}, pagamento: ${METODOS[metodo]}.`);
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

function acao(dono, pedidoId, nome, motivo = '') {
  const p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', Number(pedidoId));
  if (!p) throw fail('Pedido não encontrado.', 404);
  const eu = papel(dono, p);
  if (!eu) throw fail('Pedido não encontrado.', 404);
  const a = ACOES[nome];
  if (!a) throw fail('Ação inválida.');
  if (a.quem !== 'ambos' && a.quem !== eu) throw fail('Esta ação não é sua.', 403);
  // O cliente só cancela antes de a loja confirmar o pagamento
  if (nome === 'cancelar' && eu === 'comprador' && !['aguardando_pagamento', 'pagamento_informado'].includes(p.status)) {
    throw fail('O pagamento já foi confirmado: peça o cancelamento à loja pelo chat.');
  }
  if (!a.de.includes(p.status)) throw fail(`Não dá para fazer isso com o pedido ${STATUS[p.status].toLowerCase()}.`);
  const extra = { pago: ', pago_em = datetime(\'now\')', concluido: ', concluido_em = datetime(\'now\')' }[a.para] || '';
  db.transaction(() => {
    db.run(`UPDATE pedidos_loja SET status = ?, updated_at = datetime('now')${extra}${a.para === 'cancelado' ? ', cancelado_por = ?' : ''} WHERE id = ?`,
      ...(a.para === 'cancelado' ? [a.para, eu, p.id] : [a.para, p.id]));
    const det = txt(motivo, 300);
    evento(p.id, dono, nome, det || null);
    if (p.conversa_id) chat.sistema(p.conversa_id, `${a.msg} ${codigo(p.id)}${a.para === 'cancelado' ? ` (${eu === 'loja' ? 'pela loja' : 'pelo cliente'})` : ''}.${det ? ` Motivo: ${det}` : ''}`, p.id);
  });
  if (a.para === 'pago') {
    // Conquistas de vendas da empresa
    try { require('./perfis').registrarVenda(`u:${db.get('SELECT user_id FROM lojas WHERE id = ?', p.loja_id).user_id}`, 'empresa', p.quantidade, `Pedido ${codigo(p.id)} pelo site`); } catch { /* sem perfil */ }
    chat.avisarPorEmail(p.comprador, `Pagamento confirmado — pedido ${codigo(p.id)} — Ofertou!`, `A loja confirmou o pagamento do seu pedido ${codigo(p.id)} (${p.produto}).`);
  }
  if (nome === 'informar_pagamento') {
    const l = db.get('SELECT user_id FROM lojas WHERE id = ?', p.loja_id);
    chat.avisarPorEmail(`u:${l.user_id}`, `Pagamento informado — pedido ${codigo(p.id)} — Ofertou!`, `O cliente informou que pagou o pedido ${codigo(p.id)} (${p.produto}, ${brl(p.total)}). Confira e confirme no site.`);
  }
  return detalhe(dono, p.id);
}

function montar(p, eu = null) {
  const loja = db.get('SELECT * FROM lojas WHERE id = ?', p.loja_id) || {};
  const out = {
    id: p.id, codigo: codigo(p.id), status: p.status, status_nome: STATUS[p.status], produto: p.produto, imagem: p.imagem,
    oferta_id: p.oferta_id, preco_unit: p.preco_unit, quantidade: p.quantidade, total: p.total, metodo: p.metodo, metodo_nome: METODOS[p.metodo],
    observacao: p.observacao, created_at: p.created_at, pago_em: p.pago_em, concluido_em: p.concluido_em, conversa_id: p.conversa_id,
    loja: { id: loja.id, nome: loja.nome, slug: loja.slug }, comprador: chat.pessoa(p.comprador), eu,
    acoes: eu ? Object.entries(ACOES).filter(([n, a]) => (a.quem === 'ambos' || a.quem === eu) && a.de.includes(p.status)
      && !(n === 'cancelar' && eu === 'comprador' && !['aguardando_pagamento', 'pagamento_informado'].includes(p.status))).map(([n]) => n) : [],
  };
  // Como pagar (só para quem comprou, enquanto não foi pago)
  if (eu === 'comprador' && ['aguardando_pagamento', 'pagamento_informado'].includes(p.status)) {
    if (p.metodo === 'pix' && loja.pag_pix_chave) {
      out.pagamento = { pix: pixCopiaECola({ chave: loja.pag_pix_chave, nome: loja.pag_pix_nome || loja.nome, cidade: loja.pag_pix_cidade || 'BRASIL', valor: p.total, txid: codigo(p.id) }),
        recebedor: loja.pag_pix_nome || loja.nome };
    } else if (p.metodo === 'cartao' && loja.pag_cartao_link) out.pagamento = { link: loja.pag_cartao_link };
    out.instrucoes = loja.pedido_instrucoes || '';
  }
  return out;
}

function detalhe(dono, id) {
  const p = db.get('SELECT * FROM pedidos_loja WHERE id = ?', Number(id));
  if (!p) throw fail('Pedido não encontrado.', 404);
  const eu = papel(dono, p);
  if (!eu) throw fail('Pedido não encontrado.', 404);
  return { ...montar(p, eu), eventos: eventos(p.id) };
}

const eventos = id => db.all('SELECT quem, evento, detalhe, created_at FROM pedido_eventos WHERE pedido_id = ? ORDER BY id', id)
  .map(e => ({ ...e, quem_nome: e.quem ? chat.pessoa(e.quem).nome : 'Sistema' }));

const meusPedidos = dono => db.all('SELECT * FROM pedidos_loja WHERE comprador = ? ORDER BY id DESC LIMIT 200', dono).map(p => montar(p, 'comprador'));
function pedidosDaLoja(user) {
  const loja = db.get('SELECT id FROM lojas WHERE user_id = ?', user.id);
  return loja ? db.all('SELECT * FROM pedidos_loja WHERE loja_id = ? ORDER BY id DESC LIMIT 300', loja.id).map(p => montar(p, 'loja')) : [];
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
  const fin = db.get(`SELECT COUNT(*) n, COALESCE(SUM(total), 0) v FROM pedidos_loja WHERE loja_id = ? AND status IN ('pago', 'enviado', 'concluido')`, lojaId);
  const fin30 = db.get(`SELECT COUNT(*) n, COALESCE(SUM(total), 0) v FROM pedidos_loja WHERE loja_id = ? AND status IN ('pago', 'enviado', 'concluido') AND pago_em >= datetime('now', '-30 days')`, lojaId);
  const porStatus = Object.fromEntries(db.all('SELECT status, COUNT(*) n FROM pedidos_loja WHERE loja_id = ? GROUP BY status', lojaId).map(r => [r.status, r.n]));
  const top = db.all(`SELECT m.oferta_id AS id, SUM(m.n) AS n, o.produto FROM loja_metricas m LEFT JOIN offers o ON o.id = m.oferta_id
                      WHERE m.loja_id = ? AND m.tipo = 'produto' AND m.dia >= date('now', '-30 days') GROUP BY m.oferta_id ORDER BY n DESC LIMIT 5`, lojaId);
  const dias = db.all(`SELECT dia, tipo, SUM(n) n FROM loja_metricas WHERE loja_id = ? AND dia >= date('now', '-13 days') GROUP BY dia, tipo ORDER BY dia`, lojaId);
  return {
    acessos: cont, finalizacoes: { total: fin.n, valor: fin.v, d30: fin30.n, valor_d30: fin30.v },
    pedidos: { total: Object.values(porStatus).reduce((a, b) => a + b, 0), por_status: porStatus },
    conversas: db.get(`SELECT COUNT(*) n FROM conversas WHERE tipo = 'loja' AND loja_id = ?`, lojaId).n,
    mais_vistos: top.filter(t => t.produto), dias,
  };
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
  codigo, STATUS, METODOS, FINALIZADOS, salvarPagamento, configPagamento, publicoLoja, pixCopiaECola, criar, acao, detalhe,
  meusPedidos, pedidosDaLoja, registrarVisita, metricas, listarAdmin, detalheAdmin,
};
