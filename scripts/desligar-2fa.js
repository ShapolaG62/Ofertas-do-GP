// Emergência: desliga o login em duas etapas do administrador (celular e códigos de recuperação perdidos).
// Rode na pasta do site, no próprio servidor:  node scripts/desligar-2fa.js
// Não mexe na senha; quem tem acesso ao servidor já tem acesso ao banco.
try { require('../src/env'); } catch { /* sem .env */ }
const dois = require('../src/admin2fa');
if (!dois.ativo()) {
  console.log('O login em duas etapas já está desligado.');
} else {
  dois.desligar();
  console.log('Login em duas etapas desligado. Agora o painel pede só a senha; ative de novo em Painel → Conta e senha.');
}
