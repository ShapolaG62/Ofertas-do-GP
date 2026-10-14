const db = require('./db');

// Termos buscados automaticamente em todas as lojas com coleta automática.
// Formato de cada linha: "termo" ou "termo | categoria".
const DEFAULT_SEARCH_TERMS = [
  'iphone | celulares',
  'samsung galaxy | celulares',
  'celular xiaomi | celulares',
  'notebook | informatica',
  'monitor gamer | informatica',
  'teclado mecanico | informatica',
  'ssd 1tb | informatica',
  'playstation 5 | games',
  'nintendo switch | games',
  'headset gamer | games',
  'smart tv | audio_tv',
  'fone bluetooth | audio_tv',
  'caixa de som jbl | audio_tv',
  'air fryer | cozinha',
  'cafeteira | cozinha',
  'robo aspirador | eletrodomesticos',
  'ar condicionado | eletrodomesticos',
  'tenis | moda',
  'smartwatch | moda',
  'perfume | beleza',
  'whey protein | saude',
  'creatina | saude',
  'parafusadeira | ferramentas',
].join('\n');

const DEFAULTS = {
  // Site / redes sociais (públicos)
  whatsapp_link: 'https://chat.whatsapp.com/KRMTOE1KWMzK5CzopNC41e',
  telegram_link: '',
  instagram_user: '',
  adsense_client: '',
  ga_id: '',

  // Mineração
  search_terms: DEFAULT_SEARCH_TERMS,
  mining_interval_min: '120',
  offer_max_age_hours: '24',
  manual_offer_days: '3',
  min_discount_pct: '5',
  stores_enabled: JSON.stringify({ amazon: true, mercadolivre: true, aliexpress: true, shopee: true }),

  // Afiliados
  amazon_tag: '',
  ml_matt_word: '',
  ml_matt_tool: '',
  ml_client_id: '',
  ml_client_secret: '',
  shopee_app_id: '',
  shopee_app_secret: '',
  aliexpress_app_key: '',
  aliexpress_app_secret: '',
  aliexpress_tracking_id: '',
  magalu_store: '',

  // Cadastro de usuários do site: 'aberto' (entra na hora), 'aprovacao' (admin libera) ou 'fechado'
  signup_consumidor: 'aprovacao',
  signup_empresa: 'aprovacao',
  loja_max_produtos: '300',

  // Login com Google (Google Cloud > APIs e serviços > Credenciais > ID do cliente OAuth)
  google_client_id: '',
  google_client_secret: '',
  // Endereço público do site (ex.: https://ofertasdogp.com.br). Vazio = usa o endereço acessado.
  site_url: '',
};

// Chaves que o site público pode ler.
const PUBLIC_KEYS = ['whatsapp_link', 'telegram_link', 'instagram_user', 'adsense_client', 'ga_id'];

// Chaves que nunca saem do servidor em texto puro (nem para o painel).
const SECRET_KEYS = ['ml_client_secret', 'shopee_app_secret', 'aliexpress_app_secret', 'google_client_secret'];

// Chaves internas que o painel não pode alterar pela tela de configurações.
const INTERNAL_KEYS = ['admin_password_hash'];

for (const [key, value] of Object.entries(DEFAULTS)) {
  db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, value);
}

function getAll() {
  const map = {};
  for (const row of db.all('SELECT key, value FROM settings')) map[row.key] = row.value;
  return map;
}

function get(key) {
  const row = db.get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : DEFAULTS[key];
}

function set(key, value) {
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value == null ? '' : String(value)
  );
}

function getPublic() {
  const s = getAll();
  return Object.fromEntries(PUBLIC_KEYS.map(k => [k, s[k] || '']));
}

// Visão para o painel: segredos aparecem apenas como "configurado/não configurado".
function getForAdmin() {
  const s = getAll();
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (SECRET_KEYS.includes(key)) out[`${key}_set`] = Boolean(s[key]);
    else out[key] = s[key] ?? '';
  }
  return out;
}

// Salva somente chaves conhecidas. Segredo enviado vazio = manter o atual.
function updateFromAdmin(updates) {
  const changed = [];
  for (const [key, raw] of Object.entries(updates || {})) {
    if (!(key in DEFAULTS) || INTERNAL_KEYS.includes(key)) continue;
    let value = typeof raw === 'string' ? raw.trim() : raw;
    if (key === 'stores_enabled' && typeof value === 'object') value = JSON.stringify(value);
    if (SECRET_KEYS.includes(key) && !value) continue;
    set(key, value);
    changed.push(key);
  }
  return changed;
}

function getNumber(key, fallback) {
  const n = Number(get(key));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getEnabledStores() {
  try { return JSON.parse(get('stores_enabled') || '{}'); } catch { return {}; }
}

function getSearchTerms() {
  return String(get('search_terms') || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [query, cat] = line.split('|').map(s => s.trim());
      return { query, cat: cat || null };
    })
    .filter(t => t.query);
}

module.exports = {
  DEFAULTS, getAll, get, set, getPublic, getForAdmin, updateFromAdmin,
  getNumber, getEnabledStores, getSearchTerms,
};
