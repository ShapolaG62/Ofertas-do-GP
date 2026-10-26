// Ofertou! Ganhos — envia ao site os valores lidos na página do portal (a página do portal não pode chamar o site
// direto por causa do CORS; a extensão pode, com a permissão de acesso ao endereço do site).
async function config() {
  const c = await chrome.storage.local.get(['site', 'chave']);
  return { site: String(c.site || 'https://tanoofertou.com.br').replace(/\/+$/, ''), chave: String(c.chave || '') };
}

async function enviar(corpo) {
  const { site, chave } = await config();
  if (!chave) return { ok: false, erro: 'Configure a extensão: clique no ícone do Ofertou! e cole a chave gerada no painel.' };
  try {
    const r = await fetch(`${site}/api/ganhos/extensao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, ...j } : { ok: false, erro: j.error || `O site respondeu ${r.status}.` };
  } catch (err) {
    return { ok: false, erro: `Não consegui falar com ${site} (${err.message}).` };
  }
}

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (msg?.tipo === 'enviar') enviar(msg.dados).then(responder);
  else if (msg?.tipo === 'testar') enviar({ teste: true }).then(responder);
  else if (msg?.tipo === 'config') config().then(c => responder({ configurada: Boolean(c.chave), site: c.site }));
  else return false;
  return true; // resposta assíncrona
});
