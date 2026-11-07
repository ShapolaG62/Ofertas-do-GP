/* Ofertou! — extras da tela de agendamento (painel do administrador e do afiliado):
   • listas de sugestões para as palavras obrigatórias e proibidas (tocar marca ou desmarca no campo);
   • lista de cupons ativos: ver a mensagem e postar agora nos grupos salvos. */
(() => {
  'use strict';
  const SUGESTOES = {
    agenda_palavras_permitidas: {
      titulo: 'Sugestões de produtos que costumam vender bem',
      grupos: [
        ['Celulares', ['iphone', 'samsung galaxy', 'xiaomi', 'redmi', 'motorola', 'smartphone']],
        ['Informática', ['notebook', 'monitor', 'ssd', 'memória ram', 'placa de vídeo', 'processador', 'teclado mecânico', 'mouse gamer', 'roteador', 'impressora', 'tablet']],
        ['Games', ['playstation', 'xbox', 'nintendo switch', 'headset', 'cadeira gamer']],
        ['TV e áudio', ['smart tv', 'soundbar', 'fone bluetooth', 'caixa de som', 'echo dot', 'fire tv']],
        ['Casa e eletro', ['air fryer', 'geladeira', 'fogão', 'micro-ondas', 'lava e seca', 'máquina de lavar', 'robô aspirador', 'cafeteira', 'liquidificador', 'ventilador', 'ar condicionado', 'jogo de panelas']],
        ['Moda e beleza', ['tênis', 'mochila', 'smartwatch', 'perfume', 'secador de cabelo', 'chapinha', 'protetor solar']],
        ['Saúde e esporte', ['whey', 'creatina', 'bicicleta', 'esteira']],
        ['Bebês, pets e ferramentas', ['fralda', 'lego', 'carrinho de bebê', 'ração', 'parafusadeira', 'furadeira', 'pneu']],
      ],
    },
    agenda_palavras_bloqueadas: {
      titulo: 'Sugestões de palavras para bloquear',
      grupos: [
        ['Acessórios baratos', ['capinha', 'capa para celular', 'película', 'cabo usb', 'suporte para celular', 'carregador', 'adesivo', 'chaveiro', 'protetor de tela']],
        ['Peças e reposição', ['refil', 'peça de reposição', 'peças para', 'bateria para']],
        ['Usados', ['recondicionado', 'seminovo', 'semi novo']],
        ['Imitações', ['réplica']],
        ['Produtos restritos', ['cigarro eletrônico', 'vape', 'narguilé', 'airsoft', 'vibrador', 'medicamento', 'anabolizante']],
      ],
    },
  };
  const semAcento = v => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const palavras = campo => String(campo.value || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);

  // O painel preenche os campos por código depois de abrir: assim as marcações acompanham
  function vigiar(campo, aoMudar) {
    const original = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(campo, 'value', { configurable: true, get() { return original.get.call(this); }, set(v) { original.set.call(this, v); aoMudar(); } });
  }
  let dadosTermos = null;
  const lerTermos = () => (dadosTermos ||= fetch('/api/postagens/termos').then(r => (r.ok ? r.json() : Promise.reject(new Error('Não foi possível carregar a lista.')))).catch(err => { dadosTermos = null; throw err; }));

  function montarSugestoes(campo, dados) {
    const rotulo = campo.closest('label');
    if (!rotulo || rotulo.parentElement.classList.contains('pal-campo')) return;
    const caixa = document.createElement('div');
    caixa.className = 'pal-campo';
    rotulo.replaceWith(caixa);
    caixa.append(rotulo);
    const painel = document.createElement('details');
    painel.className = 'pal-sug';
    painel.innerHTML = `<summary>${esc(dados.titulo)} <span class="pal-conta"></span></summary>
      ${dados.grupos.map(([nome, lista]) => `<div class="pal-grupo"><span class="pal-nome">${esc(nome)}</span><div class="pal-chips">${lista.map(p => `<button type="button" class="pal-chip" data-pal="${esc(p)}" aria-pressed="false">${esc(p)}</button>`).join('')}</div></div>`).join('')}`;
    caixa.append(painel);
    const mais = document.createElement('div');
    mais.className = 'pal-mais';
    mais.innerHTML = `<button type="button" class="btn pal-mais-btn" data-pal-mais aria-expanded="false">+ Acrescentar mais palavras</button>
      <div class="pal-mais-caixa" hidden><input type="search" data-pal-busca aria-label="Procurar nos termos da mineração" placeholder="Procurar nos termos da mineração…" autocomplete="off"><p class="pal-mais-info" role="status"></p><div class="pal-chips pal-mais-lista"></div></div>`;
    caixa.append(mais);
    const sincronizar = () => {
      const marcadas = new Set(palavras(campo).map(semAcento));
      for (const c of caixa.querySelectorAll('[data-pal]')) c.setAttribute('aria-pressed', String(marcadas.has(semAcento(c.dataset.pal))));
      painel.querySelector('.pal-conta').textContent = marcadas.size ? `(${marcadas.size})` : '';
    };
    const busca = mais.querySelector('[data-pal-busca]'), info = mais.querySelector('.pal-mais-info'), lista = mais.querySelector('.pal-mais-lista');
    let termos = null;
    const desenharTermos = () => {
      const q = semAcento(busca.value);
      const achados = termos.filter(t => semAcento(t).includes(q));
      lista.innerHTML = achados.map(t => `<button type="button" class="pal-chip" data-pal="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('');
      info.textContent = achados.length ? (q ? `${achados.length} de ${termos.length} termos` : `${termos.length} termos usados na mineração`) : 'Nenhum termo com esse nome. Você também pode digitar a palavra no campo acima.';
      sincronizar();
    };
    mais.querySelector('[data-pal-mais]').addEventListener('click', async e => {
      const caixaMais = mais.querySelector('.pal-mais-caixa');
      caixaMais.hidden = !caixaMais.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!caixaMais.hidden));
      if (caixaMais.hidden) return;
      busca.focus();
      if (termos) return;
      info.textContent = 'Carregando…';
      try { termos = (await lerTermos()).termos; desenharTermos(); } catch (err) { info.textContent = err.message; }
    });
    busca.addEventListener('input', () => { if (termos) desenharTermos(); });
    busca.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); }); // Enter aqui não salva o formulário
    painel.addEventListener('toggle', sincronizar);
    campo.addEventListener('input', sincronizar);
    vigiar(campo, sincronizar);
    caixa.addEventListener('click', e => {
      const c = e.target.closest('[data-pal]');
      if (!c) return;
      const alvo = semAcento(c.dataset.pal);
      const lista = palavras(campo);
      const resto = lista.filter(p => semAcento(p) !== alvo);
      campo.value = (resto.length === lista.length ? [...lista, c.dataset.pal] : resto).join(', ');
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    sincronizar();
  }

  // "Só destas lojas": tocar para marcar. O campo continua guardando os identificadores das lojas.
  async function montarLojas(campo) {
    const rotulo = campo.closest('label');
    if (!rotulo) return;
    let lojas;
    try { lojas = (await lerTermos()).lojas; } catch { return; } // sem a lista, o campo de texto continua valendo
    const caixa = document.createElement('div');
    caixa.className = 'pal-campo';
    rotulo.replaceWith(caixa);
    caixa.append(rotulo);
    campo.type = 'hidden';
    const area = document.createElement('div');
    area.className = 'pal-chips pal-lojas';
    area.setAttribute('role', 'group');
    area.setAttribute('aria-label', 'Lojas das ofertas automáticas');
    area.innerHTML = lojas.map(l => `<button type="button" class="pal-chip" data-pal-loja="${esc(l.id)}" aria-pressed="false">${esc(l.nome)}</button>`).join('');
    caixa.append(area);
    const marcadas = () => String(campo.value || '').split(/[,;\s]+/).filter(Boolean);
    const sincronizar = () => { const m = marcadas(); area.querySelectorAll('[data-pal-loja]').forEach(b => b.setAttribute('aria-pressed', String(m.includes(b.dataset.palLoja)))); };
    vigiar(campo, sincronizar);
    area.addEventListener('click', e => {
      const b = e.target.closest('[data-pal-loja]');
      if (!b) return;
      const m = marcadas();
      campo.value = (m.includes(b.dataset.palLoja) ? m.filter(x => x !== b.dataset.palLoja) : [...m, b.dataset.palLoja]).join(', ');
    });
    sincronizar();
  }

  async function chamar(url, opcoes) {
    const r = await fetch(url, opcoes);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Não foi possível concluir.');
    return d;
  }
  const quando = iso => { try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };

  function montarCupons(el) {
    el.innerHTML = `<div class="cup-redes" data-cup-redes role="group" aria-label="Redes da lista de cupons"></div><div class="cup-acoes"><button type="button" class="btn" data-cup-postar>Postar cupons agora</button></div>
      <p class="cup-estado" data-cup-estado role="status"></p>
      <details class="cup-previa"><summary>Ver a próxima mensagem</summary><pre data-cup-texto></pre></details>`;
    const estado = el.querySelector('[data-cup-estado]');
    const botao = el.querySelector('[data-cup-postar]');
    let dados = null;
    const oculto = el.closest('form')?.querySelector('[name="agenda_cupons_redes"]');
    const marcadas = () => [...el.querySelectorAll('[data-cup-rede]:checked')].map(c => c.dataset.cupRede);
    // Rede marcada que está fora do ar agora continua marcada ao salvar
    const guardar = () => { if (oculto) oculto.value = JSON.stringify([...marcadas(), ...dados.redes.filter(r => r.marcada && !r.pronta).map(r => r.id)]); };
    function desenharRedes() {
      el.querySelector('[data-cup-redes]').innerHTML = dados.redes.map(r => `<label class="cup-rede${r.pronta ? '' : ' fora'}"><input type="checkbox" data-cup-rede="${esc(r.id)}"${r.marcada && r.pronta ? ' checked' : ''}${r.pronta ? '' : ' disabled'}> ${esc(r.nome)}${r.pronta ? '' : ' <small>não configurada</small>'}</label>`).join('');
      guardar();
    }
    el.addEventListener('change', e => { if (e.target.matches('[data-cup-rede]')) guardar(); });
    const resumo = r => (r ? `Último envio: ${quando(r.em)}, ${r.enviados} destino(s)${r.falhas?.length ? `, ${r.falhas.length} com falha` : ''}.` : '');
    async function carregar() {
      try {
        const lembrar = dados ? marcadas() : null;
        dados = await chamar('/api/postagens/cupons');
        if (lembrar) dados.redes.forEach(r => { r.marcada = lembrar.includes(r.id); });
        desenharRedes();
        el.querySelector('[data-cup-texto]').textContent = dados.texto || 'Nenhum cupom ativo no momento.';
        estado.textContent = `${dados.total} cupom(ns) ativo(s), ${dados.por_envio} em cada envio, ${dados.grupos} grupo(s) salvo(s) no WhatsApp. ${resumo(dados.ultimo)}`;
      } catch (err) { estado.textContent = err.message; }
    }
    botao.addEventListener('click', async () => {
      if (!dados) await carregar();
      const escolhidas = dados ? dados.redes.filter(r => marcadas().includes(r.id)) : [];
      if (dados && !escolhidas.length) { estado.textContent = 'Marque pelo menos uma rede.'; return; }
      if (dados && !await OfertouUI.confirmar(`Postar a lista de cupons agora em: ${escolhidas.map(r => (r.id === 'whatsapp' ? `WhatsApp (${dados.grupos} grupo(s))` : r.nome)).join(', ')}?`, { titulo: 'Postar cupons', ok: 'Postar' })) return;
      botao.disabled = true;
      estado.textContent = 'Enviando…';
      try {
        const r = await chamar('/api/postagens/cupons/postar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redes: marcadas() }) });
        await carregar();
        estado.textContent = `Enviado para ${r.enviados} destino(s)${r.redes?.length ? ` (${r.redes.join(', ')})` : ''}${r.falhas.length ? `. Falhou em: ${r.falhas.map(f => `${f.grupo} (${f.erro})`).join('; ')}` : '.'}${r.sem_cupom ? ` ${r.sem_cupom} grupo(s) sem cupom das lojas marcadas.` : ''}`;
      } catch (err) { estado.textContent = err.message; }
      botao.disabled = false;
    });
    carregar();
  }

  function iniciar() {
    for (const [nome, dados] of Object.entries(SUGESTOES)) {
      document.querySelectorAll(`input[name="${nome}"]`).forEach(c => montarSugestoes(c, dados));
    }
    document.querySelectorAll('input[name="agenda_lojas"]').forEach(montarLojas);
    document.querySelectorAll('[data-lista-cupons]').forEach(montarCupons);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
