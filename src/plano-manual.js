// Troca manual do plano de uma conta pelo administrador (Painel → Usuários → ficha → Plano).
// O administrador pode dar qualquer plano a qualquer conta: se o plano for de outro tipo, a conta passa a ser do tipo
// do plano (empresa que deixa de ser empresa tem a loja tirada do ar, sem apagar; volta sozinha se a conta voltar a ser
// empresa). Ferramenta de afiliado liberada quando o plano inclui; conta em aprovação passa a ativa. Tudo no histórico.
const db = require('./db');
const planos = require('./planos');
const users = require('./users');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const NOME_TIPO = { consumidor: 'consumidor', empresa: 'empresa', afiliado: 'usuário da ferramenta' };

// validade: 'plano' (duração do plano, contada de hoje) | 'sem' (sem vencimento) | 'data' (até o dia escolhido)
function calcularValidade(p, { validade = 'plano', ate = '' }) {
  if (validade === 'sem') return planos.SEM_VENCIMENTO;
  if (validade === 'data') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ate))) throw fail('Escolha a data de vencimento.');
    // até o fim do dia escolhido no horário de Brasília (o banco guarda em UTC)
    const fim = new Date(`${ate}T23:59:59-03:00`).toISOString().replace('T', ' ').slice(0, 19);
    if (fim < new Date().toISOString().replace('T', ' ').slice(0, 19)) throw fail('A data de vencimento já passou.');
    return fim;
  }
  return planos.somaDias(null, p.dias); // grátis ou "sem vencimento" no plano → sem vencimento
}

function trocar(userId, b, quem = 'admin') {
  const u = users.getById(Number(userId));
  if (!u) throw fail('Usuário não encontrado.', 404);
  const id = String(b.plano || '');
  // Tirar o plano
  if (!id) {
    db.run('UPDATE users SET plano = NULL, assinatura_ate = NULL WHERE id = ?', u.id);
    users.logAction(users.getById(u.id), 'plano_alterado', `sem plano (${quem})`);
    return users.getById(u.id);
  }
  const p = planos.plano(id);
  if (!p || p.arquivado) throw fail('Plano não encontrado.');
  const validade = calcularValidade(p, b);

  // Tipo da conta com o plano novo: mantém o atual se o plano aceita; senão, passa para o tipo do plano
  const tipo = tipoComPlano(u.tipo, p);
  db.transaction(() => {
    db.run(`UPDATE users SET plano = ?, assinatura_ate = ?, tipo = ?,
            status = CASE WHEN status IN ('pending', 'onboarding') THEN 'active' ELSE status END WHERE id = ?`, p.id, validade, tipo, u.id);
    // Loja: sai do ar quando a conta deixa de ser empresa (oculta = 2 marca "pelo plano"); volta quando é empresa de novo
    if (u.tipo === 'empresa' && tipo !== 'empresa') db.run('UPDATE lojas SET oculta = 2 WHERE user_id = ? AND oculta = 0', u.id);
    if (tipo === 'empresa') db.run('UPDATE lojas SET oculta = 0 WHERE user_id = ? AND oculta = 2', u.id);
    if (p.ferramenta) require('./clientes').liberarPlano(users.getById(u.id), p.id, () => validade);
  });
  if (u.tipo && tipo !== u.tipo) {
    users.logAction(users.getById(u.id), 'tipo_alterado', `de ${NOME_TIPO[u.tipo] || u.tipo} para ${NOME_TIPO[tipo] || tipo}, pelo plano ${p.nome}${u.tipo === 'empresa' ? ' (loja tirada do ar)' : ''}`);
  }
  const fim = validade === planos.SEM_VENCIMENTO ? 'sem vencimento' : `até ${new Date(validade.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  users.logAction(users.getById(u.id), 'plano_alterado', `${p.nome} — ${fim} (${quem})`);
  return users.getById(u.id);
}

// Tipo que a conta terá com o plano (usado também no painel para avisar antes de aplicar)
function tipoComPlano(tipoAtual, p) {
  if (p.conta !== 'usuario') return 'afiliado'; // plano só da ferramenta de afiliado
  return tipoAtual && p.perfis.includes(tipoAtual) ? tipoAtual : p.perfil;
}

module.exports = { trocar, tipoComPlano };
