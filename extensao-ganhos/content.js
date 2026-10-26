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

  function ler() {
    const achados = [];
    const vistos = new Set();
    const add = (el, m) => {
      const valor = numero(m[2]);
      if (valor == null) return;
      const chave = norm(rotulo(el, m[0]));
      if (!chave || vistos.has(`${chave}|${valor}`)) return;
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

  // Os portais montam a tela aos poucos: tenta por até 40 s e entrega quando a leitura fica igual duas vezes seguidas
  let anterior = '', tentativas = 0;
  const timer = setInterval(() => {
    tentativas++;
    const valores = classificar(ler());
    const assinatura = JSON.stringify(valores);
    const pronto = Object.keys(valores).length && assinatura === anterior;
    anterior = assinatura;
    if (pronto || tentativas >= 20) {
      clearInterval(timer);
      chrome.runtime.sendMessage({ tipo: 'lido', plataforma, valores: pronto ? valores : {}, login: !pronto && pareceLogin(), url: location.href });
    }
  }, 2000);
})();
