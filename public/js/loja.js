/* Ofertou! — página profissional de uma loja parceira: banner, nota, catálogos, avaliações e informações */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = n => Number(n || 0).toLocaleString('pt-BR');
  const dia = s => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  const CORES = {
    verde: ['#0c8f4f', '#2bd37f'], azul: ['#1d5fd6', '#5b9bff'], roxo: ['#6b3fd4', '#a27bff'], laranja: ['#d9661a', '#ffa24d'],
    vermelho: ['#c62f2f', '#ff6464'], grafite: ['#3b4047', '#7d858f'], rosa: ['#cf3a85', '#ff7bbd'], dourado: ['#a77a0c', '#f2c94c'],
    ciano: ['#0b8f9c', '#41d9e6'], vinho: ['#6e1c38', '#b8456c'],
  };
  const TIER = { inicio: 'Início', bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', diamante: 'Diamante', especial: 'Especial' };
  const NOTA_TXT = ['Ruim', 'Regular', 'Bom', 'Muito bom', 'Ótimo'];
  const okImg = s => /^(https:\/\/|\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$)/i.test(s || '');
  const ICO = {
    chat: '<svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z"/><path d="M8 8.5h8M8 11.5h5"/></svg>',
    site: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>',
    whats: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c.3 2 1.9 3.9 4.2 4.8l1.2-1.1 1.8.8c-.2 1.4-1.2 2-2.4 1.8-3.4-.6-6-3.4-6.3-6.6-.1-1.1.6-2 1.9-2.1l.7 1.8z"/></svg>',
    insta: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1"/></svg>',
    sacola: '<svg viewBox="0 0 24 24"><path d="M6 7h12l1 14H5z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
    entrega: '<svg viewBox="0 0 24 24"><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
    pessoas: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.4c2.2.7 3.5 2.8 3.5 5.6"/></svg>',
    verificado: '<span class="selo-wrap" title="Loja parceira verificada"><svg class="selo-ok" viewBox="0 0 24 24" role="img" aria-label="Verificado"><path d="M12 1.8L12.8 2.3L13.5 3.3L14.2 3.8L15 3.7L16.1 3.2L17.1 3.2L17.6 4L17.7 5.2L18 6L18.8 6.3L20 6.4L20.8 6.9L20.8 7.9L20.3 9L20.2 9.8L20.7 10.5L21.7 11.2L22.1 12L21.7 12.8L20.7 13.5L20.2 14.2L20.3 15L20.8 16.1L20.8 17.1L20 17.6L18.8 17.7L18 18L17.7 18.8L17.6 20L17.1 20.8L16.1 20.8L15 20.3L14.2 20.2L13.5 20.7L12.8 21.7L12 22.1L11.2 21.7L10.5 20.7L9.8 20.2L9 20.3L7.9 20.8L6.9 20.8L6.4 20L6.3 18.8L6 18L5.2 17.7L4 17.6L3.2 17.1L3.2 16.1L3.7 15L3.8 14.2L3.3 13.5L2.3 12.8L1.8 12L2.3 11.2L3.3 10.5L3.8 9.8L3.7 9L3.2 7.9L3.2 6.9L4 6.4L5.2 6.3L6 6L6.3 5.2L6.4 4L6.9 3.2L7.9 3.2L9 3.7L9.8 3.8L10.5 3.3L11.2 2.3Z"/><path d="M8 12.4l2.7 2.7L16.2 9.4"/></svg></span>',
    editar: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  };
  const estrelas = (n, cls = '') => `<span class="lj-estrelas ${cls}" aria-label="${n} de 5 estrelas">${[1, 2, 3, 4, 5].map(i => `<span class="${n >= i ? 'on' : n >= i - 0.5 ? 'meia' : ''}">★</span>`).join('')}</span>`;

  let toastTimer;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  async function api(url, body, method) {
    const r = await fetch(url, body || method ? { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined } : { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = `/conta?voltar=${encodeURIComponent(location.pathname)}`; throw new Error('Entre na sua conta.'); }
    if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
    return d;
  }

  let D = null;          // dados da loja
  let LOJA = null;       // { id, nome, slug, pedidos } para a prévia dos produtos
  let aba = 'produtos';

  // ── Topo ───────────────────────────────────────────────────────────────
  function renderTopo() {
    const l = D.loja, a = D.aparencia, rep = D.reputacao, av = D.avaliacoes;
    const c = CORES[a.cor] || CORES.verde;
    $('#lj-page').style.setProperty('--lj-a', c[0]);
    $('#lj-page').style.setProperty('--lj-b', c[1]);
    $('#lj-banner').style.backgroundImage = okImg(a.capa_url) ? `url("${a.capa_url}")` : '';
    $('#lj-banner').classList.toggle('tem-imagem', okImg(a.capa_url));
    const logo = okImg(l.logo_url) ? `<img src="${esc(l.logo_url)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(l.nome.charAt(0).toUpperCase())}</span>`;
    const p = D.perfil;
    const site = /^https:\/\//i.test(l.site_url || '') ? l.site_url : '';
    $('#lj-topo').innerHTML = `
      <div class="lj-logo">${logo}</div>
      <div class="lj-ident">
        <h1>${esc(l.nome)} ${ICO.verificado}</h1>
        ${a.slogan ? `<p class="lj-slogan">${esc(a.slogan)}</p>` : ''}
        <div class="lj-meta">
          ${av && av.resumo.total ? `<a href="#avaliacoes" data-aba="avaliacoes" class="lj-nota">${estrelas(av.resumo.media)} <b>${String(av.resumo.media).replace('.', ',')}</b> <small>(${num(av.resumo.total)} avaliaç${av.resumo.total === 1 ? 'ão' : 'ões'})</small></a>` : '<span class="lj-nova">Loja nova no Ofertou!</span>'}
          ${p ? `<span>${ICO.pessoas}<b id="lj-seguidores">${num(p.seguidores)}</b> seguidores</span>` : ''}
          <span>${ICO.sacola}<b>${num(rep.vendidos)}</b> vendidos</span>
          ${rep.entrega ? `<span>${ICO.entrega}Entrega: <b>${esc(rep.entrega)}</b></span>` : ''}
          ${rep.atendimento ? `<span>${ICO.chat}<b>${esc(rep.atendimento)}</b></span>` : ''}
        </div>
      </div>
      <div class="lj-acoes">
        ${D.minha_loja ? `<a class="btn btn-primary" href="/conta?aba=loja">${ICO.editar}Editar minha loja</a>` : `<button class="btn btn-primary" type="button" id="lj-falar">${ICO.chat}Fale com lojista</button>`}
        ${p && p.pode_seguir ? `<button class="btn ${p.eu_sigo ? 'is-on' : ''}" type="button" id="lj-seguir">${p.eu_sigo ? 'Seguindo ✓' : '+ Seguir'}</button>` : ''}
        ${site ? `<a class="btn lj-ico-btn" href="${esc(site)}" target="_blank" rel="noopener nofollow" id="lj-site" title="Site oficial">${ICO.site}<span>Site</span></a>` : ''}
        ${a.whatsapp ? `<a class="btn lj-ico-btn" href="https://wa.me/${a.whatsapp.length <= 11 ? '55' : ''}${esc(a.whatsapp)}" target="_blank" rel="noopener" title="WhatsApp">${ICO.whats}<span>WhatsApp</span></a>` : ''}
        ${a.instagram ? `<a class="btn lj-ico-btn" href="https://instagram.com/${esc(a.instagram)}" target="_blank" rel="noopener nofollow" title="Instagram">${ICO.insta}<span>Instagram</span></a>` : ''}
      </div>
      ${p && p.vitrine?.length ? `<div class="lj-vitrine"><small>Conquistas</small><div class="pf-vitrine">${p.vitrine.map(vitrineEmoji).join('')}</div></div>` : ''}`;
    $('#lj-falar')?.addEventListener('click', e => window.OfertouLoja.conversar(l.id, null, e.currentTarget));
    $('#lj-site')?.addEventListener('click', () => window.OfertouLoja.visita(l.id, 'site'));
    $('#lj-seguir')?.addEventListener('click', async e => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const r = await api(`/api/perfis/${encodeURIComponent(p.slug)}/seguir`, null, p.eu_sigo ? 'DELETE' : 'POST');
        p.eu_sigo = r.eu_sigo; p.seguidores = r.seguidores;
        b.textContent = r.eu_sigo ? 'Seguindo ✓' : '+ Seguir';
        b.classList.toggle('is-on', r.eu_sigo);
        $('#lj-seguidores').textContent = num(r.seguidores);
      } catch (err) { toast(err.message); }
      b.disabled = false;
    });
  }
  const vitrineEmoji = c => `<button class="vit-emoji pf-tier-${esc(c.tier)}" type="button" aria-label="${esc(c.nome)}">
      <span class="vit-emoji-ico" aria-hidden="true">${c.icone}</span>
      <span class="vit-pop" role="tooltip"><span class="vit-pop-ico">${c.icone}</span><b>${esc(c.nome)}</b><small>${esc(c.descricao)}</small>
        <em>${TIER[c.tier] || ''}${c.xp ? ` · ${c.xp} XP` : ''}${c.obtida_em ? ` · ${dia(c.obtida_em)}` : ''}</em></span>
    </button>`;

  // ── Abas: produtos, catálogos, avaliações, sobre ──────────────────────
  function renderAbas() {
    const abas = [['produtos', `Todos os produtos <small>${D.ofertas.length}</small>`],
      ...D.catalogos.map(c => [`cat-${c.id}`, `${esc(c.nome)} <small>${c.itens.filter(id => D.ofertas.some(o => o.id === id)).length}</small>`]),
      ...(D.avaliacoes ? [['avaliacoes', `Avaliações <small>${D.avaliacoes.resumo.total}</small>`]] : []), ['sobre', 'Sobre a loja']];
    $('#lj-abas').hidden = false;
    $('#lj-abas').innerHTML = abas.map(([k, t]) => `<button type="button" role="tab" data-aba="${k}" aria-selected="${k === aba}">${t}</button>`).join('');
  }
  function mostrar(k) {
    aba = k;
    $$('#lj-abas [data-aba]').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === k));
    if (k === 'avaliacoes') return renderAvaliacoes();
    if (k === 'sobre') return renderSobre();
    const cat = k.startsWith('cat-') && D.catalogos.find(c => `cat-${c.id}` === k);
    const lista = cat ? cat.itens.map(id => D.ofertas.find(o => o.id === id)).filter(Boolean) : D.ofertas;
    $('#lj-conteudo').innerHTML = `${cat && cat.descricao ? `<p class="lj-cat-desc">${esc(cat.descricao)}</p>` : ''}
      <div class="grid">${lista.length ? lista.map(card).join('') : '<div class="empty"><img src="/images/pet-capi.png" alt="" width="110"><h3>Nenhum produto aqui ainda</h3></div>'}</div>`;
  }
  const card = o => `<button class="card card-btn" type="button" data-oferta="${o.id}">
      <div class="card-media"><img src="/api/img/${o.id}" alt="" loading="lazy" onerror="this.onerror=null;this.src='/images/pet-capi-head.png';this.style.opacity='.35'">
        ${o.desconto_pct > 0 ? `<span class="card-off">-${Math.round(o.desconto_pct)}%</span>` : ''}</div>
      <div class="card-body"><h3 class="card-title" title="${esc(o.produto)}">${esc(o.produto)}</h3>
        <div class="card-prices">${o.preco_anterior > o.preco_atual ? `<div class="card-old num">R$ ${brl(o.preco_anterior)}</div>` : ''}<div class="card-price num"><small>R$</small>${brl(o.preco_atual)}</div></div></div>
    </button>`;

  function renderSobre() {
    const l = D.loja, a = D.aparencia;
    const linha = (t, v) => (v ? `<div><dt>${t}</dt><dd>${esc(v).replace(/\n/g, '<br>')}</dd></div>` : '');
    $('#lj-conteudo').innerHTML = `<div class="lj-sobre">
      <section class="panel-card"><h2>Sobre a ${esc(l.nome)}</h2><p class="lj-texto">${esc(l.descricao || 'Esta loja ainda não escreveu a sua apresentação.').replace(/\n/g, '<br>')}</p>
        ${D.perfil?.membro_desde ? `<p class="muted" style="margin:10px 0 0">No Ofertou! desde ${dia(D.perfil.membro_desde)}</p>` : ''}</section>
      <section class="panel-card"><h2>Atendimento</h2><dl class="lj-info">
        ${linha('Horário', a.horario)}${linha('Endereço', a.endereco)}${linha('Telefone', a.telefone)}${linha('E-mail', a.email_contato)}
        ${linha('WhatsApp', a.whatsapp)}${linha('Instagram', a.instagram ? `@${a.instagram}` : '')}</dl>
        ${!a.horario && !a.endereco && !a.telefone && !a.email_contato && !a.whatsapp && !a.instagram ? '<p class="muted">Fale com a loja pelo botão "Fale com lojista".</p>' : ''}</section>
      ${a.politica_entrega || a.politica_troca ? `<section class="panel-card"><h2>Políticas</h2><dl class="lj-info">${linha('Entrega', a.politica_entrega)}${linha('Trocas e devoluções', a.politica_troca)}</dl></section>` : ''}
      ${D.pedidos?.aceita_pedidos ? `<section class="panel-card"><h2>Como comprar</h2><p class="lj-texto">Abra um produto e toque em <b>Fazer pedido</b>. ${D.pedidos.metodos.length ? `Pagamento direto à loja: ${D.pedidos.metodos.map(m => esc(m.nome)).join(', ')}.` : 'A loja envia a forma de pagamento pela conversa.'}</p></section>` : ''}
    </div>`;
  }

  // ── Avaliações ─────────────────────────────────────────────────────────
  let notaEscolhida = 0;
  function renderAvaliacoes() {
    const av = D.avaliacoes, r = av.resumo;
    const minha = av.itens.find(x => x.minha);
    const max = Math.max(1, ...Object.values(r.distribuicao));
    notaEscolhida = minha ? minha.nota : 0;
    $('#lj-conteudo').innerHTML = `<div class="lj-aval">
      <section class="panel-card lj-aval-resumo">
        <div class="lj-aval-media"><b>${r.media ? String(r.media).replace('.', ',') : '—'}</b>${estrelas(r.media || 0, 'grande')}<small>${num(r.total)} avaliaç${r.total === 1 ? 'ão' : 'ões'}</small></div>
        <div class="lj-aval-dist">${[5, 4, 3, 2, 1].map(n => `<div><span>${n} ★</span><i><em style="width:${Math.round(r.distribuicao[n] * 100 / max)}%"></em></i><small>${r.distribuicao[n]}</small></div>`).join('')}</div>
      </section>
      ${D.minha_loja ? '<p class="muted">Responda as avaliações em Minha conta → Minha loja.</p>' : `
      <form class="panel-card lj-aval-form" id="lj-aval-form">
        <h2>${minha ? 'Sua avaliação' : 'Avalie esta loja'}</h2>
        <div class="lj-escolher" role="radiogroup" aria-label="Nota">${[1, 2, 3, 4, 5].map(i => `<button type="button" role="radio" data-nota="${i}" aria-checked="${notaEscolhida === i}" aria-label="${i} estrela${i > 1 ? 's' : ''}" class="${notaEscolhida >= i ? 'on' : ''}">★</button>`).join('')}
          <span class="lj-escolher-txt" id="lj-nota-txt">${notaEscolhida ? NOTA_TXT[notaEscolhida - 1] : 'Escolha de 1 a 5 estrelas'}</span></div>
        <textarea name="texto" maxlength="1000" rows="3" placeholder="Conte como foi a sua experiência com a loja (opcional)">${esc(minha?.texto || '')}</textarea>
        <div class="row-actions"><button class="btn btn-primary" type="submit">${minha ? 'Atualizar avaliação' : 'Publicar avaliação'}</button>
          ${minha ? '<button class="btn" type="button" id="lj-aval-apagar">Apagar</button>' : ''}</div>
      </form>`}
      <div class="lj-aval-lista">${av.itens.length ? av.itens.map(x => `
        <article class="panel-card lj-aval-item${x.oculta ? ' is-oculta' : ''}">
          <header><span class="lj-aval-av">${x.autor.avatar ? `<img src="${esc(x.autor.avatar)}" alt="" referrerpolicy="no-referrer">` : esc(x.autor.nome.charAt(0).toUpperCase())}</span>
            <div><b>${x.autor.slug ? `<a href="/perfil/${esc(x.autor.slug)}">${esc(x.autor.nome)}</a>` : esc(x.autor.nome)}</b>
              <small>${estrelas(x.nota)} · ${dia(x.updated_at || x.created_at)}${x.verificada ? ' · <span class="lj-verif">✓ Compra verificada</span>' : ''}${x.oculta ? ' · <b>oculta</b>' : ''}</small></div>
            ${D.admin ? `<button class="btn btn-sm" type="button" data-ocultar="${x.id}" data-oculta="${x.oculta ? 0 : 1}">${x.oculta ? 'Mostrar' : 'Ocultar'}</button>` : ''}</header>
          ${x.texto ? `<p>${esc(x.texto).replace(/\n/g, '<br>')}</p>` : ''}
          ${x.resposta ? `<div class="lj-resposta"><b>Resposta da loja</b><p>${esc(x.resposta).replace(/\n/g, '<br>')}</p></div>` : ''}
        </article>`).join('') : '<p class="muted">Nenhuma avaliação ainda. Seja o primeiro a avaliar!</p>'}</div>
    </div>`;
  }
  $('#lj-conteudo').addEventListener('click', async e => {
    const o = e.target.closest('[data-oferta]');
    if (o) { const of = D.ofertas.find(x => x.id === Number(o.dataset.oferta)); if (of) window.OfertouLoja.abrir(of, LOJA); return; }
    const n = e.target.closest('[data-nota]');
    if (n) {
      notaEscolhida = Number(n.dataset.nota);
      $$('.lj-escolher [data-nota]').forEach(b => { const v = Number(b.dataset.nota); b.classList.toggle('on', v <= notaEscolhida); b.setAttribute('aria-checked', v === notaEscolhida); });
      $('#lj-nota-txt').textContent = NOTA_TXT[notaEscolhida - 1];
      return;
    }
    if (e.target.closest('#lj-aval-apagar')) {
      if (!await OfertouUI.confirmar('Apagar a sua avaliação?')) return;
      try { D.avaliacoes = await api(`/api/lojas/${D.loja.id}/avaliacoes/minha`, null, 'DELETE'); renderAbas(); renderTopo(); renderAvaliacoes(); toast('Avaliação apagada.'); } catch (err) { toast(err.message); }
      return;
    }
    const oc = e.target.closest('[data-ocultar]');
    if (oc) {
      try { D.avaliacoes = await api(`/api/admin/avaliacoes/${oc.dataset.ocultar}/ocultar`, { oculta: oc.dataset.oculta === '1' }); renderAvaliacoes(); } catch (err) { toast(err.message); }
    }
  });
  $('#lj-conteudo').addEventListener('submit', async e => {
    if (e.target.id !== 'lj-aval-form') return;
    e.preventDefault();
    if (!notaEscolhida) return toast('Escolha de 1 a 5 estrelas.');
    const b = e.target.querySelector('[type=submit]');
    b.disabled = true;
    try {
      D.avaliacoes = await api(`/api/lojas/${D.loja.id}/avaliacoes`, { nota: notaEscolhida, texto: e.target.texto.value });
      toast('Obrigado pela avaliação!');
      renderTopo(); renderAbas(); renderAvaliacoes();
    } catch (err) { toast(err.message); b.disabled = false; }
  });
  $('#lj-abas').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) mostrar(b.dataset.aba); });
  $('#lj-topo').addEventListener('click', e => {
    const b = e.target.closest('[data-aba]');
    if (b) { e.preventDefault(); mostrar(b.dataset.aba); $('#lj-abas').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  async function load() {
    const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
    const res = await fetch(`/api/lojas/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!res.ok) {
      $('#lj-topo').innerHTML = '<div><h1>Loja não encontrada</h1><p class="muted">Esta loja não existe ou não está disponível no momento.</p><a class="btn btn-primary" href="/">Ver ofertas</a></div>';
      return;
    }
    D = await res.json();
    LOJA = { ...D.loja, pedidos: D.pedidos };
    window.OfertouLoja.visita(D.loja.id, 'pagina');
    document.title = `${D.loja.nome} — Ofertou!`;
    renderTopo();
    renderAbas();
    const qs = new URLSearchParams(location.search);
    mostrar(location.hash === '#avaliacoes' && D.avaliacoes ? 'avaliacoes' : 'produtos');
    // Link direto para um produto: /loja/slug?produto=123
    const o = Number(qs.get('produto')) && D.ofertas.find(x => x.id === Number(qs.get('produto')));
    if (o) window.OfertouLoja.abrir(o, LOJA);
  }

  fetch('/api/conta/me').then(r => r.json()).then(d => { if (d.user) $('#account-link').textContent = 'Minha conta'; }).catch(() => {});
  load();
})();
