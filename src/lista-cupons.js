// Lista de cupons ativos para postar nos grupos de WhatsApp: 20 cupons por envio, um abaixo do outro, com onde usar cada um,
// e no fim o link "Ver mais" para a página /cupons. Cada envio continua de onde o anterior parou, para os cupons irem variando.
// Cada dono (o site ou o afiliado) usa o próprio número e os próprios grupos; grupo com lojas marcadas recebe só os cupons delas.
const db = require('./db');
const settings = require('./settings');
const clientes = require('./clientes');
const cupons = require('./cupons');
require('./cupons-ml'); // cria a tabela ml_cupons
const whatsapp = require('./whatsapp');

const POR_ENVIO = 20;
const LOJAS = { mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee', magalu: 'Magalu', aliexpress: 'AliExpress', kabum: 'KaBuM!', shein: 'Shein', temu: 'Temu' };
const NA_LOJA = { mercadolivre: 'no Mercado Livre', amazon: 'na Amazon', shopee: 'na Shopee', magalu: 'na Magalu', aliexpress: 'no AliExpress', kabum: 'na KaBuM!', shein: 'na Shein', temu: 'na Temu' };
const reais = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 });
const emAndamento = new Set();

function textoMl(c) {
  if (Number(c.valor) > 0) return c.tipo === 'pct' ? `${reais(c.valor)}% OFF` : `R$ ${reais(c.valor)} OFF`;
  return c.titulo || 'Cupom';
}

// Todos os cupons ativos: os das ofertas no ar (mais produtos primeiro) e os lidos da central do Mercado Livre
function ativos() {
  const lista = [];
  const ml = new Map(db.all(`SELECT campanha, titulo, tipo, valor, minimo, produtos FROM ml_cupons
    WHERE expira_em IS NULL OR expira_em > datetime('now')`).map(c => [String(c.campanha), c]));
  for (const c of cupons.resumo()) {
    const ehMl = cupons.ehMl(c.codigo);
    const dados = ehMl ? ml.get(String(c.codigo).slice(2)) : null;
    if (dados) ml.delete(String(dados.campanha));
    lista.push({ codigo: c.codigo, ml: ehMl, texto: dados ? textoMl(dados) : c.texto || null, minimo: Number(dados?.minimo) || 0,
      store_id: c.store_id, loja: LOJAS[c.store_id] || c.store_id, ofertas: Number(c.ofertas) || 0 });
  }
  for (const c of ml.values()) {
    lista.push({ codigo: `ML${c.campanha}`, ml: true, texto: textoMl(c), minimo: Number(c.minimo) || 0, store_id: 'mercadolivre', loja: LOJAS.mercadolivre, ofertas: 0 });
  }
  return lista.sort((a, b) => b.ofertas - a.ofertas || String(a.codigo).localeCompare(String(b.codigo)));
}

function linha(c) {
  if (c.ml) return `*${c.texto || 'Cupom'}*${c.minimo ? ` acima de R$ ${reais(c.minimo)}` : ''} — ative no Mercado Livre, em Cupons`;
  return `*${c.codigo}*${c.texto ? ` — ${c.texto}` : ''} — use ${NA_LOJA[c.store_id] || `na ${c.loja}`}`;
}

const enderecoSite = s => String(s?.site_url || settings.get('site_url') || '').trim().replace(/\/+$/, '') || 'https://tanoofertou.com.br';

function mensagem(itens, s = null) {
  return `*Cupons ativos*\n\n${itens.map(linha).join('\n')}\n\nRegras e validade na própria loja.\n\n*Ver mais:* ${enderecoSite(s)}/cupons`;
}

// Os próximos 20 a partir da posição, voltando ao começo quando a lista acaba
function fatia(lista, pos = 0) {
  if (lista.length <= POR_ENVIO) return lista;
  const i = ((Number(pos) || 0) % lista.length + lista.length) % lista.length;
  return Array.from({ length: POR_ENVIO }, (_, n) => lista[(i + n) % lista.length]);
}

const doGrupo = (lista, g) => (g?.lojas?.length ? lista.filter(c => g.lojas.includes(c.store_id)) : lista);

// Posição da lista e resultado do último envio de cada dono
function ler(cid, chave) {
  return cid ? db.get('SELECT value FROM cliente_config WHERE cliente_id = ? AND key = ?', cid, chave)?.value : settings.get(chave);
}
function gravar(cid, chave, valor) {
  if (!cid) return settings.set(chave, String(valor));
  db.run(`INSERT INTO cliente_config (cliente_id, key, value) VALUES (?, ?, ?)
          ON CONFLICT(cliente_id, key) DO UPDATE SET value = excluded.value`, cid, chave, String(valor));
}
const configDe = cid => (cid ? clientes.config(cid) : settings.getAll());
function ultimoEnvio(cid) {
  try { return JSON.parse(ler(cid, 'agenda_cupons_ultima') || 'null'); } catch { return null; }
}

function previa(cid = null) {
  const s = configDe(cid);
  const lista = ativos();
  const pos = Number(ler(cid, 'agenda_cupons_pos')) || 0;
  const itens = fatia(lista, pos);
  return { total: lista.length, por_envio: POR_ENVIO, texto: itens.length ? mensagem(itens, s) : '', grupos: whatsapp.gruposEscolhidos(s).length, ultimo: ultimoEnvio(cid) };
}

// Envia para os grupos salvos do dono. Falha num grupo não impede os outros.
async function postar(cid = null, motivo = 'manual') {
  const chave = cid ? Number(cid) : 'site';
  if (emAndamento.has(chave)) throw Object.assign(new Error('Já existe um envio de cupons em andamento.'), { status: 409 });
  const s = configDe(cid);
  const faltando = require('./social').REDES.whatsapp.pronta(s);
  if (faltando) throw Object.assign(new Error(faltando), { status: 400 });
  const grupos = whatsapp.gruposEscolhidos(s);
  if (!grupos.length) throw Object.assign(new Error('Escolha e salve os grupos de WhatsApp primeiro.'), { status: 400 });
  const lista = ativos();
  if (!lista.length) throw Object.assign(new Error('Nenhum cupom ativo no momento.'), { status: 400 });
  emAndamento.add(chave);
  const pos = Number(ler(cid, 'agenda_cupons_pos')) || 0;
  const r = { em: new Date().toISOString(), motivo, enviados: 0, sem_cupom: 0, falhas: [], cupons: 0 };
  try {
    for (const g of grupos) {
      const itens = fatia(doGrupo(lista, g), pos);
      if (!itens.length) { r.sem_cupom++; continue; }
      try {
        await whatsapp.enviar(s, g.id, { texto: mensagem(itens, s) });
        r.enviados++;
        r.cupons = Math.max(r.cupons, itens.length);
      } catch (err) {
        r.falhas.push({ grupo: g.nome || g.id, erro: err.message });
      }
    }
    if (r.enviados) gravar(cid, 'agenda_cupons_pos', (pos + POR_ENVIO) % Math.max(lista.length, 1));
    gravar(cid, 'agenda_cupons_ultima', JSON.stringify(r));
  } finally {
    emAndamento.delete(chave);
  }
  return r;
}

module.exports = { POR_ENVIO, ativos, linha, mensagem, fatia, doGrupo, previa, postar, ultimoEnvio };
