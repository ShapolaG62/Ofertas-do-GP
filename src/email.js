// Envio de e-mails (confirmação de assinatura) por SMTP — configurado em Painel → Planos e pagamentos.
// Ex.: Gmail → smtp.gmail.com, porta 587, usuário = seu e-mail, senha = "senha de app" do Google.
const nodemailer = require('nodemailer');
const settings = require('./settings');

function configurado(s = settings.getAll()) {
  return Boolean(s.smtp_host && s.smtp_user && s.smtp_pass);
}

async function enviar({ para, assunto, texto, html }) {
  const s = settings.getAll();
  if (!configurado(s)) throw new Error('E-mail (SMTP) não configurado no painel.');
  const porta = Number(s.smtp_port) || 587;
  const transporte = nodemailer.createTransport({
    host: s.smtp_host,
    port: porta,
    secure: porta === 465,
    auth: { user: s.smtp_user, pass: s.smtp_pass },
    connectionTimeout: 15000,
  });
  await transporte.sendMail({ from: s.smtp_from || s.smtp_user, to: para, subject: assunto, text: texto, html });
}

module.exports = { configurado, enviar };
