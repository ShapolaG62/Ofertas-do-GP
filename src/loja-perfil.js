// Página profissional das lojas parceiras: aparência (banner, logo, cor, slogan), informações (contatos, horário,
// políticas), catálogos (coleções de produtos criadas pela empresa) e avaliações de 1 a 5 estrelas com mensagem.
//  • Avaliações: uma por pessoa e loja (pode editar), qualquer conta logada exceto a própria loja. Quem tem compra
//    finalizada pela loja no site ganha o selo "Compra verificada". A loja responde publicamente; o admin oculta.
const db = require('./db');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const txt = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const IMG = /^(https:\/\/[^\s]+|\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)|\/uploads\/perfis\/[\w.-]+\.webp)$/i;
const CORES_LOJA = ['verde', 'azul', 'roxo', 'laranja', 'vermelho', 'grafite', 'rosa', 'dourado', 'ciano', 'vinho'];

for (const col of ['capa_url TEXT', 'cor TEXT', 'slogan TEXT', 'whatsapp TEXT', 'instagram TEXT', 'telefone TEXT', 'email_contato TEXT',
  'endereco TEXT', 'horario TEXT', 'politica_entrega TEXT', 'politica_troca TEXT', 'mostrar_avaliacoes INTEGER NOT NULL DEFAULT 1']) {
  try { db.db.exec(`ALTER TABLE lojas ADD COLUMN ${col}`); } catch { /* já existe */ }
}
db.db.exec(`
  CREATE TABLE IF NOT EXISTS loja_catalogos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS loja_catalogo_itens (
    catalogo_id INTEGER NOT NULL REFERENCES loja_catalogos(id) ON DELETE CASCADE,
    oferta_id INTEGER NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (catalogo_id, oferta_id)
  );
  CREATE TABLE IF NOT EXISTS loja_avaliacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
    autor TEXT NOT NULL,                -- 'u:<id>' | 'c:<id>' | 'admin'
    nota INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
    texto TEXT,
    resposta TEXT,
    resposta_em TEXT,
    oculta INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (loja_id, autor)
  );
`);

const lojaDoUsuario = userId => db.get('SELECT * FROM lojas WHERE user_id = ?', userId);
const imagem = (v, campo) => {
  const s = String(v || '').trim();
  if (!s) return null;
  if (!IMG.test(s) || s.length > 500) throw fail(`${campo}: envie uma imagem ou use um link começando com https://`);
  return s;
};

// ── Aparência e informações ─────────────────────────────────────────────────
function salvarAparencia(user, b) {
  const l = lojaDoUsuario(user.id);
  if (!l) throw fail('Crie sua loja primeiro (nome e descrição).');
  const whats = String(b.whatsapp || '').replace(/\D/g, '');
  if (whats && (whats.length < 10 || whats.length > 13)) throw fail('WhatsApp: informe DDD + número.');
  const insta = txt(b.instagram, 40).replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '');
  if (insta && !/^[a-z0-9._]{1,30}$/i.test(insta)) throw fail('Instagram: use só o nome do perfil (ex.: minhaloja).');
  const email = txt(b.email_contato, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw fail('E-mail de contato inválido.');
  db.run(`UPDATE lojas SET logo_url = ?, capa_url = ?, cor = ?, slogan = ?, whatsapp = ?, instagram = ?, telefone = ?, email_contato = ?,
          endereco = ?, horario = ?, politica_entrega = ?, politica_troca = ?, mostrar_avaliacoes = ? WHERE id = ?`,
  imagem(b.logo_url, 'Logo'), imagem(b.capa_url, 'Banner'), CORES_LOJA.includes(b.cor) ? b.cor : 'verde', txt(b.slogan, 90) || null,
  whats || null, insta || null, txt(b.telefone, 20) || null, email || null, txt(b.endereco, 200) || null, txt(b.horario, 120) || null,
  txt(b.politica_entrega, 600) || null, txt(b.politica_troca, 600) || null, b.mostrar_avaliacoes === false || b.mostrar_avaliacoes === '0' ? 0 : 1, l.id);
  const novoLogo = lojaDoUsuario(user.id).logo_url || null;
  if (novoLogo !== (l.logo_url || null)) require('./foto-loja').daLoja(user.id, novoLogo); // a foto do perfil acompanha
  return aparencia(lojaDoUsuario(user.id));
}

const aparencia = l => ({
  logo_url: l.logo_url || '', capa_url: l.capa_url || '', cor: l.cor || 'verde', slogan: l.slogan || '', whatsapp: l.whatsapp || '',
  instagram: l.instagram || '', telefone: l.telefone || '', email_contato: l.email_contato || '', endereco: l.endereco || '',
  horario: l.horario || '', politica_entrega: l.politica_entrega || '', politica_troca: l.politica_troca || '',
  mostrar_avaliacoes: l.mostrar_avaliacoes !== 0,
});

// ── Catálogos ───────────────────────────────────────────────────────────────
function catalogos(lojaId, { publico = false } = {}) {
  return db.all('SELECT * FROM loja_catalogos WHERE loja_id = ? ORDER BY ordem, id', lojaId).map(c => ({
    id: c.id, nome: c.nome, descricao: c.descricao || '', ordem: c.ordem,
    itens: db.all(`SELECT i.oferta_id FROM loja_catalogo_itens i JOIN offers o ON o.id = i.oferta_id
                   WHERE i.catalogo_id = ? AND o.loja_id = ?${publico ? ' AND o.oculto = 0' : ''} ORDER BY i.ordem, i.oferta_id`, c.id, lojaId).map(r => r.oferta_id),
  })).filter(c => !publico || c.itens.length);
}

function salvarCatalogo(user, id, b) {
  const l = lojaDoUsuario(user.id);
  if (!l) throw fail('Crie sua loja primeiro.');
  const nome = txt(b.nome, 50);
  if (nome.length < 2) throw fail('Dê um nome ao catálogo (ex.: Promoções de verão).');
  const ids = [...new Set((Array.isArray(b.itens) ? b.itens : []).map(Number).filter(n => n > 0))].slice(0, 500);
  const validos = ids.filter(o => db.get('SELECT 1 FROM offers WHERE id = ? AND loja_id = ?', o, l.id));
  let cid = Number(id) || null;
  db.transaction(() => {
    if (cid) {
      if (!db.get('SELECT 1 FROM loja_catalogos WHERE id = ? AND loja_id = ?', cid, l.id)) throw fail('Catálogo não encontrado.', 404);
      db.run('UPDATE loja_catalogos SET nome = ?, descricao = ?, ordem = ? WHERE id = ?', nome, txt(b.descricao, 200) || null, parseInt(b.ordem, 10) || 0, cid);
    } else {
      if (db.get('SELECT COUNT(*) n FROM loja_catalogos WHERE loja_id = ?', l.id).n >= 20) throw fail('Limite de 20 catálogos por loja.');
      cid = Number(db.run('INSERT INTO loja_catalogos (loja_id, nome, descricao, ordem) VALUES (?, ?, ?, ?)', l.id, nome, txt(b.descricao, 200) || null,
        parseInt(b.ordem, 10) || db.get('SELECT COUNT(*) n FROM loja_catalogos WHERE loja_id = ?', l.id).n).lastInsertRowid);
    }
    db.run('DELETE FROM loja_catalogo_itens WHERE catalogo_id = ?', cid);
    validos.forEach((o, i) => db.run('INSERT INTO loja_catalogo_itens (catalogo_id, oferta_id, ordem) VALUES (?, ?, ?)', cid, o, i));
  });
  return catalogos(l.id);
}

function excluirCatalogo(user, id) {
  const l = lojaDoUsuario(user.id);
  if (!l) throw fail('Loja não encontrada.', 404);
  if (!db.run('DELETE FROM loja_catalogos WHERE id = ? AND loja_id = ?', Number(id), l.id).changes) throw fail('Catálogo não encontrado.', 404);
  return catalogos(l.id);
}

// ── Avaliações ──────────────────────────────────────────────────────────────
const compraVerificada = (lojaId, dono) => Boolean(db.get(`SELECT 1 FROM pedidos_loja WHERE loja_id = ? AND comprador = ? AND status IN ('pago', 'enviado', 'concluido')`, lojaId, dono));

function resumoAvaliacoes(lojaId) {
  const r = db.get('SELECT COUNT(*) n, AVG(nota) media FROM loja_avaliacoes WHERE loja_id = ? AND oculta = 0', lojaId);
  const dist = Object.fromEntries([1, 2, 3, 4, 5].map(n => [n, 0]));
  for (const x of db.all('SELECT nota, COUNT(*) n FROM loja_avaliacoes WHERE loja_id = ? AND oculta = 0 GROUP BY nota', lojaId)) dist[x.nota] = x.n;
  return { total: r.n, media: r.n ? Math.round(r.media * 10) / 10 : null, distribuicao: dist };
}

function avaliacoes(lojaId, visitante = null, { admin = false } = {}) {
  const chat = require('./chat');
  const lista = db.all(`SELECT * FROM loja_avaliacoes WHERE loja_id = ?${admin ? '' : ' AND oculta = 0'} ORDER BY id DESC LIMIT 200`, lojaId).map(a => {
    const p = chat.pessoa(a.autor);
    return { id: a.id, nota: a.nota, texto: a.texto || '', resposta: a.resposta || '', resposta_em: a.resposta_em, oculta: Boolean(a.oculta),
      ...(admin && a.oculta ? { oculta_motivo: MOTIVOS_OCULTAR[a.oculta_motivo] || 'sem motivo registrado' } : {}),
      autor: { nome: p.nome, avatar: p.avatar, slug: p.slug }, minha: a.autor === visitante, verificada: compraVerificada(lojaId, a.autor),
      created_at: a.created_at, updated_at: a.updated_at };
  });
  return { resumo: resumoAvaliacoes(lojaId), itens: lista };
}

const limiteAvaliar = new Map();
function avaliar(dono, lojaId, b) {
  if (!dono) throw fail('Entre na sua conta para avaliar.', 401);
  const l = db.get('SELECT id, user_id, oculta FROM lojas WHERE id = ?', Number(lojaId));
  if (!l || l.oculta) throw fail('Loja não encontrada.', 404);
  if (`u:${l.user_id}` === dono) throw fail('Você não pode avaliar a sua própria loja.');
  const nota = parseInt(b.nota, 10);
  if (!(nota >= 1 && nota <= 5)) throw fail('Escolha de 1 a 5 estrelas.');
  const texto = txt(b.texto, 1000);
  const ult = limiteAvaliar.get(dono) || 0;
  if (Date.now() - ult < 20000) throw fail('Aguarde alguns segundos para avaliar de novo.', 429);
  limiteAvaliar.set(dono, Date.now());
  db.run(`INSERT INTO loja_avaliacoes (loja_id, autor, nota, texto) VALUES (?, ?, ?, ?)
          ON CONFLICT (loja_id, autor) DO UPDATE SET nota = excluded.nota, texto = excluded.texto, updated_at = datetime('now'), oculta = 0, oculta_motivo = NULL, oculta_em = NULL`,
  l.id, dono, nota, texto || null);
  // Aviso para a loja
  try { require('./chat').avisarPorEmail(`u:${l.user_id}`, 'Nova avaliação na sua loja — Ofertou!', `Sua loja recebeu uma avaliação de ${nota} estrela(s).${texto ? `\n\n"${texto.slice(0, 300)}"` : ''}`); } catch { /* sem e-mail */ }
  return avaliacoes(l.id, dono);
}

function excluirMinhaAvaliacao(dono, lojaId) {
  if (!dono) throw fail('Entre na sua conta.', 401);
  db.run('DELETE FROM loja_avaliacoes WHERE loja_id = ? AND autor = ?', Number(lojaId), dono);
  return avaliacoes(Number(lojaId), dono);
}

function responder(user, avaliacaoId, resposta) {
  const l = lojaDoUsuario(user.id);
  const a = l && db.get('SELECT * FROM loja_avaliacoes WHERE id = ? AND loja_id = ?', Number(avaliacaoId), l.id);
  if (!a) throw fail('Avaliação não encontrada.', 404);
  const t = txt(resposta, 600);
  db.run('UPDATE loja_avaliacoes SET resposta = ?, resposta_em = ? WHERE id = ?', t || null, t ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null, a.id);
  return avaliacoes(l.id, `u:${user.id}`);
}

// Admin: ocultar/mostrar. Avaliação negativa NÃO é motivo para ocultar (o consumidor tem direito de opinar e os outros
// compradores têm direito à informação): só abusos da lista abaixo. Cada ação fica registrada e o autor é avisado.
const MOTIVOS_OCULTAR = {
  ofensiva: 'Ofensas, palavrões ou discurso de ódio',
  dados_pessoais: 'Expõe dados pessoais (telefone, endereço, documento)',
  spam: 'Propaganda, links ou spam',
  falsa: 'Avaliação falsa ou fraudulenta (ex.: da própria loja ou de concorrente)',
  ilegal: 'Conteúdo ilegal',
  sem_relacao: 'Não fala da loja nem da compra',
};
for (const col of ['oculta_motivo TEXT', 'oculta_em TEXT']) {
  try { db.db.exec(`ALTER TABLE loja_avaliacoes ADD COLUMN ${col}`); } catch { /* já existe */ }
}
function moderar(avaliacaoId, oculta, motivo = '') {
  const a = db.get('SELECT * FROM loja_avaliacoes WHERE id = ?', Number(avaliacaoId));
  if (!a) throw fail('Avaliação não encontrada.', 404);
  if (oculta && !MOTIVOS_OCULTAR[motivo]) throw fail('Escolha o motivo: só avaliações abusivas podem ser ocultadas (crítica ou nota baixa não é motivo).');
  db.run('UPDATE loja_avaliacoes SET oculta = ?, oculta_motivo = ?, oculta_em = ? WHERE id = ?',
    oculta ? 1 : 0, oculta ? motivo : null, oculta ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null, a.id);
  const loja = db.get('SELECT nome, slug FROM lojas WHERE id = ?', a.loja_id) || {};
  require('./users').logAction(null, oculta ? 'avaliacao_ocultada' : 'avaliacao_mostrada',
    `Avaliação ${a.id} (${a.nota}★, de ${a.autor}) na loja "${loja.nome || a.loja_id}"${oculta ? ` — motivo: ${MOTIVOS_OCULTAR[motivo]}` : ''}`);
  if (oculta && a.autor !== 'admin') {
    try {
      require('./notificacoes').criar(a.autor, { tipo: 'avaliacao_oculta', titulo: 'Sua avaliação foi ocultada',
        texto: `A avaliação que você deixou para ${loja.nome || 'a loja'} foi ocultada pela moderação. Motivo: ${MOTIVOS_OCULTAR[motivo]}. Você pode editá-la e publicar de novo.`,
        link: loja.slug ? `/loja/${loja.slug}#avaliacoes` : null });
    } catch { /* sem aviso */ }
  }
  return avaliacoes(a.loja_id, 'admin', { admin: true });
}

module.exports = {
  CORES_LOJA, aparencia, salvarAparencia, catalogos, salvarCatalogo, excluirCatalogo,
  avaliacoes, resumoAvaliacoes, avaliar, excluirMinhaAvaliacao, responder, moderar, MOTIVOS_OCULTAR,
};
