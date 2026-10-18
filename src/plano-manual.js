// Troca manual do plano de uma conta pelo administrador (Painel → Usuários → ficha → Plano).
// Usa as mesmas regras da compra: tipo de conta compatível, ferramenta de afiliado liberada quando o plano inclui,
// conta em aprovação passa a ativa. Fica registrado no histórico de moderação.
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

  db.transaction(() => {
    if (p.conta === 'usuario') {
      // O plano precisa aceitar o tipo da conta (conta sem tipo ou de afiliado assume o tipo do plano)
      let tipo = u.tipo;
      if (!tipo || (tipo === 'afiliado' && !p.perfis.includes('afiliado'))) tipo = p.perfil;
      if (!p.perfis.includes(tipo)) {
        throw fail(`O plano ${p.nome} é para conta de ${p.perfis.map(t => NOME_TIPO[t] || t).join(' ou ')}; esta conta é de ${NOME_TIPO[u.tipo] || u.tipo}.`);
      }
      db.run(`UPDATE users SET plano = ?, assinatura_ate = ?, tipo = ?,
              status = CASE WHEN status IN ('pending', 'onboarding') THEN 'active' ELSE status END WHERE id = ?`, p.id, validade, tipo, u.id);
    } else {
      // Plano só da ferramenta de afiliado: a conta ganha o painel de afiliado (mesmo login)
      if (u.tipo && u.tipo !== 'afiliado') {
        throw fail(`O plano ${p.nome} é só da ferramenta de afiliado; esta conta é de ${NOME_TIPO[u.tipo]}. Use um plano de ${NOME_TIPO[u.tipo]} com a ferramenta junto.`);
      }
      db.run(`UPDATE users SET plano = ?, assinatura_ate = ?, tipo = 'afiliado',
              status = CASE WHEN status IN ('pending', 'onboarding') THEN 'active' ELSE status END WHERE id = ?`, p.id, validade, u.id);
    }
    if (p.ferramenta) require('./clientes').liberarPlano(users.getById(u.id), p.id, () => validade);
  });
  const fim = validade === planos.SEM_VENCIMENTO ? 'sem vencimento' : `até ${new Date(validade.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  users.logAction(users.getById(u.id), 'plano_alterado', `${p.nome} — ${fim} (${quem})`);
  return users.getById(u.id);
}

module.exports = { trocar };
