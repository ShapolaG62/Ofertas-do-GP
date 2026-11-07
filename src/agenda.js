// Postagens agendadas: nos horários do painel (padrão 09:00, 14:00 e 20:00, horário de Brasília) publica
// algumas ofertas (padrão 5) nas redes escolhidas — primeiro as da fila, depois as melhores do momento.
// Cada dono tem a sua agenda: o site (admin, cid = null) e cada cliente da ferramenta (cid = id do cliente),
// com a própria fila, os próprios canais e os próprios links de afiliado.
const db = require('./db');
const settings = require('./settings');
const offers = require('./offers');
const social = require('./social');
const clientes = require('./clientes');
const whatsapp = require('./whatsapp');
const precoNaHora = require('./preco-na-hora');
const avisos = require('./envio-avisos');

// Grupos escolhidos para cada oferta da fila: { grupos, por_tipo } (vazio = os grupos salvos no painel)
if (!db.all('PRAGMA table_info(post_queue)').some(c => c.name === 'destino')) db.db.exec('ALTER TABLE post_queue ADD COLUMN destino TEXT');
const lerDestino = v => { try { return v ? JSON.parse(v) : null; } catch { return null; } };

let timer = null;
let pausaEntreOfertas = true; // os testes desligam a pausa
const rodando = new Set();          // donos com rodada em andamento ('site' ou id do cliente)
const ultimaExecucao = new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = msg => console.log(`[AGENDA] ${msg}`);
const dono = cid => (cid ? Number(cid) : 'site');
const configDe = cid => (cid ? clientes.config(cid) : settings.getAll());

// Data e hora em Brasília (UTC-3, sem horário de verão desde 2019).
function agoraBrasilia() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return { dia: d.toISOString().slice(0, 10), minutos: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function horarios(s = settings.getAll()) {
  return String(s.agenda_horarios || '')
    .split(/[,;\s]+/)
    .map(h => h.match(/^(\d{1,2}):(\d{2})$/))
    .filter(m => m && Number(m[1]) < 24 && Number(m[2]) < 60)
    .map(m => `${m[1].padStart(2, '0')}:${m[2]}`)
    .filter((h, i, a) => a.indexOf(h) === i)
    .sort();
}

function redesAgenda(s = settings.getAll()) {
  try { const r = JSON.parse(s.agenda_redes || '[]'); return Array.isArray(r) ? r.filter(id => social.REDES[id]) : []; } catch { return []; }
}

// Horários que já rodaram hoje (do site em settings; de cada cliente em cliente_config).
function lerFeitas(cid) {
  const raw = cid ? db.get(`SELECT value FROM cliente_config WHERE cliente_id = ? AND key = 'agenda_ultimas'`, cid)?.value : settings.get('agenda_ultimas');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
function gravarFeitas(cid, feitas) {
  if (!cid) return settings.set('agenda_ultimas', JSON.stringify(feitas));
  db.run(`INSERT INTO cliente_config (cliente_id, key, value) VALUES (?, 'agenda_ultimas', ?)
          ON CONFLICT(cliente_id, key) DO UPDATE SET value = excluded.value`, cid, JSON.stringify(feitas));
}

// ── Fila ─────────────────────────────────────────────────────────────────────
function enfileirar(itens, autor, cid = null) {
  let n = 0;
  for (const it of itens.slice(0, 200)) {
    const id = Number(it.offer_id);
    if (!Number.isInteger(id) || id <= 0 || !db.get('SELECT 1 FROM offers WHERE id = ?', id)) continue;
    // Não duplica uma oferta que já está esperando: atualiza o texto.
    const ja = db.get(`SELECT id FROM post_queue WHERE offer_id = ? AND status = 'pendente' AND cliente_id IS ?`, id, cid);
    const texto = String(it.texto || '').trim().slice(0, 4000) || null;
    const destino = it.destino ? JSON.stringify(it.destino) : null;
    const prioridade = it.prioridade ? 1 : 0;
    if (ja) db.run('UPDATE post_queue SET texto = ?, autor = ?, destino = ?, prioridade = MAX(prioridade, ?) WHERE id = ?', texto, autor, destino, prioridade, ja.id);
    else db.run('INSERT INTO post_queue (offer_id, texto, autor, cliente_id, destino, prioridade) VALUES (?, ?, ?, ?, ?, ?)', id, texto, autor, cid, destino, prioridade);
    n++;
  }
  return n;
}

function listarFila(cid = null, limit = 200) {
  return db.all(
    `SELECT q.*, o.produto, o.preco_atual, o.desconto_pct FROM post_queue q LEFT JOIN offers o ON o.id = q.offer_id
     WHERE q.cliente_id IS ?
     ORDER BY CASE q.status WHEN 'pendente' THEN 0 ELSE 1 END, CASE q.status WHEN 'pendente' THEN -q.prioridade ELSE 0 END, CASE q.status WHEN 'pendente' THEN q.id ELSE -q.id END LIMIT ?`, cid, limit);
}
const removerDaFila = (id, cid = null) => db.run(`DELETE FROM post_queue WHERE id = ? AND status = 'pendente' AND cliente_id IS ?`, id, cid);
const limparFila = (cid = null) => db.run(`DELETE FROM post_queue WHERE status = 'pendente' AND cliente_id IS ?`, cid).changes;
const pendentes = (cid = null) => db.get(`SELECT COUNT(*) AS n FROM post_queue WHERE status = 'pendente' AND cliente_id IS ?`, cid).n;

// Filtros das ofertas automáticas (Painel → Redes sociais → Agendamento): lojas escolhidas, palavras que nunca
// entram (ex.: capinha, película) e, se preenchidas, palavras obrigatórias (só entra o que tiver pelo menos uma).
const semAcento = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const listaPalavras = v => String(v || '').split(/[,;\n]+/).map(semAcento).map(x => x.trim()).filter(Boolean);
function filtroDoDono(s) {
  const lojas = String(s.agenda_lojas || '').split(/[,;\s]+/).filter(Boolean);
  const bloqueadas = listaPalavras(s.agenda_palavras_bloqueadas);
  const permitidas = listaPalavras(s.agenda_palavras_permitidas);
  return o => {
    if (lojas.length && !lojas.includes(o.store_id)) return false;
    const nome = semAcento(o.produto);
    if (bloqueadas.some(w => nome.includes(w))) return false;
    if (permitidas.length && !permitidas.some(w => nome.includes(w))) return false;
    return true;
  };
}

// Repetição: o mesmo produto (mesmo por outro vendedor) não volta em 7 dias, a não ser que o preço tenha caído de verdade:
// pelo menos 10% abaixo do menor preço postado na semana e depois de 24 horas da última postagem.
const QUEDA_PARA_REPOSTAR = 0.9;
const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'por', 'em', 'a', 'o', 'as', 'os', 'kit', 'novo', 'original']);
// Mesmo produto com outro título ou vendedor: as 6 primeiras palavras que importam, em qualquer ordem
function impressaoDoProduto(nome) {
  const palavras = semAcento(nome).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(p => p && !PALAVRAS_VAZIAS.has(p)).slice(0, 6);
  return [...new Set(palavras)].sort().join(' ');
}
// relampago: a oferta relâmpago não espera as 24 horas, mas precisa estar pelo menos 10% abaixo do menor preço postado
function regraDeRepeticao(cid, { relampago = false } = {}) {
  const porId = new Map(), porNome = new Map();
  const juntar = (mapa, chave, p) => {
    const atual = mapa.get(chave) || { menor: null, semPreco: false, ultima: 0 };
    const preco = Number(p.preco);
    if (preco > 0) atual.menor = atual.menor === null ? preco : Math.min(atual.menor, preco);
    else atual.semPreco = true; // postagem antiga, de antes de guardar o preço
    atual.ultima = Math.max(atual.ultima, Date.parse(`${String(p.created_at).replace(' ', 'T')}Z`) || 0);
    mapa.set(chave, atual);
  };
  for (const p of db.all(`SELECT offer_id, produto, preco, created_at FROM social_posts WHERE ok = 1 AND cliente_id IS ? AND created_at > datetime('now', '-7 days')`, cid)) {
    juntar(porId, p.offer_id, p);
    juntar(porNome, impressaoDoProduto(p.produto), p);
  }
  const bloqueia = (reg, o) => {
    if (!reg) return false;
    if (reg.semPreco || reg.menor === null || (!relampago && Date.now() - reg.ultima < 24 * 3600000)) return true;
    return !(Number(o.preco_atual) <= reg.menor * QUEDA_PARA_REPOSTAR);
  };
  return { porOferta: o => bloqueia(porId.get(o.id), o), porProduto: o => bloqueia(porNome.get(impressaoDoProduto(o.produto)), o) };
}

// Melhores ofertas do momento: as de maior nota (chance de venda + comissão extra, sem descontos suspeitos), categorias
// variadas, sem repetir produto (regra acima), respeitando os filtros do dono. Para o afiliado, só das lojas em que ele já
// tem link de afiliado (postar das outras não rende comissão).
// Grupos por tipo e loja: cada grupo com escolha tem a vez de receber a melhor oferta dele. soTemas: nada que nenhum grupo
// receba (quando o WhatsApp é a única rede). girar: passa a vez para o próximo grupo.
const vezDoTema = new Map();
function melhoresOfertas(qtd, excluir, cid = null, s = configDe(cid), { soTemas = false, girar = false } = {}) {
  const passa = filtroDoDono(s);
  const repeticao = regraDeRepeticao(cid);
  const grupos = whatsapp.gruposEscolhidos(s);
  const comTema = grupos.filter(g => g.categorias.length || g.lojas.length);
  const soDosGrupos = soTemas && grupos.length && comTema.length === grupos.length;
  const pagas = cid ? new Set(clientes.lojasComAfiliado(s)) : null;
  const limite = Date.now() - 12 * 3600000;
  let rows = require('./busca-ofertas').paraPostar(o => !repeticao.porOferta(o) && !excluir.has(o.id) && passa(o)
    && (!soDosGrupos || grupos.some(g => whatsapp.grupoRecebe(g, o.categoria, o.store_id))) && Date.parse(`${String(o.last_seen_at).replace(' ', 'T')}Z`) > limite && (!pagas?.size || pagas.has(o.store_id))).slice(0, 1500);
  // Só com foto pública (a postagem sai com a imagem)
  const comFoto = new Set();
  for (let i = 0; i < rows.length; i += 500) {
    const ids = rows.slice(i, i + 500).map(r => r.id);
    for (const r of db.all(`SELECT id FROM offers WHERE id IN (${ids.map(() => '?').join(',')}) AND imagem LIKE 'https://%'`, ...ids)) comFoto.add(r.id);
  }
  rows = rows.filter(r => comFoto.has(r.id));
  const vistos = new Set(); // o mesmo produto de vendedores diferentes entra uma vez só
  rows = rows.filter(r => {
    const k = impressaoDoProduto(r.produto);
    if (vistos.has(k) || repeticao.porProduto(r)) return false;
    vistos.add(k);
    return true;
  });
  const out = [], cats = new Set();
  if (comTema.length) {             // cada grupo com tema, na sua vez
    const inicio = vezDoTema.get(dono(cid)) || 0;
    if (girar) vezDoTema.set(dono(cid), inicio + 1);
    for (let i = 0; i < comTema.length && out.length < qtd; i++) {
      const g = comTema[(inicio + i) % comTema.length];
      const r = rows.find(x => whatsapp.grupoRecebe(g, x.categoria, x.store_id) && !out.includes(x.id) && offers.isActive(x.id));
      if (r) { out.push(r.id); cats.add(r.categoria); }
    }
  }
  for (const r of rows) {           // primeiro uma por categoria
    if (out.length >= qtd) break;
    if (cats.has(r.categoria) || out.includes(r.id) || !offers.isActive(r.id)) continue;
    cats.add(r.categoria); out.push(r.id);
  }
  for (const r of rows) {           // completa se faltar
    if (out.length >= qtd) break;
    if (!out.includes(r.id) && offers.isActive(r.id)) out.push(r.id);
  }
  return out;
}

// ── Execução ─────────────────────────────────────────────────────────────────
async function executar(motivo = 'agendado', cid = null, qtdForcada = null, { soRelampago = false } = {}) {
  const d = dono(cid);
  if (rodando.has(d)) return { erro: 'Já existe uma postagem agendada em andamento.' };
  const s = configDe(cid);
  const prontas = redesAgenda(s).filter(id => !social.REDES[id].pronta(s));
  if (!prontas.length) {
    const erro = 'Nenhuma rede do agendamento está configurada.';
    if (motivo !== 'manual') avisos.avisar(cid, { tipo: 'sem-rede', titulo: 'As postagens agendadas não saíram', texto: `${erro} Confira as redes e os grupos no painel.` });
    return { erro };
  }
  rodando.add(d);
  const qtd = qtdForcada || Math.min(Math.max(parseInt(s.agenda_qtd, 10) || 5, 1), 20);
  const intervalo = prontas.includes('whatsapp') ? Math.min(Math.max(Number(s.whatsapp_intervalo_s) || 90, 20), 900) * 1000 : 5000;
  const feitos = [];
  let conferidos = 0;
  const pulados = [];
  const quem = cid ? `cliente ${cid}` : 'site';
  const soWhatsapp = prontas.length === 1 && prontas[0] === 'whatsapp';
  try {
    // 1) fila (pula ofertas que saíram do ar); 2) completa com as melhores ofertas do momento
    const fila = db.all(`SELECT * FROM post_queue WHERE status = 'pendente' AND cliente_id IS ? ${soRelampago ? 'AND prioridade = 1' : ''} ORDER BY prioridade DESC, id`, cid);
    const usadas = new Set(fila.map(q => q.offer_id));
    let posFila = 0;
    let candidatas = null;
    const proxima = () => {
      while (posFila < fila.length) {
        const q = fila[posFila++];
        if (q.prioridade && !require('./relampago').estaAtiva(q.offer_id)) {
          db.run(`UPDATE post_queue SET status = 'expirado', resultado = 'A oferta relâmpago terminou antes de ser postada.' WHERE id = ?`, q.id);
          continue;
        }
        if (!offers.isActive(q.offer_id)) {
          db.run(`UPDATE post_queue SET status = 'expirado', resultado = 'Oferta saiu do ar antes de ser postada.' WHERE id = ?`, q.id);
          continue;
        }
        // Antes de postar: oferta automática precisa ter o preço conferido na loja nas últimas 24 h
        const v = db.get("SELECT fonte, last_seen_at < datetime('now', '-24 hours') AS velha FROM offers WHERE id = ?", q.offer_id);
        if (v && v.fonte === 'auto' && v.velha) {
          db.run(`UPDATE post_queue SET status = 'expirado', resultado = 'Preço não conferido na loja nas últimas 24 h (pode ter mudado).' WHERE id = ?`, q.id);
          continue;
        }
        return { fila: q.id, offer_id: q.offer_id, texto: q.texto, destino: lerDestino(q.destino), relampago: Boolean(q.prioridade) };
      }
      if (soRelampago || s.agenda_completar === '0') return null;
      // Pega algumas a mais: as que tiverem mudado de preço na loja dão lugar à seguinte
      if (!candidatas) {
        const faltam = qtd - feitos.length;
        candidatas = melhoresOfertas(faltam * 3 + 5, usadas, cid, s, { soTemas: soWhatsapp, girar: true }).map(id => ({ offer_id: id, texto: null }));
      }
      return candidatas.shift() || null;
    };
    const temMais = () => posFila < fila.length || (!soRelampago && s.agenda_completar !== '0' && (candidatas === null || candidatas.length > 0));
    const descartar = (it, motivoPulo) => {
      if (it.fila) db.run(`UPDATE post_queue SET status = 'expirado', resultado = ? WHERE id = ?`, motivoPulo, it.fila);
      pulados.push({ offer_id: it.offer_id, motivo: motivoPulo });
    };
    log(`${quem} — ${motivo}: até ${qtd} oferta(s) em ${prontas.join(', ')}`);

    let it;
    while (feitos.length < qtd && (it = proxima())) {
      const alvo = db.get('SELECT categoria, store_id FROM offers WHERE id = ?', it.offer_id) || {};
      const sItem = it.destino?.grupos?.length ? whatsapp.comDestinos(s, it.destino.grupos, it.destino.por_tipo !== false) : s;
      const redes = prontas.filter(id => id !== 'whatsapp' || whatsapp.gruposDaOferta(sItem, alvo.categoria, alvo.store_id).length);
      if (!redes.length) { descartar(it, 'Nenhum grupo de destino recebe ofertas deste tipo e desta loja.'); continue; }
      const conferencia = await precoNaHora.conferir(it.offer_id);
      if (conferencia.acao === 'pular') { descartar(it, conferencia.motivo); continue; }
      if (conferencia.situacao !== 'sem_checagem') conferidos++;
      const o = db.get('SELECT * FROM offers WHERE id = ?', it.offer_id);
      // Texto da fila com o preço antigo: refaz pelo modelo, com o preço de agora
      if (it.texto && conferencia.precoAntigo && it.texto.includes(Number(conferencia.precoAntigo).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))) it.texto = null;
      const link = cid ? await clientes.linkParaPostar(cid, o, s) : null; // cliente: link de afiliado dele
      if (link) o.__link = link;
      if (!it.texto) o.__link = await require('./encurtador').curto(social.postLink(o, s)); // link curto no post
      const texto = it.texto || (it.relampago ? require('./relampago').textoDaPostagem(o, s) : social.textoPadrao(o, s));
      let resultados;
      try { resultados = await social.publicar(it.offer_id, redes, texto, `agenda (${motivo})`, cid ? { s: sItem, clienteId: cid, link } : { s: sItem }); }
      catch (err) { resultados = [{ rede: '-', ok: false, mensagem: err.message }]; }
      const ok = resultados.some(r => r.ok);
      const resumo = resultados.map(r => `${social.REDES[r.rede]?.nome || r.rede}: ${r.ok ? 'ok' : r.mensagem}`).join(' | ');
      if (it.fila) db.run(`UPDATE post_queue SET status = ?, resultado = ?, posted_at = datetime('now') WHERE id = ?`, ok ? 'postado' : 'erro', resumo, it.fila);
      feitos.push({ offer_id: it.offer_id, produto: o.produto, ok, resumo });
      if (pausaEntreOfertas && feitos.length < qtd && temMais()) await sleep(intervalo);
    }
  } finally {
    rodando.delete(d);
  }
  const r = { em: new Date().toISOString(), motivo, feitos, conferidos, pulados };
  ultimaExecucao.set(d, r);
  log(`${quem} — concluído: ${feitos.filter(f => f.ok).length} de ${feitos.length} publicadas, ${conferidos} com preço conferido na hora, ${pulados.length} puladas`);
  avisos.avaliarRodada(cid, feitos);
  if (!feitos.length && motivo !== 'manual' && !soRelampago) {
    avisos.avisar(cid, { tipo: 'sem-ofertas', titulo: 'Rodada de postagens sem nenhuma oferta', texto: 'Nenhuma oferta passou pelos filtros, temas e pela regra de repetição. Confira o agendamento no painel.' });
  }
  return r;
}

// Confere a cada minuto se chegou a hora de cada dono (site e clientes com acesso válido); cada horário roda
// uma vez por dia (até 2 horas de atraso, caso o computador estivesse desligado na hora).
// Modo contínuo: entre o início e o fim do dia, uma rodada pequena (agenda_por_vez) a cada X a Y minutos, com
// intervalo sorteado a cada vez (ritmo de gente, não de robô).
const proximoContinuo = new Map(); // dono → hora (ms) do próximo envio
const hhmm = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function sortearIntervalo(s) {
  const a = Math.min(Math.max(parseInt(s.agenda_intervalo_min, 10) || 20, 5), 720);
  const b = Math.max(a, Math.min(parseInt(s.agenda_intervalo_max, 10) || a, 720));
  return (a + Math.random() * (b - a)) * 60000;
}
function verificarContinuo(cid, s) {
  const { minutos } = agoraBrasilia();
  const ini = hhmm(s.agenda_inicio) ?? 8 * 60, fim = hhmm(s.agenda_fim) ?? 22 * 60;
  const dentro = ini <= fim ? minutos >= ini && minutos < fim : minutos >= ini || minutos < fim; // fim depois da meia-noite
  const d = dono(cid);
  if (!dentro) { proximoContinuo.delete(d); return; }
  const prox = proximoContinuo.get(d);
  if (prox === undefined) { proximoContinuo.set(d, Date.now() + Math.random() * 60000); return; } // começa no 1º minuto
  if (Date.now() < prox) return;
  proximoContinuo.set(d, Date.now() + sortearIntervalo(s));
  const porVez = Math.min(Math.max(parseInt(s.agenda_por_vez, 10) || 1, 1), 5);
  executar('modo contínuo', cid, porVez).catch(err => log(`erro: ${err.message}`));
}

// Lista de cupons: cada horário roda uma vez por dia, ligada ou não ao agendamento das ofertas
function verificarCupons(cid, s) {
  if (s.agenda_cupons_ativa !== '1') return;
  const { dia, minutos } = agoraBrasilia();
  const feitas = lerFeitas(cid);
  for (const h of horarios({ agenda_horarios: s.agenda_cupons_horarios })) {
    const [hh, mm] = h.split(':').map(Number);
    const alvo = hh * 60 + mm, chave = `cupons ${h}`;
    if (minutos < alvo || minutos > alvo + 120 || feitas[chave] === dia) continue;
    feitas[chave] = dia;
    gravarFeitas(cid, feitas);
    require('./lista-cupons').postar(cid, `horário ${h}`).then(r => {
      log(`cupons (${cid ? `cliente ${cid}` : 'site'}): ${r.enviados} grupo(s), ${r.falhas.length} com falha`);
      if (r.falhas.length) avisos.avisar(cid, { tipo: 'cupons', titulo: 'A lista de cupons falhou em alguns grupos', texto: r.falhas.map(f => `${f.grupo}: ${f.erro}`).join('; ').slice(0, 500) });
    }).catch(err => {
      log(`cupons: ${err.message}`);
      avisos.avisar(cid, { tipo: 'cupons', titulo: 'A lista de cupons não saiu', texto: err.message });
    });
    break;
  }
}

function verificarDono(cid) {
  const s = configDe(cid);
  verificarCupons(cid, s);
  if (s.agenda_ativa !== '1' || rodando.has(dono(cid))) return;
  if (s.agenda_modo === 'continuo') return verificarContinuo(cid, s);
  const { dia, minutos } = agoraBrasilia();
  const feitas = lerFeitas(cid);
  for (const h of horarios(s)) {
    const [hh, mm] = h.split(':').map(Number);
    const alvo = hh * 60 + mm;
    if (minutos < alvo || minutos > alvo + 120 || feitas[h] === dia) continue;
    feitas[h] = dia;
    gravarFeitas(cid, feitas);
    executar(`horário ${h}`, cid).catch(err => log(`erro: ${err.message}`));
    break;
  }
}

function verificar() {
  verificarDono(null);
  for (const c of db.all(`SELECT id FROM clientes WHERE status = 'ativo' AND validade >= datetime('now')`)) verificarDono(c.id);
}

function iniciar() {
  require('./envio-grupos').iniciar();
  avisos.iniciar();
  clearInterval(timer);
  timer = setInterval(verificar, 60 * 1000);
  setTimeout(verificar, 15 * 1000);
}

function estado(cid = null) {
  const s = configDe(cid);
  const { dia, minutos } = agoraBrasilia();
  const feitas = lerFeitas(cid);
  const lista = horarios(s);
  const proximo = lista.find(h => { const [a, b] = h.split(':').map(Number); return a * 60 + b > minutos && feitas[h] !== dia; }) || lista[0] || null;
  const continuo = s.agenda_modo === 'continuo';
  const prox = proximoContinuo.get(dono(cid));
  const proxTxt = prox ? new Date(prox - 3 * 3600 * 1000).toISOString().slice(11, 16) : null;
  return {
    ativa: s.agenda_ativa === '1', modo: continuo ? 'continuo' : 'horarios',
    horarios: continuo ? [`${s.agenda_inicio || '08:00'}–${s.agenda_fim || '22:00'}, a cada ${s.agenda_intervalo_min || 20}–${s.agenda_intervalo_max || 40} min`] : lista,
    proximo: continuo ? proxTxt : proximo, rodando: rodando.has(dono(cid)), pendentes: pendentes(cid),
    ultimaExecucao: ultimaExecucao.get(dono(cid)) || null, redes: redesAgenda(s), problema: avisos.problema(cid),
  };
}

// Só para os testes
const _paraTestes = ({ pausa } = {}) => { if (pausa !== undefined) pausaEntreOfertas = pausa; };

module.exports = { regraDeRepeticao, redesAgenda, _paraTestes, impressaoDoProduto, enfileirar, listarFila, removerDaFila, limparFila, pendentes, executar, iniciar, estado, horarios, melhoresOfertas, filtroDoDono };
