// Avisa o dono (site ou cliente da ferramenta) quando as postagens param: número desconectado, rodada com falha, sem
// ofertas para postar. O site recebe no sino do painel e por e-mail; o cliente, no sino da conta e por e-mail.
// O mesmo problema gera no máximo um aviso a cada 6 horas.
const db = require('./db');
const settings = require('./settings');
const whatsapp = require('./whatsapp');

db.db.exec(`CREATE TABLE IF NOT EXISTS envio_avisos (chave TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);

const log = m => console.log(`[AVISO ENVIO] ${m}`);
const configDe = cid => (cid ? require('./clientes').config(cid) : settings.getAll());
const blocoAtual = () => Math.floor(Date.now() / (6 * 3600000));

function avisar(cid, { tipo, titulo, texto }) {
  const chave = `envio-${tipo}-${cid || 'site'}-${blocoAtual()}`;
  try {
    if (!cid) {
      return require('./ganhos').notificar({ chave, tipo: 'envio', titulo, texto, link: '/admin#social' });
    }
    if (!db.run('INSERT OR IGNORE INTO envio_avisos (chave) VALUES (?)', chave).changes) return false;
    const c = require('./clientes').getById(cid);
    if (!c) return false;
    const conta = db.get('SELECT id FROM users WHERE cliente_id = ?', cid);
    require('./notificacoes').criar(conta ? `u:${conta.id}` : `c:${cid}`, { tipo: 'envio', titulo, texto, link: '/cliente' });
    const email = require('./email');
    if (c.email && email.configurado()) email.enviar({ para: c.email, assunto: `Ofertou!: ${titulo}`, texto: `${titulo}\n\n${texto || ''}` }).catch(err => log(`e-mail: ${err.message}`));
    return true;
  } catch (err) {
    log(`não consegui avisar: ${err.message}`);
    return false;
  }
}

// Depois de cada rodada do agendamento
function avaliarRodada(cid, feitos) {
  const erros = feitos.filter(f => !f.ok);
  if (!erros.length) return;
  const ultimo = String(erros[erros.length - 1].resumo || '').slice(0, 300);
  if (erros.length === feitos.length) {
    return avisar(cid, { tipo: 'rodada', titulo: 'As postagens agendadas falharam', texto: `Nenhuma das ${feitos.length} oferta(s) foi publicada. Último erro: ${ultimo}` });
  }
  return avisar(cid, { tipo: 'rodada-parcial', titulo: 'Parte das postagens agendadas falhou', texto: `${erros.length} de ${feitos.length} oferta(s) não foram publicadas. Último erro: ${ultimo}` });
}

// ── Conexão do WhatsApp ──────────────────────────────────────────────────────
// Confere a cada 5 minutos quem tem o agendamento ligado com o WhatsApp. Duas conferências seguidas com problema viram aviso.
const problemas = new Map(); // dono → { falhas, mensagem, desde, avisado }
const QUEDAS_PARA_AVISAR = 2;
const usaWhatsapp = s => { try { return s.agenda_ativa === '1' && JSON.parse(s.agenda_redes || '[]').includes('whatsapp') && !whatsapp.config(s).erro; } catch { return false; } };

async function conferirDono(cid) {
  const d = cid || 'site';
  const s = configDe(cid);
  if (!usaWhatsapp(s)) { problemas.delete(d); return; }
  const st = await whatsapp.status(s).catch(err => ({ conectado: false, mensagem: err.message }));
  if (st.conectado) {
    const antes = problemas.get(d);
    problemas.delete(d);
    if (antes?.avisado) avisar(cid, { tipo: 'whatsapp-voltou', titulo: 'O WhatsApp voltou a funcionar', texto: 'As postagens agendadas seguem normalmente.' });
    return;
  }
  const p = problemas.get(d) || { falhas: 0, desde: new Date().toISOString(), avisado: false };
  p.falhas++;
  p.mensagem = st.mensagem || 'Número desconectado.';
  problemas.set(d, p);
  if (p.falhas >= QUEDAS_PARA_AVISAR && !p.avisado) {
    p.avisado = true;
    avisar(cid, { tipo: 'whatsapp', titulo: 'O WhatsApp está fora do ar e as postagens não vão sair', texto: `${p.mensagem} Conecte o número de novo no painel.` });
  }
}
async function conferirConexoes() {
  await conferirDono(null).catch(err => log(err.message));
  for (const { id } of db.all(`SELECT id FROM clientes WHERE status = 'ativo' AND validade >= datetime('now')`)) {
    await conferirDono(id).catch(err => log(err.message));
  }
}
// O que mostrar no painel (null = tudo certo)
function problema(cid = null) {
  const p = problemas.get(cid || 'site');
  return p && p.falhas >= QUEDAS_PARA_AVISAR ? { mensagem: p.mensagem, desde: p.desde } : null;
}

let timer = null;
function iniciar() {
  if (timer) return;
  db.run(`DELETE FROM envio_avisos WHERE created_at < datetime('now', '-7 days')`);
  timer = setInterval(() => conferirConexoes().catch(err => log(err.message)), 5 * 60000);
  timer.unref?.();
  setTimeout(() => conferirConexoes().catch(err => log(err.message)), 90000).unref?.();
}

module.exports = { avisar, avaliarRodada, conferirDono, conferirConexoes, problema, iniciar };
