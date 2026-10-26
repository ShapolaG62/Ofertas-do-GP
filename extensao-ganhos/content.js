// Ofertou! Ganhos — roda nas páginas dos portais de afiliados, sem mostrar nada na tela. Espera o portal montar a
// página, procura os valores em dinheiro com o texto ao lado ("Saldo disponível", "Ganhos estimados"...) e entrega
// para a extensão, que manda ao painel do Ofertou!. Só lê o que já está na tela da conta logada; não clica em nada.
(() => {
  'use strict';
  if (window.__ofertouGanhos) return;
  window.__ofertouGanhos = true;

  const host = location.hostname;
  const plataforma = /mercadolivre/.test(host) ? 'mercadolivre' : /amazon/.test(host) ? 'amazon' : /shopee/.test(host) ? 'shopee'
    : /magalu/.test(host) ? 'magalu' : /aliexpress/.test(host) ? 'aliexpress' : /awin/.test(host) ? 'kabum' : null;
  if (!plataforma) return;

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const DINHEIRO = /(R\$|US\$|USD|\$)\s?(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g;
  function numero(txt) {
    let t = String(txt).replace(/\s/g, '');
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');   // 1.234,56
    else t = t.replace(/,/g, '');                                          // 1,234.56
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const visivel = el => el && el.getClientRects().length > 0;

  // Texto perto do valor: sobe alguns níveis até achar um bloco curto com alguma palavra além do número
  function rotulo(el, trecho) {
    let atual = el;
    for (let i = 0; i < 5 && atual && atual !== document.body; i++) {
      const t = (atual.innerText || '').replace(/\s+/g, ' ').trim();
      const sem = t.split(trecho).join(' ').replace(DINHEIRO, ' ').replace(/[\s|·•:–-]+/g, ' ').trim();
      if (sem.length >= 3 && /[a-zà-ú]{3}/i.test(sem)) return sem.slice(0, 70);
      if (t.length > 220) break;
      atual = atual.parentElement;
    }
    return '';
  }

  // Valor dentro de um cartão de produto (bloco com link para um anúncio): é preço, não saldo
  function dentroDeProduto(el) {
    for (let i = 0; i < 4 && el && el !== document.body; i++, el = el.parentElement) {
      if (el.matches?.('a[href*="MLB"], a[href*="/dp/"], a[href*="/product/"]')) return true;
      // Cartão = bloco com um só anúncio; um bloco com vários é a lista ou a página toda (onde também está o saldo)
      const ids = new Set([...(el.querySelectorAll?.('a[href*="MLB"], a[href*="/dp/"]') || [])]
        .map(a => (decodeURIComponent(a.href).match(/MLB-?\d{6,}|\/dp\/\w+/i) || [a.href])[0].toUpperCase().replace('-', '')));
      if (ids.size === 1) return true;
      if (ids.size > 1) return false;
    }
    return false;
  }

  function ler() {
    const achados = [];
    const vistos = new Set();
    const add = (el, m) => {
      const valor = numero(m[2]);
      if (valor == null) return;
      if (dentroDeProduto(el)) return; // preço de produto da lista, não é saldo
      const chave = norm(rotulo(el, m[0]));
      if (!chave || chave.includes('%') || vistos.has(`${chave}|${valor}`)) return;
      vistos.add(`${chave}|${valor}`);
      achados.push({ valor, chave });
    };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let no;
    while ((no = w.nextNode()) && achados.length < 40) {
      const txt = no.nodeValue;
      if (!txt || !/\d/.test(txt) || !/\$|USD/.test(txt)) continue;
      const el = no.parentElement;
      if (!el || el.closest('script,style,noscript') || !visivel(el)) continue;
      for (const m of txt.matchAll(DINHEIRO)) add(el, m);
    }
    // "R$" e o número em elementos separados: junta pelo texto do bloco
    const valores = new Set(achados.map(a => a.valor));
    for (const el of document.querySelectorAll('div,span,p,li,td,strong,b,h1,h2,h3,h4')) {
      if (achados.length >= 40) break;
      if (el.children.length > 4 || !visivel(el)) continue;
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (t.length > 120 || !/\$/.test(t)) continue;
      const m = [...t.matchAll(DINHEIRO)][0];
      if (!m || valores.has(numero(m[2]))) continue;
      valores.add(numero(m[2]));
      add(el, m);
    }
    return achados;
  }

  // Qual valor é qual, pelo texto ao lado (o primeiro que combinar)
  const REGRAS = [
    ['a_liberar', /a liberar|pendente|em analise|estimad|previst|a receber|aguardando|bloquead|a confirmar|pending|estimated|processing|unconfirmed/],
    ['disponivel', /disponivel|para sacar|saldo|liberad|available|withdraw|pronto para|confirmed balance/],
    ['total', /total|ganho|comiss|receita|earning/],
  ];
  function classificar(achados) {
    const out = {};
    for (const a of achados) {
      const r = REGRAS.find(([, re]) => re.test(a.chave));
      if (r && out[r[0]] == null) out[r[0]] = a.valor;
    }
    return out;
  }

  const pareceLogin = () => /login|signin|sign-in|entrar|auth/i.test(location.href) || Boolean(document.querySelector('input[type=password]'));

  // ── Produtos com comissão extra listados no portal (Mercado Livre) ──
  // Cartões com link para um anúncio (MLB…) e uma porcentagem de ganho no mesmo bloco.
  const PCT = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g;
  function comissoesDaLista() {
    if (plataforma !== 'mercadolivre') return [];
    const itens = new Map();
    for (const a of document.querySelectorAll('a[href*="MLB"]')) {
      const m = decodeURIComponent(a.href).match(/MLB-?(\d{6,})/i);
      if (!m || itens.has(m[1])) continue;
      // Sobe até achar o cartão do produto com o ganho (texto curto com "%")
      let el = a, texto = '';
      for (let i = 0; i < 6 && el && el !== document.body; i++, el = el.parentElement) {
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (t.length > 500) break;
        if (/%/.test(t) && /ganh|comiss|extra/i.test(t)) { texto = t; break; }
      }
      if (!texto) continue;
      let base = 0, extra = 0, incluida = false;
      const achados = [...texto.matchAll(PCT)];
      achados.forEach((p, i) => {
        const v = Number(p[1].replace(',', '.'));
        if (!(v > 0 && v <= 60)) return;
        const ini = i ? achados[i - 1].index + achados[i - 1][0].length : Math.max(0, p.index - 30);
        const fim = Math.min(i < achados.length - 1 ? achados[i + 1].index : texto.length, p.index + p[0].length + 30);
        const contexto = texto.slice(ini, fim);
        // Só o que está colado na porcentagem decide se é desconto ("30% OFF", "desconto de 20%")
        const antes = texto.slice(Math.max(ini, p.index - 14), p.index), depois = texto.slice(p.index + p[0].length, p.index + p[0].length + 14);
        if (/^\s*(off|de desconto|de cashback)/i.test(depois) || /(desconto|juros|cashback|cupom|avalia\w*)(\s+de)?\s*$/i.test(antes)) return;
        if (/extra|adicional|campanha|bônus|bonus/i.test(contexto)) { extra = Math.max(extra, v); if (/inclu|dos quais|sendo/i.test(contexto)) incluida = true; }
        else if (/ganh|comiss/i.test(contexto)) base = Math.max(base, v);
      });
      if (!base && !extra) continue;
      itens.set(m[1], { item: `MLB${m[1]}`, comissao: Math.round((extra && !incluida ? base + extra : base || extra) * 100) / 100, extra });
    }
    return [...itens.values()].slice(0, 100);
  }

  // ── Aviso no canto (só quando você abriu o portal pelo botão "Portal" do painel) ──
  function aviso(texto, botoes = []) {
    document.getElementById('ofertou-aviso')?.remove();
    const caixa = document.createElement('div');
    caixa.id = 'ofertou-aviso';
    caixa.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483646;max-width:calc(100vw - 32px)';
    const raiz = caixa.attachShadow({ mode: 'open' });
    raiz.innerHTML = `<style>
      .a { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 14px; border-radius: 12px; font: 600 13.5px/1.4 system-ui, sans-serif;
        background: #121714; color: #eef3f0; border: 1px solid #2bb673; box-shadow: 0 12px 30px rgba(0,0,0,.35); }
      b { color: #2bb673; } button { font: inherit; font-weight: 700; padding: 6px 12px; border-radius: 999px; border: 1px solid #343c36; background: #1b211d; color: inherit; cursor: pointer; }
      button.ok { background: #2bb673; border-color: #2bb673; color: #fff; }
    </style><div class="a"><span><b>Ofertou!</b> <span class="t"></span></span></div>`;
    raiz.querySelector('.t').textContent = texto;
    for (const [rotulo, fn, ok] of botoes) {
      const b = document.createElement('button');
      b.textContent = rotulo; if (ok) b.className = 'ok';
      b.addEventListener('click', fn);
      raiz.querySelector('.a').appendChild(b);
    }
    document.documentElement.appendChild(caixa);
  }

  // Os portais montam a tela aos poucos: tenta por até 40 s e entrega quando a leitura fica igual duas vezes seguidas
  function lerEEnviar() {
    let anterior = '', tentativas = 0;
    const timer = setInterval(async () => {
      tentativas++;
      const valores = classificar(ler());
      const assinatura = JSON.stringify(valores);
      const pronto = Object.keys(valores).length && assinatura === anterior;
      anterior = assinatura;
      if (!pronto && tentativas < 20) return;
      clearInterval(timer);
      const r = await chrome.runtime.sendMessage({
        tipo: 'lido', plataforma, valores: pronto ? valores : {}, login: !pronto && pareceLogin(), url: location.href,
        comissoes: comissoesDaLista(),
      }).catch(() => null);
      if (!r?.voltar) return; // aberto por você ou pela sincronização: não mostra nada
      const voltar = ok => { location.href = `${r.voltar}?portal=${plataforma}${ok ? '&ok=1' : ''}#ganhos`; };
      if (r.ok) {
        aviso(`${r.mensagem} Voltando para o painel…`);
        setTimeout(() => voltar(true), 2500);
      } else {
        aviso(r.mensagem || 'Não encontrei o saldo nesta página. Abra a página de ganhos/saldo do portal.', [
          ['Ler de novo', () => { document.getElementById('ofertou-aviso')?.remove(); lerEEnviar(); }],
          ['Voltar ao Ofertou!', () => voltar(false), true],
        ]);
      }
    }, 2000);
  }
  lerEEnviar();
})();
