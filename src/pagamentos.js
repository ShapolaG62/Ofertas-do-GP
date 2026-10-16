// Compra de planos: pedido com os dados do cadastro, pagamento por Pix ou Mercado Pago e, aprovado o pagamento,
// criação (ou renovação) da conta, e-mail de confirmação com a data de validade e login automático.
//  • Com o Access Token do Mercado Pago no painel: Pix (QR code) e checkout do Mercado Pago, confirmação automática
//    (consultando a API — o aviso do Mercado Pago só serve de gatilho, nunca é aceito sem conferir).
//  • Pix pela chave, transferência bancária ou link de pagamento (PagBank, InfinitePay…): o admin confere e confirma no painel.
// Cada forma liga/desliga em Painel → Planos → Formas de recebimento.
const crypto = require('crypto');
const axios = require('axios');
const db = require('./db');
const settings = require('./settings');
const auth = require('./auth');
const users = require('./users');
const clientes = require('./clientes');
const cadastro = require('./cadastro');
const planos = require('./planos');
const email = require('./email');

const MP = 'https://api.mercadopago.com';
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const sqlDe = d => d.toISOString().replace('T', ' ').slice(0, 19);
const isBlocked = key => Boolean(db.get('SELECT 1 FROM blocked_emails WHERE email = ?', key));
const PIX_MINUTOS = 30;

// Formas que o cliente pode escolher. "pix" é automático (Mercado Pago) quando possível; senão, pela chave do admin.
function metodosDisponiveis(s = settings.getAll(), planoId = null) {
  const mp = Boolean(s.mp_access_token);
  const pixAuto = mp && s.pag_mp_pix !== '0';
  const pixManual = s.pag_pix_ativo !== '0' && Boolean(String(s.pix_chave || '').trim());
  const ted = s.pag_ted_ativo === '1' && Boolean(s.ted_banco && s.ted_conta && s.ted_titular);
  const links = ['consumidor', 'empresa', 'pro'].filter(id => /^https:\/\//i.test(String(s[`pag_link_${id}`] || '').trim()));
  const link = s.pag_link_ativo === '1' && (planoId ? links.includes(planoId) : links.length > 0);
  const parcelas = Math.min(Math.max(parseInt(s.pag_mp_parcelas, 10) || 1, 1), 12);
  const lista = [];
  if (pixAuto || pixManual) lista.push({ id: 'pix', nome: 'Pix', automatico: pixAuto,
    desc: pixAuto ? 'QR code na hora, liberação automática' : 'Pague pela chave Pix e envie o comprovante' });
  if (mp && s.pag_mp_cartao !== '0') lista.push({ id: 'mercadopago', nome: 'Cartão de crédito ou débito', automatico: true,
    desc: `Pelo Mercado Pago${parcelas > 1 ? `, em até ${parcelas}x` : ''} — liberação automática` });
  if (link) lista.push({ id: 'link', nome: String(s.pag_link_nome || 'Link de pagamento').slice(0, 60), automatico: false,
    desc: 'Pague pelo link seguro e envie o comprovante' });
  if (ted) lista.push({ id: 'transferencia', nome: 'Transferência bancária (TED)', automatico: false,
    desc: 'Transfira para a conta indicada e envie o comprovante' });
  return { lista, pix: pixAuto || pixManual, pix_automatico: pixAuto, mercadopago: lista.some(m => m.id === 'mercadopago'),
    algum: lista.length > 0 };
}

// ── Pedido ───────────────────────────────────────────────────────────────────
// Valida os dados do formulário conforme o plano. Se o e-mail já tem conta e a senha confere, é renovação.
function validarDados(p, b) {
  const emailN = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailN) || emailN.length > 120) throw fail('Informe um e-mail válido.');
  const senha = String(b.senha || '');
  if (senha.length < 8 || senha.length > 200) throw fail('A senha precisa ter pelo menos 8 caracteres.');
  if (!(b.aceite_termos === true || b.aceite_termos === 'on' || b.aceite_termos === '1')) {
    throw fail('É preciso aceitar os Termos de uso e a Política de privacidade.');
  }
  if (isBlocked(emailN)) throw fail('Não é possível usar este e-mail. Fale com o administrador.');
  const renovar = b.renovar === true || b.renovar === 'on' || b.renovar === '1';

  if (p.conta === 'cliente') {
    const existente = db.get('SELECT * FROM clientes WHERE email = ?', emailN);
    if (existente) {
      if (!auth.verifyPassword(senha, existente.senha_hash)) throw fail('Este e-mail já tem acesso ao Afiliado Pro. Para renovar, use a mesma senha.', 409);
      return { email: emailN, nome: existente.nome, renovar_cliente_id: existente.id };
    }
    if (renovar) throw fail('Não encontramos um acesso ao Afiliado Pro com este e-mail. Desmarque "renovar" para criar um novo.', 404);
    if (b.senha_confirmacao !== undefined && b.senha_confirmacao !== senha) throw fail('As senhas não conferem.');
    const nome = String(b.nome || '').trim().replace(/\s+/g, ' ');
    if (nome.length < 5 || !/\s/.test(nome)) throw fail('Informe nome e sobrenome.');
    const cpf = cadastro.digits(b.cpf);
    if (!cadastro.validCpf(cpf)) throw fail('CPF inválido.');
    const tel = cadastro.digits(b.telefone);
    if (tel.length < 10 || tel.length > 11) throw fail('Informe o celular com DDD.');
    return { email: emailN, nome, cpf, telefone: tel, senha_hash: auth.hashPassword(senha) };
  }

  // Consumidor ou empresa: conta do site
  const existente = db.get('SELECT * FROM users WHERE email = ?', emailN);
  if (existente) {
    if (!existente.senha_hash || !auth.verifyPassword(senha, existente.senha_hash)) {
      throw fail('Este e-mail já tem conta no site. Para assinar, use a mesma senha da conta (ou entre e escolha o plano).', 409);
    }
    if (existente.tipo && existente.tipo !== p.perfil) {
      throw fail(`Sua conta é de ${existente.tipo === 'empresa' ? 'empresa' : 'consumidor'}. Para trocar de perfil, fale com o administrador.`, 409);
    }
    if (['banned', 'rejected'].includes(existente.status)) throw fail('Esta conta não pode assinar. Fale com o administrador.', 403);
    return { email: emailN, nome: existente.nome, renovar_user_id: existente.id };
  }
  if (renovar) throw fail('Não encontramos uma conta com este e-mail. Desmarque "renovar" para criar uma nova.', 404);
  if (b.senha_confirmacao !== undefined && b.senha_confirmacao !== senha) throw fail('As senhas não conferem.');
  const dados = { ...cadastro.dadosPessoa(b), ...(p.perfil === 'empresa' ? cadastro.dadosEmpresa(b) : {}) };
  if (isBlocked(`cpf:${dados.cpf}`) || (dados.cnpj && isBlocked(`cnpj:${dados.cnpj}`))) throw fail('Não é possível concluir com estes dados. Fale com o administrador.');
  if (db.get('SELECT 1 FROM users WHERE cpf = ?', dados.cpf)) throw fail('Já existe uma conta com este CPF. Entre com ela para assinar.', 409);
  if (dados.cnpj && db.get('SELECT 1 FROM users WHERE cnpj = ?', dados.cnpj)) throw fail('Já existe uma conta com este CNPJ.', 409);
  return { email: emailN, nome: dados.nome, ...dados, senha_hash: auth.hashPassword(senha) };
}

function baseUrl(req) {
  const site = String(settings.get('site_url') || '').replace(/\/+$/, '');
  return /^https?:\/\//i.test(site) ? site : `${req.protocol}://${req.get('host')}`;
}

async function mp(method, path, data, s, extraHeaders = {}) {
  const r = await axios({ method, url: `${MP}${path}`, data, timeout: 20000, validateStatus: () => true,
    headers: { Authorization: `Bearer ${s.mp_access_token}`, 'Content-Type': 'application/json', ...extraHeaders } });
  if (r.status >= 400) {
    const m = r.data?.message || r.data?.error || `HTTP ${r.status}`;
    throw fail(r.status === 401 ? 'Mercado Pago recusou o Access Token (confira no painel).' : `Mercado Pago: ${m}`, 502);
  }
  return r.data;
}

async function criarPedido(b, req) {
  const s = settings.getAll();
  const p = planos.plano(String(b.plano || ''), s);
  if (!p || !p.ativo || !(p.preco > 0)) throw fail('Plano indisponível.');
  const metodo = String(b.metodo || '');
  const disp = metodosDisponiveis(s, p.id);
  if (!disp.lista.some(m => m.id === metodo)) throw fail('Forma de pagamento indisponível no momento.');
  const dados = validarDados(p, b);

  const token = crypto.randomBytes(24).toString('hex');
  const ins = db.run(`INSERT INTO pagamentos (token, plano, valor, dias, metodo, email, nome, dados) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    token, p.id, p.preco, p.dias, metodo === 'pix' && !disp.pix_automatico ? 'pix_manual' : metodo, dados.email, dados.nome || null, JSON.stringify(dados));
  const id = Number(ins.lastInsertRowid);
  const base = baseUrl(req);
  const publico = /^https:\/\//i.test(base); // o Mercado Pago só avisa / volta para endereços https
  const descricao = `${p.nome} — ${p.dias} dias de acesso (Ofertas do GP)`;

  try {
    if (metodo === 'pix' && disp.pix_automatico) {
      const [primeiro, ...resto] = String(dados.nome || 'Cliente').split(' ');
      const expira = new Date(Date.now() + PIX_MINUTOS * 60000);
      const pay = await mp('post', '/v1/payments', {
        transaction_amount: p.preco, description: descricao, payment_method_id: 'pix', external_reference: token,
        date_of_expiration: expira.toISOString().replace('Z', '+00:00'),
        payer: { email: dados.email, first_name: primeiro, last_name: resto.join(' ') || primeiro,
          ...(dados.cpf ? { identification: { type: 'CPF', number: dados.cpf } } : {}) },
        ...(publico ? { notification_url: `${base}/api/pagamentos/webhook` } : {}),
      }, s, { 'X-Idempotency-Key': token });
      const td = pay.point_of_interaction?.transaction_data || {};
      db.run('UPDATE pagamentos SET mp_payment_id = ?, pix_qr = ?, pix_qr_base64 = ?, pix_expira = ? WHERE id = ?',
        String(pay.id), td.qr_code || null, td.qr_code_base64 || null, sqlDe(expira), id);
      return { token };
    }
    if (metodo === 'mercadopago') {
      const pref = await mp('post', '/checkout/preferences', {
        items: [{ id: p.id, title: descricao, quantity: 1, unit_price: p.preco, currency_id: 'BRL' }],
        payer: { email: dados.email, name: dados.nome || undefined },
        external_reference: token,
        back_urls: { success: `${base}/assinar?pedido=${token}`, failure: `${base}/assinar?pedido=${token}`, pending: `${base}/assinar?pedido=${token}` },
        ...(publico ? { auto_return: 'approved', notification_url: `${base}/api/pagamentos/webhook` } : {}),
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }], installments: Math.min(Math.max(parseInt(s.pag_mp_parcelas, 10) || 1, 1), 12) },
        statement_descriptor: 'OFERTASDOGP',
      }, s);
      db.run('UPDATE pagamentos SET mp_preference_id = ? WHERE id = ?', String(pref.id), id);
      return { token, checkout_url: pref.init_point };
    }
    return { token }; // Pix pela chave, transferência ou link: a página mostra como pagar
  } catch (err) {
    db.run(`UPDATE pagamentos SET status = 'cancelado', observacao = ? WHERE id = ?`, err.message.slice(0, 300), id);
    throw err;
  }
}

// ── Confirmação ──────────────────────────────────────────────────────────────
const MP_STATUS = { approved: 'aprovado', rejected: 'recusado', cancelled: 'cancelado', refunded: 'cancelado', charged_back: 'cancelado' };

// Consulta o Mercado Pago e atualiza o pedido (aprovando a conta se o pagamento foi aprovado).
async function verificar(pedido) {
  if (pedido.status !== 'pendente') return pedido;
  const s = settings.getAll();
  if (['pix', 'mercadopago'].includes(pedido.metodo) && s.mp_access_token) {
    let pay = null;
    if (pedido.mp_payment_id) pay = await mp('get', `/v1/payments/${pedido.mp_payment_id}`, null, s).catch(() => null);
    else {
      const r = await mp('get', `/v1/payments/search?external_reference=${pedido.token}&sort=date_created&criteria=desc`, null, s).catch(() => null);
      pay = r?.results?.find(x => x.status === 'approved') || r?.results?.[0] || null;
    }
    // Só vale o pagamento deste pedido, com o valor certo.
    if (pay && pay.external_reference === pedido.token && Math.abs(Number(pay.transaction_amount) - pedido.valor) < 0.01) {
      if (pay.status === 'approved') { if (!pedido.mp_payment_id) db.run('UPDATE pagamentos SET mp_payment_id = ? WHERE id = ?', String(pay.id), pedido.id); return aprovar(pedido.id, 'Mercado Pago'); }
      if (MP_STATUS[pay.status]) db.run('UPDATE pagamentos SET status = ? WHERE id = ? AND status = ?', MP_STATUS[pay.status], pedido.id, 'pendente');
    }
  }
  if (pedido.pix_expira && pedido.pix_expira < nowSql() && pedido.metodo === 'pix') {
    db.run(`UPDATE pagamentos SET status = 'expirado' WHERE id = ? AND status = 'pendente'`, pedido.id);
  }
  return db.get('SELECT * FROM pagamentos WHERE id = ?', pedido.id);
}

const somaDias = (ate, dias) => sqlDe(new Date(Math.max(Date.now(), new Date(String(ate || '').replace(' ', 'T') + 'Z').getTime() || 0) + dias * 86400000));

// Cria ou renova a conta do pedido (uma única vez) e manda o e-mail de confirmação.
function aprovar(pedidoId, origem) {
  let pedido;
  db.transaction(() => {
    pedido = db.get('SELECT * FROM pagamentos WHERE id = ?', pedidoId);
    if (!pedido || pedido.status === 'aprovado') return;
    const p = planos.plano(pedido.plano);
    const d = JSON.parse(pedido.dados);
    let contaTipo, contaId, validade;
    if (p.conta === 'cliente') {
      contaTipo = 'cliente';
      if (d.renovar_cliente_id && clientes.getById(d.renovar_cliente_id)) {
        contaId = d.renovar_cliente_id;
        validade = somaDias(clientes.getById(contaId).validade, pedido.dias);
        db.run(`UPDATE clientes SET validade = ?, status = 'ativo' WHERE id = ?`, validade, contaId);
      } else {
        validade = somaDias(null, pedido.dias);
        const ex = db.get('SELECT id FROM clientes WHERE email = ?', d.email);
        if (ex) { contaId = ex.id; db.run(`UPDATE clientes SET validade = ?, status = 'ativo' WHERE id = ?`, validade, contaId); }
        else {
          contaId = Number(db.run('INSERT INTO clientes (nome, email, senha_hash, validade, observacoes) VALUES (?, ?, ?, ?, ?)',
            d.nome, d.email, d.senha_hash, validade, `Assinatura online (${p.nome}) — CPF ${d.cpf}, tel ${d.telefone}`).lastInsertRowid);
        }
      }
    } else {
      contaTipo = 'usuario';
      if (d.renovar_user_id && users.getById(d.renovar_user_id)) {
        contaId = d.renovar_user_id;
        const u = users.getById(contaId);
        validade = somaDias(u.assinatura_ate, pedido.dias);
        db.run(`UPDATE users SET plano = ?, assinatura_ate = ?, tipo = COALESCE(tipo, ?),
                status = CASE WHEN status IN ('pending', 'onboarding') THEN 'active' ELSE status END WHERE id = ?`, p.id, validade, p.perfil, contaId);
      } else {
        validade = somaDias(null, pedido.dias);
        const { email: em, nome, senha_hash, ...resto } = d;
        const cols = { email: em, nome, senha_hash, tipo: p.perfil, status: 'active', plano: p.id, assinatura_ate: validade, aceite_termos_em: nowSql(), ...resto };
        delete cols.renovar_user_id;
        contaId = Number(db.run(`INSERT INTO users (${Object.keys(cols).join(', ')}) VALUES (${Object.keys(cols).map(() => '?').join(', ')})`,
          ...Object.values(cols)).lastInsertRowid);
      }
      users.logAction(users.getById(contaId), 'assinatura_aprovada', `${p.nome} até ${validade.slice(0, 10)} (${origem})`);
    }
    // Não guarda a senha (hash) além do necessário.
    const semSenha = { ...d }; delete semSenha.senha_hash;
    db.run(`UPDATE pagamentos SET status = 'aprovado', aprovado_em = datetime('now'), conta_tipo = ?, conta_id = ?, validade_ate = ?, dados = ?, observacao = ? WHERE id = ?`,
      contaTipo, contaId, validade, JSON.stringify(semSenha), `aprovado por: ${origem}`, pedido.id);
  });
  const atualizado = db.get('SELECT * FROM pagamentos WHERE id = ?', pedidoId);
  if (atualizado?.status === 'aprovado' && !atualizado.email_enviado) enviarConfirmacao(atualizado).catch(err => console.error('[PAGAMENTO] e-mail:', err.message));
  return atualizado;
}

const fmtDia = sql => new Date(String(sql).replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

async function enviarConfirmacao(pedido) {
  if (!email.configurado()) return false;
  const p = planos.plano(pedido.plano);
  const site = String(settings.get('site_url') || '').replace(/\/+$/, '') || 'o site Ofertas do GP';
  const onde = p.conta === 'cliente' ? `${site}/cliente` : `${site}/conta`;
  const validade = fmtDia(pedido.validade_ate);
  const texto = [
    `Olá${pedido.nome ? `, ${pedido.nome.split(' ')[0]}` : ''}!`, '',
    `Seu pagamento foi confirmado e o plano ${p.nome} está ativo.`, '',
    `Valor: R$ ${pedido.valor.toFixed(2).replace('.', ',')}`,
    `Válido até: ${validade}`,
    `Acesso: ${onde} (entre com o e-mail ${pedido.email} e a senha que você cadastrou)`, '',
    'Para renovar, é só assinar o mesmo plano de novo com o mesmo e-mail e senha: os dias são somados.', '',
    'Obrigado!', 'Ofertas do GP',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#161b18;line-height:1.55">
    <h2 style="color:#0c8f4f;margin:0 0 12px">Pagamento confirmado! 🎉</h2>
    <p>Olá${pedido.nome ? `, ${escHtml(pedido.nome.split(' ')[0])}` : ''}! Seu plano <b>${escHtml(p.nome)}</b> está ativo.</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#48514c">Valor</td><td><b>R$ ${pedido.valor.toFixed(2).replace('.', ',')}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#48514c">Válido até</td><td><b>${validade}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#48514c">Acesso</td><td><a href="${escHtml(onde)}">${escHtml(onde)}</a></td></tr>
    </table>
    <p style="color:#48514c">Entre com o e-mail <b>${escHtml(pedido.email)}</b> e a senha que você cadastrou. Para renovar, assine o mesmo plano com o mesmo e-mail e senha: os dias são somados.</p>
    <p>Obrigado!<br>Ofertas do GP</p></div>`;
  await email.enviar({ para: pedido.email, assunto: `Pagamento confirmado — ${p.nome} válido até ${validade}`, texto, html });
  db.run('UPDATE pagamentos SET email_enviado = 1 WHERE id = ?', pedido.id);
  return true;
}
const escHtml = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Entrega o login (cookie de sessão) uma única vez, ao navegador que fez o pedido (tem o token).
function entregarLogin(pedido, req, res) {
  if (pedido.status !== 'aprovado' || pedido.login_entregue) return null;
  db.run('UPDATE pagamentos SET login_entregue = 1 WHERE id = ?', pedido.id);
  if (pedido.conta_tipo === 'cliente') {
    const c = clientes.getById(pedido.conta_id);
    if (c) clientes.criarSessao(req, res, c);
    return '/';
  }
  users.createSession(req, res, pedido.conta_id);
  return '/';
}

// Como pagar nas formas confirmadas pelo admin (dados que o próprio admin cadastrou para receber).
const MANUAIS = ['pix_manual', 'transferencia', 'link'];
const TIPO_CHAVE = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Chave aleatória' };
function instrucoesManuais(pedido, s) {
  const base = { tipo: pedido.metodo, whatsapp: s.pag_whatsapp || s.whatsapp_anuncios || '', recado: s.pag_instrucoes || '' };
  if (pedido.metodo === 'pix_manual') {
    return { ...base, chave: s.pix_chave, chave_tipo: TIPO_CHAVE[s.pix_tipo] || '', nome: s.pix_nome, banco: s.pix_banco };
  }
  if (pedido.metodo === 'transferencia') {
    return { ...base, banco: s.ted_banco, agencia: s.ted_agencia, conta: s.ted_conta,
      tipo_conta: s.ted_tipo_conta === 'poupanca' ? 'Poupança' : 'Corrente', titular: s.ted_titular, documento: s.ted_documento };
  }
  return { ...base, nome: s.pag_link_nome, url: String(s[`pag_link_${pedido.plano}`] || '').trim() };
}

// Situação do pedido para a página de pagamento (sem dados pessoais).
function publico(pedido) {
  const p = planos.plano(pedido.plano);
  const s = settings.getAll();
  return {
    status: pedido.status, plano: p.nome, valor: pedido.valor, dias: pedido.dias, metodo: pedido.metodo, email: pedido.email,
    validade_ate: pedido.validade_ate,
    pix: pedido.metodo === 'pix' ? { copia_cola: pedido.pix_qr, qr_base64: pedido.pix_qr_base64, expira: pedido.pix_expira } : null,
    manual: MANUAIS.includes(pedido.metodo) ? instrucoesManuais(pedido, s) : null,
    email_configurado: email.configurado(s),
  };
}

const porToken = token => db.get('SELECT * FROM pagamentos WHERE token = ?', String(token || ''));

// Aviso do Mercado Pago (webhook): só usamos o id para consultar o pagamento na API.
async function webhook(body, query) {
  const id = body?.data?.id || query['data.id'] || (query.topic === 'payment' ? query.id : null);
  if (!id || !/^\d+$/.test(String(id))) return;
  const s = settings.getAll();
  if (!s.mp_access_token) return;
  const pay = await mp('get', `/v1/payments/${id}`, null, s).catch(() => null);
  const pedido = pay?.external_reference && porToken(pay.external_reference);
  if (pedido) {
    if (!pedido.mp_payment_id) db.run('UPDATE pagamentos SET mp_payment_id = ? WHERE id = ?', String(pay.id), pedido.id);
    await verificar(db.get('SELECT * FROM pagamentos WHERE id = ?', pedido.id));
  }
}

// ── Painel do admin ──────────────────────────────────────────────────────────
function listar(limit = 200) {
  return db.all(`SELECT id, plano, valor, dias, metodo, status, email, nome, mp_payment_id, conta_tipo, conta_id, validade_ate,
                 email_enviado, observacao, created_at, aprovado_em FROM pagamentos ORDER BY id DESC LIMIT ?`, limit);
}

function confirmarManual(id) {
  const p = db.get('SELECT * FROM pagamentos WHERE id = ?', id);
  if (!p) throw fail('Pedido não encontrado.', 404);
  if (p.status === 'aprovado') throw fail('Este pedido já foi aprovado.');
  if (!['pendente', 'expirado'].includes(p.status)) throw fail('Só dá para confirmar pedidos pendentes.');
  db.run(`UPDATE pagamentos SET status = 'pendente' WHERE id = ?`, id);
  return aprovar(id, 'confirmação manual do admin');
}

function cancelar(id) {
  db.run(`UPDATE pagamentos SET status = 'cancelado', observacao = 'cancelado pelo admin' WHERE id = ? AND status IN ('pendente', 'expirado')`, id);
}

async function reenviarEmail(id) {
  const p = db.get('SELECT * FROM pagamentos WHERE id = ?', id);
  if (!p || p.status !== 'aprovado') throw fail('Só pedidos aprovados recebem o e-mail.');
  if (!email.configurado()) throw fail('Configure o e-mail (SMTP) no painel primeiro.');
  db.run('UPDATE pagamentos SET email_enviado = 0 WHERE id = ?', id);
  await enviarConfirmacao(p);
}

// Assinatura vencida de uma conta do site (consumidor/empresa que comprou plano).
const assinaturaVencida = u => Boolean(u && u.assinatura_ate && u.assinatura_ate < nowSql());

module.exports = {
  metodosDisponiveis, criarPedido, verificar, aprovar, entregarLogin, publico, porToken, webhook,
  listar, confirmarManual, cancelar, reenviarEmail, assinaturaVencida, enviarConfirmacao,
};
