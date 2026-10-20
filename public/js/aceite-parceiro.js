/* Ofertou! — aceite dos Termos do Parceiro (item 6-A de /privacidade) para quem já é lojista ou afiliado e ainda não
   aceitou a versão atual (cadastro antigo, acesso criado pelo painel...). A janela não fecha sem o aceite; dá para sair.
   OfertouAceiteParceiro.pedir(['lojista' | 'afiliado'], urlDoAceite, urlDeSair) → Promise (resolve depois de aceitar) */
(() => {
  'use strict';
  if (window.OfertouAceiteParceiro) return;
  const TEXTOS = {
    lojista: `<b>Termos do Lojista Parceiro.</b> Sou o <b>único responsável</b> pelos produtos, preços, estoque, notas fiscais, <b>prazos de entrega, de troca e de atendimento</b> e pelo cumprimento do Código de Defesa do Consumidor nas vendas da minha loja. O Ofertou! <b>não responde</b> por descumprimentos meus e, se for reclamado, processado, condenado ou tiver de pagar qualquer valor por ato ou omissão minha, terá <b>direito de regresso</b>: eu o ressarcirei integralmente, com custas, honorários e multas. Sei que a loja pode ser suspensa ou excluída se eu descumprir essas regras.`,
    afiliado: `<b>Termos do Afiliado.</b> Sou o <b>único responsável</b> pelo que divulgo nos meus canais e pelos meus links, inclusive pelas regras dos programas de afiliados, da publicidade e da LGPD. O Ofertou! <b>não responde</b> por violações minhas e terá <b>direito de regresso</b> contra mim por qualquer valor que tiver de pagar por causa delas. O acesso é <b>pessoal e intransferível</b>: <b>não posso revender, alugar, emprestar, ceder ou compartilhar</b> a minha conta, o painel ou a ferramenta com outras pessoas, sob pena de encerramento do acesso sem reembolso e de responder pelos prejuízos.`,
  };
  const css = document.createElement('style');
  css.textContent = `
  .oap .oui-caixa { width: min(560px, 100%); max-height: calc(100dvh - 32px); overflow: auto; }
  .oap-aceite { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 12px; cursor: pointer;
    border: 1px solid var(--line-strong, var(--border-strong, #343c36)); background: var(--surface-2, rgba(255,255,255,.03)); font-size: 13.5px; line-height: 1.55; }
  .oap-aceite input { flex: none; width: 18px; height: 18px; margin-top: 2px; accent-color: var(--brand, var(--green, #2bd47d)); }
  .oap-erro { margin: 0; color: #ff6b6f; font-size: 13.5px; }
  .oap a { color: var(--brand, var(--green, #2bd47d)); }`;
  document.head.appendChild(css);

  function pedir(papeis, url, sair) {
    papeis = (papeis || []).filter(p => TEXTOS[p]);
    if (!papeis.length) return Promise.resolve();
    return new Promise(ok => {
      const fundo = document.createElement('div');
      fundo.className = 'oui-fundo oap';
      fundo.innerHTML = `<form class="oui-caixa" role="dialog" aria-modal="true" aria-labelledby="oap-tit">
        <div><h2 class="oui-titulo" id="oap-tit">Atualizamos os Termos do Parceiro</h2>
          <p class="oui-texto">Para continuar usando ${papeis.includes('lojista') ? 'a sua loja' : 'o painel do afiliado'}, leia o
          <a href="/privacidade#parceiros" target="_blank" rel="noopener">item 6-A dos Termos de Uso</a> e confirme:</p></div>
        ${papeis.map(p => `<label class="oap-aceite"><input type="checkbox" name="aceite_${p}" required><span>Li e aceito. ${TEXTOS[p]}</span></label>`).join('')}
        <p class="oap-erro" hidden></p>
        <div class="oui-botoes"><button type="button" class="oui-btn" data-sair>Sair da conta</button><button class="oui-btn ok">Aceitar e continuar</button></div>
      </form>`;
      document.body.appendChild(fundo);
      const form = fundo.querySelector('form'), erro = fundo.querySelector('.oap-erro');
      fundo.querySelector('[data-sair]').addEventListener('click', async () => {
        await fetch(sair, { method: 'POST' }).catch(() => {});
        location.href = '/';
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const corpo = Object.fromEntries(papeis.map(p => [`aceite_${p}`, form[`aceite_${p}`].checked]));
        const btn = form.querySelector('.ok'); btn.disabled = true; erro.hidden = true;
        try {
          const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || 'Não foi possível registrar o aceite.');
          fundo.remove(); ok();
        } catch (err) { erro.textContent = err.message; erro.hidden = false; btn.disabled = false; }
      });
      form.querySelector('input').focus();
    });
  }
  window.OfertouAceiteParceiro = { pedir };
})();
