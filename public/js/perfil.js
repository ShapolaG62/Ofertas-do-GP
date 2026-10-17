/* Ofertou! — perfil estilo Steam: visualização, editor (com limites do plano) e ações do admin */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = n => Number(n || 0).toLocaleString('pt-BR');
  const dia = s => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

  const CORES = {
    verde: ['#0c8f4f', '#2bd37f'], azul: ['#1d5fd6', '#5b9bff'], roxo: ['#6b3fd4', '#a27bff'], laranja: ['#d9661a', '#ffa24d'],
    vermelho: ['#c62f2f', '#ff6464'], grafite: ['#3b4047', '#7d858f'], rosa: ['#cf3a85', '#ff7bbd'], dourado: ['#a77a0c', '#f2c94c'],
    ciano: ['#0b8f9c', '#41d9e6'], vinho: ['#6e1c38', '#b8456c'],
    aurora: ['#13c26b', '#4d8cff', '#9a6bff'], 'por-do-sol': ['#ff7a45', '#ff3d77', '#8f2bd1'], oceano: ['#0b4f8a', '#0e9fae', '#3fd6e3'],
    neon: ['#00e092', '#00c8f0', '#a259ff'], galaxia: ['#241a5e', '#6b3fd4', '#d63c8a'],
  };
  const NOME_COR = { 'por-do-sol': 'Pôr do sol', galaxia: 'Galáxia' };
  const corNome = c => NOME_COR[c] || c[0].toUpperCase() + c.slice(1);
  const ICONE_LINK = { site: '🌐', instagram: '📸', whatsapp: '💬', telegram: '✈️', youtube: '▶️', tiktok: '🎵' };
  const TIER = { inicio: 'Início', bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', diamante: 'Diamante', especial: 'Especial' };

  const slugUrl = location.pathname.replace(/^\/perfil\/?/, '').replace(/\/+$/, '');
  let P = null; // perfil carregado

  let toastTimer;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  async function api(url, opts = {}) {
    const r = await fetch(url, { cache: 'no-store', ...opts });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || `Erro ${r.status}`), { status: r.status });
    return d;
  }

  // ── Tema ───────────────────────────────────────────────────────────────────
  function tema(cor) {
    const c = CORES[cor] || CORES.verde;
    const root = document.body.style; // o body.pf-body define as cores padrão; sobrescreve nele
    root.setProperty('--pf-a', c[0]);
    root.setProperty('--pf-b', c[1]);
    root.setProperty('--pf-grad', `linear-gradient(120deg, ${c.join(', ')})`);
  }

  const avatarHtml = (p, cls = '') => `
    <span class="pf-avatar pf-moldura-${esc(p.moldura)} ${cls}">
      ${p.avatar ? `<img src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="pf-avatar-letra">${esc((p.nome || '?').trim()[0] || '?').toUpperCase()}</span>`}
    </span>`;

  const conquistaHtml = (c, grande = false) => `
    <div class="pf-conq pf-tier-${c.tier}${c.obtida ? '' : ' is-bloqueada'}${grande ? ' is-grande' : ''}" title="${esc(`${c.nome} — ${c.descricao}`)}">
      <span class="pf-conq-ico">${c.obtida ? c.icone : '🔒'}</span>
      <span class="pf-conq-txt">
        <b>${esc(c.nome)}</b>
        <small>${esc(c.descricao)}</small>
        ${c.obtida
    ? `<em>${TIER[c.tier]} · ${c.xp} XP${c.obtida_em ? ` · ${dia(c.obtida_em)}` : ''}</em>`
    : `<span class="pf-prog"><span style="width:${Math.round((c.progresso / c.alvo) * 100)}%"></span></span><em>${num(c.progresso)} / ${num(c.alvo)}</em>`}
      </span>
    </div>`;

  // ── Página ─────────────────────────────────────────────────────────────────
  function render() {
    tema(P.cor);
    document.title = `${P.nome} — Perfil no Ofertou!`;
    $('#pf-capa').style.backgroundImage = P.capa ? `url("${P.capa}")` : '';
    $('#pf-capa').classList.toggle('tem-imagem', Boolean(P.capa));
    const nv = P.nivel;
    $('#pf-topo').innerHTML = `
      ${avatarHtml(P, 'is-grande')}
      <div class="pf-ident">
        <h1>${esc(P.nome)}</h1>
        ${P.titulo ? `<p class="pf-titulo">${esc(P.titulo)}</p>` : ''}
        <div class="pf-selos">
          <span class="pf-papel">${esc(P.papel_rotulo)}</span>
          ${P.selos.map(s => `<span class="pf-selo pf-selo-${esc(s.id)}">${esc(s.nome)}</span>`).join('')}
          ${P.oculto ? '<span class="pf-selo pf-selo-oculto">Oculto</span>' : ''}
        </div>
        <p class="pf-social"><b id="pf-n-seguidores">${num(P.seguidores)}</b> seguidores · <b>${num(P.seguindo)}</b> seguindo</p>
        <p class="pf-meta">${P.cidade ? `📍 ${esc(P.cidade)} · ` : ''}Membro desde ${dia(P.membro_desde)}${P.loja ? ` · <a href="/loja/${esc(P.loja.slug)}">🏪 ${esc(P.loja.nome)}</a>` : ''}</p>
      </div>
      <div class="pf-topo-dir">
        <div class="pf-nivel-selo" title="${nv.xp !== undefined ? `${num(nv.xp)} XP` : 'Nível'}"><small>Nível</small><b>${nv.nivel}</b></div>
        <div class="pf-topo-acoes">
          ${P.proprio ? '<button class="btn btn-primary" type="button" id="pf-editar">Editar perfil</button>' : ''}
          ${P.pode_seguir ? `<button class="btn ${P.eu_sigo ? '' : 'btn-primary'}" type="button" id="pf-seguir">${P.eu_sigo ? 'Seguindo ✓' : '+ Seguir'}</button>` : ''}
          <button class="btn" type="button" id="pf-copiar">Copiar link</button>
        </div>
      </div>`;

    $('#pf-resumo').innerHTML = `<h2>Resumo</h2>${P.bio
      ? `<p class="pf-bio">${esc(P.bio)}</p>`
      : `<p class="pf-vazio">${P.proprio ? 'Conte um pouco sobre você: toque em <b>Editar perfil</b>.' : 'Nenhum resumo ainda.'}</p>`}`;

    $('#pf-vitrine').innerHTML = P.vitrine.length
      ? P.vitrine.map(c => conquistaHtml(c, true)).join('')
      : '<p class="pf-vazio">Nenhuma conquista ainda. Use o site e elas vão aparecendo aqui!</p>';

    $('#pf-contagem').textContent = P.conquistas.total ? `${P.conquistas.obtidas} de ${P.conquistas.total}` : `${P.conquistas.obtidas} conquistada${P.conquistas.obtidas === 1 ? '' : 's'}`;
    $('#pf-conquistas').innerHTML = P.conquistas.familias.map(f => `
      <div class="pf-familia">
        <h3>${f.icone} ${esc(f.nome)} <small>${P.conquistas.total ? `${f.itens.filter(c => c.obtida).length}/${f.itens.length}` : f.itens.length}</small></h3>
        <div class="pf-conqs">${f.itens.map(c => conquistaHtml(c)).join('')}</div>
      </div>`).join('');

    const comProgresso = nv.xp_proximo !== undefined;
    $('#pf-nivel').innerHTML = `
      <div class="pf-nivel-linha"><div class="pf-nivel-selo is-pequeno"><b>${nv.nivel}</b></div>
        <div><b>Nível ${nv.nivel}</b>${comProgresso ? `<small>${num(nv.xp)} XP no total</small>` : ''}</div></div>
      ${comProgresso ? `<div class="pf-xp"><span style="width:${Math.round((nv.xp_nivel / nv.xp_proximo) * 100)}%"></span></div>
      <small class="pf-xp-txt">${num(nv.xp_proximo - nv.xp_nivel)} XP para o nível ${nv.nivel + 1}</small>` : ''}
      <p class="pf-plano-linha">Plano: <b>${esc(P.plano_rotulo)}</b></p>`;

    $('#pf-numeros').hidden = !P.numeros.length;
    $('#pf-numeros').innerHTML = `<h2>Números</h2><dl class="pf-nums">${P.numeros.map(n => `<div><dt>${esc(n.rotulo)}</dt><dd>${num(n.valor)}</dd></div>`).join('')}</dl>`;

    $('#pf-links').hidden = !P.links.length;
    $('#pf-links').innerHTML = `<h2>Links</h2><div class="pf-links">${P.links.map(l => `
      <a href="${esc(l.url)}" target="_blank" rel="noopener nofollow ugc">${ICONE_LINK[l.tipo] || '🔗'} ${esc((P.opcoes?.tipos_link || {})[l.tipo] || l.tipo)}</a>`).join('')}</div>`;
    if (!P.opcoes) { // visitante: nomes dos tipos de link
      const nomes = { site: 'Site', instagram: 'Instagram', whatsapp: 'Grupo de WhatsApp', telegram: 'Telegram', youtube: 'YouTube', tiktok: 'TikTok' };
      $$('#pf-links a').forEach((a, i) => { a.textContent = `${ICONE_LINK[P.links[i].tipo] || '🔗'} ${nomes[P.links[i].tipo] || 'Link'}`; });
    }

    $('#pf-grid').hidden = false;
    $('#pf-editar')?.addEventListener('click', abrirEditor);
    $('#pf-seguir')?.addEventListener('click', async e => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const r = await api(`/api/perfis/${encodeURIComponent(P.slug)}/seguir`, { method: P.eu_sigo ? 'DELETE' : 'POST' });
        P.eu_sigo = r.eu_sigo; P.seguidores = r.seguidores;
        b.textContent = r.eu_sigo ? 'Seguindo ✓' : '+ Seguir';
        b.classList.toggle('btn-primary', !r.eu_sigo);
        $('#pf-n-seguidores').textContent = num(r.seguidores);
      } catch (err) { toast(err.message); } finally { b.disabled = false; }
    });
    $('#pf-copiar').addEventListener('click', () => {
      navigator.clipboard.writeText(`${location.origin}/perfil/${P.slug}`).then(() => toast('Link do perfil copiado!'));
    });
    if (P.admin_vendo) renderAdmin();
    if (P.proprio && P.plano === 'admin') renderAvisosAdmin();
  }

  // ── Editor ─────────────────────────────────────────────────────────────────
  let escolhaCor = 'verde';
  let escolhaMoldura = 'nenhuma';
  function abrirEditor() {
    const f = $('#pf-form');
    const L = P.limites;
    f.nome.value = P.nome; f.titulo.value = P.titulo; f.cidade.value = P.cidade; f.bio.value = P.bio; f.slug.value = P.slug;
    f.bio.maxLength = L.bio;
    const contaBio = () => { $('#pf-bio-conta').textContent = `${f.bio.value.length}/${L.bio}`; };
    f.bio.oninput = contaBio; contaBio();
    f.slug.disabled = !L.slug_livre;
    $('#pf-slug-lock').textContent = L.slug_livre ? '' : '🔒 planos com endereço próprio';
    $('#pf-plano-aviso').innerHTML = `Seu plano: <b>${esc(L.rotulo)}</b> — vitrine com ${L.vitrine} conquistas, resumo de ${L.bio} letras${L.capa ? ', capa' : ''}${L.links ? `, ${L.links} link(s)` : ''}${L.gradiente ? ', cores em degradê' : ''}.`
      + (P.plano === 'admin' ? '' : ' <a class="link-btn so-web" href="/conta#planos">Libere mais com um plano</a>');

    // Imagens
    $('#pf-avatar-prev').innerHTML = avatarHtml(P);
    $('#pf-capa-prev').style.backgroundImage = P.capa ? `url("${P.capa}")` : '';
    $('#pf-capa-lock').textContent = L.capa ? '' : '🔒 planos pagos';
    $('#pf-capa-acoes').hidden = !L.capa;

    // Cores (as bloqueadas aparecem com cadeado e o plano que libera)
    escolhaCor = P.cor;
    const todas = Object.keys(CORES);
    $('#pf-cores').innerHTML = todas.map(c => {
      const livre = P.opcoes.cores.includes(c);
      const quem = Object.values(P.opcoes.todos_planos).find(pl => pl.cores.includes(c));
      return `<button type="button" class="pf-cor${c === escolhaCor ? ' is-sel' : ''}" data-cor="${c}" ${livre ? '' : 'disabled'}
        style="background:linear-gradient(120deg, ${CORES[c].join(', ')})" title="${esc(corNome(c))}${livre ? '' : ` — ${esc(quem?.rotulo || '')}`}">
        ${livre ? '' : '🔒'}</button>`;
    }).join('');
    // Molduras liberadas
    escolhaMoldura = P.moldura;
    const todasMolduras = [['nenhuma', 'Sem moldura', 'livre'], ['bronze', 'Bronze', 'nível 3'], ['prata', 'Prata', 'nível 8'], ['ouro', 'Ouro', 'nível 15'],
      ['diamante', 'Diamante', 'nível 25'], ['pro', 'Do plano', 'planos com moldura'], ['coroa', 'Coroa', 'admin']];
    $('#pf-molduras').innerHTML = todasMolduras.filter(([id]) => id !== 'coroa' || P.plano === 'admin').map(([id, nome, req]) => {
      const livre = P.opcoes.molduras.some(m => m.id === id);
      return `<button type="button" class="pf-mold-op${id === escolhaMoldura ? ' is-sel' : ''}" data-moldura="${id}" ${livre ? '' : 'disabled'}>
        <span class="pf-avatar pf-moldura-${id}"><span class="pf-avatar-letra">${esc(P.nome[0] || '?')}</span></span>
        <small>${esc(nome)}${livre ? '' : `<br>🔒 ${esc(req)}`}</small></button>`;
    }).join('');

    // Vitrine
    const obtidas = P.conquistas.familias.flatMap(fm => fm.itens).filter(c => c.obtida);
    const marcadas = new Set(P.vitrine_ids || []);
    $('#pf-escolha-vitrine').innerHTML = obtidas.length ? obtidas.map(c => `
      <label class="pf-vit-op"><input type="checkbox" value="${esc(c.id)}" ${marcadas.has(c.id) ? 'checked' : ''}> ${c.icone} ${esc(c.nome)}</label>`).join('')
      : '<p class="pf-vazio">Você ainda não tem conquistas.</p>';
    const contaVit = () => {
      const n = $$('#pf-escolha-vitrine input:checked').length;
      $('#pf-vitrine-conta').textContent = `${n}/${L.vitrine}`;
      $$('#pf-escolha-vitrine input:not(:checked)').forEach(i => { i.disabled = n >= L.vitrine; });
    };
    $('#pf-escolha-vitrine').onchange = contaVit; contaVit();

    // Links
    $('#pf-links-conta').textContent = L.links ? `até ${L.links}` : '🔒 planos pagos';
    $('#pf-links-edit').innerHTML = '';
    P.links.forEach(l => addLink(l));
    $('#pf-add-link').hidden = !L.links;
    atualizarAddLink();

    $('#pf-msg').hidden = true;
    $('#pf-editor').showModal();
  }

  function addLink(l = { tipo: 'instagram', url: '' }) {
    const tipos = P.opcoes.tipos_link;
    const row = document.createElement('div');
    row.className = 'pf-link-row';
    row.innerHTML = `<select>${Object.entries(tipos).map(([k, v]) => `<option value="${k}" ${k === l.tipo ? 'selected' : ''}>${ICONE_LINK[k]} ${esc(v)}</option>`).join('')}</select>
      <input type="url" placeholder="https://" value="${esc(l.url)}" maxlength="300">
      <button class="btn btn-sm" type="button" aria-label="Remover link">✕</button>`;
    row.querySelector('button').addEventListener('click', () => { row.remove(); atualizarAddLink(); });
    $('#pf-links-edit').appendChild(row);
    atualizarAddLink();
  }
  function atualizarAddLink() { $('#pf-add-link').disabled = $$('.pf-link-row').length >= P.limites.links; }
  $('#pf-add-link').addEventListener('click', () => addLink());

  $('#pf-cores').addEventListener('click', e => {
    const b = e.target.closest('[data-cor]');
    if (!b || b.disabled) return;
    escolhaCor = b.dataset.cor;
    $$('.pf-cor').forEach(x => x.classList.toggle('is-sel', x === b));
    tema(escolhaCor);
  });
  $('#pf-molduras').addEventListener('click', e => {
    const b = e.target.closest('[data-moldura]');
    if (!b || b.disabled) return;
    escolhaMoldura = b.dataset.moldura;
    $$('.pf-mold-op').forEach(x => x.classList.toggle('is-sel', x === b));
  });
  $$('[data-fechar]').forEach(b => b.addEventListener('click', () => { $('#pf-editor').close(); tema(P.cor); }));

  $('#pf-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const body = {
      nome: f.nome.value, titulo: f.titulo.value, cidade: f.cidade.value, bio: f.bio.value,
      cor: escolhaCor, moldura: escolhaMoldura,
      vitrine: $$('#pf-escolha-vitrine input:checked').map(i => i.value),
      links: $$('.pf-link-row').map(r => ({ tipo: r.querySelector('select').value, url: r.querySelector('input').value.trim() })).filter(l => l.url),
    };
    if (P.limites.slug_livre) body.slug = f.slug.value.trim();
    try {
      P = await api('/api/perfil', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      $('#pf-editor').close();
      if (slugUrl && slugUrl !== P.slug) history.replaceState(null, '', `/perfil/${P.slug}`);
      render();
      toast('Perfil salvo!');
    } catch (err) { $('#pf-msg').textContent = err.message; $('#pf-msg').hidden = false; }
  });

  // Upload de foto e capa
  $$('[data-img]').forEach(inp => inp.addEventListener('change', async () => {
    const file = inp.files[0];
    inp.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Imagem muito grande (máx. 5 MB).'); return; }
    try {
      toast('Enviando imagem…');
      P = await api(`/api/perfil/imagem/${inp.dataset.img}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      render();
      $('#pf-avatar-prev').innerHTML = avatarHtml(P);
      $('#pf-capa-prev').style.backgroundImage = P.capa ? `url("${P.capa}")` : '';
      toast('Imagem atualizada!');
    } catch (err) { toast(err.message); }
  }));
  $$('[data-remover]').forEach(b => b.addEventListener('click', async () => {
    try {
      P = await api(`/api/perfil/imagem/${b.dataset.remover}`, { method: 'DELETE' });
      render();
      $('#pf-avatar-prev').innerHTML = avatarHtml(P);
      $('#pf-capa-prev').style.backgroundImage = P.capa ? `url("${P.capa}")` : '';
    } catch (err) { toast(err.message); }
  }));

  // ── Avisos do admin (saldo disponível para sacar nas plataformas de afiliados) ──
  async function renderAvisosAdmin() {
    const box = $('#pf-avisos');
    let d;
    try { d = await api('/api/admin/notificacoes'); } catch { return; }
    box.hidden = false;
    box.innerHTML = `<h2>🔔 Avisos</h2>${d.itens.length ? d.itens.map(n => `
      <div class="pf-aviso"><b>${esc(n.titulo)}</b><small>${esc(n.texto || '')}</small>
        <span class="pf-aviso-acoes">${n.link ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">Abrir portal ↗</a>` : ''}<a href="/admin">Ver ganhos</a></span></div>`).join('')
    : '<p class="pf-vazio">Nenhum saldo pronto para sacar agora.</p><a class="pf-aviso-link" href="/admin">Ver ganhos no painel</a>'}`;
  }

  // ── Admin vendo o perfil de outra pessoa ──────────────────────────────────
  async function renderAdmin() {
    const box = $('#pf-admin');
    let r;
    try { r = await api(`/api/admin/perfis/${encodeURIComponent(P.dono)}`); } catch { return; }
    box.hidden = false;
    box.innerHTML = `
      <h2>Admin</h2>
      <p class="hint" style="margin:0 0 10px">Vendas e compras confirmadas (dos relatórios dos programas de afiliados ou da loja) liberam as conquistas.</p>
      <dl class="pf-nums">
        <div><dt>Vendas como afiliado</dt><dd>${num(r.vendas.afiliado)}</dd></div>
        <div><dt>Vendas da loja</dt><dd>${num(r.vendas.empresa)}</dd></div>
        <div><dt>Compras pelo código</dt><dd>${num(r.vendas.compra)}</dd></div>
      </dl>
      <form class="pf-admin-form" id="pf-admin-form">
        <select name="tipo"><option value="afiliado">Vendas como afiliado</option><option value="empresa">Vendas da loja</option><option value="compra">Compras pelo código</option></select>
        <input name="quantidade" type="number" step="1" placeholder="Qtd." required>
        <input name="observacao" maxlength="200" placeholder="Observação (ex.: relatório de outubro)">
        <button class="btn btn-primary btn-sm" type="submit">Registrar</button>
      </form>
      <div class="pf-admin-acoes">
        <button class="btn btn-sm" type="button" data-mod="oculto">${r.oculto ? 'Mostrar perfil' : 'Ocultar perfil'}</button>
        <button class="btn btn-sm" type="button" data-mod="limpar">Remover foto, capa e textos</button>
      </div>
      ${r.registros.length ? `<details><summary>Últimos registros</summary><ul class="pf-admin-log">${r.registros.map(x => `<li>${dia(x.created_at)} · ${esc(x.tipo)} ${x.quantidade > 0 ? '+' : ''}${x.quantidade}${x.observacao ? ` — ${esc(x.observacao)}` : ''}</li>`).join('')}</ul></details>` : ''}`;
    $('#pf-admin-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      try {
        await api(`/api/admin/perfis/${encodeURIComponent(P.dono)}/vendas`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: f.tipo.value, quantidade: f.quantidade.value, observacao: f.observacao.value }) });
        toast('Registrado!');
        carregar();
      } catch (err) { toast(err.message); }
    });
    box.querySelectorAll('[data-mod]').forEach(b => b.addEventListener('click', async () => {
      const body = b.dataset.mod === 'oculto' ? { oculto: !r.oculto } : { limpar: true };
      if (body.limpar && !confirm('Remover a foto, a capa, o título, o resumo e os links deste perfil?')) return;
      try {
        await api(`/api/admin/perfis/${encodeURIComponent(P.dono)}/moderar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        carregar();
      } catch (err) { toast(err.message); }
    }));
  }

  // ── Início ─────────────────────────────────────────────────────────────────
  async function carregar() {
    try {
      P = await api(slugUrl ? `/api/perfis/${encodeURIComponent(slugUrl)}` : '/api/perfil');
      if (!slugUrl) history.replaceState(null, '', `/perfil/${P.slug}`);
      $('#pf-meu').hidden = P.proprio;
      render();
    } catch (err) {
      if (err.status === 401) { location.href = '/conta'; return; }
      $('#pf-topo').innerHTML = `<div class="pf-erro"><h1>${esc(err.message)}</h1><a class="btn btn-primary" href="/">Ver ofertas</a></div>`;
    }
  }
  // Visitante logado: mostra o atalho para o próprio perfil
  if (slugUrl) fetch('/api/perfil', { cache: 'no-store' }).then(r => r.json()).then(d => { if (d.slug && d.slug !== slugUrl) $('#pf-meu').hidden = false; }).catch(() => {});
  carregar();
})();
