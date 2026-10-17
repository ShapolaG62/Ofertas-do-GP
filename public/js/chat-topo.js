/* Ofertou! — ícone de Mensagens no topo das páginas, com o número de mensagens não lidas e pedidos de mensagem */
(() => {
  'use strict';
  const acoes = document.querySelector('.header-actions');
  if (!acoes || location.pathname.startsWith('/mensagens')) return;
  const btn = document.createElement('a');
  btn.className = 'btn btn-sm chat-topo';
  btn.href = '/mensagens';
  btn.hidden = true;
  btn.innerHTML = '<span aria-hidden="true">💬</span><span class="chat-topo-txt">Mensagens</span><b class="chat-topo-n" hidden></b>';
  acoes.insertBefore(btn, acoes.firstChild);
  async function atualizar() {
    try {
      const r = await fetch('/api/chat/resumo', { cache: 'no-store' }).then(x => x.json());
      btn.hidden = !r.logado;
      const n = (r.nao_lidas || 0) + (r.pedidos || 0);
      const b = btn.querySelector('.chat-topo-n');
      b.hidden = !n;
      b.textContent = n > 99 ? '99+' : n;
      btn.title = r.pedidos ? `${r.pedidos} pedido(s) de mensagem esperando sua resposta` : n ? `${n} mensagem(ns) não lida(s)` : 'Mensagens';
    } catch { /* sem conexão */ }
  }
  atualizar();
  setInterval(() => { if (document.visibilityState === 'visible') atualizar(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizar(); });
})();
