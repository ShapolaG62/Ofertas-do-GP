// Padrão de senha forte para todas as senhas criadas no site (contas, equipe, clientes da ferramenta e painel).
// A LGPD (art. 46) pede medidas de segurança adequadas para proteger os dados pessoais; seguimos as boas práticas
// usuais (NIST/OWASP): tamanho mínimo, mistura de tipos de caractere e bloqueio de senhas óbvias ou vazadas.
// Vale para senhas novas: quem já tem senha continua entrando normalmente.
const MIN = 8, MAX = 200;
const COMUNS = new Set(['12345678', '123456789', '1234567890', 'password', 'password1', 'senha123', 'senha1234', 'qwerty123', 'abc12345',
  'abcd1234', 'iloveyou', '11111111', '00000000', '12341234', 'admin123', 'ofertou1', 'ofertou123', 'brasil123', 'mudar123', 'teste123',
  'qwertyui', '87654321', 'senhasenha', 'Senha@123', 'Senha123!', 'Admin@123', 'Brasil@123', 'Mudar@123', 'Teste@123', 'Abc@1234', 'P@ssw0rd', 'Password1!']
  .map(s => s.toLowerCase()));

const REGRAS = [
  { id: 'tamanho', texto: `Pelo menos ${MIN} caracteres`, ok: s => s.length >= MIN },
  { id: 'maiuscula', texto: 'Uma letra maiúscula', ok: s => /[A-ZÀ-Ý]/.test(s) },
  { id: 'minuscula', texto: 'Uma letra minúscula', ok: s => /[a-zà-ÿ]/.test(s) },
  { id: 'numero', texto: 'Um número', ok: s => /\d/.test(s) },
  { id: 'simbolo', texto: 'Um símbolo (ex.: ! @ # $ %)', ok: s => /[^A-Za-zÀ-ÿ0-9\s]/.test(s) },
];

const fail = msg => Object.assign(new Error(msg), { status: 400 });
const sem = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Lança erro explicando o que falta; email/nome servem para impedir senha com o próprio e-mail ou nome
function validar(senha, { email = '', nome = '' } = {}) {
  senha = String(senha ?? '');
  if (senha.length > MAX) throw fail(`A senha pode ter no máximo ${MAX} caracteres.`);
  const faltam = REGRAS.filter(r => !r.ok(senha)).map(r => r.texto.toLowerCase());
  if (faltam.length) throw fail(`Senha fraca. Ela precisa ter: ${faltam.join(', ')}.`);
  if (COMUNS.has(senha.toLowerCase())) throw fail('Essa senha é muito comum e fácil de adivinhar. Escolha outra.');
  if (/(.)\1{3,}/.test(senha)) throw fail('A senha não pode repetir o mesmo caractere 4 vezes seguidas.');
  const s = sem(senha);
  const usuario = sem(String(email).split('@')[0]);
  if (usuario.length >= 4 && s.includes(usuario)) throw fail('A senha não pode conter o seu e-mail.');
  for (const parte of sem(nome).split(/\s+/).filter(p => p.length >= 4)) {
    if (s.includes(parte)) throw fail('A senha não pode conter o seu nome.');
  }
  return senha;
}

module.exports = { validar, REGRAS: REGRAS.map(({ id, texto }) => ({ id, texto })), MIN, MAX };
