// Direito de arrependimento dos planos (Código de Defesa do Consumidor, art. 49): quem comprou um plano pelo site
// pode desistir em até 7 dias da confirmação do pagamento e recebe o valor de volta.
// • Pago pelo Mercado Pago: o reembolso é feito na hora, automaticamente.
// • Pago por Pix na chave, transferência ou link: o pedido de reembolso vai para o administrador, que devolve e marca como feito.
// Em ambos os casos os dias comprados são retirados da conta (se não sobrar prazo, o plano termina na hora).
const db = require('./db');
const users = require('./users');
const settings = require('./settings');

const PRAZO_DIAS = 7;
for (const col of ['reembolso_status TEXT', 'reembolso_em TEXT', 'reembolso_obs TEXT']) {
  try { db.db.exec(`ALTER TABLE pagamentos ADD COLUMN ${col}`); } catch { /* já existe */ }
}

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const agora = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const SEM_VENCIMENTO_PREFIXO = '9999';

// Compra que ainda está no prazo de arrependimento (a mais recente)
function compraNoPrazo(u) {
  if (!u) return null;
  return db.get(`SELECT * FROM pagamentos WHERE status = 'aprovado' AND valor > 0 AND reembolso_status IS NULL
      AND aprovado_em >= datetime('now', ?) AND ((conta_tipo = 'usuario' AND conta_id = ?) OR (conta_tipo = 'cliente' AND conta_id = ?))
    ORDER BY aprovado_em DESC LIMIT 1`, `-${PRAZO_DIAS} days`, u.id, u.cliente_id || -1) || null;
}

function situacao(u) {
  const p = compraNoPrazo(u);
  if (!p) return { pode: false, prazo_dias: PRAZO_DIAS };
  const plano = require('./planos').plano(p.plano);
  const ate = new Date(new Date(p.aprovado_em.replace(' ', 'T') + 'Z').getTime() + PRAZO_DIAS * 86400000);
  return {
    pode: true, prazo_dias: PRAZO_DIAS, pedido_id: p.id, plano: plano?.nome || p.plano, valor: p.valor,
    comprado_em: p.aprovado_em, ate: ate.toISOString().replace('T', ' ').slice(0, 19),
    automatico: Boolean(p.mp_payment_id && settings.get('mp_access_token')),
  };
}

// Tira da conta os dias comprados naquele pedido
function tirarDias(validadeAtual, dias) {
  if (!validadeAtual || String(validadeAtual).startsWith(SEM_VENCIMENTO_PREFIXO) || !dias) return agora();
  const v = new Date(String(validadeAtual).replace(' ', 'T') + 'Z').getTime() - dias * 86400000;
  return v <= Date.now() ? agora() : new Date(v).toISOString().replace('T', ' ').slice(0, 19);
}

async function pedir(u, motivo = '') {
  const p = compraNoPrazo(u);
  if (!p) throw fail(`Não há compra de plano nos últimos ${PRAZO_DIAS} dias para cancelar. Depois desse prazo, fale com o Suporte.`, 404);
  motivo = String(motivo || '').trim().slice(0, 300);
  let status = 'solicitado', obs = motivo ? `Motivo: ${motivo}` : '';
  // Mercado Pago: devolve na hora
  if (p.mp_payment_id && settings.get('mp_access_token')) {
    const pg = require('./pagamentos');
    try {
      await pg.mp('post', `/v1/payments/${p.mp_payment_id}/refunds`, {}, settings.getAll(), { 'X-Idempotency-Key': `arrependimento-${p.id}` });
      status = 'reembolsado';
    } catch (err) {
      obs = `${obs} · Reembolso automático falhou (${err.message}): devolver manualmente.`.trim();
    }
  }
  db.transaction(() => {
    db.run(`UPDATE pagamentos SET reembolso_status = ?, reembolso_em = datetime('now'), reembolso_obs = ? WHERE id = ?`, status, obs || null, p.id);
    if (p.conta_tipo === 'usuario') {
      const conta = users.getById(p.conta_id);
      db.run('UPDATE users SET assinatura_ate = ? WHERE id = ?', tirarDias(conta.assinatura_ate, p.dias), conta.id);
    } else {
      const c = db.get('SELECT validade FROM clientes WHERE id = ?', p.conta_id);
      if (c) db.run('UPDATE clientes SET validade = ? WHERE id = ?', tirarDias(c.validade, p.dias).slice(0, 10), p.conta_id);
      if (u.cliente_id === p.conta_id && u.assinatura_ate) db.run('UPDATE users SET assinatura_ate = ? WHERE id = ?', tirarDias(u.assinatura_ate, p.dias), u.id);
    }
  });
  users.logAction(users.getById(u.id), 'arrependimento', `pedido ${p.id} (${brl(p.valor)}) — ${status === 'reembolsado' ? 'reembolsado pelo Mercado Pago' : 'reembolso a fazer pelo administrador'}`);
  // Avisa o administrador no sino do painel
  try {
    db.run(`INSERT INTO admin_notificacoes (tipo, titulo, texto) VALUES ('arrependimento', ?, ?)`,
      status === 'reembolsado' ? 'Plano cancelado no prazo de arrependimento (reembolsado)' : 'Pedido de reembolso de plano (arrependimento)',
      `${u.nome || u.email} — ${brl(p.valor)}${status === 'reembolsado' ? ', devolvido automaticamente pelo Mercado Pago.' : '. Devolva o valor e marque como feito em Planos e pagamentos → Pedidos de assinatura.'}`);
  } catch { /* opcional */ }
  return { status, valor: p.valor };
}

// Administrador: marca como devolvido um reembolso pedido (Pix na chave, transferência ou link)
function marcarReembolsado(id, obs = '') {
  const p = db.get('SELECT * FROM pagamentos WHERE id = ?', Number(id));
  if (!p || p.reembolso_status !== 'solicitado') throw fail('Este pedido não tem reembolso pendente.');
  db.run(`UPDATE pagamentos SET reembolso_status = 'reembolsado', reembolso_obs = TRIM(COALESCE(reembolso_obs, '') || ' · ' || ?) WHERE id = ?`,
    `Devolvido pelo administrador em ${new Date().toLocaleDateString('pt-BR')}${obs ? ` (${String(obs).slice(0, 200)})` : ''}`, p.id);
  return db.get('SELECT * FROM pagamentos WHERE id = ?', p.id);
}

module.exports = { PRAZO_DIAS, situacao, pedir, marcarReembolsado };
