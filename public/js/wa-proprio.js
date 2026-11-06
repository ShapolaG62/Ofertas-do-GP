// Painel → WhatsApp → API própria: QR code, mensagens recebidas, envio e chave da API.
(function () {
  const el = id => document.getElementById(id);
  if (!el('wap-status')) return;
  const BASE = '/api/admin/wa';
  const FASES = {
    desligado: 'Desconectado',
    conectando: 'Abrindo a conexão…',
    qr: 'Leia o QR code com o celular',
    reconectando: 'Reconectando…',
    conectado: 'Conectado',
  };
  let chatAberto = null;
  let ultimoId = 0;

  async function pedir(caminho, opcoes = {}) {
    const r = await fetch(BASE + caminho, {
      method: opcoes.method || 'GET',
      headers: opcoes.body ? { 'Content-Type': 'application/json' } : {},
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.error || `Erro ${r.status}`);
    return dados;
  }
  const visivel = () => el('wap-status').offsetParent !== null && !document.hidden;
  const nomeDe = c => c.nome || c.chat_nome || String(c.chat).split('@')[0];
  const DESCRICAO = { imagem: '📷 Foto', video: '🎥 Vídeo', audio: '🎤 Áudio', documento: '📄 Documento', figurinha: 'Figurinha', contato: '👤 Contato', localizacao: '📍 Localização', enquete: '📊 Enquete' };
  const resumo = m => m.texto || DESCRICAO[m.tipo] || '';
  const hora = sql => new Date(`${String(sql).replace(' ', 'T')}Z`).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function aviso(texto, ok = false) {
    const caixa = el('wap-msg');
    caixa.textContent = texto;
    caixa.className = texto ? `msg ${ok ? 'ok' : 'err'}` : '';
  }

  // ── Conexão ──
  function mostrarStatus(s) {
    const partes = [FASES[s.fase] || s.fase];
    if (s.conectado && s.numero) partes[0] += `: +${s.numero}${s.nome ? ` (${s.nome})` : ''}`;
    if (s.erro) partes.push(s.erro);
    el('wap-status').textContent = partes.join('. ');
    el('wap-qr').hidden = !s.qr;
    el('wap-instrucao').hidden = !s.qr;
    if (s.qr) el('wap-qr').src = s.qr;
    const ativo = s.fase === 'conectado' || s.fase === 'reconectando' || s.sessao_salva;
    el('wap-conectar').hidden = s.fase === 'conectado' || s.fase === 'qr';
    el('wap-conectar').disabled = s.fase === 'conectando';
    el('wap-desconectar').hidden = !ativo;
  }
  async function atualizarStatus() {
    if (!visivel()) return;
    try { mostrarStatus(await pedir('/status')); } catch (err) { el('wap-status').textContent = err.message; }
  }
  el('wap-conectar').addEventListener('click', async () => {
    el('wap-conectar').disabled = true;
    try { mostrarStatus(await pedir('/conectar', { method: 'POST' })); } catch (err) { el('wap-status').textContent = err.message; el('wap-conectar').disabled = false; }
  });
  el('wap-desconectar').addEventListener('click', async () => {
    const certo = await OfertouUI.confirmar('Desconectar este WhatsApp do servidor? A sessão e as mensagens guardadas aqui serão apagadas, e o envio automático para até você conectar de novo.');
    if (!certo) return;
    try {
      mostrarStatus(await pedir('/desconectar', { method: 'POST' }));
      chatAberto = null;
      ultimoId = 0;
      el('wap-mensagens').replaceChildren();
      el('wap-chat-nome').textContent = 'Escolha uma conversa';
      el('wap-form').hidden = true;
      await carregarConversas();
    } catch (err) { el('wap-status').textContent = err.message; }
  });

  // ── Conversas e mensagens ──
  async function carregarConversas() {
    if (!visivel()) return;
    const { conversas } = await pedir('/conversas');
    const lista = el('wap-conversas');
    if (!conversas.length) { lista.innerHTML = '<span class="hint">Nenhuma mensagem ainda.</span>'; return; }
    lista.replaceChildren(...conversas.map(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wap-conversa';
      b.setAttribute('aria-current', String(c.chat === chatAberto?.chat));
      const nome = document.createElement('b');
      nome.textContent = nomeDe(c);
      const ultima = document.createElement('small');
      ultima.textContent = `${c.de_mim ? 'Você: ' : ''}${resumo(c)}`;
      b.append(nome, ultima);
      b.addEventListener('click', () => abrirChat(c));
      return b;
    }));
  }
  function bolha(m) {
    const d = document.createElement('div');
    d.className = `wap-bolha${m.de_mim ? ' eu' : ''}`;
    const quem = !m.de_mim && m.autor ? `${m.autor} · ` : '';
    d.textContent = resumo(m);
    const info = document.createElement('small');
    info.textContent = `${quem}${hora(m.criado_em)}`;
    d.append(info);
    return d;
  }
  function acrescentar(lista) {
    if (!lista.length) return;
    const caixa = el('wap-mensagens');
    caixa.append(...lista.map(bolha));
    caixa.scrollTop = caixa.scrollHeight;
    ultimoId = lista[lista.length - 1].id;
  }
  async function abrirChat(c) {
    chatAberto = c;
    ultimoId = 0;
    el('wap-chat-nome').textContent = nomeDe(c);
    el('wap-mensagens').replaceChildren();
    el('wap-form').hidden = false;
    aviso('');
    try {
      const { mensagens } = await pedir(`/mensagens?chat=${encodeURIComponent(c.chat)}&limite=100`);
      if (chatAberto === c) acrescentar(mensagens);
      await carregarConversas();
    } catch (err) { aviso(err.message); }
  }
  async function buscarNovas() {
    if (!visivel()) return;
    try {
      await carregarConversas();
      if (!chatAberto) return;
      const atual = chatAberto;
      const { mensagens } = await pedir(`/mensagens?chat=${encodeURIComponent(atual.chat)}&depois=${ultimoId}&limite=100`);
      if (chatAberto === atual) acrescentar(mensagens);
    } catch { /* tenta de novo na próxima rodada */ }
  }
  el('wap-form').addEventListener('submit', async e => {
    e.preventDefault();
    const texto = el('wap-texto').value.trim();
    if (!texto || !chatAberto) return;
    const botao = e.target.querySelector('button');
    botao.disabled = true;
    aviso('');
    try {
      await pedir('/enviar', { method: 'POST', body: { para: chatAberto.chat, texto } });
      el('wap-texto').value = '';
      await buscarNovas();
    } catch (err) { aviso(err.message); }
    botao.disabled = false;
  });

  // ── Chave da API ──
  async function atualizarChave() {
    const c = await pedir('/chave');
    el('wap-chave-estado').textContent = c.existe ? `Há uma chave ativa, criada em ${hora(c.criada_em)}.` : 'Nenhuma chave criada.';
    el('wap-chave-gerar').textContent = c.existe ? 'Trocar chave' : 'Gerar chave';
    el('wap-chave-apagar').hidden = !c.existe;
  }
  el('wap-chave-gerar').addEventListener('click', async () => {
    const trocar = el('wap-chave-gerar').textContent === 'Trocar chave';
    if (trocar && !await OfertouUI.confirmar('Trocar a chave? Os programas que usam a chave atual param de funcionar.')) return;
    try {
      const { chave } = await pedir('/chave', { method: 'POST' });
      el('wap-chave-nova').textContent = `Copie agora, ela não aparece de novo: ${chave}`;
      el('wap-chave-nova').hidden = false;
      await atualizarChave();
    } catch (err) { el('wap-chave-estado').textContent = err.message; }
  });
  el('wap-chave-apagar').addEventListener('click', async () => {
    if (!await OfertouUI.confirmar('Apagar a chave? Os programas que usam essa chave param de funcionar.')) return;
    try {
      await pedir('/chave', { method: 'DELETE' });
      el('wap-chave-nova').hidden = true;
      await atualizarChave();
    } catch (err) { el('wap-chave-estado').textContent = err.message; }
  });

  // ── Atualização: QR code e mensagens enquanto a parte estiver na tela ──
  function ciclo() {
    atualizarStatus();
    buscarNovas();
  }
  el('wa-provider').addEventListener('change', () => setTimeout(() => { ciclo(); atualizarChave().catch(() => {}); }, 0));
  let chaveLida = false;
  setInterval(() => {
    if (!visivel()) return;
    ciclo();
    if (!chaveLida) { chaveLida = true; atualizarChave().catch(() => { chaveLida = false; }); }
  }, 3000);
})();
