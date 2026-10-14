// Banco de dados SQLite usando o módulo nativo do Node (node:sqlite, Node >= 22.13).
// Não precisa compilar nada: funciona igual no Windows, no Linux e no Docker.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'ofertas.db');
const db = new DatabaseSync(DB_PATH);

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
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('consumidor', 'empresa')),
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    empresa_nome TEXT,
    cnpj TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'banned', 'rejected')),
    status_motivo TEXT,
    suspenso_ate TEXT,
    bloqueio_publicacao INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

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

// Dados cadastrais completos de pessoas e empresas
const USER_EXTRA_COLUMNS = [
  'cpf', 'data_nascimento', 'telefone',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
  'razao_social', 'inscricao_estadual', 'telefone_empresa', 'ramo', 'site_empresa',
  'emp_cep', 'emp_logradouro', 'emp_numero', 'emp_complemento', 'emp_bairro', 'emp_cidade', 'emp_uf',
  'aceite_termos_em',
];
const userColumns = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
for (const col of USER_EXTRA_COLUMNS) {
  if (!userColumns.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cpf ON users (cpf) WHERE cpf IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cnpj ON users (cnpj) WHERE cnpj IS NOT NULL');

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

module.exports = { db, all, get, run, transaction, DB_PATH };
