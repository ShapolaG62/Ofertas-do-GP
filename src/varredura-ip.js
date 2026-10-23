// Varredura de IP (Painel → Acessos suspeitos): procura contas usadas em lugares diferentes do Brasil em pouco tempo,
// sinal de login emprestado, compartilhado ou revendido (Termos do Parceiro, item 6-A) ou de conta invadida.
// Usa os registros de acesso do Marco Civil (src/registro-acesso.js: um por pessoa e IP a cada 30 min e cada login)
// e a localização aproximada dos IPs (src/geoip.js).
const db = require('./db');
const geoip = require('./geoip');
const settings = require('./settings');

// Contas dispensadas pelo admin (botão "Dispensar"): { dono: 'AAAA-MM-DD HH:MM:SS' }. Os acessos até esse momento
// deixam de contar; a conta só volta à lista se tiver acessos distantes de novo depois disso.
const lerDispensados = () => { try { return JSON.parse(settings.get('acessos_dispensados') || '{}') || {}; } catch { return {}; } };
const agoraSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
function dispensar(dono) {
  const d = lerDispensados();
  d[String(dono)] = agoraSql();
  settings.set('acessos_dispensados', JSON.stringify(d));
}
// O número vermelho do menu conta só as contas de risco alto com ocorrência nova desde a última vez que a aba foi aberta
function marcarVisto() { settings.set('acessos_visto_em', agoraSql()); }
function novosAltos() {
  const visto = settings.get('acessos_visto_em') || '';
  return varrer({ horas: 24 }).contas.filter(c => c.gravidade === 'alta' && c.ultima_ocorrencia > visto).length;
}

const VELOCIDADE_IMPOSSIVEL = 900; // km/h: mais rápido que um avião comercial
const MAX_LINHAS = 200000;

function quem(dono) {
  if (dono === 'admin') return { nome: 'Administrador (painel)', email: '', tipo: 'admin' };
  const m = /^([uc]):(\d+)$/.exec(dono || '');
  if (!m) return { nome: dono, email: '', tipo: '' };
  const r = m[1] === 'u'
    ? db.get('SELECT id, nome, email, tipo, status FROM users WHERE id = ?', Number(m[2]))
    : db.get('SELECT id, nome, email, status FROM clientes WHERE id = ?', Number(m[2]));
  if (!r) return { nome: '(conta excluída)', email: '', tipo: '' };
  return { id: r.id, nome: r.nome || r.email, email: r.email, tipo: m[1] === 'u' ? r.tipo : 'ferramenta', status: r.status, cliente: m[1] === 'c' };
}

const ponto = r => { const g = geoip.localizar(r.ip); return { ip: r.ip, em: r.created_at, evento: r.evento, navegador: r.navegador, geo: g, texto: g?.texto || 'Local desconhecido' }; };
const minutosEntre = (a, b) => (new Date(b.em.replace(' ', 'T') + 'Z') - new Date(a.em.replace(' ', 'T') + 'Z')) / 60000;

// horas: período analisado · km: distância mínima entre os lugares · maxHoras: tempo máximo entre os dois acessos
function varrer({ horas = 168, km = 300, maxHoras = 3 } = {}) {
  horas = Math.min(24 * 180, Math.max(1, Number(horas) || 168));
  km = Math.min(5000, Math.max(20, Number(km) || 300));
  maxHoras = Math.min(72, Math.max(0.25, Number(maxHoras) || 3));
  const geo = geoip.info();
  const linhas = db.all(`SELECT dono, ip, evento, navegador, created_at FROM registros_acesso
    WHERE dono IS NOT NULL AND created_at >= datetime('now', ?) ORDER BY dono, created_at LIMIT ?`, `-${Math.round(horas * 60)} minutes`, MAX_LINHAS);

  const contas = [];
  const dispensados = lerDispensados();
  let i = 0;
  while (i < linhas.length) {
    const dono = linhas[i].dono;
    const meus = [];
    while (i < linhas.length && linhas[i].dono === dono) {
      if (!dispensados[dono] || linhas[i].created_at > dispensados[dono]) meus.push(linhas[i]);
      i++;
    }
    if (!meus.length) continue;
    const pontos = meus.map(ponto);
    const ocorrencias = [];
    const lugares = new Map(); // texto → vezes
    let ultimo = null, alternancias = 0, maxVel = 0;
    const seq = []; // sequência de lugares diferentes (para contar idas e voltas A → B → A)
    for (const p of pontos) {
      const chave = p.geo?.pais === 'BR' ? p.texto : p.geo?.pais ? `País ${p.geo.pais}` : null;
      if (chave) {
        lugares.set(chave, (lugares.get(chave) || 0) + 1);
        if (seq.at(-1) !== chave) { if (seq.at(-2) === chave) alternancias++; seq.push(chave); }
      }
      if (!p.geo || p.geo.local) continue;
      if (ultimo && ultimo.ip !== p.ip) {
        const min = minutosEntre(ultimo, p);
        if (min <= maxHoras * 60) {
          const d = geoip.distancia(ultimo.geo, p.geo);
          const outroPais = ultimo.geo.pais && p.geo.pais && ultimo.geo.pais !== p.geo.pais;
          if ((d != null && d >= km) || outroPais) {
            const vel = d != null ? d / Math.max(min / 60, 1 / 60) : null;
            if (vel) maxVel = Math.max(maxVel, vel);
            ocorrencias.push({ de: ultimo, para: p, km: d != null ? Math.round(d) : null, minutos: Math.round(min), velocidade: vel ? Math.round(vel) : null, outro_pais: Boolean(outroPais) });
          }
        }
      }
      ultimo = p;
    }
    if (!ocorrencias.length) continue;
    const impossivel = ocorrencias.some(o => o.outro_pais && o.minutos <= 120) || maxVel >= VELOCIDADE_IMPOSSIVEL;
    // Alto: viagem impossível repetida, ou idas e voltas entre os mesmos lugares (duas pessoas usando ao mesmo tempo)
    const gravidade = (impossivel && (ocorrencias.length >= 2 || alternancias >= 1)) || (alternancias >= 2 && ocorrencias.length >= 3) ? 'alta'
      : impossivel || alternancias >= 1 || ocorrencias.length >= 2 ? 'media' : 'baixa';
    contas.push({
      dono, ...quem(dono), gravidade, ocorrencias: ocorrencias.length, alternancias, velocidade_max: Math.round(maxVel) || null,
      lugares: [...lugares.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => ({ lugar: l, vezes: n })),
      ips: new Set(meus.map(r => r.ip)).size, ultimo_acesso: meus.at(-1).created_at, ultima_ocorrencia: ocorrencias.at(-1).para.em,
      exemplos: ocorrencias.slice(-5).reverse().map(o => ({ ...o, de: resumo(o.de), para: resumo(o.para) })),
    });
  }
  const ordem = { alta: 0, media: 1, baixa: 2 };
  contas.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || b.ocorrencias - a.ocorrencias);
  return { geo, parametros: { horas, km, max_horas: maxHoras }, analisados: linhas.length, limite: linhas.length >= MAX_LINHAS, contas };
}
const resumo = p => ({ ip: p.ip, em: p.em, texto: p.texto });

// Histórico de acessos de uma conta, com o lugar de cada um
function historico(dono, horas = 720) {
  const h = Math.min(24 * 180, Math.max(1, Number(horas) || 720));
  const linhas = db.all(`SELECT dono, ip, evento, navegador, created_at FROM registros_acesso WHERE dono = ? AND created_at >= datetime('now', ?)
    ORDER BY created_at DESC, id DESC LIMIT 500`, String(dono || ''), `-${h} hours`);
  return { dono, ...quem(dono), acessos: linhas.map(r => { const p = ponto(r); return { ...resumo(p), evento: p.evento, navegador: p.navegador }; }) };
}

module.exports = { varrer, historico, quem, dispensar, marcarVisto, novosAltos };
