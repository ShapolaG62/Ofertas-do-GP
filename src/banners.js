// Publicidade no site: espaços (slots), campanhas de empresas, contagem de visualizações/cliques
// e pedidos de contato de quem quer anunciar.
const db = require('./db');
const { assertPublicUrl } = require('./net');

// Espaços disponíveis e o tamanho recomendado da arte (largura x altura, em pixels).
const ESPACOS = {
  topo: { nome: 'Topo da página inicial', tamanho: '1200 x 200', mobile: '600 x 300' },
  meio: { nome: 'Meio da lista de ofertas', tamanho: '1200 x 150', mobile: '600 x 300' },
  lateral: { nome: 'Acima dos filtros (computador)', tamanho: '300 x 300', mobile: null },
  paginas: { nome: 'Páginas de loja e de anúncio', tamanho: '1200 x 200', mobile: '600 x 300' },
};

const LOCAL_IMAGE = /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;
const LOCAL_VIDEO = /^\/uploads\/[a-f0-9]{32}\.(mp4|webm)$/;

// Exigências do vídeo dos banners (mostradas no painel e na página "Anuncie").
const VIDEO = { maxBytes: 8 * 1024 * 1024, idealBytes: 4 * 1024 * 1024, maxSegundos: 15, formatos: 'MP4 (H.264) ou WEBM' };

// Duração de um MP4 lida da caixa "mvhd" do próprio arquivo (sem programas externos). null se não achar.
function duracaoMp4(buf) {
  const i = buf.indexOf('mvhd');
  if (i < 4 || i + 28 > buf.length) return null;
  const v = buf[i + 4];
  const escala = v === 1 ? buf.readUInt32BE(i + 24) : buf.readUInt32BE(i + 16);
  const dur = v === 1 ? Number(buf.readBigUInt64BE(i + 28)) : buf.readUInt32BE(i + 20);
  return escala ? dur / escala : null;
}

// Guarda o vídeo enviado no painel: confere o tipo pelo conteúdo, o tamanho e (no MP4) a duração.
function saveVideo(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw fail('Arquivo vazio.');
  if (buf.length > VIDEO.maxBytes) throw fail(`O vídeo pode ter no máximo ${VIDEO.maxBytes / 1024 / 1024} MB.`);
  let ext = null;
  if (buf.slice(4, 8).toString() === 'ftyp') ext = 'mp4';
  else if (buf.slice(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) ext = 'webm';
  if (!ext) throw fail(`Envie o vídeo em ${VIDEO.formatos}.`);
  if (ext === 'mp4') {
    const seg = duracaoMp4(buf);
    if (seg && seg > VIDEO.maxSegundos + 0.5) throw fail(`O vídeo tem ${Math.round(seg)} segundos; o máximo é ${VIDEO.maxSegundos}.`);
  }
  const name = `${require('crypto').randomBytes(16).toString('hex')}.${ext}`;
  require('fs').writeFileSync(require('path').join(db.UPLOADS_DIR, name), buf);
  return `/uploads/${name}`;
}

function videoOrNull(v, label) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (LOCAL_VIDEO.test(s)) return s;
  throw fail(`Vídeo ${label} inválido: envie o arquivo pelo painel.`);
}
const settings = require('./settings');

// Link para a conversa no WhatsApp com quem vende a publicidade (número configurado no painel).
function whatsappLink(espaco) {
  const numero = String(settings.get('whatsapp_anuncios') || '').replace(/\D/g, '');
  if (numero.length < 10) return null;
  const nome = ESPACOS[espaco] ? `, no espaço "${ESPACOS[espaco].nome}"` : '';
  const texto = `Olá! Vi o Ofertou! e quero anunciar minha empresa no site${nome}.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });

function text(v, label, { min = 0, max = 120, required = false } = {}) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!s) { if (required) throw fail(`Informe ${label}.`); return null; }
  if (s.length < min || s.length > max) throw fail(`${label[0].toUpperCase()}${label.slice(1)}: entre ${min} e ${max} caracteres.`);
  return s;
}

function imageOrNull(v, label, required) {
  const s = String(v || '').trim();
  if (!s) { if (required) throw fail(`Envie a imagem ${label}.`); return null; }
  if (LOCAL_IMAGE.test(s)) return s;
  if (/^https:\/\//i.test(s) && s.length <= 500) { assertPublicUrl(s); return s; }
  throw fail(`Imagem ${label} inválida.`);
}

// Datas "AAAA-MM-DD" do formulário → início do dia / fim do dia (horário de Brasília convertido para UTC).
function dateSql(v, label, endOfDay) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw fail(`Informe a data de ${label}.`);
  const d = new Date(`${s}T${endOfDay ? '23:59:59' : '00:00:00'}-03:00`);
  if (isNaN(d)) throw fail(`Data de ${label} inválida.`);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function parseCampaign(b) {
  const espaco = String(b.espaco || '');
  if (!ESPACOS[espaco]) throw fail('Escolha o espaço do anúncio.');
  const link = String(b.link || '').trim();
  if (!/^https:\/\//i.test(link) || link.length > 500) throw fail('Informe o link de destino começando com https://');
  assertPublicUrl(link);
  const inicio = dateSql(b.inicio, 'início', false);
  const fim = dateSql(b.fim, 'término', true);
  if (fim <= inicio) throw fail('A data de término precisa ser depois do início.');
  return {
    anunciante: text(b.anunciante, 'o nome do anunciante', { min: 2, max: 80, required: true }),
    contato: text(b.contato, 'o contato', { max: 120 }),
    espaco,
    link,
    imagem: imageOrNull(b.imagem, 'para computador', true),
    imagem_mobile: ESPACOS[espaco].mobile ? imageOrNull(b.imagem_mobile, 'para celular', false) : null,
    video: videoOrNull(b.video, 'para computador'),
    video_mobile: ESPACOS[espaco].mobile ? videoOrNull(b.video_mobile, 'para celular') : null,
    texto_alt: text(b.texto_alt, 'a descrição da imagem', { max: 150 }),
    inicio,
    fim,
    ativo: b.ativo === false || b.ativo === '0' ? 0 : 1,
    observacoes: text(b.observacoes, 'as observações', { max: 500 }),
  };
}

function saveCampaign(body, id = null) {
  const c = parseCampaign(body);
  const cols = Object.keys(c);
  if (id) {
    const n = db.run(`UPDATE banners SET ${cols.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(c), id).changes;
    if (!n) throw fail('Campanha não encontrada.', 404);
    return id;
  }
  return Number(db.run(`INSERT INTO banners (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...Object.values(c)).lastInsertRowid);
}

function listCampaigns() {
  return db.all(`SELECT *, CASE
      WHEN ativo = 0 THEN 'pausada'
      WHEN inicio > datetime('now') THEN 'agendada'
      WHEN fim < datetime('now') THEN 'encerrada'
      ELSE 'no_ar' END AS situacao
    FROM banners ORDER BY id DESC`);
}

const deleteCampaign = id => db.run('DELETE FROM banners WHERE id = ?', id).changes;
const setActive = (id, ativo) => db.run('UPDATE banners SET ativo = ? WHERE id = ?', ativo ? 1 : 0, id);

const LIVE_SQL = `ativo = 1 AND inicio <= datetime('now') AND fim >= datetime('now')`;

// Escolhe uma campanha no ar para cada espaço pedido (sorteio entre as ativas) e conta a visualização.
function pick(espacos) {
  const out = {};
  for (const espaco of espacos) {
    if (!ESPACOS[espaco]) continue;
    const b = db.get(
      `SELECT id, anunciante, imagem, imagem_mobile, video, video_mobile, texto_alt FROM banners WHERE espaco = ? AND ${LIVE_SQL}
       ORDER BY random() LIMIT 1`, espaco
    );
    if (b) db.run('UPDATE banners SET impressoes = impressoes + 1 WHERE id = ?', b.id);
    out[espaco] = b || null;
  }
  return out;
}

// Clique: conta e devolve o link (só para campanhas no ar).
function click(id) {
  const b = db.get(`SELECT link FROM banners WHERE id = ? AND ${LIVE_SQL}`, id);
  if (!b) return null;
  db.run('UPDATE banners SET cliques = cliques + 1 WHERE id = ?', id);
  return b.link;
}

// ── Pedidos de contato de empresas interessadas ──────────────────────────────
function saveLead(b) {
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) throw fail('Informe um e-mail válido.');
  const telefone = String(b.telefone || '').replace(/\D/g, '') || null;
  if (telefone && (telefone.length < 10 || telefone.length > 11)) throw fail('Telefone inválido: use DDD + número.');
  const espaco = ESPACOS[b.espaco] ? b.espaco : null;
  db.run('INSERT INTO ad_leads (nome, empresa, email, telefone, espaco, mensagem) VALUES (?, ?, ?, ?, ?, ?)',
    text(b.nome, 'seu nome', { min: 2, max: 80, required: true }),
    text(b.empresa, 'o nome da empresa', { min: 2, max: 100, required: true }),
    email, telefone, espaco,
    text(b.mensagem, 'a mensagem', { max: 1000 }));
}

const listLeads = () => db.all('SELECT * FROM ad_leads ORDER BY CASE status WHEN \'novo\' THEN 0 ELSE 1 END, created_at DESC LIMIT 300');
const setLeadStatus = (id, status) => db.run('UPDATE ad_leads SET status = ? WHERE id = ?', status === 'atendido' ? 'atendido' : 'novo', id);
const deleteLead = id => db.run('DELETE FROM ad_leads WHERE id = ?', id);
const newLeadsCount = () => db.get(`SELECT COUNT(*) AS n FROM ad_leads WHERE status = 'novo'`).n;

module.exports = {
  ESPACOS, VIDEO, saveVideo, whatsappLink, saveCampaign, listCampaigns, deleteCampaign, setActive, pick, click,
  saveLead, listLeads, setLeadStatus, deleteLead, newLeadsCount,
};
