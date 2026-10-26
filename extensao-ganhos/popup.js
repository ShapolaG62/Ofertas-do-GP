const $ = s => document.querySelector(s);
const msg = (sel, t, tipo = '') => { $(sel).textContent = t; $(sel).className = `msg ${tipo}`; };
const brl = n => (n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const hora = ms => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

let PORTAIS = {}, ativos = [];

async function desenhar() {
  const { estado = {} } = await chrome.storage.local.get('estado');
  $('#portais').innerHTML = '';
  for (const [id, p] of Object.entries(PORTAIS)) {
    const e = estado[id];
    const div = document.createElement('label');
    div.className = 'item';
    div.innerHTML = '<input type="checkbox"><b></b><small></small>';
    div.querySelector('input').checked = ativos.includes(id);
    div.querySelector('input').dataset.id = id;
    div.querySelector('b').textContent = p.nome;
    const s = div.querySelector('small');
    if (!ativos.includes(id)) s.textContent = 'Desligado';
    else if (!e) s.textContent = 'Ainda não sincronizou.';
    else {
      s.textContent = e.ok ? `${hora(e.em)} · disponível ${brl(e.disponivel)} · a liberar ${brl(e.a_liberar)}` : `${hora(e.em)} · ${e.mensagem}`;
      s.className = e.ok ? 'ok' : 'erro';
    }
    $('#portais').appendChild(div);
  }
}

$('#portais').addEventListener('change', async e => {
  const id = e.target.dataset.id;
  if (!id) return;
  ativos = e.target.checked ? [...new Set([...ativos, id])] : ativos.filter(x => x !== id);
  await chrome.storage.local.set({ ativos });
  desenhar();
});

async function sincronizarAgora() {
  $('#agora').disabled = true;
  msg('#msg-sync', 'Sincronizando… (abre os portais numa janela minimizada e fecha sozinha)');
  await chrome.runtime.sendMessage({ tipo: 'sincronizar' });
  $('#agora').disabled = false;
  msg('#msg-sync', 'Pronto.', 'bom');
  desenhar();
}
$('#agora').addEventListener('click', sincronizarAgora);

$('#salvar').addEventListener('click', async () => {
  let site = $('#site').value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(site)) site = `https://${site}`;
  const chave = $('#chave').value.trim();
  if (!chave) return msg('#msg', 'Cole a chave gerada em Painel → Ganhos de afiliados.', 'ruim');
  // Endereço diferente do padrão: o Chrome pede licença para a extensão acessar o site
  const padrao = /^https:\/\/tanoofertou\.com\.br|^http:\/\/(localhost|127\.0\.0\.1)/i.test(site);
  if (!padrao && !(await chrome.permissions.request({ origins: [`${new URL(site).origin}/*`] }))) return msg('#msg', 'Sem a permissão, a extensão não consegue enviar para esse endereço.', 'ruim');
  await chrome.storage.local.set({ site, chave });
  msg('#msg', 'Testando…');
  const r = await chrome.runtime.sendMessage({ tipo: 'testar' });
  if (!r?.ok) return msg('#msg', r?.erro || 'Não funcionou.', 'ruim');
  msg('#msg', 'Chave certa!', 'bom');
  $('#config').open = false;
  sincronizarAgora();
});

(async () => {
  const r = await chrome.runtime.sendMessage({ tipo: 'portais' });
  PORTAIS = r.PORTAIS;
  const c = await chrome.storage.local.get(['site', 'chave', 'ativos']);
  ativos = Array.isArray(c.ativos) ? c.ativos : r.ATIVOS_PADRAO;
  $('#site').value = c.site || 'https://tanoofertou.com.br';
  $('#chave').value = c.chave || '';
  if (!c.chave) $('#config').open = true;
  desenhar();
})();
