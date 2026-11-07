// Ofertou! — lê as listas de produtos dos cupons para o minerador de cupons, com a sessão do seu Chrome.
// Fica aqui porque a central de cupons (www.) não pode ler páginas de lista.mercadolivre.com.br diretamente.
const TEMPO_MAXIMO = 25000;

chrome.runtime.onMessage.addListener((m, sender, responder) => {
  if (m?.tipo !== 'ler-lista' || sender.id !== chrome.runtime.id) return false;
  let url;
  try { url = new URL(m.url); } catch { responder({ erro: 'endereço inválido' }); return false; }
  if (url.protocol !== 'https:' || url.hostname !== 'lista.mercadolivre.com.br') { responder({ erro: 'endereço fora da lista do Mercado Livre' }); return false; }
  const parar = new AbortController();
  const relogio = setTimeout(() => parar.abort(), TEMPO_MAXIMO);
  fetch(url.href, { credentials: 'include', signal: parar.signal })
    .then(async r => responder({ status: r.status, url: r.url, html: r.ok ? await r.text() : '' }))
    .catch(err => responder({ erro: String(err?.message || err) })) // inclui redirecionamento sem fim: esse cupom é pulado
    .finally(() => clearTimeout(relogio));
  return true; // a resposta vem depois
});
