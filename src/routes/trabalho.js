// Área de trabalho da equipe (/trabalho): SAC, Moderação do chat, Postagens e Equipe (cargos e permissões).
// Cada pessoa vê só o que o cargo dela permite (src/cargos.js). O dono do site (admin) é Proprietário: vê e faz tudo.
const express = require('express');
const perfis = require('../perfis');
const sac = require('../sac');
const mod = require('../moderacao-chat');
const cargos = require('../cargos');
const equipe = require('../equipe');

const router = express.Router();
const sendError = (res, err) => res.status(err.status || 400).json({ error: err.message });

function exigir(permissao) {
  return (req, res, next) => {
    req.dono = perfis.donoDe(req);
    if (!req.dono) return res.status(401).json({ error: 'Entre na sua conta.' });
    if (permissao && !cargos.pode(req.dono, permissao)) return res.status(403).json({ error: 'Seu cargo não tem acesso a esta parte.' });
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
}

// O que esta pessoa pode fazer na Área de trabalho
router.get('/api/trabalho/me', exigir(null), (req, res) => {
  const eu = cargos.de(req.dono);
  res.json({
    nome: eu.dono_site ? 'Proprietário' : require('../chat').pessoa(req.dono).nome,
    cargo: eu.cargo, cargo_nome: eu.cargo_nome || null, dono_site: eu.dono_site, permissoes: eu.permissoes,
    xingamentos: eu.permissoes.includes('moderar') ? mod.novos() : 0,
    sac_fila: eu.permissoes.includes('sac') ? sac.resumoAtendente(req.dono)?.fila || 0 : 0,
  });
});

// Moderação do chat
router.get('/api/moderacao', exigir('moderar'), (req, res) => {
  res.json({ conversas: mod.listar({ status: String(req.query.status || '') }), novos: mod.novos(), pode_punir: cargos.pode(req.dono, 'punir') });
});
router.get('/api/moderacao/:origem/:id', exigir('moderar'), (req, res) => {
  try { res.json({ ...mod.detalhe(req.params.origem, req.params.id), pode_punir: cargos.pode(req.dono, 'punir') }); } catch (err) { sendError(res, err); }
});
router.post('/api/moderacao/:origem/:id/acao', exigir('moderar'), (req, res) => {
  try { res.json({ ...mod.punir(req.params.origem, req.params.id, req.body || {}, req.dono), pode_punir: cargos.pode(req.dono, 'punir') }); } catch (err) { sendError(res, err); }
});

// Equipe: pessoas, cargos e permissões
router.get('/api/equipe', exigir('equipe'), (req, res) => {
  const eu = cargos.de(req.dono);
  // Cargos e permissões: só o dono do site, Proprietários e Gerentes veem (só o dono muda)
  const verCargos = eu.dono_site || ['proprietario', 'gerente'].includes(eu.cargo);
  res.json({
    equipe: equipe.listar(req.dono), cargos_permitidos: equipe.cargosPermitidos(req.dono), dono_site: eu.dono_site, meu_nivel: eu.nivel,
    nomes: { cargos: cargos.CARGOS.map(c => ({ id: c.id, nome: c.nome })), permissoes: cargos.PERMISSOES.map(p => ({ id: p.id, nome: p.nome })) },
    ver_cargos: verCargos, matriz: verCargos ? cargos.matriz() : null,
  });
});
router.post('/api/equipe', exigir('equipe'), (req, res) => { try { res.json({ pessoa: equipe.adicionar(req.body || {}, req.dono) }); } catch (err) { sendError(res, err); } });
router.post('/api/equipe/:id/cargo', exigir('equipe'), (req, res) => { try { res.json({ pessoa: equipe.atualizar(req.params.id, req.body || {}, req.dono) }); } catch (err) { sendError(res, err); } });
router.post('/api/equipe/:id/senha', exigir('equipe'), (req, res) => { try { res.json({ pessoa: equipe.definirSenha(req.params.id, req.body?.senha, req.dono) }); } catch (err) { sendError(res, err); } });
router.post('/api/equipe/:id/remover', exigir('equipe'), (req, res) => { try { res.json({ ok: equipe.remover(req.params.id, req.dono) }); } catch (err) { sendError(res, err); } });
// Cargos e permissões: só o Proprietário dono do site muda
router.put('/api/equipe/cargos', exigir('equipe'), (req, res) => {
  if (!cargos.de(req.dono).dono_site) return res.status(403).json({ error: 'Só o Proprietário (dono do site) muda as permissões dos cargos.' });
  try { res.json({ matriz: cargos.salvarMatriz(req.body?.matriz || {}) }); } catch (err) { sendError(res, err); }
});

module.exports = router;
