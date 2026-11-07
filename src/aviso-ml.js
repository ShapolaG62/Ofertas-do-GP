// Lembrete da coleta do Mercado Livre: o site não consegue ler as ofertas e os cupons de lá, só a extensão do Chrome.
// Três vezes por dia (9h, 14h e 20h, horário de Brasília) o administrador é avisado no sino e vê um aviso fixo no painel.
// O aviso só some depois que a extensão entregar as ofertas e os cupons daquele período.
const db = require('./db');
const settings = require('./settings');
require('./ganhos'); // cria a tabela de notificações

const HORARIOS = [9, 14, 20];
const CHAVES = { ofertas: 'ml_coleta_ofertas_em', cupons: 'ml_coleta_cupons_em' };

// O último horário de aviso que já passou, em milissegundos
function ultimoHorario(agora = Date.now()) {
  const br = new Date(agora - 3 * 3600000);
  const dia = Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate());
  for (const h of [...HORARIOS].reverse()) {
    const t = dia + (h + 3) * 3600000;
    if (t <= agora) return { em: t, hora: h, dia: new Date(dia).toISOString().slice(0, 10) };
  }
  const ontem = dia - 86400000, h = HORARIOS[HORARIOS.length - 1];
  return { em: ontem + (h + 3) * 3600000, hora: h, dia: new Date(ontem).toISOString().slice(0, 10) };
}

const lerMs = k => Number(settings.get(CHAVES[k])) || 0;

function estado(agora = Date.now()) {
  const u = ultimoHorario(agora);
  const falta = Object.keys(CHAVES).filter(k => lerMs(k) < u.em);
  return { pendente: falta.length > 0, falta, desde: u.em, hora: u.hora, ofertas_em: lerMs('ofertas') || null, cupons_em: lerMs('cupons') || null };
}

// Chamado quando a extensão entrega dados de verdade
function registrar(tipo, agora = Date.now()) {
  if (!CHAVES[tipo]) return estado(agora);
  settings.set(CHAVES[tipo], String(agora));
  const e = estado(agora);
  if (!e.pendente) db.run(`UPDATE admin_notificacoes SET lida = 1 WHERE tipo = 'ml-coleta' AND lida = 0`);
  return e;
}

function verificar(agora = Date.now()) {
  const e = estado(agora);
  if (!e.pendente) return false;
  const u = ultimoHorario(agora);
  return require('./ganhos').notificar({
    chave: `ml-coleta-${u.dia}-${u.hora}`, tipo: 'ml-coleta', semEmail: true,
    titulo: 'Use a extensão para coletar o Mercado Livre',
    texto: 'Faltam as ofertas e os cupons de agora. Abra o painel e toque em Coletar agora, com o Chrome logado no Mercado Livre.',
    link: '/admin#mining',
  });
}

module.exports = { HORARIOS, estado, registrar, verificar, ultimoHorario };
