const $ = s => document.querySelector(s);
const msg = (t, tipo = '') => { $('#msg').textContent = t; $('#msg').className = tipo; };

chrome.storage.local.get(['site', 'chave']).then(c => {
  $('#site').value = c.site || 'https://tanoofertou.com.br';
  $('#chave').value = c.chave || '';
});

$('#salvar').addEventListener('click', async () => {
  let site = $('#site').value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(site)) site = `https://${site}`;
  const chave = $('#chave').value.trim();
  if (!chave) return msg('Cole a chave gerada em Painel → Ganhos de afiliados → Extensão do Chrome.', 'ruim');
  // Endereço diferente do padrão: o Chrome pede licença para a extensão acessar o site
  const origem = `${new URL(site).origin}/*`;
  const padrao = /^https:\/\/tanoofertou\.com\.br|^http:\/\/(localhost|127\.0\.0\.1)/i.test(site);
  if (!padrao && !(await chrome.permissions.request({ origins: [origem] }))) return msg('Sem a permissão, a extensão não consegue enviar para esse endereço.', 'ruim');
  await chrome.storage.local.set({ site, chave });
  msg('Testando…');
  const r = await chrome.runtime.sendMessage({ tipo: 'testar' });
  msg(r?.ok ? 'Tudo certo! Agora é só abrir os portais.' : (r?.erro || 'Não funcionou.'), r?.ok ? 'bom' : 'ruim');
});
