// Lista de cupons ativos para postar nas redes: 20 cupons por envio, um abaixo do outro, com onde usar cada um, e no fim
// "Ver mais", que leva à página /cupons. Cada envio continua de onde o anterior parou, para os cupons irem variando.
// Cada dono (o site ou o afiliado) usa os próprios canais. No afiliado, "Ver mais" leva à página de cupons com os links dele.
//  • WhatsApp: em cada grupo salvo; grupo com lojas marcadas recebe só os cupons delas.
//  • Telegram: a lista, com um botão "Ver mais" de verdade.
//  • Facebook: a lista, com o link em destaque.
//  • Instagram: só publica com foto, então leva uma imagem com os primeiros cupons e a lista na legenda.
//  • X: até 280 caracteres, então leva os cupons que couberem.
const db = require('./db');
const settings = require('./settings');
const clientes = require('./clientes');
const cupons = require('./cupons');
require('./cupons-ml'); // cria a tabela ml_cupons
const whatsapp = require('./whatsapp');

const POR_ENVIO = 20;
const NA_IMAGEM = 10;
const LOJAS = { mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee', magalu: 'Magalu', aliexpress: 'AliExpress', kabum: 'KaBuM!', shein: 'Shein', temu: 'Temu' };
const NA_LOJA = { mercadolivre: 'no Mercado Livre', amazon: 'na Amazon', shopee: 'na Shopee', magalu: 'na Magalu', aliexpress: 'no AliExpress', kabum: 'na KaBuM!', shein: 'na Shein', temu: 'na Temu' };
const reais = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 });
const emAndamento = new Set();
const social = () => require('./social');

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
  if (c.ml) return `🏷️ *${c.texto || 'Cupom'}*${c.minimo ? ` acima de R$ ${reais(c.minimo)}` : ''} — 🛒 ative no Mercado Livre, em Cupons`;
  return `🏷️ *${c.codigo}*${c.texto ? ` — ${c.texto}` : ''} — 🛒 use ${NA_LOJA[c.store_id] || `na ${c.loja}`}`;
}

const enderecoSite = s => String(s?.site_url || settings.get('site_url') || '').trim().replace(/\/+$/, '') || 'https://tanoofertou.com.br';
const linkVerMais = (s, cid = null) => `${enderecoSite(s)}/cupons${cid ? `?de=${Number(cid)}` : ''}`;

function mensagem(itens, s = null, cid = null, { verMais = true } = {}) {
  const corpo = `🔥 *CUPONS ATIVOS* 🔥\n💸 Copie o código e use no pagamento da loja 👇\n\n${itens.map(linha).join('\n')}\n\n⚠️ Regras e validade na própria loja.`;
  return verMais ? `${corpo}\n\n👉 *Ver mais:* ${linkVerMais(s, cid)}` : corpo;
}

// X: até 280 caracteres, e todo link conta como 23. Entram os cupons que couberem, inteiros.
function textoCurto(itens, s = null, cid = null) {
  const curta = c => (c.ml ? `${c.texto || 'Cupom'} no Mercado Livre` : `${c.codigo}${c.texto ? ` ${c.texto}` : ''} ${NA_LOJA[c.store_id] || `na ${c.loja}`}`);
  const inicio = '🔥 Cupons ativos\n', fim = '\n👉 Ver mais: ';
  let espaco = 280 - inicio.length - fim.length - 23;
  const linhas = [];
  for (const c of itens) {
    const l = curta(c);
    if (l.length + 1 > espaco) break;
    linhas.push(l);
    espaco -= l.length + 1;
  }
  return `${inicio}${linhas.join('\n')}${fim}${linkVerMais(s, cid)}`;
}

// Os próximos 20 a partir da posição, voltando ao começo quando a lista acaba
function fatia(lista, pos = 0, quantos = POR_ENVIO) {
  if (lista.length <= quantos) return lista;
  const i = ((Number(pos) || 0) % lista.length + lista.length) % lista.length;
  return Array.from({ length: quantos }, (_, n) => lista[(i + n) % lista.length]);
}

const doGrupo = (lista, g) => (g?.lojas?.length ? lista.filter(c => g.lojas.includes(c.store_id)) : lista);

// Imagem para o Instagram, que só publica com foto (1080 x 1350, JPG)
async function imagem(pos = 0, site = null) {
  const x = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const corta = (v, n) => (String(v).length > n ? `${String(v).slice(0, n - 1)}…` : String(v));
  const itens = fatia(ativos(), pos, NA_IMAGEM);
  const linhas = itens.map((c, i) => {
    const y = 250 + i * 104;
    const nome = c.ml ? (c.texto || 'Cupom') : c.codigo;
    const det = c.ml ? 'ative no Mercado Livre, em Cupons' : `${c.texto ? `${c.texto} · ` : ''}use ${NA_LOJA[c.store_id] || `na ${c.loja}`}`;
    return `<rect x="60" y="${y - 44}" width="960" height="92" rx="16" fill="#ffffff" stroke="#dbe6dd" stroke-width="2"/>
      <text x="88" y="${y - 6}" font-size="34" font-weight="800" fill="#0d6985">${x(corta(nome, 38))}</text>
      <text x="88" y="${y + 32}" font-size="26" fill="#3f4843">${x(corta(det, 56))}</text>`;
  }).join('');
  const dominio = enderecoSite(site ? { site_url: site } : null).replace(/^https?:\/\//, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="Segoe UI, Arial, Helvetica, sans-serif">
    <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#0a7a43"/><stop offset=".6" stop-color="#0d6985"/><stop offset="1" stop-color="#0b6bb5"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="#f2f7f3"/><rect width="1080" height="14" fill="url(#g)"/>
    <text x="60" y="120" font-size="74" font-weight="800" fill="#0a7a43">Cupons ativos</text>
    <text x="60" y="170" font-size="30" fill="#3f4843">Regras e validade na própria loja</text>
    ${linhas}
    <text x="60" y="1312" font-size="30" font-weight="700" fill="#0a7a43">Ver mais: ${x(dominio)}/cupons</text></svg>`;
  return require('sharp')(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

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
// Redes marcadas para a lista (padrão: WhatsApp)
function redesDe(s) {
  try {
    const r = JSON.parse(s.agenda_cupons_redes || '["whatsapp"]');
    return Array.isArray(r) ? r.filter(id => social().REDES[id]) : ['whatsapp'];
  } catch { return ['whatsapp']; }
}

function previa(cid = null) {
  const s = configDe(cid);
  const lista = ativos();
  const pos = Number(ler(cid, 'agenda_cupons_pos')) || 0;
  const itens = fatia(lista, pos);
  const marcadas = redesDe(s);
  return { total: lista.length, por_envio: POR_ENVIO, texto: itens.length ? mensagem(itens, s, cid) : '', grupos: whatsapp.gruposEscolhidos(s).length, ultimo: ultimoEnvio(cid),
    redes: social().listarRedes(s).map(r => ({ id: r.id, nome: r.nome, pronta: r.pronta, marcada: marcadas.includes(r.id) })) };
}

// Envia para as redes marcadas (ou as pedidas). Falha em um destino não impede os outros.
async function postar(cid = null, motivo = 'manual', redesPedidas = null) {
  const chave = cid ? Number(cid) : 'site';
  if (emAndamento.has(chave)) throw Object.assign(new Error('Já existe um envio de cupons em andamento.'), { status: 409 });
  const s = configDe(cid);
  const redes = Array.isArray(redesPedidas) ? redesPedidas.filter(id => social().REDES[id]) : redesDe(s);
  if (!redes.length) throw Object.assign(new Error('Marque pelo menos uma rede para a lista de cupons.'), { status: 400 });
  const lista = ativos();
  if (!lista.length) throw Object.assign(new Error('Nenhum cupom ativo no momento.'), { status: 400 });
  emAndamento.add(chave);
  const pos = Number(ler(cid, 'agenda_cupons_pos')) || 0;
  const r = { em: new Date().toISOString(), motivo, enviados: 0, sem_cupom: 0, falhas: [], cupons: 0, redes: [] };
  const itensGerais = fatia(lista, pos);
  const falhou = (nome, err) => r.falhas.push({ grupo: nome, erro: err.message || String(err) });
  try {
    for (const id of redes) {
      const nomeRede = social().REDES[id].nome;
      const faltando = social().REDES[id].pronta(s);
      if (faltando) { falhou(nomeRede, faltando); continue; }
      if (id === 'whatsapp') {
        const grupos = whatsapp.gruposEscolhidos(s);
        if (!grupos.length) { falhou(nomeRede, 'Escolha e salve os grupos de WhatsApp primeiro.'); continue; }
        for (const g of grupos) {
          const itens = fatia(doGrupo(lista, g), pos);
          if (!itens.length) { r.sem_cupom++; continue; }
          try {
            await whatsapp.enviar(s, g.id, { texto: mensagem(itens, s, cid) });
            r.enviados++;
            r.cupons = Math.max(r.cupons, itens.length);
            if (!r.redes.includes(nomeRede)) r.redes.push(nomeRede);
          } catch (err) { falhou(g.nome || g.id, err); }
        }
        continue;
      }
      try {
        const link = linkVerMais(s, cid);
        const base = enderecoSite(s);
        await social().postarTexto[id]({
          texto: mensagem(itensGerais, s, cid, { verMais: id !== 'telegram' }),
          link,
          curto: textoCurto(itensGerais, s, cid),
          imagem: `${base}/cupons/imagem.jpg?pos=${pos}&v=${Date.now()}`,
        }, s);
        r.enviados++;
        r.cupons = Math.max(r.cupons, itensGerais.length);
        r.redes.push(nomeRede);
      } catch (err) { falhou(nomeRede, err); }
    }
    if (r.enviados) gravar(cid, 'agenda_cupons_pos', (pos + POR_ENVIO) % Math.max(lista.length, 1));
    gravar(cid, 'agenda_cupons_ultima', JSON.stringify(r));
  } finally {
    emAndamento.delete(chave);
  }
  return r;
}

module.exports = { POR_ENVIO, ativos, linha, mensagem, textoCurto, linkVerMais, fatia, doGrupo, imagem, previa, postar, ultimoEnvio };
