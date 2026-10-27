// Painel admin → Ganhos: vendas dos programas de afiliados, saldos, saques e avisos.
const express = require('express');
const auth = require('../auth');
const ganhos = require('../ganhos');

const router = express.Router();
const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message });
const tentar = fn => (req, res) => { try { res.json(fn(req)); } catch (err) { sendError(res, err); } };

router.use('/api/admin/ganhos', auth.requireAdmin);

router.get('/api/admin/ganhos', tentar(req => ({
  plataformas: ganhos.painel(),
  vendas: ganhos.listar({ plataforma: req.query.plataforma, status: req.query.status }),
  saques: ganhos.saques(),
  notificacoes: ganhos.notificacoes(),
  sync: require('../ganhos-sync').estado(),
})));
// Ganho estimado do Mercado Livre lido pela extensão no painel de afiliado (substitui o valor anterior)
router.post('/api/admin/ganhos/ml-estimado', tentar(req => ganhos.salvarGanhoEstimadoMl(req.body?.valor)));
// Busca agora as vendas nos programas com API (Shopee e KaBuM!/Awin)
router.post('/api/admin/ganhos/sincronizar', async (req, res) => {
  try { res.json(await require('../ganhos-sync').sincronizar()); } catch (err) { sendError(res, err); }
});
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
