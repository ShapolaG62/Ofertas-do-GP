const db = require('./db');

// Termos buscados automaticamente em todas as lojas com coleta automática (lista em search-terms.js).
// Formato de cada linha: "termo" ou "termo | categoria".
const { DEFAULT_SEARCH_TERMS } = require('./search-terms');

const DEFAULTS = {
  // Site / redes sociais (públicos)
  whatsapp_link: 'https://chat.whatsapp.com/KRMTOE1KWMzK5CzopNC41e',
  whatsapp_anuncios: '556282417271', // número que atende empresas interessadas em anunciar
  telegram_link: '',
  instagram_user: '',
  adsense_client: '',            // ID de editor do Google AdSense (ca-pub-...)
  adsense_ativo: '0',            // mostrar anúncios do Google nos espaços sem campanha de anunciante
  adsense_slot_topo: '',         // códigos dos blocos de anúncio (data-ad-slot) de cada espaço
  adsense_slot_meio: '',
  adsense_slot_lateral: '',
  adsense_slot_paginas: '',
  ga_id: '',

  // Mineração
  search_terms: DEFAULT_SEARCH_TERMS,
  mining_terms_per_run: '60', // termos por rodada; a lista inteira é percorrida em rodízio
  mining_interval_min: '120',
  offer_max_age_hours: '24',
  manual_offer_days: '3',
  min_discount_pct: '5',
  stores_enabled: JSON.stringify({ amazon: true, mercadolivre: true, aliexpress: true, shopee: true, kabum: true }),

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
  kabum_afiliado: '',        // modelo do link de afiliado da KaBuM! com {url} (ou parâmetros para acrescentar)
  magalu_store: '',

  // Cadastro de usuários do site: 'aberto' (entra na hora), 'aprovacao' (admin libera) ou 'fechado'
  signup_consumidor: 'aprovacao',
  signup_empresa: 'aprovacao',
  signup_afiliado: 'aprovacao',
  loja_max_produtos: '300',

  // '1' = só usuários logados e liberados veem as ofertas (a primeira página vira o login)
  exigir_login: '1',

  // Login com Google (Google Cloud > APIs e serviços > Credenciais > ID do cliente OAuth)
  google_client_id: '',
  google_client_secret: '',
  // Endereço público do site (ex.: https://ofertou.com.br). Vazio = usa o endereço acessado.
  site_url: '',

  // Postagem automática nas redes sociais (APIs oficiais)
  telegram_bot_token: '',   // @BotFather
  telegram_chat_id: '',     // @canal ou id do grupo (-100...)
  facebook_page_id: '',
  facebook_page_token: '',  // token de acesso da página (também usado pelo Instagram)
  instagram_business_id: '',
  x_api_key: '',
  x_api_secret: '',
  x_access_token: '',
  x_access_secret: '',

  // WhatsApp (número separado, conectado por Z-API ou Evolution API)
  whatsapp_provider: '',        // 'zapi' | 'evolution'
  zapi_instance: '',
  zapi_token: '',
  zapi_client_token: '',        // "token de segurança da conta" (opcional)
  evolution_url: '',
  evolution_api_key: '',
  evolution_instance: '',
  whatsapp_groups: '[]',        // grupos de destino: [{ id, nome }]
  whatsapp_intervalo_s: '90',   // espera entre uma oferta e outra no WhatsApp

  // Marca d'água nas imagens das postagens
  marca_ativa: '1',
  marca_texto: 'Ofertou!',
  marca_posicao: 'inferior-direito', // inferior-direito | inferior-esquerdo | superior-direito | superior-esquerdo | centro
  marca_opacidade: '90',             // 30 a 100 (%)

  // Planos pagos (página de login) — nome, preço (R$) e dias de acesso de cada um
  plano_consumidor_nome: 'Caçador de Ofertas',
  plano_consumidor_preco: '9.90',
  plano_consumidor_dias: '30',
  plano_consumidor_ativo: '1',
  plano_empresa_nome: 'Loja Parceira',
  plano_empresa_preco: '49.90',
  plano_empresa_dias: '30',
  plano_empresa_ativo: '1',
  plano_pro_nome: 'Afiliado Pro',
  plano_pro_preco: '79.90',
  plano_pro_dias: '30',
  plano_pro_ativo: '1',
  // Formas de recebimento (Painel → Planos). Cada uma liga/desliga sozinha.
  //  • Mercado Pago: Pix com QR code e cartão pelo checkout, confirmação automática.
  //  • Pix pela chave, transferência bancária e link de pagamento: o admin confirma cada pedido.
  mp_access_token: '',
  pag_mp_pix: '1',
  pag_mp_cartao: '1',
  pag_mp_parcelas: '1',         // parcelas máximas no cartão
  pag_pix_ativo: '1',
  pix_chave: '',
  pix_tipo: '',                 // cpf, cnpj, email, telefone ou aleatoria
  pix_nome: '',
  pix_banco: '',
  pag_ted_ativo: '0',
  ted_banco: '',
  ted_agencia: '',
  ted_conta: '',
  ted_tipo_conta: 'corrente',
  ted_titular: '',
  ted_documento: '',
  pag_link_ativo: '0',
  pag_link_nome: 'Cartão de crédito',
  pag_link_consumidor: '',      // links de pagamento prontos (PagBank, InfinitePay, PicPay…), um por plano
  pag_link_empresa: '',
  pag_link_pro: '',
  // App nas lojas (Google Play / App Store) com compras validadas pelo RevenueCat
  app_ativo: '0',
  rc_chave_android: '',         // chave pública do SDK (goog_...)
  rc_chave_ios: '',             // chave pública do SDK (appl_...)
  rc_chave_secreta: '',         // chave secreta da API (sk_...)
  rc_webhook_auth: '',          // valor do cabeçalho Authorization configurado no webhook do RevenueCat
  app_produto_consumidor: 'ofertou_consumidor_mensal',
  app_produto_empresa: 'ofertou_empresa_mensal',
  app_produto_pro: 'ofertou_pro_mensal',
  pag_whatsapp: '',             // WhatsApp para o comprovante (vazio = o mesmo dos anúncios)
  pag_instrucoes: '',           // recado extra na tela de pagamento
  // E-mail de confirmação (SMTP — ex.: Gmail com "senha de app")
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',

  // Postagens agendadas (3 vezes por dia)
  agenda_ativa: '0',
  agenda_horarios: '09:00,14:00,20:00', // horário de Brasília
  agenda_qtd: '5',
  agenda_redes: '["whatsapp"]',
  agenda_completar: '1',        // completa a fila com as melhores ofertas do momento
};

// Chaves que o site público pode ler.
const PUBLIC_KEYS = ['whatsapp_link', 'telegram_link', 'instagram_user', 'adsense_client', 'ga_id'];

// Chaves que nunca saem do servidor em texto puro (nem para o painel).
const SECRET_KEYS = ['ml_client_secret', 'shopee_app_secret', 'aliexpress_app_secret', 'google_client_secret',
  'telegram_bot_token', 'facebook_page_token', 'x_api_secret', 'x_access_token', 'x_access_secret',
  'zapi_token', 'zapi_client_token', 'evolution_api_key', 'mp_access_token', 'smtp_pass', 'rc_chave_secreta', 'rc_webhook_auth'];

// Chaves internas que o painel não pode alterar pela tela de configurações.
const INTERNAL_KEYS = ['admin_password_hash', 'mining_cursor', 'agenda_ultimas'];

for (const [key, value] of Object.entries(DEFAULTS)) {
  db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, value);
}
// O site passou a se chamar Ofertou!: a marca d'água que ainda usa o nome antigo padrão acompanha a mudança.
db.run("UPDATE settings SET value = 'Ofertou!' WHERE key = 'marca_texto' AND value = 'Ofertas do GP'");

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
    if (['stores_enabled', 'whatsapp_groups', 'agenda_redes'].includes(key) && typeof value === 'object') value = JSON.stringify(value);
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
