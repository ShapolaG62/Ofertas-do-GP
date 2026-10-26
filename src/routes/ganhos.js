// Painel admin → Ganhos: vendas dos programas de afiliados, saldos, saques e avisos.
const express = require('express');
const auth = require('../auth');
const ganhos = require('../ganhos');

const router = express.Router();
const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message });
const tentar = fn => (req, res) => { try { res.json(fn(req)); } catch (err) { sendError(res, err); } };

// ── Extensão do Chrome "Ofertou! Ganhos" (pasta extensao-ganhos/) ──
// Lê o saldo na página do portal de cada programa (aberta e logada no navegador do dono) e manda para cá com a chave
// gerada no painel. Só o resumo da chave fica guardado; a chave aparece uma vez, na hora de gerar.
const crypto = require('crypto');
const settings = require('../settings');
const { createLimiter } = require('../ratelimit');
const extLimiter = createLimiter(120, 60);
const hashChave = c => crypto.createHash('sha256').update(String(c)).digest('hex');
router.post('/api/ganhos/extensao', express.json({ limit: '20kb' }), (req, res) => {
  const ip = req.ip || 'x';
  const wait = extLimiter.hit(`ext:${ip}`);
  if (wait) return res.status(429).json({ error: 'Muitos envios seguidos. Tente mais tarde.' });
  const chave = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const certa = settings.get('ganhos_ext_chave_hash') || '';
  const ok = chave && certa && crypto.timingSafeEqual(Buffer.from(hashChave(chave)), Buffer.from(certa.padEnd(64, '0').slice(0, 64)));
  if (!ok) return res.status(401).json({ error: 'Chave da extensão inválida. Gere uma nova em Painel → Ganhos de afiliados.' });
  if (req.body?.teste) return res.json({ ok: true, site: 'Ofertou!' });
  try { const p = ganhos.registrarPortal(req.body || {}); res.json({ ok: true, plataforma: p.nome, disponivel: p.disponivel, a_liberar: p.a_liberar }); }
  catch (err) { sendError(res, err); }
});

router.use('/api/admin/ganhos', auth.requireAdmin);

router.get('/api/admin/ganhos', tentar(req => ({
  plataformas: ganhos.painel(),
  vendas: ganhos.listar({ plataforma: req.query.plataforma, status: req.query.status }),
  saques: ganhos.saques(),
  notificacoes: ganhos.notificacoes(),
  sync: require('../ganhos-sync').estado(),
})));
// Busca agora as vendas nos programas com API (Shopee e KaBuM!/Awin)
router.post('/api/admin/ganhos/sincronizar', async (req, res) => {
  try { res.json(await require('../ganhos-sync').sincronizar()); } catch (err) { sendError(res, err); }
});
router.post('/api/admin/ganhos/extensao/chave', tentar(() => {
  const chave = `ofg_${crypto.randomBytes(24).toString('hex')}`;
  settings.set('ganhos_ext_chave_hash', hashChave(chave));
  return { chave };
}));
router.get('/api/admin/ganhos/extensao', tentar(() => ({ tem_chave: Boolean(settings.get('ganhos_ext_chave_hash')) })));
router.delete('/api/admin/ganhos/portal/:id', tentar(req => { ganhos.limparPortal(req.params.id); return { ok: true }; }));
router.post('/api/admin/ganhos/vendas', tentar(req => { const r = ganhos.registrar(req.body || {}); ganhos.verificar(); return r; }));
router.patch('/api/admin/ganhos/vendas/:id', tentar(req => { ganhos.atualizarStatus(req.params.id, req.body?.status); return { ok: true }; }));
router.delete('/api/admin/ganhos/vendas/:id', tentar(req => { ganhos.excluir(req.params.id); return { ok: true }; }));
router.post('/api/admin/ganhos/saques', tentar(req => ganhos.registrarSaque(req.body || {})));
router.delete('/api/admin/ganhos/saques/:id', tentar(req => { ganhos.excluirSaque(req.params.id); ganhos.verificar(); return { ok: true }; }));
router.put('/api/admin/ganhos/plataformas/:id', tentar(req => ganhos.editarPlataforma(req.params.id, req.body || {})));

// Planilha exportada do portal: primeiro a prévia (colunas sugeridas), depois a importação com as colunas escolhidas
const csv = express.text({ type: ['text/*', 'application/csv', 'application/vnd.ms-excel'], limit: '8mb' });
router.post('/api/admin/ganhos/csv/previa', csv, tentar(req => ganhos.previa(req.body)));
router.post('/api/admin/ganhos/csv/importar', csv, tentar(req => {
  let mapa;
  try { mapa = JSON.parse(String(req.query.mapa || '{}')); } catch { mapa = {}; }
  return ganhos.importar(req.body, String(req.query.plataforma || ''), mapa);
}));

// Avisos (sininho do painel e perfil do admin)
router.get('/api/admin/notificacoes', auth.requireAdmin, tentar(req => ({ itens: ganhos.notificacoes({ todas: req.query.todas === '1' }) })));
router.post('/api/admin/notificacoes/:id/lida', auth.requireAdmin, tentar(req => { ganhos.marcarLida(req.params.id); return { ok: true }; }));
router.post('/api/admin/notificacoes/lidas', auth.requireAdmin, tentar(() => { ganhos.marcarTodasLidas(); return { ok: true }; }));

module.exports = router;
