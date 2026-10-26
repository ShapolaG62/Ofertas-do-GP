// Ofertou! Ganhos — roda só nas páginas dos portais de afiliados. Procura os valores em dinheiro da tela (com o texto
// que está perto de cada um), mostra num quadrinho no canto e manda para o painel do Ofertou! os que você marcar como
// "Disponível", "A liberar" ou "Total". A escolha fica guardada: nas próximas visitas o envio é sozinho.
// Só lê o que já está na tela de quem está logado; não clica em nada nem abre outras páginas.
(() => {
  'use strict';
  if (window.__ofertouGanhos) return;
  window.__ofertouGanhos = true;

  const host = location.hostname;
  const PLAT = /mercadolivre/.test(host) ? ['mercadolivre', 'Mercado Livre']
    : /amazon/.test(host) ? ['amazon', 'Amazon']
    : /shopee/.test(host) ? ['shopee', 'Shopee']
    : /magalu/.test(host) ? ['magalu', 'Magalu']
    : /aliexpress/.test(host) ? ['aliexpress', 'AliExpress']
    : /awin/.test(host) ? ['kabum', 'KaBuM! (Awin)'] : null;
  if (!PLAT) return;
  const [plataforma, nomePlat] = PLAT;
  const CAMPOS = { disponivel: 'Disponível', a_liberar: 'A liberar', total: 'Total' };

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const DINHEIRO = /(R\$|US\$|USD|\$)\s?(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g;
  function numero(txt) {
    let t = String(txt).replace(/\s/g, '');
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');   // 1.234,56
    else t = t.replace(/,/g, '');                                          // 1,234.56
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

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
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let no;
    while ((no = w.nextNode()) && achados.length < 40) {
      const txt = no.nodeValue;
      if (!txt || !/\d/.test(txt) || !/\$|USD/.test(txt)) continue;
      const el = no.parentElement;
      if (!el || el.closest('script,style,noscript') || !el.getClientRects().length) continue;
      for (const m of txt.matchAll(DINHEIRO)) {
        const valor = numero(m[2]);
        if (valor == null) continue;
        const r = rotulo(el, m[0]);
        const chave = norm(r).slice(0, 50);
        const id = `${chave}|${valor}`;
        if (!chave || vistos.has(id)) continue;
        vistos.add(id);
        achados.push({ valor, rotulo: r, chave, moeda: /US|^\$/.test(m[1]) ? 'USD' : 'BRL' });
      }
    }
    // Alguns portais quebram "R$" e o número em elementos separados: junta pelo texto do bloco
    const valoresVistos = new Set(achados.map(a => a.valor));
    {
      for (const el of document.querySelectorAll('div,span,p,li,td,strong,b,h1,h2,h3,h4')) {
        if (achados.length >= 40) break;
        if (el.children.length > 4 || !el.getClientRects().length) continue;
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (t.length > 120 || !/\$/.test(t)) continue;
        const m = [...t.matchAll(DINHEIRO)][0];
        if (!m) continue;
        const valor = numero(m[2]);
        const r = rotulo(el, m[0]);
        const chave = norm(r).slice(0, 50);
        if (valor == null || !chave || vistos.has(`${chave}|${valor}`) || valoresVistos.has(valor)) continue;
        valoresVistos.add(valor);
        vistos.add(`${chave}|${valor}`);
        achados.push({ valor, rotulo: r, chave, moeda: /US|^\$/.test(m[1]) ? 'USD' : 'BRL' });
      }
    }
    return achados;
  }

  // Sugestão pelo texto (você confirma ou troca no quadrinho)
  function sugestao(chave) {
    if (/a liberar|pendente|em analise|estimad|previst|a receber|aguardando|bloquead|pending|estimated|processing|a confirmar/.test(chave)) return 'a_liberar';
    if (/disponivel|para sacar|saldo|liberad|available|withdraw|pronto para/.test(chave)) return 'disponivel';
    if (/total|ganho|comiss|receita|earning/.test(chave)) return 'total';
    return '';
  }

  // ── Quadrinho no canto da página (Shadow DOM: o estilo do portal não interfere) ──
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646';
  const raiz = caixa.attachShadow({ mode: 'open' });
  raiz.innerHTML = `<style>
    :host { all: initial; }
    .q { width: 320px; max-width: calc(100vw - 32px); max-height: 70vh; display: flex; flex-direction: column; font: 13px/1.4 system-ui, sans-serif;
      background: #121714; color: #eef3f0; border: 1px solid #2bb673; border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,.45); overflow: hidden; }
    .topo { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #17201b; cursor: pointer; }
    .topo b { flex: 1; font-size: 13.5px; }
    .topo .x { border: 0; background: none; color: #9aa79f; font-size: 16px; cursor: pointer; }
    .corpo { padding: 10px 12px; overflow: auto; display: grid; gap: 8px; }
    .min .corpo { display: none; }
    .linha { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; padding: 6px 8px; border-radius: 9px; background: #1b231e; }
    .linha small { color: #9aa79f; grid-column: 1 / -1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .linha b { font-size: 14px; }
    select, button.b { font: inherit; border-radius: 8px; border: 1px solid #343c36; background: #121714; color: #eef3f0; padding: 4px 6px; }
    button.b { padding: 8px 12px; font-weight: 700; cursor: pointer; }
    button.ok { background: #2bb673; border-color: #2bb673; color: #fff; }
    .acoes { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    label { display: flex; gap: 6px; align-items: center; color: #c8d1cb; }
    .st { color: #9aa79f; font-size: 12px; }
    .st.bom { color: #4ade80; } .st.ruim { color: #ff8a8a; }
  </style>
  <div class="q min"><div class="topo"><b>Ofertou! Ganhos · ${nomePlat}</b><span class="resumo st"></span><button class="x" title="Esconder">×</button></div>
  <div class="corpo"><div class="lista"></div>
    <label><input type="checkbox" class="auto" checked> Enviar sozinho nas próximas visitas</label>
    <div class="acoes"><button class="b ok enviar">Enviar ao Ofertou!</button><button class="b ler">Ler de novo</button></div>
    <div class="st msg">Marque qual valor é o saldo <b>Disponível</b> e qual está <b>A liberar</b>.</div></div></div>`;
  const $ = s => raiz.querySelector(s);
  $('.topo').addEventListener('click', e => { if (!e.target.closest('.x')) $('.q').classList.toggle('min'); });
  $('.x').addEventListener('click', () => caixa.remove());

  let achados = [];
  let mapa = {};            // campo → chave do rótulo (guardado por plataforma)
  let auto = true;
  let ultimoEnvio = '';
  const CHAVE_MAPA = `mapa_${plataforma}`;

  function msg(t, tipo = '') { const m = $('.msg'); m.textContent = t; m.className = `st msg ${tipo}`; }

  function desenhar() {
    $('.lista').innerHTML = '';
    if (!achados.length) { $('.lista').innerHTML = '<div class="st">Nenhum valor em dinheiro na tela ainda. Abra a página de ganhos/saldo do portal.</div>'; return; }
    for (const [i, a] of achados.entries()) {
      const campo = Object.keys(mapa).find(k => mapa[k] === a.chave) || '';
      const div = document.createElement('div');
      div.className = 'linha';
      div.innerHTML = `<small></small><b></b><select data-i="${i}"><option value="">—</option>${Object.entries(CAMPOS).map(([k, n]) => `<option value="${k}" ${k === campo ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
      div.querySelector('small').textContent = a.rotulo;
      div.querySelector('b').textContent = a.valor.toLocaleString('pt-BR', { style: 'currency', currency: a.moeda });
      $('.lista').appendChild(div);
    }
  }

  $('.lista').addEventListener('change', e => {
    const s = e.target.closest('select');
    if (!s) return;
    const a = achados[Number(s.dataset.i)];
    for (const k of Object.keys(mapa)) if (mapa[k] === a.chave || k === s.value) delete mapa[k];
    if (s.value) mapa[s.value] = a.chave;
    desenhar();
  });
  $('.auto').addEventListener('change', e => { auto = e.target.checked; chrome.storage.local.set({ [`auto_${plataforma}`]: auto }); });

  function valores() {
    const out = {};
    for (const [campo, chave] of Object.entries(mapa)) {
      const a = achados.find(x => x.chave === chave);
      if (a) out[campo] = a.valor;
    }
    return out;
  }

  async function enviar(sozinho = false) {
    const v = valores();
    if (!Object.keys(v).length) { if (!sozinho) msg('Escolha pelo menos um valor (Disponível, A liberar ou Total).', 'ruim'); return; }
    const assinatura = JSON.stringify(v);
    if (sozinho && assinatura === ultimoEnvio) return;
    await chrome.storage.local.set({ [CHAVE_MAPA]: mapa });
    msg('Enviando…');
    const r = await chrome.runtime.sendMessage({ tipo: 'enviar', dados: { plataforma, ...v, url: location.href } });
    if (r?.ok) {
      ultimoEnvio = assinatura;
      const fmt = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: plataforma === 'aliexpress' ? 'USD' : 'BRL' });
      msg(`Enviado: disponível ${fmt(r.disponivel)} · a liberar ${fmt(r.a_liberar)}.`, 'bom');
      $('.resumo').textContent = '✓ enviado';
    } else {
      msg(r?.erro || 'Não foi possível enviar.', 'ruim');
      $('.q').classList.remove('min');
    }
  }
  $('.enviar').addEventListener('click', () => enviar(false));
  $('.ler').addEventListener('click', () => { achados = ler(); desenhar(); });

  async function iniciar() {
    const g = await chrome.storage.local.get([CHAVE_MAPA, `auto_${plataforma}`]);
    mapa = g[CHAVE_MAPA] || {};
    auto = g[`auto_${plataforma}`] !== false;
    $('.auto').checked = auto;
    const c = await chrome.runtime.sendMessage({ tipo: 'config' });
    document.documentElement.appendChild(caixa);
    if (!g[CHAVE_MAPA]) $('.q').classList.remove('min'); // 1ª vez neste portal: abre para marcar os valores
    if (!c?.configurada) { msg('Clique no ícone do Ofertou! na barra do Chrome e cole a chave gerada no painel.', 'ruim'); }
    atualizar();
  }

  // Os portais montam a tela aos poucos (e trocam de página sem recarregar): lê de novo quando a tela muda
  let espera = null;
  function atualizar() {
    const novos = ler();
    const mudou = JSON.stringify(novos.map(a => a.chave + a.valor)) !== JSON.stringify(achados.map(a => a.chave + a.valor));
    if (!mudou) return;
    achados = novos;
    // Primeira vez nesta plataforma: sugere pelo texto
    if (!Object.keys(mapa).length) {
      for (const a of achados) { const s = sugestao(a.chave); if (s && !mapa[s]) mapa[s] = a.chave; }
    }
    desenhar();
    const v = valores();
    $('.resumo').textContent = Object.keys(v).length ? '' : (achados.length ? 'marque os valores' : '');
    // Já tem a escolha guardada: envia sozinho
    chrome.storage.local.get(CHAVE_MAPA).then(g => { if (auto && g[CHAVE_MAPA] && Object.keys(v).length) enviar(true); });
  }
  new MutationObserver(() => { clearTimeout(espera); espera = setTimeout(atualizar, 1500); })
    .observe(document.body, { childList: true, subtree: true, characterData: true });

  setTimeout(iniciar, 1200);
})();
