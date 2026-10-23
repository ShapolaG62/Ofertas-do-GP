// Alertas de ofertas no WhatsApp particular: a pessoa escolhe os termos (ex.: "iphone 15", "air fryer") e, quando uma
// oferta nova com esses termos entra no site, recebe uma mensagem no celular cadastrado na conta.
// Só com pedido expresso (pergunta + caixa de aceite, LGPD) e com limites para o número do site não ser banido:
// no máximo uma mensagem por pessoa a cada rodada (até 3 ofertas juntas), limite diário escolhido pela pessoa,
// só das 8h às 22h (Brasília) e um intervalo entre um envio e outro. Envia pelo mesmo WhatsApp das postagens
// (Painel → Redes sociais → WhatsApp). O admin liga e desliga em Painel → Redes sociais.
const db = require('./db');
const settings = require('./settings');

db.db.exec(`
  CREATE TABLE IF NOT EXISTS alertas_whatsapp (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ativo INTEGER NOT NULL DEFAULT 0,
    termos TEXT NOT NULL DEFAULT '[]',
    desconto_min INTEGER NOT NULL DEFAULT 0,
    max_dia INTEGER NOT NULL DEFAULT 3,
    aceite_em TEXT,                 -- quando aceitou receber (prova do consentimento)
    falhas INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS alertas_enviados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ofertas TEXT NOT NULL,          -- ids enviados nesta mensagem, separados por vírgula
    termo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_alertas_enviados_user ON alertas_enviados (user_id, created_at);
`);

const MAX_TERMOS = 10;
const OFERTAS_POR_MSG = 3;
const ENVIOS_POR_RODADA = 40;      // pessoas atendidas por rodada (o resto fica para a próxima)
const PAUSA_ENTRE_ENVIOS_MS = 4000;
const DESCONTOS = [0, 10, 20, 30, 40, 50];
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// O site tem o WhatsApp das postagens configurado e o admin deixou o recurso ligado?
function disponivel() {
  const s = settings.getAll();
  return s.alertas_wa_ativo === '1' && !require('./whatsapp').config(s).erro;
}

const mascarar = tel => { const t = String(tel || '').replace(/\D/g, ''); return t.length >= 10 ? `(${t.slice(0, 2)}) ${t.length === 11 ? '9' : ''}****-${t.slice(-4)}` : ''; };

function deUsuario(u) {
  const r = db.get('SELECT * FROM alertas_whatsapp WHERE user_id = ?', u.id) || { ativo: 0, termos: '[]', desconto_min: 0, max_dia: 3, aceite_em: null };
  let termos = [];
  try { termos = JSON.parse(r.termos); } catch { /* vazio */ }
  return {
    disponivel: disponivel(), telefone: mascarar(u.telefone), tem_telefone: Boolean(String(u.telefone || '').replace(/\D/g, '').length >= 10),
    ativo: Boolean(r.ativo), termos, desconto_min: r.desconto_min, max_dia: r.max_dia, aceite_em: r.aceite_em,
    descontos: DESCONTOS, max_termos: MAX_TERMOS,
  };
}

function salvar(u, b, req) {
  if (!disponivel()) throw fail('Os alertas no WhatsApp ainda não estão disponíveis.');
  const ativo = b.ativo === true || b.ativo === 'on' || b.ativo === '1';
  const termos = [...new Set((Array.isArray(b.termos) ? b.termos : String(b.termos || '').split(/[,\n]/))
    .map(t => String(t).trim().replace(/\s+/g, ' ')).filter(t => norm(t).length >= 2))].slice(0, MAX_TERMOS);
  if (termos.some(t => t.length > 40)) throw fail('Cada termo pode ter no máximo 40 letras.');
  const desconto = DESCONTOS.includes(Number(b.desconto_min)) ? Number(b.desconto_min) : 0;
  const maxDia = Math.min(10, Math.max(1, Math.round(Number(b.max_dia) || 3)));
  const atual = db.get('SELECT aceite_em FROM alertas_whatsapp WHERE user_id = ?', u.id);
  let aceite = atual?.aceite_em || null;
  if (ativo) {
    if (String(u.telefone || '').replace(/\D/g, '').length < 10) throw fail('Cadastre o seu celular com DDD em Minha conta → Meus dados.');
    if (!termos.length) throw fail('Escolha pelo menos um termo de oferta.');
    if (!aceite) {
      if (!(b.aceite === true || b.aceite === 'on' || b.aceite === '1')) throw fail('Para ativar, confirme que aceita receber ofertas no seu WhatsApp.');
      aceite = new Date().toISOString().replace('T', ' ').slice(0, 19);
      try { require('./registro-acesso').gravar(req, `u:${u.id}`, 'aceite_alertas_whatsapp'); } catch { /* registro opcional */ }
    }
  }
  db.run(`INSERT INTO alertas_whatsapp (user_id, ativo, termos, desconto_min, max_dia, aceite_em, falhas, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET ativo = excluded.ativo, termos = excluded.termos, desconto_min = excluded.desconto_min,
      max_dia = excluded.max_dia, aceite_em = excluded.aceite_em, falhas = 0, updated_at = excluded.updated_at`,
  u.id, ativo ? 1 : 0, JSON.stringify(termos), desconto, maxDia, aceite);
  return deUsuario(require('./users').getById(u.id));
}

// ── Rodada de envio (a cada 10 minutos) ──
const brl = v => `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const horaBrasilia = () => Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
const agoraSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const inicioDoDia = () => { const d = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()); return `${d} 03:00:00`; };
const espera = ms => new Promise(ok => setTimeout(ok, ms));

function mensagem(termo, ofertas, s) {
  const social = require('./social');
  const site = String(s.site_url || '').replace(/\/+$/, '');
  const itens = ofertas.map(o => `*${social.tituloCurto ? social.tituloCurto(o.produto) : o.produto.slice(0, 80)}*\n`
    + `${o.preco_anterior > o.preco_atual ? `~${brl(o.preco_anterior)}~ por ` : ''}*${brl(o.preco_atual)}*${o.desconto_pct ? ` (-${o.desconto_pct}%)` : ''}\n${social.postLink(o, s)}`).join('\n\n');
  return `🔔 *Ofertou!* — achamos ${ofertas.length > 1 ? 'ofertas' : 'uma oferta'} de *"${termo}"* para você:\n\n${itens}\n\n`
    + `_Confira o preço na loja antes de comprar._${site ? `\nPara mudar os termos ou parar de receber: ${site}/?alertas=1` : '\nPara parar de receber, desative em Ofertou! → Alertas no WhatsApp.'}`;
}

// Quanto a oferta é mesmo do produto pedido: o termo no começo do nome vale mais; "capa para iphone", "mouse para
// notebook" (acessório) não conta. nome = texto normalizado com espaços nas pontas.
const ACESSORIO = /\b(para|pra|p|compativel com|compativeis com|compativel|capa|capinha|case|pelicula|suporte|carregador|cabo|adaptador|refil) $/;
function relevancia(nome, palavras) {
  const i = nome.indexOf(` ${palavras[0]}`);
  if (i < 0) return -1;
  if (ACESSORIO.test(nome.slice(0, i + 1))) return -1;
  const posicao = nome.slice(0, i).trim().split(' ').filter(Boolean).length; // quantas palavras antes do termo
  return posicao === 0 ? 3 : posicao <= 2 ? 2 : posicao <= 5 ? 1 : 0;
}

let rodando = false;
async function rodada({ ignorarHorario = false } = {}) {
  if (rodando || !disponivel()) return { enviados: 0 };
  const h = horaBrasilia();
  if (!ignorarHorario && (h < 8 || h >= 22)) return { enviados: 0, fora_do_horario: true };
  rodando = true;
  const s = settings.getAll();
  const ate = agoraSql();
  const desde = s.alertas_wa_ultimo || new Date(Date.now() - 30 * 60000).toISOString().replace('T', ' ').slice(0, 19);
  let enviados = 0;
  try {
    const { activeClause } = require('./offers');
    const ac = activeClause();
    const novas = db.all(`SELECT o.* FROM offers o WHERE ${ac.sql} AND o.created_at > ? AND o.created_at <= ? ORDER BY o.desconto_pct DESC LIMIT 3000`, ...ac.params, desde, ate)
      .map(o => ({ ...o, _n: ` ${norm(o.produto)} ` }));
    if (novas.length) {
      const pessoas = db.all(`SELECT a.*, u.telefone FROM alertas_whatsapp a JOIN users u ON u.id = a.user_id
        WHERE a.ativo = 1 AND u.status = 'active' AND length(u.telefone) >= 10 ORDER BY a.updated_at`);
      for (const a of pessoas) {
        if (enviados >= ENVIOS_POR_RODADA) break;
        const hoje = db.get('SELECT COUNT(*) n FROM alertas_enviados WHERE user_id = ? AND created_at >= ?', a.user_id, inicioDoDia()).n;
        if (hoje >= a.max_dia) continue;
        let termos = [];
        try { termos = JSON.parse(a.termos); } catch { continue; }
        const ja = new Set(db.all(`SELECT ofertas FROM alertas_enviados WHERE user_id = ? AND created_at >= datetime('now', '-3 days')`, a.user_id)
          .flatMap(r => r.ofertas.split(',')).map(Number));
        // Primeiro termo com oferta nova: todas as palavras dele aparecem no nome do produto
        let escolha = null;
        for (const termo of termos) {
          const palavras = norm(termo).split(' ').filter(Boolean);
          const achadas = novas
            .filter(o => !ja.has(o.id) && o.desconto_pct >= a.desconto_min && palavras.every(p => o._n.includes(` ${p}`)))
            .map(o => ({ o, nota: relevancia(o._n, palavras) })).filter(x => x.nota >= 0)
            .sort((x, y) => y.nota - x.nota || y.o.desconto_pct - x.o.desconto_pct).map(x => x.o);
          if (achadas.length) { escolha = { termo, ofertas: achadas.slice(0, OFERTAS_POR_MSG) }; break; }
        }
        if (!escolha) continue;
        const numero = `55${String(a.telefone).replace(/\D/g, '')}`;
        try {
          await require('./whatsapp').enviar(s, numero, { texto: mensagem(escolha.termo, escolha.ofertas, s) });
          db.run('INSERT INTO alertas_enviados (user_id, ofertas, termo) VALUES (?, ?, ?)', a.user_id, escolha.ofertas.map(o => o.id).join(','), escolha.termo);
          db.run('UPDATE alertas_whatsapp SET falhas = 0 WHERE user_id = ?', a.user_id);
          enviados++;
        } catch (err) {
          console.error('[ALERTAS WHATSAPP]', a.user_id, err.message);
          db.run('UPDATE alertas_whatsapp SET falhas = falhas + 1 WHERE user_id = ?', a.user_id);
          // Número que não recebe (sem WhatsApp, errado): depois de 3 falhas seguidas, pausa e avisa no sino
          if ((a.falhas || 0) + 1 >= 3) {
            db.run('UPDATE alertas_whatsapp SET ativo = 0 WHERE user_id = ?', a.user_id);
            try {
              require('./notificacoes').criar(`u:${a.user_id}`, { tipo: 'alerta', titulo: 'Alertas no WhatsApp pausados',
                texto: 'Não conseguimos enviar as ofertas para o seu WhatsApp. Confira o celular em Meus dados e ative de novo.', link: '/?alertas=1' });
            } catch { /* sem sino */ }
          }
        }
        await espera(PAUSA_ENTRE_ENVIOS_MS);
      }
    }
    settings.set('alertas_wa_ultimo', ate);
  } catch (err) {
    console.error('[ALERTAS WHATSAPP]', err.message);
  } finally { rodando = false; }
  return { enviados };
}

function iniciar() {
  setTimeout(() => rodada().catch(() => {}), 60 * 1000);
  setInterval(() => rodada().catch(() => {}), 10 * 60 * 1000);
}

// Painel: quantas pessoas pediram e quantas mensagens saíram hoje
function resumo() {
  return {
    ativo: settings.get('alertas_wa_ativo') === '1',
    disponivel: disponivel(),
    pessoas: db.get('SELECT COUNT(*) n FROM alertas_whatsapp WHERE ativo = 1').n,
    enviados_hoje: db.get('SELECT COUNT(*) n FROM alertas_enviados WHERE created_at >= ?', inicioDoDia()).n,
  };
}

module.exports = { deUsuario, salvar, rodada, iniciar, resumo, disponivel, mensagem, norm };
