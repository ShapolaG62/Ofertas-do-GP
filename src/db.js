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
`);

// Migrações simples: colunas adicionadas depois da primeira versão.
const offerColumns = db.prepare('PRAGMA table_info(offers)').all().map(c => c.name);
if (!offerColumns.includes('subcategoria')) db.exec('ALTER TABLE offers ADD COLUMN subcategoria TEXT');

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
