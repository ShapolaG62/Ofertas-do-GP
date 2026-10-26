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
  if (!chaveExtensaoOk(req)) return res.status(401).json({ error: 'Chave da extensão inválida. Gere uma nova em Painel → Ganhos de afiliados.' });
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
// Mercado Livre: a comissão de cada produto só aparece na página dele para quem está logado como afiliado.
// A extensão pede a lista de produtos a conferir (os mais atrativos primeiro; nunca conferidos ou conferidos há
// mais de 3 dias, porque as campanhas de comissão extra mudam), abre as páginas e devolve o que leu.
function chaveExtensaoOk(req) {
  const chave = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const certa = settings.get('ganhos_ext_chave_hash') || '';
  return Boolean(chave && certa && crypto.timingSafeEqual(Buffer.from(hashChave(chave)), Buffer.from(certa.padEnd(64, '0').slice(0, 64))));
}
router.get('/api/ganhos/extensao/ml-pendentes', (req, res) => {
  if (!chaveExtensaoOk(req)) return res.status(401).json({ error: 'Chave da extensão inválida.' });
  const n = Math.min(Math.max(parseInt(req.query.n, 10) || 20, 1), 50);
  const db = require('../db');
  const limite = Date.now() - 3 * 86400000;
  const conferida = new Map(db.all(`SELECT id, comissao_em FROM offers WHERE store_id = 'mercadolivre' AND comissao_em IS NOT NULL`).map(r => [r.id, r.comissao_em]));
  const velha = id => { const em = conferida.get(id); return !em || Date.parse(em.replace(' ', 'T') + 'Z') < limite; };
  const ativas = require('../busca-ofertas').ativas().filter(o => o.store_id === 'mercadolivre' && velha(o.id));
  ativas.sort((a, b) => (b._s || 0) - (a._s || 0));
  const itens = [];
  for (const o of ativas.slice(0, n)) {
    const r = db.get('SELECT store_product_id, original_url FROM offers WHERE id = ?', o.id);
    if (r && /^https:\/\//.test(r.original_url)) itens.push({ id: o.id, item: r.store_product_id, url: r.original_url });
  }
  res.json({ itens });
});
router.post('/api/ganhos/extensao/ml-comissoes', express.json({ limit: '50kb' }), (req, res) => {
  if (!chaveExtensaoOk(req)) return res.status(401).json({ error: 'Chave da extensão inválida.' });
  const db = require('../db');
  const pct = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 90 ? null : Math.round(Number(v) * 100) / 100);
  let atualizadas = 0, extras = 0;
  for (const it of (Array.isArray(req.body?.itens) ? req.body.itens : []).slice(0, 100)) {
    const total = pct(it.comissao), extra = pct(it.extra) || 0;
    if (total == null) continue;
    const m = String(it.item || '').toUpperCase().match(/MLB-?(\d{6,})/);
    const id = Number(it.id) || 0;
    const r = id
      ? db.run(`UPDATE offers SET comissao_pct = ?, comissao_extra_pct = ?, comissao_em = datetime('now') WHERE id = ? AND store_id = 'mercadolivre'`, total, extra, id)
      : m ? db.run(`UPDATE offers SET comissao_pct = ?, comissao_extra_pct = ?, comissao_em = datetime('now') WHERE store_id = 'mercadolivre' AND store_product_id = ?`, total, extra, `MLB${m[1]}`) : { changes: 0 };
    if (r.changes) { atualizadas += r.changes; if (extra > 0) extras += r.changes; }
  }
  res.json({ ok: true, atualizadas, extras });
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
