// O que fica em volta da compra de um plano: período grátis, 1 mês grátis para as primeiras lojas, renovação automática
// pelo Mercado Pago, troca de plano e a lista "Meus planos".
//  • Renovação automática: assinatura do Mercado Pago (preapproval). Toda cobrança é conferida na API do Mercado Pago;
//    o aviso dele só adianta a conferência, que também roda sozinha a cada hora.
//  • Troca de plano: o que falta usar do plano antigo vira dias a mais no novo. A pessoa paga o preço cheio do novo e
//    nada é devolvido; assim funciona igual no Pix, no cartão e na renovação automática.
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');
const planos = require('./planos');
const users = require('./users');
const clientes = require('./clientes');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const LOJAS_GRATIS = 20;
const DIAS_LOJA_GRATIS = 30;
const DIA_MS = 86400000;

for (const col of ['ciclo TEXT', 'renovacao_auto INTEGER NOT NULL DEFAULT 0', 'trocado_de TEXT', 'reembolso_status TEXT', 'reembolso_em TEXT', 'reembolso_obs TEXT']) {
  try { db.db.exec(`ALTER TABLE pagamentos ADD COLUMN ${col}`); } catch { /* já existe */ }
}
db.db.exec(`
  CREATE TABLE IF NOT EXISTS planos_cortesia (
    chave TEXT NOT NULL,                     -- e-mail, cpf:... ou cnpj:...
    plano TEXT NOT NULL,
    tipo TEXT NOT NULL,                      -- teste | loja_mes
    pedido_id INTEGER,
    aviso_fim INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (chave, plano)
  );
  CREATE TABLE IF NOT EXISTS assinaturas_auto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,              -- o pedido que iniciou a assinatura
    mp_preapproval_id TEXT NOT NULL UNIQUE,
    plano TEXT NOT NULL,
    ciclo TEXT NOT NULL,
    valor REAL NOT NULL,
    dias INTEGER NOT NULL,
    email TEXT NOT NULL,
    conta_tipo TEXT,
    conta_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pendente', -- pendente | ativa | cancelada
    criada_em TEXT NOT NULL DEFAULT (datetime('now')),
    cancelada_em TEXT
  );
  CREATE TABLE IF NOT EXISTS assinaturas_cobrancas (
    mp_payment_id TEXT PRIMARY KEY,
    assinatura_id INTEGER NOT NULL,
    pedido_id INTEGER NOT NULL,
    criada_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const ms = sql => {
  const t = String(sql || '');
  if (!t) return 0;
  return new Date(t.length <= 10 ? `${t}T23:59:59Z` : `${t.replace(' ', 'T')}Z`).getTime() || 0;
};
const semVencimento = v => String(v || '').startsWith('9999');

// ── Período grátis ───────────────────────────────────────────────────────────
const lojasGratisRestantes = () => Math.max(0, LOJAS_GRATIS - db.get(`SELECT COUNT(DISTINCT pedido_id) n FROM planos_cortesia WHERE tipo = 'loja_mes'`).n);

// E-mail, CPF e CNPJ da compra: o mesmo período grátis não vale duas vezes para a mesma pessoa ou empresa
function identidade(dados, logado) {
  const conta = logado || (dados.renovar_user_id && users.getById(dados.renovar_user_id)) || {};
  const pd = dados.perfil_dados || {};
  const cpf = dados.cpf || pd.cpf || conta.cpf;
  const cnpj = dados.cnpj || pd.cnpj || conta.cnpj;
  return [String(dados.email || conta.email || '').toLowerCase(), cpf && `cpf:${cpf}`, cnpj && `cnpj:${cnpj}`].filter(Boolean);
}
function jaUsou(chaves, planoId) {
  if (!chaves.length) return false;
  const marcas = chaves.map(() => '?').join(', ');
  if (db.get(`SELECT 1 FROM planos_cortesia WHERE plano = ? AND chave IN (${marcas})`, planoId, ...chaves)) return true;
  return Boolean(db.get(`SELECT 1 FROM pagamentos WHERE plano = ? AND status = 'aprovado' AND valor > 0 AND lower(email) = ?`, planoId, chaves[0]));
}
// O que esta pessoa pode ganhar neste plano. Sem saber quem é (ainda não preencheu nada), vale o que está disponível para quem é novo.
function cortesia(p, chaves = []) {
  if (!p || p.gratis) return null;
  if (jaUsou(chaves, p.id)) return null;
  if (p.tipos.includes('empresa') && lojasGratisRestantes() > 0) return { tipo: 'loja_mes', dias: DIAS_LOJA_GRATIS, restantes: lojasGratisRestantes() };
  return p.teste_dias > 0 ? { tipo: 'teste', dias: p.teste_dias } : null;
}
function registrarCortesia(chaves, planoId, tipo, pedidoId) {
  for (const c of chaves) db.run('INSERT OR IGNORE INTO planos_cortesia (chave, plano, tipo, pedido_id) VALUES (?, ?, ?, ?)', c, planoId, tipo, pedidoId);
}

// ── Planos da conta ──────────────────────────────────────────────────────────
function clienteDa(u, c) {
  if (c) return c;
  if (!u) return null;
  return (u.cliente_id && clientes.getById(u.cliente_id)) || null;
}
function validadeDe(p, u, c) {
  const cli = clienteDa(u, c);
  if (cli && cli.plano === p.id) return cli.validade;
  return u && u.plano === p.id ? u.assinatura_ate : null;
}
const planoAtivo = (p, u, c) => { const v = validadeDe(p, u, c); return Boolean(v) && (semVencimento(v) || ms(v) > Date.now()); };

function ultimoPedido(planoId, u, c) {
  const cli = clienteDa(u, c);
  return db.get(`SELECT * FROM pagamentos WHERE plano = ? AND status = 'aprovado' AND reembolso_status IS NULL
      AND ((conta_tipo = 'usuario' AND conta_id = ?) OR (conta_tipo = 'cliente' AND conta_id = ?)) ORDER BY id DESC LIMIT 1`, planoId, u?.id ?? -1, cli?.id ?? -1) || null;
}
function autoDa(planoId, u, c) {
  const cli = clienteDa(u, c);
  return db.get(`SELECT * FROM assinaturas_auto WHERE plano = ? AND status = 'ativa'
      AND ((conta_tipo = 'usuario' AND conta_id = ?) OR (conta_tipo = 'cliente' AND conta_id = ?)) ORDER BY id DESC LIMIT 1`, planoId, u?.id ?? -1, cli?.id ?? -1) || null;
}

function meus(u, c) {
  const ids = new Set();
  const cli = clienteDa(u, c);
  if (u?.plano) ids.add(u.plano);
  if (cli?.plano) ids.add(cli.plano);
  const lista = [...ids].map(id => {
    const p = planos.plano(id);
    if (!p) return null;
    const validade = validadeDe(p, u, c);
    const pedido = ultimoPedido(id, u, c);
    const auto = autoDa(id, u, c);
    const cicloId = auto?.ciclo || pedido?.ciclo || 'mensal';
    return {
      plano: id, nome: p.nome, gratis: p.gratis, ferramenta: p.ferramenta, validade, sem_vencimento: semVencimento(validade),
      ativo: planoAtivo(p, u, c), em_teste: pedido?.metodo === 'teste', ciclo: planos.CICLOS[cicloId] ? cicloId : 'mensal', ciclos: p.ciclos, desconto_auto: p.desconto_auto,
      auto: auto ? { id: auto.id, valor: auto.valor, dias: auto.dias, ciclo: auto.ciclo } : null,
    };
  }).filter(Boolean);
  const tenho = new Set(lista.filter(x => x.ativo).map(x => x.plano));
  return {
    planos: lista,
    disponiveis: planos.listar().filter(p => !p.gratis && !tenho.has(p.id)).map(p => ({ id: p.id, nome: p.nome, chamada: p.chamada, ciclos: p.ciclos, ferramenta: p.ferramenta, cortesia: cortesia(p, u ? identidade({ email: u.email }, u) : c ? [String(c.email).toLowerCase()] : []) })),
    so_ferramenta: !u,
    mercadopago: Boolean(settings.get('mp_access_token')),
  };
}

// ── Troca de plano ───────────────────────────────────────────────────────────
// O que falta usar do plano antigo, em dinheiro, convertido em dias do plano novo
function creditoDaTroca(velho, ciclo, u, c) {
  const pedido = ultimoPedido(velho.id, u, c);
  const validade = validadeDe(velho, u, c);
  if (!pedido || !(pedido.valor > 0) || !(pedido.dias > 0) || semVencimento(validade)) return { credito: 0, dias_bonus: 0 };
  const restam = Math.min(pedido.dias, Math.max(0, (ms(validade) - Date.now()) / DIA_MS));
  const credito = Math.floor(pedido.valor * (restam / pedido.dias) * 100) / 100;
  return { credito, dias_bonus: ciclo.preco > 0 ? Math.floor(credito / (ciclo.preco / ciclo.dias)) : 0 };
}
function prepararTroca(p, ciclo, b, u, c) {
  const de = String(b.trocar_de || '');
  if (!de) return null;
  if (!u && !c) throw fail('Entre na sua conta para trocar de plano.', 401);
  const velho = planos.plano(de);
  if (!velho || !planoAtivo(velho, u, c)) throw fail('Você não tem esse plano ativo para trocar.', 409);
  if (velho.gratis) return null; // sair do grátis não tira nada: é só assinar
  if (!u && p.id !== velho.id) throw fail('Para mudar de plano, entre com a conta do site.', 401);
  if (p.id === velho.id && ciclo.id === (ultimoPedido(velho.id, u, c)?.ciclo || 'mensal') && !b.renovacao_auto) throw fail('Você já está neste plano e neste período.', 409);
  return { trocar_de: velho.id, trocar_user_id: u?.id || null, trocar_cliente_id: clienteDa(u, c)?.id || null, ...creditoDaTroca(velho, ciclo, u, c) };
}
// Dentro da aprovação do pedido novo: tira o plano antigo da conta. Os dias do novo contam a partir de agora.
function encerrarPlanoAntigo(d) {
  const agora = nowSql();
  const velho = planos.plano(d.trocar_de);
  if (d.trocar_cliente_id) db.run('UPDATE clientes SET validade = ? WHERE id = ? AND plano = ?', agora, d.trocar_cliente_id, d.trocar_de);
  if (d.trocar_user_id) {
    const u = users.getById(d.trocar_user_id);
    if (u && u.plano === d.trocar_de) db.run('UPDATE users SET assinatura_ate = ? WHERE id = ?', agora, u.id);
    if (u) users.logAction(u, 'plano_trocado', `Saiu do plano ${velho?.nome || d.trocar_de}`);
  }
}

// ── Renovação automática ─────────────────────────────────────────────────────
const pag = () => require('./pagamentos');
function criarAuto({ token, preapproval, plano, ciclo, valor, dias, email }) {
  db.run('INSERT INTO assinaturas_auto (token, mp_preapproval_id, plano, ciclo, valor, dias, email) VALUES (?, ?, ?, ?, ?, ?, ?)', token, String(preapproval), plano, ciclo, valor, dias, email);
}
const marcarCancelada = id => db.run(`UPDATE assinaturas_auto SET status = 'cancelada', cancelada_em = datetime('now') WHERE id = ?`, id);

// Cobranças aprovadas da assinatura: cada uma libera os dias uma única vez
async function conferir(a) {
  const s = settings.getAll();
  if (!s.mp_access_token) return a;
  const { mp, aprovar } = pag();
  const pre = await mp('get', `/preapproval/${a.mp_preapproval_id}`, null, s);
  if (String(pre.external_reference || '') !== a.token) return a; // não é desta compra
  const r = await mp('get', `/authorized_payments/search?preapproval_id=${encodeURIComponent(a.mp_preapproval_id)}`, null, s).catch(() => ({ results: [] }));
  for (const c of r.results || []) {
    const pagamentoId = c.payment?.id;
    if (!pagamentoId || db.get('SELECT 1 FROM assinaturas_cobrancas WHERE mp_payment_id = ?', String(pagamentoId))) continue;
    const pay = await mp('get', `/v1/payments/${pagamentoId}`, null, s).catch(() => null);
    if (!pay || pay.status !== 'approved' || Math.abs(Number(pay.transaction_amount) - a.valor) >= 0.01) continue;
    const original = db.get('SELECT * FROM pagamentos WHERE token = ?', a.token);
    let pedidoId;
    if (original && original.status === 'pendente') {
      pedidoId = original.id;
      db.run('UPDATE pagamentos SET mp_payment_id = ? WHERE id = ?', String(pagamentoId), pedidoId);
    } else {
      // Renovação: novo pedido na mesma conta, sem pedir nada de novo à pessoa
      if (!a.conta_id) continue;
      const conta = a.conta_tipo === 'cliente' ? { renovar_cliente_id: a.conta_id } : { renovar_user_id: a.conta_id };
      pedidoId = Number(db.run(`INSERT INTO pagamentos (token, plano, valor, dias, metodo, email, nome, dados, ciclo, renovacao_auto, mp_payment_id) VALUES (?, ?, ?, ?, 'assinatura', ?, ?, ?, ?, 1, ?)`,
        crypto.randomBytes(24).toString('hex'), a.plano, a.valor, a.dias, a.email, original?.nome || null, JSON.stringify({ email: a.email, nome: original?.nome || null, ...conta }), a.ciclo, String(pagamentoId)).lastInsertRowid);
    }
    db.run('INSERT INTO assinaturas_cobrancas (mp_payment_id, assinatura_id, pedido_id) VALUES (?, ?, ?)', String(pagamentoId), a.id, pedidoId);
    const aprovado = aprovar(pedidoId, 'renovação automática do Mercado Pago');
    if (aprovado?.conta_id) {
      db.run(`UPDATE assinaturas_auto SET conta_tipo = ?, conta_id = ?, status = CASE WHEN status = 'pendente' THEN 'ativa' ELSE status END WHERE id = ?`, aprovado.conta_tipo, aprovado.conta_id, a.id);
      a = db.get('SELECT * FROM assinaturas_auto WHERE id = ?', a.id);
    }
  }
  if (['cancelled', 'canceled'].includes(pre.status) && a.status !== 'cancelada') {
    marcarCancelada(a.id);
    db.run(`UPDATE pagamentos SET status = 'cancelado', observacao = 'assinatura cancelada no Mercado Pago' WHERE token = ? AND status = 'pendente'`, a.token);
  }
  return db.get('SELECT * FROM assinaturas_auto WHERE id = ?', a.id);
}
const conferirPedido = async pedido => {
  const a = db.get('SELECT * FROM assinaturas_auto WHERE token = ?', pedido.token);
  if (a) await conferir(a);
};
const conferirPorId = async id => {
  const a = db.get('SELECT * FROM assinaturas_auto WHERE mp_preapproval_id = ?', String(id));
  if (a) await conferir(a);
};

async function pararNoMercadoPago(a) {
  const s = settings.getAll();
  if (s.mp_access_token) await pag().mp('put', `/preapproval/${a.mp_preapproval_id}`, { status: 'cancelled' }, s);
  marcarCancelada(a.id);
}
// A própria pessoa desliga em Meus planos. O acesso já pago continua até o fim do prazo.
async function desligar(id, u, c) {
  const cli = clienteDa(u, c);
  const a = db.get(`SELECT * FROM assinaturas_auto WHERE id = ? AND status = 'ativa' AND ((conta_tipo = 'usuario' AND conta_id = ?) OR (conta_tipo = 'cliente' AND conta_id = ?))`, Number(id), u?.id ?? -1, cli?.id ?? -1);
  if (!a) throw fail('Renovação automática não encontrada.', 404);
  await pararNoMercadoPago(a);
  if (u) users.logAction(u, 'renovacao_desligada', planos.plano(a.plano)?.nome || a.plano);
  return { ok: true };
}
// Troca de plano e arrependimento: para de cobrar o plano que saiu
async function pararDaConta(contas, planoId, menosToken = null) {
  const lista = db.all(`SELECT * FROM assinaturas_auto WHERE status = 'ativa' AND plano = ?`, planoId)
    .filter(a => a.token !== menosToken && contas.some(([t, i]) => a.conta_tipo === t && a.conta_id === i));
  for (const a of lista) {
    await pararNoMercadoPago(a).catch(err => {
      console.error('[ASSINATURA] não parou a renovação:', err.message);
      db.run(`INSERT INTO admin_notificacoes (tipo, titulo, texto) VALUES ('assinatura', ?, ?)`, 'Cancele uma renovação automática no Mercado Pago', `O plano foi trocado ou cancelado, mas o Mercado Pago não respondeu. Assinatura ${a.mp_preapproval_id}, ${a.email}.`);
    });
  }
}

// ── Rotina ───────────────────────────────────────────────────────────────────
async function conferirTodas() {
  for (const a of db.all(`SELECT * FROM assinaturas_auto WHERE status = 'ativa' OR (status = 'pendente' AND criada_em >= datetime('now', '-3 days'))`)) {
    await conferir(a).catch(err => console.error('[ASSINATURA]', err.message));
  }
}
// Avisa por e-mail dois dias antes do fim do período grátis
async function avisarFimDoGratis() {
  const email = require('./email');
  if (!email.configurado()) return;
  const site = String(settings.get('site_url') || '').replace(/\/+$/, '');
  const fim = new Date(Date.now() + 2 * DIA_MS).toISOString().replace('T', ' ').slice(0, 19);
  const lista = db.all(`SELECT DISTINCT c.pedido_id, c.plano, p.email, p.validade_ate FROM planos_cortesia c JOIN pagamentos p ON p.id = c.pedido_id
    WHERE c.aviso_fim = 0 AND p.status = 'aprovado' AND p.validade_ate <= ? AND p.validade_ate > ?`, fim, nowSql());
  for (const x of lista) {
    const p = planos.plano(x.plano);
    if (!p) continue;
    db.run('UPDATE planos_cortesia SET aviso_fim = 1 WHERE pedido_id = ?', x.pedido_id);
    await email.enviar({ para: x.email, assunto: `Seu período grátis do ${p.nome} está acabando`,
      texto: `Seu período grátis do plano ${p.nome} termina em ${new Date(`${x.validade_ate.replace(' ', 'T')}Z`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Nada é cobrado sem você escolher. Para continuar: ${site}/assinar?plano=${p.id}`,
    }).catch(err => console.error('[ASSINATURA] e-mail:', err.message));
  }
}
let timer = null;
function iniciar() {
  const rodar = () => { conferirTodas().catch(err => console.error('[ASSINATURA]', err.message)); avisarFimDoGratis().catch(err => console.error('[ASSINATURA]', err.message)); };
  clearInterval(timer);
  setTimeout(rodar, 90 * 1000);
  timer = setInterval(rodar, 60 * 60 * 1000);
}

module.exports = {
  LOJAS_GRATIS, lojasGratisRestantes, identidade, cortesia, registrarCortesia, planoAtivo, clienteDa, meus, prepararTroca, creditoDaTroca, encerrarPlanoAntigo,
  criarAuto, conferir, conferirPedido, conferirPorId, conferirTodas, desligar, pararDaConta, avisarFimDoGratis, iniciar,
};
