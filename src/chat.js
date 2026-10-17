// Mensagens entre usuários, afiliados e empresas.
//  • Conversa pessoal: a primeira mensagem vira um PEDIDO DE MENSAGEM. Quem recebe é avisado (no site e por e-mail,
//    se o SMTP estiver configurado) e escolhe aceitar, recusar ou bloquear. Até aceitar, quem pediu manda no máximo
//    3 mensagens. Vale também para empresas (conversa pessoal com o dono da conta).
//  • Atendimento da loja: o cliente fala com a empresa pela página da loja ou de um produto. Entra direto (é o
//    atendimento da loja), e a empresa pode bloquear.
// Cada conversa é um ticket (CV-000123) com todo o histórico, inclusive os avisos dos pedidos de compra, e fica
// disponível no painel do administrador (Atendimento) e na ficha de cada usuário.
// Participantes são identificados como nos perfis: 'u:<id>' (conta do site), 'c:<id>' (cliente só da ferramenta)
// ou 'admin'.
const db = require('./db');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const MAX_TEXTO = 2000;
const MAX_PENDENTES = 3;          // mensagens de quem pediu, antes de a outra pessoa aceitar
const DIAS_NOVO_PEDIDO = 30;      // depois de recusado, só pode pedir de novo após 30 dias

db.db.exec(`
  CREATE TABLE IF NOT EXISTS conversas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('pessoal', 'loja')),
    a TEXT NOT NULL,                    -- quem iniciou (no atendimento: o cliente)
    b TEXT NOT NULL,                    -- quem recebeu (no atendimento: o dono da loja)
    loja_id INTEGER,                    -- atendimento: a loja
    oferta_id INTEGER,                  -- produto que originou a conversa (opcional)
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceita', 'recusada', 'bloqueada')),
    bloqueada_por TEXT,
    respondida_em TEXT,
    lido_a INTEGER NOT NULL DEFAULT 0,  -- última mensagem lida por "a"
    lido_b INTEGER NOT NULL DEFAULT 0,
    ultima_msg_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_conversas_a ON conversas(a);
  CREATE INDEX IF NOT EXISTS idx_conversas_b ON conversas(b);
  CREATE INDEX IF NOT EXISTS idx_conversas_loja ON conversas(loja_id);
  CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    autor TEXT,                         -- null = mensagem do sistema (pedido criado, pagamento confirmado…)
    texto TEXT NOT NULL,
    pedido_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens(conversa_id, id);
`);

const ticket = id => `CV-${String(id).padStart(6, '0')}`;
const texto = v => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXTO);

// Nome e foto de um participante (o do perfil; no atendimento, o lado da empresa aparece como a loja)
function pessoa(dono, conv = null) {
  if (conv && conv.tipo === 'loja' && dono === conv.b && conv.loja_id) {
    const l = db.get('SELECT nome, slug, logo_url FROM lojas WHERE id = ?', conv.loja_id);
    if (l) return { dono, nome: l.nome, avatar: /^https:\/\//i.test(l.logo_url || '') ? l.logo_url : null, slug: null, loja_slug: l.slug, loja: true };
  }
  const p = db.get('SELECT nome, avatar, slug FROM perfis WHERE dono = ?', dono);
  if (p) return { dono, nome: p.nome || 'Usuário', avatar: p.avatar || null, slug: p.slug };
  if (dono === 'admin') return { dono, nome: 'Ofertou!', avatar: '/images/pet-capi-head.png', slug: null };
  const [t, id] = String(dono).split(':');
  const r = t === 'u' ? db.get('SELECT nome, empresa_nome, tipo, avatar_url FROM users WHERE id = ?', Number(id))
    : t === 'c' ? db.get('SELECT nome FROM clientes WHERE id = ?', Number(id)) : null;
  return { dono, nome: (r && (r.tipo === 'empresa' ? r.empresa_nome || r.nome : r.nome)) || 'Usuário', avatar: r?.avatar_url || null, slug: null };
}

// E-mail de um participante (para avisos)
function emailDe(dono) {
  const [t, id] = String(dono).split(':');
  if (t === 'u') return db.get('SELECT email FROM users WHERE id = ?', Number(id))?.email || null;
  if (t === 'c') return db.get('SELECT email FROM clientes WHERE id = ?', Number(id))?.email || null;
  return null;
}

function avisarPorEmail(dono, assunto, corpo) {
  const para = emailDe(dono);
  const email = require('./email');
  if (!para || !email.configurado()) return;
  const site = String(require('./settings').get('site_url') || '').replace(/\/+$/, '');
  email.enviar({ para, assunto, texto: `${corpo}\n\nAbra suas mensagens: ${site || 'o site Ofertou!'}/mensagens\n\nOfertou!` })
    .catch(err => console.error('[CHAT] e-mail:', err.message));
}

const outro = (c, dono) => (c.a === dono ? c.b : c.a);
function daConversa(dono, id) {
  const c = db.get('SELECT * FROM conversas WHERE id = ?', Number(id));
  if (!c || (c.a !== dono && c.b !== dono)) throw fail('Conversa não encontrada.', 404);
  return c;
}

// Limite de envio: 20 mensagens por minuto por pessoa
const envios = new Map();
function limitar(dono) {
  const agora = Date.now();
  const lista = (envios.get(dono) || []).filter(t => agora - t < 60000);
  if (lista.length >= 20) throw fail('Muitas mensagens seguidas. Espere um pouco.', 429);
  lista.push(agora);
  envios.set(dono, lista);
}

function gravar(convId, autor, msg, pedidoId = null) {
  const r = db.run('INSERT INTO mensagens (conversa_id, autor, texto, pedido_id) VALUES (?, ?, ?, ?)', convId, autor, msg, pedidoId);
  const id = Number(r.lastInsertRowid);
  db.run('UPDATE conversas SET ultima_msg_at = datetime(\'now\') WHERE id = ?', convId);
  // Quem escreveu já leu tudo até aqui
  if (autor) {
    const c = db.get('SELECT a, b FROM conversas WHERE id = ?', convId);
    db.run(`UPDATE conversas SET ${c.a === autor ? 'lido_a' : 'lido_b'} = ? WHERE id = ?`, id, convId);
  }
  return id;
}

// Mensagem automática (pedido criado, pagamento confirmado…)
const sistema = (convId, msg, pedidoId = null) => gravar(convId, null, texto(msg), pedidoId);

// ── Começar conversas ────────────────────────────────────────────────────────
// Conversa pessoal com o dono de um perfil (pelo endereço do perfil)
function iniciarPessoal(de, slugPerfil, msg) {
  if (!de) throw fail('Entre na sua conta para enviar mensagens.', 401);
  const alvo = db.get('SELECT dono, nome, oculto FROM perfis WHERE slug = ?', String(slugPerfil || ''));
  if (!alvo || alvo.oculto) throw fail('Perfil não encontrado.', 404);
  if (alvo.dono === de) throw fail('Você não pode mandar mensagem para você mesmo.');
  let c = db.get(`SELECT * FROM conversas WHERE tipo = 'pessoal' AND ((a = ? AND b = ?) OR (a = ? AND b = ?))`, de, alvo.dono, alvo.dono, de);
  if (c && c.status === 'bloqueada') throw fail(c.bloqueada_por === de ? 'Você bloqueou esta pessoa. Desbloqueie a conversa para escrever.' : 'Esta pessoa não aceita mensagens suas.', 403);
  if (c && c.status === 'recusada' && c.a === de) {
    const dias = (Date.now() - new Date(String(c.respondida_em).replace(' ', 'T') + 'Z').getTime()) / 86400000;
    if (dias < DIAS_NOVO_PEDIDO) throw fail('Esta pessoa recusou o seu pedido de mensagem. Tente de novo mais tarde.', 403);
    db.run(`UPDATE conversas SET status = 'pendente', respondida_em = NULL WHERE id = ?`, c.id);
    c = db.get('SELECT * FROM conversas WHERE id = ?', c.id);
  }
  const nova = !c;
  if (nova) {
    const id = Number(db.run(`INSERT INTO conversas (tipo, a, b, status) VALUES ('pessoal', ?, ?, 'pendente')`, de, alvo.dono).lastInsertRowid);
    c = db.get('SELECT * FROM conversas WHERE id = ?', id);
  }
  if (texto(msg)) enviar(de, c.id, msg);
  if (nova) avisarPorEmail(alvo.dono, `${pessoa(de).nome} quer conversar com você no Ofertou!`,
    `${pessoa(de).nome} enviou um pedido de mensagem para você. Entre no site para ver a mensagem e escolher se aceita receber mensagens dessa pessoa.`);
  return { id: c.id, ticket: ticket(c.id) };
}

// Atendimento: conversa do cliente com a loja (uma por cliente e loja; o produto fica como contexto)
function conversaLoja(de, lojaId, ofertaId = null) {
  if (!de) throw fail('Entre na sua conta para falar com a loja.', 401);
  const loja = db.get('SELECT id, user_id, nome, oculta FROM lojas WHERE id = ?', Number(lojaId));
  if (!loja || loja.oculta) throw fail('Loja não encontrada.', 404);
  const dona = `u:${loja.user_id}`;
  if (dona === de) throw fail('Esta é a sua própria loja.');
  let c = db.get(`SELECT * FROM conversas WHERE tipo = 'loja' AND a = ? AND loja_id = ?`, de, loja.id);
  if (c && c.status === 'bloqueada') throw fail('Esta loja não está recebendo mensagens suas.', 403);
  if (!c) {
    const id = Number(db.run(`INSERT INTO conversas (tipo, a, b, loja_id, oferta_id, status) VALUES ('loja', ?, ?, ?, ?, 'aceita')`,
      de, dona, loja.id, ofertaId ? Number(ofertaId) : null).lastInsertRowid);
    c = db.get('SELECT * FROM conversas WHERE id = ?', id);
    avisarPorEmail(dona, `Novo atendimento na sua loja ${loja.nome} — Ofertou!`, `${pessoa(de).nome} começou uma conversa com a sua loja ${loja.nome}.`);
  }
  if (ofertaId) {
    const o = db.get('SELECT produto, loja_id FROM offers WHERE id = ?', Number(ofertaId));
    if (o && o.loja_id === loja.id) db.run('UPDATE conversas SET oferta_id = ? WHERE id = ?', Number(ofertaId), c.id);
  }
  return c;
}

function iniciarLoja(de, lojaId, ofertaId, msg) {
  const c = conversaLoja(de, lojaId, ofertaId);
  if (ofertaId) {
    const o = db.get('SELECT produto FROM offers WHERE id = ?', Number(ofertaId));
    const ultimaRef = db.get(`SELECT texto FROM mensagens WHERE conversa_id = ? AND autor IS NULL ORDER BY id DESC LIMIT 1`, c.id);
    const ref = o ? `Conversa sobre o produto: ${o.produto}` : '';
    if (ref && ultimaRef?.texto !== ref) sistema(c.id, ref);
  }
  if (texto(msg)) enviar(de, c.id, msg);
  return { id: c.id, ticket: ticket(c.id) };
}

// ── Mensagens ────────────────────────────────────────────────────────────────
function enviar(de, convId, msg) {
  const t = texto(msg);
  if (!t) throw fail('Escreva a mensagem.');
  const c = daConversa(de, convId);
  if (c.status === 'bloqueada') throw fail('Esta conversa está bloqueada.', 403);
  if (c.status === 'recusada') throw fail(c.a === de ? 'A outra pessoa recusou receber suas mensagens.' : 'Você recusou esta conversa. Aceite para responder.', 403);
  if (c.status === 'pendente') {
    if (c.b === de) aceitarConversa(c, de); // responder = aceitar
    else {
      const n = db.get('SELECT COUNT(*) n FROM mensagens WHERE conversa_id = ? AND autor = ?', c.id, de).n;
      if (n >= MAX_PENDENTES) throw fail('Aguarde a outra pessoa aceitar o seu pedido de mensagem.', 403);
    }
  }
  limitar(de);
  return { id: gravar(c.id, de, t) };
}

function aceitarConversa(c, dono) {
  db.run(`UPDATE conversas SET status = 'aceita', respondida_em = datetime('now') WHERE id = ?`, c.id);
  sistema(c.id, `${pessoa(dono).nome} aceitou a conversa.`);
}

// Resposta ao pedido de mensagem (ou bloqueio/desbloqueio em qualquer conversa)
function responder(dono, convId, acao) {
  const c = daConversa(dono, convId);
  if (acao === 'aceitar' || acao === 'recusar') {
    if (c.b !== dono || c.status !== 'pendente') throw fail('Não há pedido de mensagem para responder.');
    if (acao === 'aceitar') aceitarConversa(c, dono);
    else db.run(`UPDATE conversas SET status = 'recusada', respondida_em = datetime('now') WHERE id = ?`, c.id);
  } else if (acao === 'bloquear') {
    db.run(`UPDATE conversas SET status = 'bloqueada', bloqueada_por = ?, respondida_em = datetime('now') WHERE id = ?`, dono, c.id);
    sistema(c.id, 'Conversa bloqueada.');
  } else if (acao === 'desbloquear') {
    if (c.status !== 'bloqueada' || c.bloqueada_por !== dono) throw fail('Só quem bloqueou pode desbloquear.');
    db.run(`UPDATE conversas SET status = 'aceita', bloqueada_por = NULL WHERE id = ?`, c.id);
    sistema(c.id, 'Conversa desbloqueada.');
  } else throw fail('Ação inválida.');
  return resumoConversa(dono, db.get('SELECT * FROM conversas WHERE id = ?', c.id));
}

function naoLidas(c, dono) {
  const lido = c.a === dono ? c.lido_a : c.lido_b;
  return db.get('SELECT COUNT(*) n FROM mensagens WHERE conversa_id = ? AND id > ? AND (autor IS NULL OR autor <> ?)', c.id, lido, dono).n;
}

function resumoConversa(dono, c) {
  const ult = db.get('SELECT texto, autor, created_at FROM mensagens WHERE conversa_id = ? ORDER BY id DESC LIMIT 1', c.id);
  const oferta = c.oferta_id ? db.get('SELECT id, produto FROM offers WHERE id = ?', c.oferta_id) : null;
  return {
    id: c.id, ticket: ticket(c.id), tipo: c.tipo, status: c.status, outro: pessoa(outro(c, dono), c),
    eu_sou: c.a === dono ? 'a' : 'b', minha_loja: c.tipo === 'loja' && c.b === dono,
    pedido_para_mim: c.status === 'pendente' && c.b === dono, bloqueada_por_mim: c.bloqueada_por === dono,
    ultima: ult ? { texto: ult.texto.slice(0, 120), minha: ult.autor === dono, sistema: !ult.autor, em: ult.created_at } : null,
    nao_lidas: naoLidas(c, dono), oferta, ultima_msg_at: c.ultima_msg_at || c.created_at,
  };
}

// Conversas de uma pessoa (pedidos de mensagem recusados por ela não aparecem)
function lista(dono) {
  if (!dono) throw fail('Entre na sua conta.', 401);
  return db.all(`SELECT * FROM conversas WHERE (a = ? OR (b = ? AND status <> 'recusada'))
                 ORDER BY COALESCE(ultima_msg_at, created_at) DESC LIMIT 300`, dono, dono).map(c => resumoConversa(dono, c));
}

// Mensagens de uma conversa (a partir de um id, para atualizar) e marca como lidas
function mensagens(dono, convId, depois = 0) {
  const c = daConversa(dono, convId);
  const lista = db.all('SELECT id, autor, texto, pedido_id, created_at FROM mensagens WHERE conversa_id = ? AND id > ? ORDER BY id LIMIT 500',
    c.id, Number(depois) || 0).map(m => ({ id: m.id, minha: m.autor === dono, sistema: !m.autor, texto: m.texto, pedido_id: m.pedido_id, em: m.created_at }));
  if (lista.length) db.run(`UPDATE conversas SET ${c.a === dono ? 'lido_a' : 'lido_b'} = MAX(${c.a === dono ? 'lido_a' : 'lido_b'}, ?) WHERE id = ?`, lista[lista.length - 1].id, c.id);
  return { conversa: resumoConversa(dono, db.get('SELECT * FROM conversas WHERE id = ?', c.id)), mensagens: lista };
}

// Para o ícone do topo: mensagens não lidas e pedidos de mensagem esperando resposta
function resumo(dono) {
  if (!dono) return { nao_lidas: 0, pedidos: 0 };
  const convs = db.all(`SELECT * FROM conversas WHERE (a = ? OR b = ?) AND status IN ('pendente', 'aceita')`, dono, dono);
  let nao = 0, pedidos = 0;
  for (const c of convs) {
    if (c.status === 'pendente' && c.b === dono) pedidos++;
    else nao += naoLidas(c, dono);
  }
  return { nao_lidas: nao, pedidos };
}

// ── Painel do administrador ─────────────────────────────────────────────────
function listarAdmin({ q = '', dono = null, limite = 200 } = {}) {
  const termo = String(q || '').trim().toLowerCase().replace(/^cv-0*/, '');
  let sql = 'SELECT * FROM conversas WHERE 1 = 1';
  const p = [];
  if (dono) { sql += ' AND (a = ? OR b = ?)'; p.push(dono, dono); }
  sql += ' ORDER BY COALESCE(ultima_msg_at, created_at) DESC LIMIT ?';
  p.push(termo ? 2000 : limite);
  let rows = db.all(sql, ...p).map(c => ({
    id: c.id, ticket: ticket(c.id), tipo: c.tipo, status: c.status, a: pessoa(c.a), b: pessoa(c.b, c), loja_id: c.loja_id,
    mensagens: db.get('SELECT COUNT(*) n FROM mensagens WHERE conversa_id = ?', c.id).n,
    created_at: c.created_at, ultima_msg_at: c.ultima_msg_at,
  }));
  if (termo) rows = rows.filter(r => String(r.id) === termo || `${r.a.nome} ${r.b.nome}`.toLowerCase().includes(termo)).slice(0, limite);
  return rows;
}

function transcricao(convId) {
  const c = db.get('SELECT * FROM conversas WHERE id = ?', Number(convId));
  if (!c) throw fail('Conversa não encontrada.', 404);
  const a = pessoa(c.a), b = pessoa(c.b, c);
  return {
    id: c.id, ticket: ticket(c.id), tipo: c.tipo, status: c.status, a, b, created_at: c.created_at, respondida_em: c.respondida_em,
    bloqueada_por: c.bloqueada_por ? pessoa(c.bloqueada_por).nome : null,
    mensagens: db.all('SELECT id, autor, texto, pedido_id, created_at FROM mensagens WHERE conversa_id = ? ORDER BY id', c.id)
      .map(m => ({ ...m, autor_nome: m.autor ? (m.autor === c.a ? a.nome : b.nome) : 'Sistema' })),
  };
}

module.exports = {
  ticket, pessoa, iniciarPessoal, iniciarLoja, conversaLoja, enviar, responder, lista, mensagens, resumo, sistema,
  listarAdmin, transcricao, avisarPorEmail,
};
