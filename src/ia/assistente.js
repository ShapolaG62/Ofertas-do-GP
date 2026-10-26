// Capi, a assistente virtual do Ofertou! — feita do zero, roda inteira no servidor, sem serviço externo.
// Conhece SOMENTE o Guia do usuário (public/ajuda.html, a mesma página pública /ajuda): divide o guia em trechos
// (cada passo, cada item e cada pergunta frequente), e para cada pergunta procura o trecho mais parecido
// (BM25, com palavras sem acento, sinônimos do dia a dia e radicais). Responde só com o que está no guia:
// nunca com dados internos, de outras pessoas, do painel ou de configuração.
const fs = require('fs');
const path = require('path');

const GUIA = path.join(__dirname, '..', '..', 'public', 'ajuda.html');

// ── Texto ───────────────────────────────────────────────────────────────────
const semAcento = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set(('a o e é de da do das dos em no na nos nas um uma uns umas para pra pro por com sem que se ao aos à às ou ' +
  'eu me meu minha meus minhas voce voces seu sua seus suas ele ela eles elas isso isto esse essa este esta aquele aquela ' +
  'como qual quais quando onde quem porque por que oque o que tem ter tenho estou esta estao ser sou foi vai vou ja nao sim ' +
  'mais menos muito muita bem tambem so ainda ate depois antes entao la aqui ai algum alguma alguem nada tudo todo toda ' +
  'pode posso consigo fazer faço faz fiz quero queria gostaria preciso precisa saber ajuda ajudar duvida favor obrigado obrigada ' +
  'oi ola bom boa dia tarde noite tudo blz beleza ofertou site').split(/\s+/).map(semAcento));
// Palavras do dia a dia que querem dizer a mesma coisa (todas viram a primeira da lista)
const SINONIMOS = [
  ['senha', 'password', 'senhas'], ['entrar', 'login', 'logar', 'acessar', 'acesso', 'entra'],
  ['cadastro', 'cadastrar', 'registrar', 'registro', 'inscrever', 'criar conta', 'conta nova'],
  ['pagamento', 'pagar', 'paguei', 'pago', 'pagando', 'cobranca', 'cobrar', 'cobrado'],
  ['pix', 'qr', 'qrcode', 'copia e cola'], ['cartao', 'credito', 'debito', 'cartoes'],
  ['plano', 'planos', 'assinatura', 'assinar', 'mensalidade'], ['gratis', 'gratuito', 'gratuita', 'free', 'de graca'],
  ['cancelar', 'cancelamento', 'desistir', 'arrependimento', 'devolver', 'devolucao', 'reembolso', 'estorno'],
  ['entrega', 'frete', 'chegou', 'chegar', 'rastreio', 'rastrear', 'envio'],
  ['pedido', 'pedidos', 'compra', 'comprei', 'comprar', 'compras'],
  ['loja', 'lojista', 'empresa', 'empresarial', 'vendedor', 'vender', 'vendas'],
  ['afiliado', 'afiliados', 'comissao', 'divulgar', 'divulgacao'],
  ['preco', 'precos', 'valor', 'custa', 'caro'], ['oferta', 'ofertas', 'promocao', 'promocoes', 'desconto', 'descontos'],
  ['cupom', 'cupons', 'codigo promocional'], ['suporte', 'sac', 'atendimento', 'atendente', 'ajuda humana'],
  ['perfil', 'foto', 'avatar'], ['moedas', 'moeda', 'cosmeticos', 'cosmetico', 'missoes', 'missao'],
  ['mensagem', 'mensagens', 'chat', 'conversa', 'conversar'], ['excluir', 'apagar', 'deletar', 'remover'],
  ['dados', 'lgpd', 'privacidade'], ['aprovacao', 'aprovar', 'aprovado', 'liberacao', 'liberar', 'aguardando', 'analise'],
  ['aplicativo', 'app', 'instalar', 'baixar'], ['whatsapp', 'zap', 'wpp', 'whats'],
  ['esqueci', 'esqueceu', 'esquecer', 'esquecida', 'esquecido', 'perdi', 'recuperar', 'redefinir'],
  ['criar', 'crio', 'criei', 'abrir', 'fazer conta'], ['trocar', 'mudar', 'alterar', 'troco', 'mudo', 'altero', 'editar'],
];
const SIN = new Map();
for (const grupo of SINONIMOS) for (const p of grupo) SIN.set(semAcento(p), semAcento(grupo[0]));
// Radical simples (português): tira plural e terminações comuns, para "cancelei" achar "cancelar"
function radical(p) {
  if (p.length <= 3) return p;
  const r = p.replace(/(amento|imento|acoes|icoes|acao|icao|mente|ando|endo|indo|aram|eram|iram|asse|esse|isse|ei|ou|ar|er|ir|as|es|os|is|s)$/, '') || p;
  return r.length > 3 ? r.replace(/[aeo]$/, '') : r; // "cancelo", "cancela" e "cancelar" viram "cancel"
}
function termos(texto) {
  // 1) palavras sem acento, sem as vazias, já trocadas pelo sinônimo principal ("crio" → "criar")
  const um = semAcento(texto).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(p => p && !STOP.has(p) && p.length > 1).map(p => SIN.get(p) || p);
  // 2) expressões de duas palavras ("criar conta" → "cadastro")
  let t = ` ${um.join(' ')} `;
  for (const [de, para] of SIN) if (de.includes(' ') && t.includes(` ${de} `)) t = t.split(` ${de} `).join(` ${para} `);
  // 3) radical
  return t.split(' ').filter(Boolean).map(radical);
}
const limpar = html => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

// ── Base de conhecimento (refeita quando o guia muda) ─────────────────────────
let BASE = { mtime: 0, trechos: [], df: new Map(), media: 1 };
function carregar() {
  let st;
  try { st = fs.statSync(GUIA); } catch { return BASE; }
  if (st.mtimeMs === BASE.mtime) return BASE;
  const html = fs.readFileSync(GUIA, 'utf8');
  const trechos = [];
  for (const m of html.matchAll(/<section id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)) {
    const [, id, corpo] = m;
    const titulo = limpar((/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(corpo) || [])[1] || '');
    let sub = '';
    // percorre na ordem: h3 (subtítulo), perguntas frequentes, passos, itens e parágrafos
    const re = /<h3[^>]*>([\s\S]*?)<\/h3>|<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>|<li[^>]*>([\s\S]*?)<\/li>|<p(?![^>]*class="sub")[^>]*>([\s\S]*?)<\/p>/g;
    for (const x of corpo.matchAll(re)) {
      if (x[1]) { sub = limpar(x[1]); continue; }
      let pergunta = '', texto;
      if (x[2]) { pergunta = limpar(x[2]); texto = limpar(x[3]); } else texto = limpar(x[4] || x[5]);
      if (!texto || texto.length < 25) continue;
      // passo "<b>Título</b><span>explicação</span>" vira "Título: explicação"
      const passo = /^<b>([\s\S]*?)<\/b>\s*<span>([\s\S]*?)<\/span>/.exec((x[4] || '').trim());
      if (passo) texto = `${limpar(passo[1])}: ${limpar(passo[2])}`;
      const t = termos(`${titulo} ${sub} ${pergunta} ${pergunta} ${texto}`);
      trechos.push({ id, titulo: sub ? `${titulo} — ${sub}` : titulo, pergunta, texto, t, tf: contar(t), tt: new Set(termos(`${titulo} ${sub} ${pergunta}`)) });
    }
  }
  const df = new Map();
  for (const tr of trechos) for (const p of new Set(tr.t)) df.set(p, (df.get(p) || 0) + 1);
  BASE = { mtime: st.mtimeMs, trechos, df, media: trechos.reduce((a, x) => a + x.t.length, 0) / Math.max(1, trechos.length) };
  return BASE;
}
const contar = l => { const m = new Map(); for (const p of l) m.set(p, (m.get(p) || 0) + 1); return m; };

// BM25: quanto cada trecho combina com a pergunta
function buscar(pergunta, n = 3) {
  const b = carregar();
  const q = [...new Set(termos(pergunta))];
  if (!q.length) return { q, itens: [] };
  const N = b.trechos.length, k1 = 1.4, bb = 0.7;
  const itens = b.trechos.map(tr => {
    let s = 0, achou = 0;
    for (const p of q) {
      const f = tr.tf.get(p) || 0;
      if (!f) continue;
      achou++;
      const idf = Math.log(1 + (N - b.df.get(p) + 0.5) / (b.df.get(p) + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - bb + bb * tr.t.length / b.media));
    }
    // O assunto do trecho (título da seção ou a pergunta frequente) bate com a pergunta: vale mais
    const noTitulo = q.filter(p => tr.tt.has(p)).length;
    return { tr, s: s * (1 + 0.4 * noTitulo), cobertura: achou / q.length };
  }).filter(x => x.s > 0).sort((a, c) => c.s - a.s);
  return { q, itens: itens.slice(0, n) };
}

// Assuntos que a Capi não responde (informação interna, de outras pessoas ou de segurança)
const PROIBIDO = /\b(painel do admin|admin|administrador|senha do (admin|painel)|banco de dados|servidor|vps|api key|token|chave secreta|codigo fonte|cpf de|dados de outr|e-?mail de outr|telefone de outr|quanto (o site|voces) (ganha|fatura)|faturamento|lucro)\b/;

// Endereço público do site (Painel → Site), para o link do guia na resposta
const baseSite = () => { try { return String(require('../settings').get('site_url') || '').trim().replace(/\/+$/, '') || 'https://tanoofertou.com.br'; } catch { return 'https://tanoofertou.com.br'; } };

// Resposta para uma pergunta: { texto, confianca: 'alta'|'media'|'baixa', fonte }
function responder(pergunta) {
  const norm = semAcento(pergunta);
  if (PROIBIDO.test(norm)) {
    return { texto: 'Esse assunto eu não consigo tratar por aqui, porque envolve informações internas ou de segurança. Um atendente da nossa equipe pode te ajudar.', confianca: 'baixa', interno: true };
  }
  const { q, itens } = buscar(pergunta, 3);
  const melhor = itens[0];
  if (!melhor || !q.length) return { texto: '', confianca: 'baixa' };
  const conf = melhor.s >= 5 && melhor.cobertura >= 0.5 ? 'alta'
    : (melhor.cobertura >= 0.99 && melhor.s >= 1.5) || (melhor.s >= 2.5 && melhor.cobertura >= 0.5) ? 'media' : 'baixa';
  if (conf === 'baixa') return { texto: '', confianca: 'baixa' };
  // Junta o 2º trecho se for da mesma seção e quase tão bom (passos seguidos de um mesmo assunto)
  const partes = [melhor.tr];
  const seg = itens[1];
  if (seg && seg.tr.id === melhor.tr.id && seg.s >= melhor.s * 0.75 && seg.tr.texto !== melhor.tr.texto) partes.push(seg.tr);
  const corpo = partes.map(p => (p.pergunta ? p.texto : p.texto)).join('\n\n');
  return {
    texto: `${corpo.length > 700 ? `${corpo.slice(0, 700).replace(/\s+\S*$/, '')}…` : corpo}\n\n📖 Mais detalhes no guia (${melhor.tr.titulo}): ${baseSite()}/ajuda#${melhor.tr.id}`,
    confianca: conf, fonte: melhor.tr.id,
  };
}

module.exports = { responder, buscar, termos, semAcento, carregar };
