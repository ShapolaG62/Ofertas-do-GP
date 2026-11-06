// Endereços da API própria de WhatsApp (src/whatsapp-proprio.js):
//  • /api/admin/wa/*: painel do administrador (conectar pelo QR code, desconectar, chave da API e tudo abaixo);
//  • /api/wa/*: para outros programas, com o cabeçalho "Authorization: Bearer <chave>". Só lê e envia: a chave não
//    conecta nem desconecta o número.
// Fica antes do leitor de JSON geral do site porque o envio pode trazer uma foto (até 12 MB), lida só depois do login.
const crypto = require('crypto');
const express = require('express');
const auth = require('../auth');
const db = require('../db');
const proprio = require('../whatsapp-proprio');

db.db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_api_chave (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    hash TEXT NOT NULL,
    criada_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const router = express.Router();
const lerJson = express.json({ limit: '12mb' });
const erro = (res, err) => {
  if (!err.status) console.error('[WHATSAPP PRÓPRIO]', err.message);
  res.status(err.status || 500).json({ error: err.message });
};
const hash = chave => crypto.createHash('sha256').update(String(chave)).digest('hex');
const semCache = (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

function exigirChave(req, res, next) {
  const chave = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')?.[1];
  const salva = db.get('SELECT hash FROM whatsapp_api_chave WHERE id = 1')?.hash;
  if (!chave || !salva || !crypto.timingSafeEqual(Buffer.from(hash(chave)), Buffer.from(salva))) {
    return res.status(401).json({ error: 'Chave da API inválida.' });
  }
  next();
}

// O que o painel e a chave podem fazer
function rotasComuns(r) {
  r.get('/grupos', async (req, res) => {
    try { res.json({ grupos: await proprio.carregarGrupos() }); } catch (err) { erro(res, err); }
  });
  r.get('/conversas', (req, res) => {
    try { res.json({ conversas: proprio.conversas() }); } catch (err) { erro(res, err); }
  });
  r.get('/mensagens', (req, res) => {
    try { res.json({ mensagens: proprio.mensagens(req.query) }); } catch (err) { erro(res, err); }
  });
  // Corpo: { para, texto, imagem (endereço da foto) ou imagem_base64 }
  r.post('/enviar', lerJson, async (req, res) => {
    const { para, texto, imagem, imagem_base64: base64 } = req.body || {};
    try {
      const foto = base64 ? Buffer.from(String(base64), 'base64') : (imagem || null);
      res.json({ ok: true, id: await proprio.enviar(para, { imagem: foto, texto }) });
    } catch (err) { erro(res, err); }
  });
}

// ── Painel do administrador ─────────────────────────────────────────────────
const painel = express.Router();
painel.use(semCache, auth.requireAdmin);
painel.get('/status', (req, res) => res.json(proprio.status()));
painel.post('/conectar', async (req, res) => {
  try { res.json(await proprio.conectar()); } catch (err) { erro(res, err); }
});
painel.post('/desconectar', async (req, res) => {
  try { res.json(await proprio.desconectar()); } catch (err) { erro(res, err); }
});
painel.get('/chave', (req, res) => {
  const c = db.get('SELECT criada_em FROM whatsapp_api_chave WHERE id = 1');
  res.json({ existe: Boolean(c), criada_em: c?.criada_em || null });
});
// A chave só aparece nesta resposta: o banco guarda apenas o resumo dela. Gerar outra invalida a anterior.
painel.post('/chave', (req, res) => {
  const chave = `ofw_${crypto.randomBytes(32).toString('hex')}`;
  db.run(`INSERT INTO whatsapp_api_chave (id, hash, criada_em) VALUES (1, ?, datetime('now'))
          ON CONFLICT (id) DO UPDATE SET hash = excluded.hash, criada_em = excluded.criada_em`, hash(chave));
  res.json({ chave });
});
painel.delete('/chave', (req, res) => {
  db.run('DELETE FROM whatsapp_api_chave WHERE id = 1');
  res.json({ ok: true });
});
rotasComuns(painel);
router.use('/api/admin/wa', painel);

// ── Outros programas, com a chave ───────────────────────────────────────────
const externa = express.Router();
externa.use(semCache, exigirChave);
externa.get('/status', (req, res) => {
  const { fase, conectado, numero, nome, erro: motivo } = proprio.status();
  res.json({ fase, conectado, numero, nome, erro: motivo });
});
rotasComuns(externa);
router.use('/api/wa', externa);

module.exports = router;
