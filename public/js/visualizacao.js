/* Ofertou! — Modo de visualização do administrador (áreas Afiliado e Loja parceira da central).
   Sem conta dessas áreas, as telas abrem com dados de exemplo, montados aqui no navegador: nenhuma gravação sai daqui
   e nenhum dado de cliente real é lido. Fora da central, ou para quem tem a própria conta, este arquivo não faz nada. */
(() => {
  'use strict';
  if (window.OfertouVisualizacao) return;
  let area = null;
  try {
    const central = window.top !== window ? window.top.OfertouCentral : null;
    const id = window.frameElement?.dataset.area;
    if (central?.visualiza?.(id)) area = id;
  } catch { /* outro site */ }
  const pagina = location.pathname.replace(/\/+$/, '');
  if (!((area === 'afiliado' && pagina === '/cliente') || (area === 'loja' && pagina === '/conta'))) return;
  window.OfertouVisualizacao = true; // os quadros dentro destas telas também não gravam (ver tema.js)

  const AVISO = 'Modo de visualização: nada é salvo.';
  const hoje = d => new Date(Date.now() - 3 * 3600000 - d * 86400000).toISOString().slice(0, 10);
  const quando = d => `${hoje(d)} 13:30:00`;
  const validade = '9999-12-31 23:59:59';
  const LOJAS = { mercadolivre: 'Mercado Livre', shopee: 'Shopee', amazon: 'Amazon', magalu: 'Magalu', aliexpress: 'AliExpress', kabum: 'KaBuM!' };
  const PRODUTOS = ['Air Fryer 4L Inox', 'Fone Bluetooth com Cancelamento de Ruído', 'Monitor 27" Full HD', 'Garrafa Térmica 1 Litro', 'Tênis de Corrida Masculino', 'Relógio Inteligente com GPS',
    'Liquidificador 1200W', 'Kit de Panelas Antiaderentes', 'Mochila para Notebook', 'Smart TV 50" 4K', 'Cadeira de Escritório', 'Ventilador de Mesa 40cm'];
  const ofertas = PRODUTOS.map((produto, i) => {
    const preco_atual = 79.9 + i * 53, desconto_pct = 18 + (i * 7) % 40;
    return { id: 900001 + i, produto, preco_atual, preco_anterior: Math.round(preco_atual / (1 - desconto_pct / 100) * 100) / 100, desconto_pct,
      store_id: Object.keys(LOJAS)[i % 6], plataforma: Object.values(LOJAS)[i % 6], comissao_pct: 4 + i % 5, comissao_extra_pct: i % 4 === 0 ? 2 : 0, cupom_texto: i % 3 === 0 ? 'EXEMPLO10' : null };
  });

  // ── Afiliado ───────────────────────────────────────────────────────────────
  const painelAfiliado = dias => {
    const serie = Array.from({ length: dias }, (_, i) => {
      const n = dias - 1 - i, a = 6 + (n * 5) % 9, b = 3 + (n * 3) % 6, c = 2 + (n * 7) % 4;
      return { dia: hoje(n), ok: a + b + c, erro: n % 5 === 1 ? 1 : 0, lojas: { mercadolivre: a, shopee: b, amazon: c } };
    });
    return { dias, serie, enviados: serie.reduce((s, d) => s + d.ok, 0), falhas: serie.reduce((s, d) => s + d.erro, 0),
      redes: [{ id: 'whatsapp', nome: 'WhatsApp', pronta: true }, { id: 'telegram', nome: 'Telegram', pronta: true }, { id: 'facebook', nome: 'Facebook', pronta: false, motivo: 'não configurado' }, { id: 'x', nome: 'X', pronta: false, motivo: 'não configurado' }],
      grupos_whatsapp: 4, fila: 3, agenda: { ativa: true, proximo: '18:00' }, cliques: 186 * Math.max(1, Math.round(dias / 7)), comissao: 42.5 * dias,
      saldo: { disponivel: 312.4, a_liberar: 148.9, recebido: 1250 }, lembrete_planilha: [], ultimo_envio: quando(0), sem_afiliado: ['KaBuM!'] };
  };
  const comissao = dias => {
    const serie = Array.from({ length: dias }, (_, i) => ({ dia: hoje(dias - 1 - i), comissao: 12 + ((dias - i) * 13) % 47 }));
    const total = serie.reduce((s, d) => s + d.comissao, 0);
    return { comissao: total, cancelados: 2, confirmada: total * 0.7, pendente: total * 0.3, pedidos: dias * 3, ticket: 164.8, serie,
      por_loja: [{ nome: 'Mercado Livre', pedidos: dias * 2, comissao: total * 0.6 }, { nome: 'Shopee', pedidos: dias, comissao: total * 0.4 }],
      top: ofertas.slice(0, 5).map((o, i) => ({ produto: o.produto, comissao: 90 - i * 14 })),
      recentes: ofertas.slice(0, 6).map((o, i) => ({ data_venda: hoje(i), plataforma: i % 2 ? 'shopee' : 'mercadolivre', produto: o.produto, comissao: 8.5 + i * 3, status: i % 3 ? 'confirmada' : 'pendente' })),
      lojas: LOJAS, sync: { ok: true, em: new Date().toISOString(), novas: 3, atualizadas: 5 }, shopee_ligada: true,
      saldos: { brl: { disponivel: 312.4, a_liberar: 148.9, recebido: 1250 }, usd: {}, lojas: [
        { nome: 'Mercado Livre', moeda: 'BRL', disponivel: 212.4, a_liberar: 98.9, proxima_liberacao: hoje(-6), pode_sacar: true, falta: 0 },
        { nome: 'Shopee', moeda: 'BRL', disponivel: 100, a_liberar: 50, proxima_liberacao: hoje(-12), pode_sacar: false, falta: 50 }] },
      lembrete: [], saques: [{ id: 1, plataforma: 'mercadolivre', valor: 500, criado_em: quando(20) }] };
  };
  const membros = dias => {
    const serie = Array.from({ length: dias }, (_, i) => ({ dia: hoje(dias - 1 - i), entradas: 4 + (i * 3) % 9, saidas: 1 + (i * 2) % 4 }));
    const entradas = serie.reduce((s, d) => s + d.entradas, 0), saidas = serie.reduce((s, d) => s + d.saidas, 0);
    return { total: 1840, entradas, saidas, serie, grupos: [{ nome: 'Ofertas do Dia 1', total: 980, entradas: Math.ceil(entradas / 2), saidas: Math.ceil(saidas / 2) }, { nome: 'Ofertas do Dia 2', total: 860, entradas: Math.floor(entradas / 2), saidas: Math.floor(saidas / 2) }] };
  };
  const configAfiliado = { config: { amazon_tag: 'exemplo-20', ml_matt_word: 'exemplo', ml_matt_tool: '123456', magalu_store: 'exemplo', shopee_app_id: '123456', shopee_app_secret_set: true, aliexpress_app_key: '123456', aliexpress_app_secret_set: true, aliexpress_tracking_id: 'exemplo',
    telegram_bot_token_set: true, telegram_chat_id: '@canaldeexemplo', 
    whatsapp_groups: JSON.stringify([{ id: '1', nome: 'Ofertas do Dia 1' }, { id: '2', nome: 'Ofertas do Dia 2' }]), whatsapp_intervalo_s: '30',
    agenda_ativa: '1', agenda_horarios: '09:00,12:00,18:00', agenda_qtd: '5', agenda_redes: JSON.stringify(['whatsapp', 'telegram']), agenda_completar: '1', post_modelo: '', grupo_slug: 'exemplo' }, sem_afiliado: ['KaBuM!'] };
  const agenda = { estado: { ativa: true, horarios: ['09:00', '12:00', '18:00'], proximo: '18:00', pendentes: 3, rodando: false, ultimaExecucao: { em: quando(0), feitos: [{ ok: true }, { ok: true }, { ok: true }, { ok: false }] } },
    fila: ofertas.slice(0, 3).map((o, i) => ({ id: i + 1, offer_id: o.id, produto: o.produto, status: 'pendente', resultado: '' })) };
  const historico = ofertas.slice(0, 8).map((o, i) => ({ created_at: quando(i), produto: o.produto, rede: i % 2 ? 'telegram' : 'whatsapp', ok: i !== 3, mensagem: i === 3 ? 'Exemplo de falha no envio' : '' }));

  function rotaAfiliado(u) {
    const dias = Number(u.searchParams.get('dias')) || 7;
    return {
      '/api/cliente/me': { cliente: { id: 0, nome: 'Afiliado Exemplo', email: 'afiliado@exemplo.com', plano: 'Afiliado Pro', validade, status: 'ativo' }, parceiro_pendente: [] },
      '/api/cliente/painel': () => painelAfiliado(dias),
      '/api/cliente/sugestoes': { itens: ofertas },
      '/api/cliente/config': configAfiliado,
      '/api/cliente/grupo-automacao': { webhook: 'https://exemplo.com/webhook/exemplo', controle: '', ajuda: '' },
      '/api/cliente/whatsapp/status': { conectado: true, mensagem: 'Exemplo: WhatsApp conectado.' },
      '/api/cliente/whatsapp/grupos': { ocultos: 3, temas: [{ id: 'tecnologia', nome: 'Tecnologia', icone: '💻', categorias: ['informatica', 'celulares'] }, { id: 'casa', nome: 'Casa', icone: '🏠', categorias: ['casa', 'cozinha'] }], lojas: [{ id: 'mercadolivre', nome: 'Mercado Livre' }, { id: 'shopee', nome: 'Shopee' }, { id: 'amazon', nome: 'Amazon' }, { id: 'magalu', nome: 'Magalu' }, { id: 'kabum', nome: 'KaBuM!' }], grupos: [{ id: '1', nome: 'Ofertas do Dia 1', membros: 420, salvo: true, categorias: ['informatica', 'celulares'], sugestao: [] }, { id: '2', nome: 'Ofertas Casa', membros: 980, salvo: true, categorias: [], sugestao: ['casa'] }] },
      '/api/cliente/wa/status': { fase: 'conectado', conectado: true, numero: '5500000000000', nome: 'Exemplo', sessao_salva: true },
      '/api/cliente/wa/conversas': { conversas: [{ chat: '1@g.us', nome: 'Ofertas do Dia 1', grupo: true, id: 1, texto: 'Mensagem de exemplo', tipo: 'texto', de_mim: 1, criado_em: quando(0) }] },
      '/api/cliente/wa/mensagens': { mensagens: [{ id: 1, chat: '1@g.us', de_mim: 1, tipo: 'texto', texto: 'Mensagem de exemplo', criado_em: quando(0) }] },
      '/api/cliente/wa/chave': { existe: false, criada_em: null },
      '/api/cliente/wa/grupos/em-serie': { rodando: false, itens: [], proximo: 1 },
      '/api/cliente/wa/ajustes': { rejeitar_chamadas: true, mensagem_chamada: '', sempre_online: false, ler_mensagens: false, ler_status: false },
      '/api/cliente/wa/webhook': { url: null },
      '/api/cliente/agenda': agenda,
      '/api/cliente/comissao': () => comissao(dias > 0 ? dias : 30),
      '/api/cliente/membros': () => membros(dias),
      '/api/cliente/site-grupo': { slug: 'exemplo', endereco: `${location.origin}/g/exemplo`, grupos: [{ nome: 'Ofertas do Dia 1', entradas: 420, limite: 1000, lotado: false }, { nome: 'Ofertas do Dia 2', entradas: 1000, limite: 1000, lotado: true }] },
      '/api/cliente/populares': { buscados: ['air fryer', 'iphone', 'smart tv', 'fone bluetooth', 'tênis'].map((termo, i) => ({ termo, vezes: 320 - i * 45 })), clicados: ofertas.slice(0, 6).map(o => ({ ...o, link: '#exemplo' })) },
      '/api/postagens/historico': historico,
      '/api/postagens/resultados': {
        dias: 30, total: { envios: 120, cliques: 460, falhas: 2, tentando: 0, recuperados: 3, rastreados: 120 }, falhas: [],
        grupos: [{ chave: '1', nome: 'Ofertas do Dia 1', envios: 60, cliques: 280, falhas: 1 }, { chave: '2', nome: 'Ofertas do Dia 2', envios: 60, cliques: 180, falhas: 1 }],
        horas: [{ chave: '20', nome: '20h', envios: 40, cliques: 220 }, { chave: '14', nome: '14h', envios: 40, cliques: 140 }, { chave: '09', nome: '09h', envios: 40, cliques: 100 }],
        temas: [{ chave: 'celulares', nome: 'Celulares, tablets e relógios', envios: 40, cliques: 210 }, { chave: 'casa', nome: 'Casa, móveis e decoração', envios: 80, cliques: 250 }],
        lojas: [{ chave: 'mercadolivre', nome: 'Mercado Livre', envios: 70, cliques: 300 }, { chave: 'shopee', nome: 'Shopee', envios: 50, cliques: 160 }],
        ofertas: [{ chave: 1, nome: 'Produto de exemplo', envios: 2, cliques: 48 }],
      },
    }[u.pathname];
  }

  // ── Loja parceira ──────────────────────────────────────────────────────────
  const lojaExemplo = { id: 0, nome: 'Loja Exemplo', slug: 'exemplo', descricao: 'Loja criada só para mostrar como o painel funciona.', logo_url: '', site_url: 'https://exemplo.com', feed_url: 'https://exemplo.com/produtos.xml', feed_status: 'ok', feed_tipo: 'XML', feed_ultima_sync: quando(0) };
  const painelLoja = () => {
    const serie = Array.from({ length: 30 }, (_, i) => { const n = (i * 7) % 5; return { dia: hoje(29 - i), valor: n * 89.9, vendas: n, pagina: 14 + (i * 11) % 40, produto: 8 + (i * 5) % 22 }; });
    return {
      loja: { nome: lojaExemplo.nome, slug: lojaExemplo.slug, aceita_pedidos: true, metodos: ['Pix', 'cartão'] },
      kpis: { vendas: { valor: 5394, n: 60, itens: 72, var_valor: 12 }, mp: { disponivel: true, conectado: true }, ticket_medio: 89.9, acessos: { n: 1240, var: 8 }, conversao: 6.4, avaliacao: { media: 4.7, total: 38, estrelas: { 5: 28, 4: 7, 3: 2, 2: 1, 1: 0 } } },
      pendencias: { a_enviar: [{ atrasado: false }, { atrasado: false }], pedidos_mensagem: 0, mensagens: 1, avaliacoes_sem_resposta: 0, anuncios_expirando: 2, anuncios_vencidos: 0 },
      funil: { pagina: 1240, produto: 930, pedidos: 74, pagos: 60 },
      checklist: [{ ok: true, texto: 'Colocar o logo da loja', aba: 'loja' }, { ok: true, texto: 'Escrever a apresentação da loja', aba: 'loja' }, { ok: true, texto: 'Conectar o Mercado Pago', aba: 'vendas' }, { ok: false, texto: 'Explicar como funciona a entrega', aba: 'loja' }],
      serie,
      mais_vendidos: ofertas.slice(0, 5).map((o, i) => ({ produto: o.produto, q: 14 - i * 2, v: (14 - i * 2) * o.preco_atual })),
      mais_vistos: ofertas.slice(3, 8).map((o, i) => ({ produto: o.produto, n: 210 - i * 28 })),
      ultimos: ofertas.slice(0, 4).map((o, i) => ({ id: i + 1, codigo: `#EX${1040 - i}`, produto: o.produto, quantidade: 1 + i % 2, subtotal: o.preco_atual, pago_em: quando(i), status: i ? 'enviado' : 'pago', status_nome: i ? 'Enviado' : 'Pago' })),
      avaliacoes: [{ nota: 5, autor: 'Cliente de exemplo', created_at: quando(1), texto: 'Entrega rápida e produto muito bom.', resposta: 'Obrigado!' }, { nota: 4, autor: 'Outro cliente', created_at: quando(4), texto: 'Gostei bastante.', resposta: 'Que bom!' }],
    };
  };
  const vendas = { loja: { id: 0, nome: lojaExemplo.nome, slug: lojaExemplo.slug },
    pagamento: { aceita_pedidos: true, aceita_pix: true, aceita_cartao: true, pedido_instrucoes: 'Exemplo: enviamos em até 2 dias úteis.', parcelas: 6, gateway_ok: true, mp: { disponivel: true, conectado: true, conta_id: 'exemplo', conectado_em: quando(40) } },
    pedidos: [], metricas: { finalizacoes: { total: 240, d30: 60, valor: 21576, valor_d30: 5394 }, pedidos: { total: 268, por_status: { aguardando_pagamento: 2 } },
      acessos: { pagina: { total: 8420, d30: 1240, d7: 310 }, produto: { total: 6120, d30: 930 }, site: { total: 410, d30: 62 }, link: { total: 780, d30: 118 } }, conversas: 96, mais_vistos: ofertas.slice(3, 8).map((o, i) => ({ produto: o.produto, n: 210 - i * 28 })) } };
  const editor = { loja: { id: 0, nome: lojaExemplo.nome, slug: lojaExemplo.slug, descricao: lojaExemplo.descricao, site_url: lojaExemplo.site_url },
    aparencia: { slogan: 'Promoções de verdade, todos os dias', whatsapp: '(00) 00000-0000', instagram: '@lojaexemplo', telefone: '(00) 0000-0000', email_contato: 'contato@exemplo.com', horario: 'Seg a sex, 9h às 18h', endereco: 'Rua de Exemplo, 100', politica_entrega: 'Enviamos em até 2 dias úteis.', politica_troca: 'Trocas em até 7 dias.', logo_url: '', capa_url: '', mostrar_avaliacoes: true, cor: 'verde' },
    cores: ['verde'], catalogos: [{ id: 1, nome: 'Promoções da semana', descricao: 'Exemplo de catálogo', itens: [900001, 900002, 900003] }],
    produtos: ofertas.slice(0, 6).map(o => ({ id: o.id, produto: o.produto, preco_atual: o.preco_atual, oculto: 0, no_ar: 1 })),
    avaliacoes: { resumo: { total: 2, media: 4.5 }, itens: [{ id: 1, autor: { nome: 'Cliente de exemplo' }, nota: 5, created_at: quando(1), verificada: true, texto: 'Entrega rápida e produto muito bom.', resposta: 'Obrigado!' }, { id: 2, autor: { nome: 'Outro cliente' }, nota: 4, created_at: quando(4), verificada: false, texto: 'Gostei bastante.', resposta: '' }] } };
  const rotaLoja = {
    '/api/conta/me': { user: { id: 0, tipo: 'empresa', nome: 'Responsável Exemplo', empresa_nome: lojaExemplo.nome, email: 'loja@exemplo.com', status: 'active', tem_senha: true, created_at: quando(90), cadastro_simplificado: false, email_provisorio: false }, loja: lojaExemplo, parceiro_pendente: [] },
    '/api/conta/loja/painel': painelLoja,
    '/api/conta/loja/vendas': vendas,
    '/api/conta/loja/editor': editor,
    '/api/conta/produtos': ofertas.slice(0, 6).map((o, i) => ({ ...o, oculto: 0, no_prazo: i !== 5, fonte: 'feed', link_clicks: 120 - i * 15, expires_at: quando(-10) })),
    '/api/conta/cartoes': { disponivel: true, max: 3, cartoes: [], parcelas: 6 },
    '/api/conta/arrependimento': { pode: false },
    '/api/pedidos': [],
  };

  // ── Comum às duas telas ────────────────────────────────────────────────────
  const COMUM = {
    '/api/chat/resumo': { logado: true, nao_lidas: 0, pedidos: 0, sac: 0 },
    '/api/chat/conversas': { conversas: [] },
    '/api/notificacoes': { itens: [], nao_lidas: 0 },
    '/api/sac/meu': { chamado: null },
  };
  // Mensagens e Meu perfil da loja: sem conversas nem perfil de verdade. O "src" evita carregar os scripts dessas telas.
  const telaExemplo = (classe, titulo, script, extra = '') => `<main class="${classe}"><div class="panel-card"><h2>${titulo}</h2><p class="muted">No modo de visualização esta tela fica vazia, porque ela mostraria conversas e dados de uma conta de verdade.</p></div></main>${extra}<script src="/js/visualizacao.js?${script}"></script>`;
  const TELAS = {
    '/mensagens/tela': telaExemplo('msg-page', 'Mensagens', '/js/mensagens.js'),
    '/perfil/minha-conta': telaExemplo('pf-page', 'Meu perfil', '/js/perfil.js', '<div id="pf-editor" hidden></div>'),
  };

  const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });
  const buscarDeVerdade = window.fetch.bind(window);
  window.fetch = async (entrada, opcoes = {}) => {
    const u = new URL(typeof entrada === 'string' ? entrada : entrada.url || String(entrada), location.href);
    if (u.origin !== location.origin) return buscarDeVerdade(entrada, opcoes);
    const metodo = String(opcoes.method || entrada.method || 'GET').toUpperCase();
    if (metodo !== 'GET' && metodo !== 'HEAD') return json({ error: AVISO }, 403);
    if (TELAS[u.pathname]) return new Response(TELAS[u.pathname], { headers: { 'Content-Type': 'text/html' } });
    const achado = (area === 'afiliado' ? rotaAfiliado(u) : rotaLoja[u.pathname]) ?? COMUM[u.pathname];
    if (achado !== undefined) return json(typeof achado === 'function' ? achado() : achado);
    // Sem exemplo pronto: nada de dados de conta. O que é público (ofertas, planos, cadastro) segue normal.
    if (/^\/api\/(cliente|chat|sac|pedidos|notificacoes)(\/|$)/.test(u.pathname) || (/^\/api\/conta(\/|$)/.test(u.pathname) && u.pathname !== '/api/conta/cadastro-info')) return json({});
    return buscarDeVerdade(entrada, opcoes);
  };

  // Links que levariam a páginas de verdade de um exemplo que não existe
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    const u = new URL(a.href, location.href);
    if (u.hash === '#exemplo' || (u.origin === location.origin && /^\/(loja\/exemplo|g\/exemplo|anuncio\/9000)/.test(u.pathname)) || /(^|\.)exemplo\.com$/.test(u.hostname)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.OfertouUI?.avisar('Este link é só um exemplo no modo de visualização.');
    }
  }, true);
  // Fotos dos produtos de exemplo
  document.addEventListener('error', e => {
    const img = e.target;
    if (img?.tagName === 'IMG' && /\/img\/o\/9000/.test(img.src)) img.src = '/images/logo-ofertou.png';
  }, true);

  const faixa = () => {
    const f = document.createElement('div');
    f.setAttribute('role', 'status');
    f.textContent = 'Modo de visualização: estes dados são de exemplo e nada é salvo.';
    f.style.cssText = 'padding:8px 16px;background:var(--surface-2);color:var(--ink);border-bottom:1px solid var(--line);font-size:13px;font-weight:700;text-align:center';
    // No Afiliado, o cabeçalho cobre o topo da página no computador: a faixa fica logo abaixo dele, junto do conteúdo
    const alvo = area === 'afiliado' && window.matchMedia('(min-width: 761px)').matches ? document.querySelector('.cli-tab') : null;
    if (alvo) alvo.parentElement.insertBefore(f, alvo); else document.body.prepend(f);
    const css = document.createElement('style');
    css.textContent = '#logout{display:none!important}';
    document.head.append(css);
  };
  document.addEventListener('DOMContentLoaded', faixa);
})();
