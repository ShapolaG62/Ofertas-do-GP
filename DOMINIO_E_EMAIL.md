# Domínio tanoofertou.com.br e e-mail tanoofertou@gmail.com

## Já configurado
- **E-mail do site:** envio pelo Gmail (smtp.gmail.com, porta 587, usuário tanoofertou@gmail.com, remetente "Ofertou! <tanoofertou@gmail.com>"). É usado em:
  - confirmação de assinatura;
  - avisos de mensagens, pedidos e saques;
  - respostas do Suporte.
- **E-mail de contato e privacidade (LGPD):** tanoofertou@gmail.com. Aparece nos Termos e na Política de Privacidade.
- **App (Android e iPhone):** abre https://tanoofertou.com.br (`mobile/capacitor.config.json`, já copiado para os projetos Android e iOS com `npx cap copy`).
- **Servidor (VPS):** o `PASSO_A_PASSO_VPS.md` já traz o domínio no nginx e no certificado https.

## Falta (só você pode fazer)

### 1. Senha de app do Gmail (para o site conseguir enviar e-mails)
1. Entre na conta tanoofertou@gmail.com e ative a **Verificação em duas etapas** (Conta Google → Segurança).
2. Abra **https://myaccount.google.com/apppasswords**, crie uma senha de app com o nome "Ofertou" e copie os 16 caracteres.
3. No painel do Ofertou!, abra **Planos e pagamentos → E-mail de confirmação**, cole no campo **Senha** e salve.
4. Clique em **Enviar teste** para conferir.

### 2. Registrar o domínio
Hoje tanoofertou.com.br **não existe** na internet.
1. Registre em **https://registro.br** (cerca de R$ 40 por ano).
2. No registro.br, em **DNS**, crie:
   - registro **A**: `tanoofertou.com.br` → IP da VPS;
   - registro **A** (ou CNAME): `www` → IP da VPS (ou `tanoofertou.com.br`).

### 3. Colocar o site no ar na VPS
Siga o `PASSO_A_PASSO_VPS.md` até o https funcionar em https://tanoofertou.com.br.

### 4. Ligar o domínio no painel (só depois do passo 3 funcionar)
- **Painel → Usuários → Login com Google:** no campo **Endereço público do site**, coloque `https://tanoofertou.com.br` e salve. Com isso passam a funcionar:
  - os links curtos `tanoofertou.com.br/o/123`, com a prévia no WhatsApp;
  - o aviso automático do Mercado Pago (webhook);
  - os links dos e-mails;
  - as fotos públicas das postagens.
- **Login com Google:** no Google Cloud (Credenciais → seu cliente OAuth), adicione em *URIs de redirecionamento autorizados* `https://tanoofertou.com.br/auth/google/callback`. Em *Origens JavaScript*, adicione `https://tanoofertou.com.br`.
- **RevenueCat (app):** o webhook é `https://tanoofertou.com.br/api/app/webhook/revenuecat`.
- **Google AdSense:** cadastre o site `tanoofertou.com.br`. O arquivo `/ads.txt` já é servido pelo site.
- **Lojas de apps:** use `https://tanoofertou.com.br/privacidade` como link da Política de Privacidade.

> **Importante:** não preencha o "Endereço público do site" antes de o domínio abrir de verdade. Se fizer isso, o login com Google e os links das postagens vão apontar para um endereço que ainda não funciona.
