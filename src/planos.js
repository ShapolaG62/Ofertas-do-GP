// Planos (pagos ou grátis), na página inicial, em /assinar e no app. Ficam na tabela `planos` e são criados,
// editados e excluídos em Painel → Planos. Cada plano tem um ou mais TIPOS DE ACESSO, que definem o que a pessoa ganha:
//   consumidor  → vê todas as ofertas na hora, sem esperar aprovação;
//   empresa     → + loja própria no site, anúncios e importação do catálogo (com limite de produtos opcional);
//   ferramenta  → painel de afiliado: os próprios links de afiliado, redes sociais, agendamento e marca d'água.
// Com Consumidor e Empresa no mesmo plano, quem assina escolhe o tipo da conta. Com Ferramenta junto de um deles,
// a conta do site ganha também o painel de afiliado (mesmo login).
// E funções extras do perfil (vitrine, capa, links, cores, endereço próprio, moldura e selo).
// Preço 0 = plano grátis (liberado na hora, sem pagamento). Dias 0 = sem vencimento.
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const TIPOS = {
  consumidor: { nome: 'Consumidor', conta: 'usuario', perfil: 'consumidor', icone: 'consumidor' },
  empresa: { nome: 'Empresa (loja no site)', conta: 'usuario', perfil: 'empresa', icone: 'empresa' },
  ferramenta: { nome: 'Ferramenta de afiliado', conta: 'cliente', perfil: null, icone: 'pro' },
};

// Funções do perfil que cada plano pode liberar (com os limites aceitos)
const PERFIL_PADRAO = { vitrine: 4, bio: 300, capa: true, links: 1, cores_extras: true, gradiente: false, slug_livre: false, moldura: false, selo: 'Assinante' };
const PERFIL_LIMITES = { vitrine: [3, 12], bio: [160, 800], links: [0, 6] };

// O que cada tipo de acesso inclui (usado no comparativo da página inicial e nos benefícios sugeridos)
const FUNCOES_TIPO = {
  consumidor: ['Todas as ofertas reais das grandes lojas', 'Acesso liberado na hora, sem esperar aprovação', 'Busca, filtros e histórico de preço'],
  empresa: ['Página da sua loja no site', 'Anúncios com fotos, cupom e frete', 'Importação automática do catálogo'],
  ferramenta: ['Seus links de afiliado em todas as ofertas', 'Postagem automática no WhatsApp, Telegram, Facebook, Instagram e X',
    'Agendamento de manhã, à tarde e à noite', 'Marca d\'água com o seu nome nas imagens'],
};

db.db.exec(`
  CREATE TABLE IF NOT EXISTS planos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('consumidor', 'empresa', 'ferramenta')),
    preco REAL NOT NULL DEFAULT 0,
    dias INTEGER NOT NULL DEFAULT 30,
    ativo INTEGER NOT NULL DEFAULT 1,       -- à venda
    arquivado INTEGER NOT NULL DEFAULT 0,   -- excluído, mas ainda com assinantes até o fim do prazo
    ordem INTEGER NOT NULL DEFAULT 10,
    chamada TEXT,
    ideal TEXT,
    beneficios TEXT,                        -- JSON: lista de frases
    destaque TEXT,                          -- texto da faixa no cartão (ex.: "Mais completo"); vazio = sem destaque
    icone TEXT,
    recursos TEXT,                          -- JSON: { perfil: {...}, max_produtos }
    link_pagamento TEXT,                    -- link de pagamento pronto (PagBank, InfinitePay…), opcional
    produto_app TEXT,                       -- ID da assinatura na Google Play / App Store
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Vários tipos de acesso por plano (a coluna "tipo" guarda o principal, usado no ícone e no selo)
try { db.db.exec('ALTER TABLE planos ADD COLUMN tipos TEXT'); } catch { /* já existe */ }

// Primeira vez: cria os 3 planos de antes, com os preços e links que já estavam no painel.
if (!db.get('SELECT 1 FROM planos LIMIT 1')) {
  const s = settings.getAll();
  const preco = id => Math.round(Number(String(s[`plano_${id}_preco`] || '0').replace(',', '.')) * 100) / 100;
  const ANTIGOS = [
    { id: 'consumidor', tipo: 'consumidor', ordem: 1, chamada: 'Para quem quer economizar', ideal: 'Para você que compra online e não quer pagar caro nem cair em desconto falso.',
      beneficios: ['Acesso imediato, sem esperar aprovação', 'Milhares de ofertas reais de Amazon, Mercado Livre, AliExpress, KaBuM! e mais',
        'Preços conferidos várias vezes por dia', 'Busca, filtros por loja, categoria, preço e desconto', 'Histórico de preço para não cair em desconto falso'],
      perfil: { vitrine: 4, bio: 300, capa: true, links: 1, cores_extras: true, gradiente: false, slug_livre: false, moldura: false, selo: 'Assinante' } },
    { id: 'empresa', tipo: 'empresa', ordem: 2, chamada: 'Para lojas que querem vender mais', ideal: 'Para lojas físicas e virtuais que querem mostrar suas promoções a quem está pronto para comprar.',
      beneficios: ['Tudo do plano Caçador de Ofertas', 'Sua loja dentro do site, com página própria', 'Criador de anúncios com fotos, cupom e frete',
        'Importação automática do catálogo (Shopify, WooCommerce ou feed XML)', 'Seus produtos com desconto aparecem para todos os visitantes'],
      perfil: { vitrine: 6, bio: 400, capa: true, links: 4, cores_extras: true, gradiente: false, slug_livre: false, moldura: false, selo: 'Loja verificada' } },
    { id: 'pro', tipo: 'ferramenta', ordem: 3, destaque: 'Mais completo', chamada: 'Para quem divulga ofertas e ganha comissão',
      ideal: 'Para afiliados e donos de grupos de ofertas que querem postar no automático e ganhar comissão.',
      beneficios: ['Painel próprio com os SEUS links de afiliado (Amazon, Mercado Livre, KaBuM!, AliExpress, Shopee, Magalu)',
        'Mais de 20 mil ofertas reais mineradas para você postar', 'Postagem automática no seu WhatsApp, Telegram, Facebook, Instagram e X',
        'Agendamento: ofertas nos seus grupos de manhã, à tarde e à noite', 'Marca d\'água com o seu nome nas imagens'],
      perfil: { vitrine: 8, bio: 500, capa: true, links: 5, cores_extras: true, gradiente: true, slug_livre: true, moldura: true, selo: 'Afiliado Pro' } },
  ];
  const nomes = { consumidor: 'Caçador de Ofertas', empresa: 'Loja Parceira', pro: 'Afiliado Pro' };
  for (const p of ANTIGOS) {
    db.run(`INSERT INTO planos (id, nome, tipo, preco, dias, ativo, ordem, chamada, ideal, beneficios, destaque, icone, recursos, link_pagamento, produto_app)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.id, s[`plano_${p.id}_nome`] || nomes[p.id], p.tipo, preco(p.id) || { consumidor: 9.9, empresa: 49.9, pro: 79.9 }[p.id],
    Math.min(Math.max(parseInt(s[`plano_${p.id}_dias`], 10) || 30, 1), 3650), s[`plano_${p.id}_ativo`] === '0' ? 0 : 1, p.ordem,
    p.chamada, p.ideal, JSON.stringify(p.beneficios), p.destaque || null, TIPOS[p.tipo].icone, JSON.stringify({ perfil: p.perfil }),
    String(s[`pag_link_${p.id}`] || '').trim() || null, String(s[`app_produto_${p.id}`] || '').trim() || `ofertou_${p.id === 'pro' ? 'pro' : p.id}_mensal`);
  }
}

const json = (t, padrao) => { try { return JSON.parse(t) ?? padrao; } catch { return padrao; } };
const ORDEM_TIPOS = ['consumidor', 'empresa', 'ferramenta'];
const tiposDe = r => { const t = json(r.tipos, null); const v = (Array.isArray(t) ? t : [r.tipo]).filter(x => TIPOS[x]); return ORDEM_TIPOS.filter(x => v.includes(x)); };
const principal = tipos => (tipos.includes('empresa') ? 'empresa' : tipos.includes('consumidor') ? 'consumidor' : 'ferramenta');
// Validade "sem vencimento" (plano com 0 dias)
const SEM_VENCIMENTO = '9999-12-31 23:59:59';

// Formato usado pelo resto do site (o mesmo de antes: conta, perfil, beneficios…)
function montar(r) {
  if (!r) return null;
  const tipos = tiposDe(r);
  const tipoP = principal(tipos);
  const tipo = TIPOS[tipoP];
  const recursos = json(r.recursos, {});
  const perfis = tipos.filter(t => TIPOS[t].perfil); // tipos de conta do site que o plano aceita
  return {
    id: r.id, nome: r.nome, tipo: tipoP, tipos, tipo_nome: tipos.map(t => TIPOS[t].nome).join(' + '),
    // conta: 'usuario' (conta do site, com ou sem a ferramenta junto) ou 'cliente' (só a ferramenta)
    conta: perfis.length ? 'usuario' : 'cliente', perfis, perfil: perfis[0] || null, ferramenta: tipos.includes('ferramenta'),
    preco: r.preco, gratis: !(r.preco > 0), dias: r.dias, sem_vencimento: r.dias === 0, ativo: Boolean(r.ativo) && !r.arquivado, arquivado: Boolean(r.arquivado), ordem: r.ordem,
    chamada: r.chamada || '', ideal: r.ideal || '', beneficios: json(r.beneficios, []),
    destaque: r.destaque || '', icone: r.icone || tipo.icone,
    recursos: { perfil: { ...PERFIL_PADRAO, ...(recursos.perfil || {}) }, max_produtos: recursos.max_produtos || 0 },
    funcoes: [...new Set(tipos.flatMap(t => FUNCOES_TIPO[t]))],
    link_pagamento: r.link_pagamento || '', produto_app: r.produto_app || '',
  };
}

// Plano por id (inclusive arquivado, para quem ainda tem assinatura dele). O 2º argumento é ignorado (compatibilidade).
const plano = id => montar(db.get('SELECT * FROM planos WHERE id = ?', String(id || '')));
// Planos à venda, na ordem do painel.
const listar = () => db.all('SELECT * FROM planos WHERE ativo = 1 AND arquivado = 0 ORDER BY ordem, preco').map(montar);
const todos = () => db.all('SELECT * FROM planos WHERE arquivado = 0 ORDER BY ordem, preco').map(montar);

// Quantas pessoas ainda têm este plano em vigor (contas do site e clientes da ferramenta)
function assinantes(id) {
  const u = db.get(`SELECT COUNT(*) n FROM users WHERE plano = ? AND assinatura_ate > datetime('now')`, id).n;
  // (o acesso à ferramenta de quem já conta pela conta do site não entra duas vezes)
  const c = db.get(`SELECT COUNT(*) n FROM clientes c WHERE c.plano = ? AND c.validade > datetime('now') AND c.status = 'ativo'
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.cliente_id = c.id AND u.plano = c.plano AND u.assinatura_ate > datetime('now'))`, id).n;
  return u + c;
}

// ── Painel: criar, editar, excluir ──────────────────────────────────────────
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const numero = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const entre = (v, [min, max], padrao) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : padrao; };
const sim = v => v === true || v === 1 || v === '1' || v === 'on' || v === 'true';

function validar(b, atual = null) {
  const nome = texto(b.nome, 40);
  if (nome.length < 2) throw fail('Dê um nome ao plano.');
  const pedidos = Array.isArray(b.tipos) ? b.tipos : b.tipos ? [b.tipos] : b.tipo ? [b.tipo] : atual ? tiposDe(atual) : [];
  const tipos = ORDEM_TIPOS.filter(t => pedidos.includes(t));
  if (!tipos.length) throw fail('Marque pelo menos um tipo de acesso.');
  if (atual && tiposDe(atual).join() !== tipos.join() && assinantes(atual.id)) throw fail('Este plano tem assinantes: não dá para trocar os tipos de acesso. Crie um plano novo.');
  const gratis = sim(b.gratis);
  const preco = gratis ? 0 : Math.round(numero(b.preco) * 100) / 100;
  if (!gratis && (!(preco > 0) || preco > 100000)) throw fail('Informe o preço (ex.: 29,90) ou marque "Plano grátis".');
  const dias = sim(b.sem_vencimento) ? 0 : entre(b.dias, [1, 3650], NaN);
  if (!Number.isFinite(dias)) throw fail('Informe por quantos dias o plano vale (ou marque "Sem vencimento").');
  const tipo = principal(tipos);
  const p = b.perfil || {};
  const perfil = {
    vitrine: entre(p.vitrine, PERFIL_LIMITES.vitrine, PERFIL_PADRAO.vitrine),
    bio: entre(p.bio, PERFIL_LIMITES.bio, PERFIL_PADRAO.bio),
    links: entre(p.links, PERFIL_LIMITES.links, PERFIL_PADRAO.links),
    capa: sim(p.capa), cores_extras: sim(p.cores_extras), gradiente: sim(p.gradiente),
    slug_livre: sim(p.slug_livre), moldura: sim(p.moldura), selo: texto(p.selo, 30),
  };
  const beneficios = (Array.isArray(b.beneficios) ? b.beneficios : String(b.beneficios || '').split('\n'))
    .map(x => texto(x, 140)).filter(Boolean).slice(0, 12);
  if (!beneficios.length) throw fail('Escreva pelo menos um benefício (ou use "Gerar a partir das funções").');
  const link = texto(b.link_pagamento, 300);
  if (link && !/^https:\/\//i.test(link)) throw fail('O link de pagamento precisa começar com https://');
  const produto = texto(b.produto_app, 100);
  if (produto && !/^[a-z0-9._:-]+$/i.test(produto)) throw fail('O ID do produto no app aceita só letras, números, ponto, hífen e sublinhado.');
  return {
    nome, tipo, tipos: JSON.stringify(tipos), preco, dias, ativo: sim(b.ativo) ? 1 : 0, ordem: entre(b.ordem, [0, 999], 10),
    chamada: texto(b.chamada, 80) || null, ideal: texto(b.ideal, 200) || null, beneficios: JSON.stringify(beneficios),
    destaque: texto(b.destaque, 24) || null, icone: ['consumidor', 'empresa', 'pro'].includes(b.icone) ? b.icone : TIPOS[tipo].icone,
    recursos: JSON.stringify({ perfil, max_produtos: tipos.includes('empresa') ? entre(b.max_produtos, [0, 100000], 0) : 0 }),
    link_pagamento: link || null, produto_app: produto || null,
  };
}

const slug = t => String(t).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

function criar(b) {
  const v = validar(b);
  let id = slug(v.nome) || 'plano';
  while (db.get('SELECT 1 FROM planos WHERE id = ?', id)) id = `${slug(v.nome).slice(0, 24) || 'plano'}-${crypto.randomBytes(2).toString('hex')}`;
  const cols = { id, ...v };
  db.run(`INSERT INTO planos (${Object.keys(cols).join(', ')}) VALUES (${Object.keys(cols).map(() => '?').join(', ')})`, ...Object.values(cols));
  return plano(id);
}

function editar(id, b) {
  const atual = db.get('SELECT * FROM planos WHERE id = ? AND arquivado = 0', String(id));
  if (!atual) throw fail('Plano não encontrado.', 404);
  const v = validar(b, atual);
  db.run(`UPDATE planos SET ${Object.keys(v).map(k => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(v), atual.id);
  return plano(atual.id);
}

// Excluir: sem assinantes, apaga. Com assinantes, sai da venda e da lista, mas continua valendo para quem já pagou
// até o fim do prazo (depois, renovam escolhendo outro plano).
function excluir(id) {
  const atual = db.get('SELECT * FROM planos WHERE id = ? AND arquivado = 0', String(id));
  if (!atual) throw fail('Plano não encontrado.', 404);
  const n = assinantes(atual.id);
  if (n) {
    db.run('UPDATE planos SET ativo = 0, arquivado = 1 WHERE id = ?', atual.id);
    return { arquivado: true, assinantes: n };
  }
  db.run('DELETE FROM planos WHERE id = ?', atual.id);
  return { arquivado: false, assinantes: 0 };
}

// Benefícios sugeridos a partir das funções escolhidas (o admin pode editar depois)
function sugerirBeneficios(b) {
  const tipos = (Array.isArray(b.tipos) ? b.tipos : [b.tipo]).filter(t => TIPOS[t]);
  const p = b.perfil || {};
  const lista = [...FUNCOES_TIPO.consumidor];
  if (sim(b.gratis)) lista.unshift('Grátis: sem pagamento, liberado na hora');
  if (sim(b.sem_vencimento)) lista.push('Acesso sem data de vencimento');
  if (tipos.includes('consumidor') && tipos.includes('empresa')) lista.push('Você escolhe: conta de consumidor ou de empresa');
  if (tipos.includes('empresa')) {
    lista.push(...FUNCOES_TIPO.empresa);
    if (parseInt(b.max_produtos, 10) > 0) lista.push(`Até ${parseInt(b.max_produtos, 10)} produtos na sua loja`);
  }
  if (tipos.includes('ferramenta')) lista.push(...FUNCOES_TIPO.ferramenta);
  const perfil = [];
  if (sim(p.capa)) perfil.push('capa');
  if (sim(p.gradiente)) perfil.push('cores em degradê');
  if (sim(p.slug_livre)) perfil.push('endereço próprio');
  if (sim(p.moldura)) perfil.push('moldura exclusiva');
  lista.push(`Perfil com ${entre(p.vitrine, PERFIL_LIMITES.vitrine, 4)} conquistas na vitrine${perfil.length ? `, ${perfil.join(', ')}` : ''}`);
  if (texto(p.selo, 30)) lista.push(`Selo "${texto(p.selo, 30)}" no seu perfil`);
  return lista;
}

// Limite de produtos da loja de uma conta de empresa (o do plano, se houver; senão o geral do painel)
function maxProdutos(userId) {
  const u = db.get('SELECT plano, assinatura_ate FROM users WHERE id = ?', userId);
  const p = u && u.plano && u.assinatura_ate > new Date().toISOString().replace('T', ' ').slice(0, 19) ? plano(u.plano) : null;
  return p && p.recursos.max_produtos > 0 ? p.recursos.max_produtos : settings.getNumber('loja_max_produtos', 300);
}

// Nova validade somando os dias do plano ao prazo que ainda resta (0 dias = sem vencimento)
function somaDias(ate, dias) {
  if (!(dias > 0) || ate === SEM_VENCIMENTO) return SEM_VENCIMENTO;
  const base = Math.max(Date.now(), new Date(String(ate || '').replace(' ', 'T') + 'Z').getTime() || 0);
  return new Date(base + dias * 86400000).toISOString().replace('T', ' ').slice(0, 19);
}

// Primeiro plano de ferramenta à venda (usado quando o admin libera um afiliado gratuito)
// (de preferência um plano só de ferramenta)
const planoFerramenta = () => {
  const lista = [...listar(), ...todos()].filter(p => p.ferramenta);
  return lista.find(p => p.conta === 'cliente') || lista[0] || null;
};

module.exports = { SEM_VENCIMENTO, somaDias, TIPOS, FUNCOES_TIPO, PERFIL_PADRAO, PERFIL_LIMITES, plano, listar, todos, assinantes, criar, editar, excluir, sugerirBeneficios, maxProdutos, planoFerramenta };
