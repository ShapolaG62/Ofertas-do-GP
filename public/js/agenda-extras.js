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
    const chips = [...painel.querySelectorAll('[data-pal]')];
    const sincronizar = () => {
      const marcadas = new Set(palavras(campo).map(semAcento));
      let n = 0;
      for (const c of chips) {
        const sim = marcadas.has(semAcento(c.dataset.pal));
        c.setAttribute('aria-pressed', String(sim));
        if (sim) n++;
      }
      painel.querySelector('.pal-conta').textContent = n ? `(${n})` : '';
    };
    painel.addEventListener('toggle', sincronizar);
    campo.addEventListener('input', sincronizar);
    painel.addEventListener('click', e => {
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

  async function chamar(url, opcoes) {
    const r = await fetch(url, opcoes);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Não foi possível concluir.');
    return d;
  }
  const quando = iso => { try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };

  function montarCupons(el) {
    el.innerHTML = `<div class="cup-acoes"><button type="button" class="btn" data-cup-postar>Postar cupons agora</button></div>
      <p class="cup-estado" data-cup-estado role="status"></p>
      <details class="cup-previa"><summary>Ver a próxima mensagem</summary><pre data-cup-texto></pre></details>`;
    const estado = el.querySelector('[data-cup-estado]');
    const botao = el.querySelector('[data-cup-postar]');
    let dados = null;
    const resumo = r => (r ? `Último envio: ${quando(r.em)}, ${r.enviados} grupo(s)${r.falhas?.length ? `, ${r.falhas.length} com falha` : ''}.` : '');
    async function carregar() {
      try {
        dados = await chamar('/api/postagens/cupons');
        el.querySelector('[data-cup-texto]').textContent = dados.texto || 'Nenhum cupom ativo no momento.';
        estado.textContent = `${dados.total} cupom(ns) ativo(s), ${dados.por_envio} em cada envio, para ${dados.grupos} grupo(s) salvo(s). ${resumo(dados.ultimo)}`;
      } catch (err) { estado.textContent = err.message; }
    }
    botao.addEventListener('click', async () => {
      if (!dados) await carregar();
      if (dados && !await OfertouUI.confirmar(`Postar a lista de cupons em ${dados.grupos} grupo(s) agora?`, { titulo: 'Postar cupons', ok: 'Postar' })) return;
      botao.disabled = true;
      estado.textContent = 'Enviando…';
      try {
        const r = await chamar('/api/postagens/cupons/postar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        await carregar();
        estado.textContent = `Enviado para ${r.enviados} grupo(s)${r.falhas.length ? `. Falhou em: ${r.falhas.map(f => `${f.grupo} (${f.erro})`).join('; ')}` : '.'}${r.sem_cupom ? ` ${r.sem_cupom} grupo(s) sem cupom das lojas marcadas.` : ''}`;
      } catch (err) { estado.textContent = err.message; }
      botao.disabled = false;
    });
    carregar();
  }

  function iniciar() {
    for (const [nome, dados] of Object.entries(SUGESTOES)) {
      document.querySelectorAll(`input[name="${nome}"]`).forEach(c => montarSugestoes(c, dados));
    }
    document.querySelectorAll('[data-lista-cupons]').forEach(montarCupons);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
