# Guia do app Ofertou! (Google Play e App Store)

O app fica na pasta `mobile/` e é feito com **Capacitor**: um único projeto gera o app Android e o de iPhone.
Ele abre o site (o seu domínio) e acrescenta o que é nativo: ícone e tela de abertura com a Capi, tela "Sem conexão" e a **compra dos planos pela Google Play / App Store**.

Tudo o que você muda no site aparece no app na hora, sem publicar versão nova. Só é preciso gerar uma versão nova do app quando mudar algo nativo (ícone, nome, plugins).

---

## O que muda dentro do app

| No site | No app |
|---|---|
| Planos pagos com Pix / Mercado Pago | Planos pagos pela **Google Play** ou **App Store** (regra das lojas). Nas vendas pelo app as lojas ficam com 15% a 30%. |
| Preço configurado no painel | Preço cadastrado em cada loja (aparece sozinho nos cartões) |
| Entrar com Google | Escondido no app: o Google bloqueia login dentro de app desse tipo, e a Apple exigiria "Entrar com Apple" junto |
| Convites "Quero anunciar" | Escondidos no app (venda por fora das lojas não é permitida dentro do app) |

A assinatura comprada no app vale também no site, e vice-versa: o plano fica na **conta** da pessoa.

---

## 1. O que você precisa ter

1. **Site no ar com domínio e https**, com banco de dados permanente: siga o `PASSO_A_PASSO_VPS.md` (ex.: `https://ofertou.com.br`). A Vercel não serve, porque apaga os dados.
2. **Google Play Console**: conta de desenvolvedor, taxa única de US$ 25 — https://play.google.com/console
3. **Apple Developer Program**: US$ 99 por ano — https://developer.apple.com/programs/ (pessoa física ou, melhor, empresa com CNPJ e número D-U-N-S).
4. **RevenueCat** (grátis até US$ 2.500/mês de receita): https://app.revenuecat.com — confere as compras das duas lojas e avisa o site.
5. **Para gerar o app de iPhone**: um Mac com Xcode **ou** o Codemagic (https://codemagic.io — compila na nuvem, tem minutos grátis por mês).
6. **Para gerar o app Android**: o Android Studio (https://developer.android.com/studio), no seu Windows mesmo.

---

## 2. Apontar o app para o seu domínio

Abra `mobile/capacitor.config.json` e troque o endereço em `"url"` pelo do seu site (está `https://ofertou.com.br`).
Troque também em `mobile/www/erro.html` (botão "Tentar de novo"). Depois, no terminal, dentro da pasta `mobile`:

```bash
npm install
npx cap sync
```

O identificador do app é `br.com.ofertou.app`. Se quiser outro, troque em `capacitor.config.json` **antes** de publicar a primeira vez (depois não dá para mudar).

---

## 3. Criar as assinaturas nas lojas

Crie **3 assinaturas mensais** com estes IDs (os mesmos nas duas lojas):

| Plano | ID do produto |
|---|---|
| Caçador de Ofertas | `ofertou_consumidor_mensal` |
| Loja Parceira | `ofertou_empresa_mensal` |
| Afiliado Pro | `ofertou_pro_mensal` |

- **Google Play Console** → seu app → Monetizar → Produtos → **Assinaturas** → Criar assinatura → crie um **plano base** mensal com renovação automática e o preço.
- **App Store Connect** → seu app → Monetização → **Assinaturas** → crie um **grupo** (ex.: "Planos Ofertou!") e as 3 assinaturas de 1 mês, com preço, nome e descrição.

Se usar outros IDs (ou criar planos novos no painel), informe o ID em **Painel → Planos → Planos à venda → Editar → ID do produto no app**.

---

## 4. Configurar o RevenueCat

1. Crie um projeto "Ofertou!" e adicione dois apps: **Google Play** (pacote `br.com.ofertou.app`) e **App Store** (bundle `br.com.ofertou.app`).
2. Conecte as lojas seguindo as instruções da própria tela do RevenueCat: na Google Play, uma *service account* com acesso ao Play Console; na Apple, a *In-App Purchase Key* do App Store Connect.
3. **Products**: importe os 3 produtos de cada loja.
4. **Entitlements**: crie um para cada plano, com o **código do plano** mostrado no cartão do painel (os prontos são `consumidor`, `empresa` e `pro`), e ligue cada um ao produto correspondente das duas lojas.
5. **Offerings**: na offering `default`, crie 3 pacotes, cada um com o produto de um plano.
6. **API keys**: copie a chave pública do Android (`goog_…`), a do iPhone (`appl_…`) e crie uma **Secret API key** (`sk_…`).
7. **Integrations → Webhooks**: endereço `https://SEU-DOMINIO/api/app/webhook/revenuecat`. Em *Authorization header value*, invente um texto longo e aleatório (vai também no painel do site).

---

## 5. Configurar o site

**Painel → Planos → App (Google Play e App Store)**:

- cole as chaves `goog_…`, `appl_…` e a `sk_…`;
- cole o mesmo texto da autorização do webhook;
- confira o ID do produto de cada plano em **Planos à venda → Editar**;
- em **Vender planos no app**, escolha **Ligado** e salve.

As vendas feitas pelo app aparecem em **Pedidos de assinatura** como "Google Play (app)" ou "App Store (app)".

---

## 6. Gerar e publicar o app Android

1. Dentro de `mobile/`, rode `npm run android` (abre o Android Studio).
2. **Build → Generate Signed App Bundle** → crie uma *keystore*. **Guarde a keystore e as senhas num lugar seguro**: sem elas você não consegue publicar atualizações.
3. No Play Console, crie o app, preencha a ficha da loja, a classificação de conteúdo, a "Segurança dos dados" e a política de privacidade (`https://SEU-DOMINIO/privacidade`), e envie o arquivo `.aab`.
4. **Atenção:** contas pessoais novas no Google Play precisam de um **teste fechado com pelo menos 12 testadores por 14 dias** antes de liberar para todos. Comece por aí.

---

## 7. Gerar e publicar o app de iPhone

- **Com Mac:** dentro de `mobile/`, rode `npm run ios` (abre o Xcode) → em *Signing & Capabilities* escolha o seu time e adicione **In-App Purchase** → *Product → Archive* → *Distribute App*.
- **Sem Mac:** crie uma conta no Codemagic, conecte o repositório do GitHub, escolha o projeto `mobile/ios/App`, ligue a assinatura automática com a sua conta Apple e gere o build. Ele envia direto para o App Store Connect.
- No App Store Connect: ficha da loja, prints, privacidade, e **anexe as 3 assinaturas à versão** antes de enviar para revisão.

---

## 8. Revisão das lojas: dicas para não ser recusado

- Informe uma **conta de teste** (e-mail e senha) já aprovada nas notas para o revisor.
- A **exclusão de conta** já existe em *Minha conta → Senha e conta → Excluir conta* (a Apple exige).
- A tela de assinatura do app já mostra preço, período, renovação automática, como cancelar, termos e política de privacidade (a Apple exige).
- Teste as compras antes com os **testadores de licença** (Google) e o **Sandbox** (Apple). Compras de teste não entram no registro de vendas do painel.
