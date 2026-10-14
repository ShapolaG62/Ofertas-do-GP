// Banco de dados SQLite usando o módulo nativo do Node (node:sqlite, Node >= 22.13).
// Não precisa compilar nada: funciona igual no Windows, no Linux e no Docker.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Na Vercel a pasta do projeto é somente leitura: o banco vai para a pasta temporária (/tmp),
// que é apagada sempre que a Vercel recicla o servidor. Lá o site funciona só como vitrine de teste.
const DATA_DIR = process.env.DATA_DIR
  || (process.env.VERCEL ? path.join(require('os').tmpdir(), 'ofertas-do-gp') : path.join(__dirname, '..', 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'ofertas.db');
const db = new DatabaseSync(DB_PATH);

// Estrutura atual da tabela de usuários do site (também usada para migrar bancos antigos).
const USER_DATA_COLUMNS = [
  'cpf', 'data_nascimento', 'telefone',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
  'razao_social', 'inscricao_estadual', 'telefone_empresa', 'ramo', 'site_empresa',
  'emp_cep', 'emp_logradouro', 'emp_numero', 'emp_complemento', 'emp_bairro', 'emp_cidade', 'emp_uf',
  'aceite_termos_em',
];
const USERS_COLUMNS = `
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT CHECK (tipo IS NULL OR tipo IN ('consumidor', 'empresa')),
    nome TEXT,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT,
    google_id TEXT UNIQUE,
    avatar_url TEXT,
    empresa_nome TEXT,
    cnpj TEXT,
    status TEXT NOT NULL DEFAULT 'onboarding'
      CHECK (status IN ('onboarding', 'pending', 'active', 'suspended', 'banned', 'rejected')),
    status_motivo TEXT,
    suspenso_ate TEXT,
    bloqueio_publicacao INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT,
    ${USER_DATA_COLUMNS.map(c => `${c} TEXT`).join(',\n    ')}
`;

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id TEXT NOT NULL,
    store_product_id TEXT NOT NULL,
    plataforma TEXT NOT NULL,
    produto TEXT NOT NULL,
    preco_atual REAL NOT NULL,
    preco_anterior REAL NOT NULL,
    desconto_pct INTEGER NOT NULL,
    categoria TEXT,
    imagem TEXT,
    original_url TEXT NOT NULL,
    affiliate_url TEXT,
    aff_fixed INTEGER NOT NULL DEFAULT 0,
    fonte TEXT NOT NULL DEFAULT 'auto',
    oculto INTEGER NOT NULL DEFAULT 0,
    link_clicks INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    UNIQUE (store_id, store_product_id)
  );
  CREATE INDEX IF NOT EXISTS idx_offers_seen ON offers (last_seen_at);

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    price REAL NOT NULL,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_history_offer ON price_history (offer_id);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS store_status (
    store_id TEXT PRIMARY KEY,
    status TEXT,
    message TEXT,
    found INTEGER DEFAULT 0,
    saved INTEGER DEFAULT 0,
    last_run_at TEXT,
    last_success_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  -- Usuários do site (consumidores e empresas). Não têm acesso ao painel /admin.
  -- tipo fica vazio até a pessoa escolher o perfil no primeiro acesso (status 'onboarding').
  CREATE TABLE IF NOT EXISTS users (${USERS_COLUMNS});

  CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  -- Loja de uma empresa dentro do site
  CREATE TABLE IF NOT EXISTS lojas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    descricao TEXT,
    logo_url TEXT,
    site_url TEXT,
    feed_url TEXT,
    feed_tipo TEXT,
    feed_status TEXT,
    feed_mensagem TEXT,
    feed_ultima_sync TEXT,
    oculta INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS moderation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_email TEXT,
    acao TEXT NOT NULL,
    detalhe TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS blocked_emails (
    email TEXT PRIMARY KEY,
    motivo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrações simples: colunas adicionadas depois da primeira versão.
const offerColumns = db.prepare('PRAGMA table_info(offers)').all().map(c => c.name);
if (!offerColumns.includes('subcategoria')) db.exec('ALTER TABLE offers ADD COLUMN subcategoria TEXT');
if (!offerColumns.includes('loja_id')) {
  db.exec('ALTER TABLE offers ADD COLUMN loja_id INTEGER REFERENCES lojas(id) ON DELETE CASCADE');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_offers_loja ON offers (loja_id)');

// Bancos antigos: a tabela de usuários exigia tipo e senha. Recria com a estrutura nova copiando os dados.
const usersSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get()?.sql || '';
if (!usersSql.includes("'onboarding'")) {
  const oldCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`CREATE TABLE users_new (${USERS_COLUMNS})`);
    const newCols = db.prepare('PRAGMA table_info(users_new)').all().map(c => c.name);
    const common = oldCols.filter(c => newCols.includes(c)).join(', ');
    db.exec(`INSERT INTO users_new (${common}) SELECT ${common} FROM users`);
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cpf ON users (cpf) WHERE cpf IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cnpj ON users (cnpj) WHERE cnpj IS NOT NULL');

// Detalhes dos anúncios criados pelas empresas (1 para 1 com a oferta)
db.exec(`
  CREATE TABLE IF NOT EXISTS ad_details (
    offer_id INTEGER PRIMARY KEY REFERENCES offers(id) ON DELETE CASCADE,
    descricao TEXT,
    marca TEXT,
    modelo TEXT,
    condicao TEXT,
    garantia TEXT,
    parcelamento TEXT,
    frete TEXT,
    frete_valor REAL,
    prazo_entrega TEXT,
    estoque INTEGER,
    sku TEXT,
    ean TEXT,
    cupom_codigo TEXT,
    cupom_descricao TEXT,
    whatsapp TEXT,
    imagens TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Publicidade: campanhas de empresas que contrataram espaço no site e pedidos de contato.
db.exec(`
  CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anunciante TEXT NOT NULL,
    contato TEXT,
    espaco TEXT NOT NULL,
    link TEXT NOT NULL,
    imagem TEXT NOT NULL,
    imagem_mobile TEXT,
    texto_alt TEXT,
    inicio TEXT NOT NULL,
    fim TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    impressoes INTEGER NOT NULL DEFAULT 0,
    cliques INTEGER NOT NULL DEFAULT 0,
    observacoes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_banners_espaco ON banners (espaco, ativo);

  CREATE TABLE IF NOT EXISTS ad_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    empresa TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT,
    espaco TEXT,
    mensagem TEXT,
    status TEXT NOT NULL DEFAULT 'novo',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const all = (sql, ...params) => db.prepare(sql).all(...params);
const get = (sql, ...params) => db.prepare(sql).get(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { db, all, get, run, transaction, DB_PATH, UPLOADS_DIR };
