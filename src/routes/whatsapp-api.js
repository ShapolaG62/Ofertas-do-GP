// Endereços da API própria de WhatsApp (src/whatsapp-proprio.js):
//  • /api/admin/wa/*: painel do administrador, com o número do site;
//  • /api/cliente/wa/*: painel de cada cliente da ferramenta, com o número dele;
//  • /api/wa/*: para outros programas, com o cabeçalho "Authorization: Bearer <chave>". A chave lê, envia e automatiza as
//    postagens do dono dela, mas não conecta nem desconecta o número.
// Fica antes do leitor de JSON geral do site porque o envio pode trazer uma foto (até 12 MB), lida só depois do login.
const crypto = require('crypto');
const express = require('express');
const auth = require('../auth');
const db = require('../db');
const clientes = require('../clientes');
const proprio = require('../whatsapp-proprio');
const f = require('../whatsapp-funcoes');
const temas = require('../temas-grupos');

// A primeira versão tinha uma chave só, do site: passa para a tabela por dono
db.db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_api_chaves (dono TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, criada_em TEXT NOT NULL DEFAULT (datetime('now')))`);
if (db.get(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'whatsapp_api_chave'`)) {
  db.db.exec(`INSERT OR IGNORE INTO whatsapp_api_chaves (dono, hash, criada_em) SELECT 'site', hash, criada_em FROM whatsapp_api_chave; DROP TABLE whatsapp_api_chave;`);
}

const router = express.Router();
const lerJson = express.json({ limit: '45mb' }); // fotos, vídeos e documentos em base64
// Erro do próprio WhatsApp (sem permissão, grupo inexistente) não é defeito do site
const erro = (res, err) => {
  const doWhatsapp = err.output?.statusCode;
  if (!err.status && !doWhatsapp) console.error('[WHATSAPP]', err.message);
  const status = err.status || (doWhatsapp >= 400 && doWhatsapp < 500 && doWhatsapp !== 401 ? doWhatsapp : doWhatsapp ? 502 : 500);
  res.status(status).json({ error: err.message });
};
const hash = chave => crypto.createHash('sha256').update(String(chave)).digest('hex');
const semCache = (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const cfgDe = cid => (cid ? clientes.config(cid) : require('../settings').getAll());
const baseFoto = req => `${req.baseUrl}/foto/`;

function exigirChave(req, res, next) {
  const chave = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')?.[1];
  const achado = chave && db.get('SELECT dono FROM whatsapp_api_chaves WHERE hash = ?', hash(chave));
  if (!achado) return res.status(401).json({ error: 'Chave da API inválida.' });
  const cid = proprio.cidDe(achado.dono);
  if (cid && !db.get(`SELECT 1 FROM clientes WHERE id = ? AND status = 'ativo' AND validade >= datetime('now')`, cid)) {
    return res.status(403).json({ error: 'O acesso à ferramenta não está ativo.' });
  }
  req.dono = achado.dono;
  next();
}
const async_ = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => erro(res, err));

// O que o painel e a chave podem fazer
function rotasComuns(r) {
  const cid = req => proprio.cidDe(req.dono);
  r.get('/temas', (req, res) => res.json({ temas: temas.listar() }));
  r.get('/grupos', async_(async (req, res) => {
    const { grupos, ocultos } = await proprio.resumoGrupos(req.dono);
    const lista = req.query.todos === '1' ? await proprio.carregarGrupos(req.dono, { todos: true }) : grupos;
    const escolhidos = require('../whatsapp').gruposEscolhidos(cfgDe(cid(req)));
    res.json({ ocultos, temas: temas.listar(), lojas: temas.listarLojas(), grupos: temas.paraTelaGrupos(lista, escolhidos, baseFoto(req)).map((g, i) => ({ ...g, descricao: lista[i].descricao, admin: lista[i].admin, criador: lista[i].criador })) });
  }));
  r.get('/grupos/:id/convite', async_(async (req, res) => res.json({ link: await proprio.convite(req.dono, req.params.id) })));
  r.get('/foto/:jid', async_(async (req, res) => {
    const arquivo = await proprio.foto(req.dono, req.params.jid);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (!arquivo) return res.status(404).end();
    res.type('image/jpeg').sendFile(arquivo);
  }));
  r.get('/conversas', async_((req, res) => res.json({ conversas: proprio.conversas(req.dono, req.query) })));
  r.get('/mensagens', async_((req, res) => res.json({ mensagens: proprio.mensagens(req.dono, req.query) })));
  // Corpo: { para, texto, imagem (endereço da foto) ou imagem_base64 }
  r.post('/enviar', lerJson, async_(async (req, res) => {
    const { para, texto, imagem, imagem_base64: base64 } = req.body || {};
    const foto = base64 ? Buffer.from(String(base64), 'base64') : (imagem || null);
    res.json({ ok: true, id: await proprio.enviar(req.dono, para, { imagem: foto, texto }) });
  }));

  // ── Automação das postagens ──
  // Ofertas boas para postar agora, com o tipo de cada uma. ?tema=tecnologia&limite=10
  r.get('/ofertas', async_((req, res) => {
    const c = cid(req);
    const t = temas.listar().find(x => x.id === req.query.tema);
    if (req.query.tema && !t) throw falha('Tipo de produto desconhecido: veja a lista em /temas.');
    const limite = Math.min(Math.max(Number(req.query.limite) || 10, 1), 50);
    const s = cfgDe(c);
    let ids = require('../agenda').melhoresOfertas(t ? 300 : limite, new Set(), c, s);
    const lista = ids.length ? db.all(`SELECT id, produto, store_id, preco_atual, preco_anterior, desconto_pct, categoria FROM offers WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
    const porId = new Map(lista.map(o => [o.id, o]));
    ids = ids.filter(id => porId.has(id) && (!t || t.categorias.includes(porId.get(id).categoria))).slice(0, limite);
    res.json({ ofertas: ids.map(id => ({ ...porId.get(id), tema: temas.temaDaCategoria(porId.get(id).categoria).id })) });
  }));
  // Corpo: { offer_id, texto (opcional), grupos: ["id", …] (opcional: sem isso, os grupos salvos no painel), por_tipo (padrão: sim) }
  r.post('/postar', lerJson, async_(async (req, res) => {
    const b = req.body || {};
    res.json(await require('../postar').postar(cid(req), { offerId: Number(b.offer_id), texto: b.texto, grupos: b.grupos, porTipo: b.por_tipo !== false, autor: 'API' }));
  }));
  r.get('/fila', async_((req, res) => {
    const agenda = require('../agenda');
    res.json({ fila: agenda.listarFila(cid(req)).filter(q => q.status === 'pendente'), estado: agenda.estado(cid(req)) });
  }));
  // Corpo: { itens: [{ offer_id, texto (opcional) }], grupos, por_tipo }
  r.post('/fila', lerJson, async_(async (req, res) => {
    const b = req.body || {};
    const agenda = require('../agenda');
    if (!Array.isArray(b.itens) || !b.itens.length) throw falha('Informe os itens: [{ offer_id }].');
    const destino = await require('../postar').destino(cid(req), b.grupos, b.por_tipo !== false);
    const n = agenda.enfileirar(b.itens.map(i => ({ ...i, destino })), 'API', cid(req));
    res.json({ ok: true, adicionados: n, pendentes: agenda.pendentes(cid(req)) });
  }));
  r.delete('/fila/:id', async_((req, res) => {
    require('../agenda').removerDaFila(Number(req.params.id), cid(req));
    res.json({ ok: true });
  }));
  r.post('/fila/executar', async_((req, res) => {
    const agenda = require('../agenda');
    if (agenda.estado(cid(req)).rodando) throw falha('Já existe uma rodada em andamento.', 409);
    agenda.executar('manual', cid(req)).catch(err => console.error('[WHATSAPP]', err.message));
    res.json({ ok: true, mensagem: 'Rodada iniciada: as ofertas saem com o intervalo configurado.' });
  }));
  r.get('/resultados', async_((req, res) => res.json(require('../envio-grupos').resultados(cid(req), req.query.dias))));

  // ── Outros tipos de mensagem ──
  const envio = (caminho, fn) => r.post(`/enviar/${caminho}`, lerJson, async_(async (req, res) => {
    const saida = await fn(req.dono, req.body || {});
    res.json(typeof saida === 'string' ? { ok: true, id: saida } : { ok: true, ...saida });
  }));
  envio('texto', f.enviarTexto);
  envio('midia', f.enviarMidia);
  envio('audio', f.enviarAudio);
  envio('nota-de-video', f.enviarNotaDeVideo);
  envio('figurinha', f.enviarFigurinha);
  envio('localizacao', f.enviarLocalizacao);
  envio('contato', f.enviarContato);
  envio('enquete', f.enviarEnquete);
  envio('reacao', f.enviarReacao);
  envio('status', f.enviarStatus);

  // Ação com corpo JSON que devolve o resultado direto
  const acao = (metodo, caminho, fn) => r[metodo](caminho, lerJson, async_(async (req, res) => res.json(await fn(req))));

  // ── Mensagens e conversas ──
  acao('post', '/mensagens/lidas', req => f.marcarLidas(req.dono, req.body || {}));
  acao('post', '/mensagens/apagar', req => f.apagarParaTodos(req.dono, req.body || {}));
  acao('post', '/mensagens/editar', req => f.editarMensagem(req.dono, req.body || {}));
  acao('post', '/mensagens/midia', req => f.baixarMidia(req.dono, req.body || {}));
  acao('post', '/conversas/arquivar', req => f.arquivarConversa(req.dono, req.body || {}));
  acao('post', '/conversas/nao-lida', req => f.marcarNaoLida(req.dono, req.body || {}));
  acao('post', '/presenca', req => f.presenca(req.dono, req.body || {}));
  acao('post', '/numeros', req => f.conferirNumeros(req.dono, req.body || {}));
  r.get('/contatos', async_((req, res) => res.json({ contatos: proprio.contatos(req.dono, req.query) })));
  acao('post', '/bloqueios', req => f.bloquear(req.dono, req.body || {}));
  r.get('/bloqueios', async_(async (req, res) => res.json(await f.bloqueados(req.dono))));

  // ── Perfil e privacidade ──
  r.get('/perfil', async_(async (req, res) => res.json(await f.perfilDe(req.dono, req.query.numero))));
  acao('put', '/perfil', req => f.atualizarPerfil(req.dono, req.body || {}));
  acao('put', '/perfil/foto', req => f.trocarFotoPerfil(req.dono, req.body || {}));
  r.delete('/perfil/foto', async_(async (req, res) => res.json(await f.removerFotoPerfil(req.dono))));
  r.get('/privacidade', async_(async (req, res) => res.json(await f.lerPrivacidade(req.dono))));
  acao('put', '/privacidade', req => f.salvarPrivacidade(req.dono, req.body || {}));

  // ── Administração de grupos ──
  // Grupos em série: antes de /grupos/:id. ?nome= devolve também o próximo número.
  r.get('/grupos/em-serie', async_(async (req, res) => {
    const andamento = f.andamentoSerie(req.dono);
    res.json({ ...andamento, ...(req.query.nome ? { proximo: await f.proximoNumero(req.dono, req.query.nome) } : {}) });
  }));
  acao('post', '/grupos/em-serie', req => f.criarEmSerie(req.dono, req.body || {}));
  acao('post', '/grupos/em-serie/cancelar', req => f.cancelarSerie(req.dono));
  acao('post', '/grupos', req => f.criarGrupo(req.dono, req.body || {}));
  r.get('/grupos/:id', async_(async (req, res) => res.json(await f.detalhesDoGrupo(req.dono, req.params.id))));
  acao('put', '/grupos/:id', req => f.editarGrupo(req.dono, req.params.id, req.body || {}));
  acao('put', '/grupos/:id/foto', req => f.trocarFotoGrupo(req.dono, req.params.id, req.body || {}));
  acao('post', '/grupos/:id/convite/novo', req => f.novoConvite(req.dono, req.params.id));
  acao('post', '/grupos/:id/convite/enviar', req => f.enviarConvite(req.dono, req.params.id, req.body || {}));
  acao('post', '/grupos/:id/participantes', req => f.participantes(req.dono, req.params.id, req.body || {}));
  acao('put', '/grupos/:id/ajustes', req => f.ajustarGrupo(req.dono, req.params.id, req.body || {}));
  r.delete('/grupos/:id', async_(async (req, res) => res.json(await f.sairDoGrupo(req.dono, req.params.id))));
  r.get('/convites/:codigo', async_(async (req, res) => res.json(await f.infoConvite(req.dono, req.params.codigo))));
  acao('post', '/convites/:codigo', req => f.aceitarConvite(req.dono, req.params.codigo));

  // ── Etiquetas e catálogo (WhatsApp Business) ──
  r.get('/etiquetas', async_((req, res) => res.json({ etiquetas: proprio.etiquetas(req.dono) })));
  acao('post', '/etiquetas', req => f.etiquetar(req.dono, req.body || {}));
  r.get('/catalogo', async_(async (req, res) => res.json(await f.catalogo(req.dono, req.query.numero, req.query.limite))));
  r.get('/colecoes', async_(async (req, res) => res.json(await f.colecoes(req.dono, req.query.numero))));

  // ── Ajustes do número ──
  r.get('/ajustes', async_((req, res) => res.json(proprio.lerAjustes(req.dono))));
  acao('put', '/ajustes', req => proprio.salvarAjustes(req.dono, req.body || {}));
}

// Painéis com login: conectar pelo QR code, desconectar, chave e aviso para outros programas
function rotasDoPainel(r) {
  r.get('/status', (req, res) => res.json(proprio.status(req.dono)));
  r.post('/conectar', async_(async (req, res) => res.json(await proprio.conectar(req.dono))));
  r.post('/desconectar', async_(async (req, res) => res.json(await proprio.desconectar(req.dono))));
  r.post('/reiniciar', async_(async (req, res) => res.json(await proprio.reiniciar(req.dono))));
  r.get('/chave', (req, res) => {
    const c = db.get('SELECT criada_em FROM whatsapp_api_chaves WHERE dono = ?', req.dono);
    res.json({ existe: Boolean(c), criada_em: c?.criada_em || null });
  });
  // A chave só aparece nesta resposta: o banco guarda apenas o resumo dela. Gerar outra invalida a anterior.
  r.post('/chave', (req, res) => {
    const chave = `ofw_${crypto.randomBytes(32).toString('hex')}`;
    db.run(`INSERT INTO whatsapp_api_chaves (dono, hash, criada_em) VALUES (?, ?, datetime('now'))
            ON CONFLICT (dono) DO UPDATE SET hash = excluded.hash, criada_em = excluded.criada_em`, req.dono, hash(chave));
    res.json({ chave });
  });
  r.delete('/chave', (req, res) => {
    db.run('DELETE FROM whatsapp_api_chaves WHERE dono = ?', req.dono);
    res.json({ ok: true });
  });
  r.get('/webhook', (req, res) => res.json(proprio.lerWebhook(req.dono)));
  r.put('/webhook', lerJson, async_((req, res) => res.json(proprio.salvarWebhook(req.dono, req.body?.url))));
  rotasComuns(r);
}

const admin = express.Router();
admin.use(semCache, auth.requireAdmin, (req, res, next) => { req.dono = 'site'; next(); });
rotasDoPainel(admin);
router.use('/api/admin/wa', admin);

const cliente = express.Router();
cliente.use(semCache, clientes.exigir, (req, res, next) => { req.dono = proprio.donoDe(req.cliente.id); next(); });
rotasDoPainel(cliente);
router.use('/api/cliente/wa', cliente);

const externa = express.Router();
externa.use(semCache, exigirChave);
externa.get('/status', (req, res) => {
  const { fase, conectado, numero, nome, erro: motivo } = proprio.status(req.dono);
  res.json({ fase, conectado, numero, nome, erro: motivo });
});
rotasComuns(externa);
router.use('/api/wa', externa);

module.exports = router;
