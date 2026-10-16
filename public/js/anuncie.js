/* Ofertou! — página "Anuncie": espaços disponíveis e pedido de contato de empresas */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const form = $('#lead-form');
  const msg = $('#lead-msg');

  function show(text, ok) {
    msg.textContent = text;
    msg.className = `form-msg ${ok ? 'ok' : 'err'}`;
    msg.hidden = false;
  }

  fetch('/api/anuncie/info').then(r => r.json()).then(info => {
    $('#spaces').innerHTML = info.espacos.map(e => `<div class="adv-space"><b>${esc(e.nome)}</b>
      <span>Arte: ${esc(e.tamanho)} px${e.mobile ? ` · celular: ${esc(e.mobile)} px` : ''}</span></div>`).join('');
    $('#espaco-sel').insertAdjacentHTML('beforeend',
      info.espacos.map(e => `<option value="${esc(e.id)}">${esc(e.nome)}</option>`).join(''));
    const v = info.video || {};
    const mb = b => `${Math.round(b / 1048576)} MB`;
    $('#formats').innerHTML = `
      <div class="adv-space"><b>Imagem</b>
        <span>JPG, PNG ou WEBP · até 3 MB · no tamanho do espaço (veja acima). Pode mandar uma versão para computador e outra para celular.</span></div>
      <div class="adv-space"><b>Vídeo curto (opcional)</b>
        <span>${esc(v.formatos || 'MP4 ou WEBM')} · <b>sem som</b> (toca mudo e em repetição) · até ${v.maxSegundos || 15} segundos ·
        até ${mb(v.maxBytes || 8388608)} (ideal ${mb(v.idealBytes || 4194304)}) · mesma proporção da imagem do espaço.
        Mande também uma <b>imagem de capa</b>: ela aparece enquanto o vídeo carrega e para quem economiza dados no celular.</span></div>`;
    const pre = new URLSearchParams(location.search).get('espaco');
    if (pre && info.espacos.some(e => e.id === pre)) $('#espaco-sel').value = pre;
    if (/^https:\/\/wa\.me\//.test(info.whatsapp || '')) { $('#lead-wa').href = info.whatsapp; $('#lead-wa').hidden = false; }
  }).catch(() => {});

  // Máscara simples de telefone
  form.telefone.addEventListener('input', e => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
      : d.length > 2 ? d.replace(/(\d{2})(\d{0,4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '') : d;
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await fetch('/api/anuncie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Não foi possível enviar. Tente de novo.');
      form.reset();
      show('Pedido enviado! Em breve entraremos em contato.', true);
    } catch (err) {
      show(err.message, false);
    } finally {
      btn.disabled = false;
    }
  });
})();
