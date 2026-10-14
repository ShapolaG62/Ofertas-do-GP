# Ofertas do GP — Guia de uso

Tudo é configurado pelo **painel administrativo**: http://localhost:3000/admin (ou `http://SEU_IP:3000/admin` na VPS). Não é preciso editar código.

## 1. Primeiro acesso

1. Rode `npm start` (ou `start.bat` no Windows).
2. Abra http://localhost:3000/admin **no mesmo computador**.
3. Crie a senha do painel (mínimo 8 caracteres).

Por segurança, a senha só pode ser criada a partir do próprio computador do servidor. Na VPS, defina a variável `ADMIN_PASSWORD` (o script `start-vps.sh` pergunta).

## 2. Abas do painel

| Aba | Para que serve |
|---|---|
| **Painel** | Situação de cada loja (funcionando, bloqueada, falta configurar), botão **Minerar agora** e busca pontual por um termo. |
| **Ofertas** | Lista de ofertas no ar, expiradas e ocultas. Permite ocultar, excluir e **adicionar oferta manual**. |
| **Afiliados** | Tags e credenciais de cada programa de afiliados. Ao salvar, os links de todas as ofertas são atualizados. |
| **Mineração** | Lojas ativas, termos de busca, intervalo, desconto mínimo e validade das ofertas. |
| **Site** | Link do grupo do WhatsApp, Telegram, Instagram, Google AdSense e Analytics. |
| **Conta** | Trocar a senha. |

## 3. Programas de afiliados

- **Amazon:** cadastre-se em https://associados.amazon.com.br e cole sua tag (ex.: `seunome-20`).
- **Mercado Livre:** programa em https://www.mercadolivre.com.br/afiliados. Gere um link no programa, confira os valores de `matt_word` e `matt_tool` nele e preencha no painel. Teste um link antes de divulgar.
  - Para a mineração funcionar de forma estável, crie um aplicativo em https://developers.mercadolivre.com.br/devcenter e informe o App ID e a Chave secreta.
- **Shopee:** em https://affiliate.shopee.com.br solicite acesso à **Open API** e informe App ID e senha da API. Sem isso a Shopee não é minerada.
- **AliExpress:** em https://portals.aliexpress.com crie um app na Open Platform e informe App Key, App Secret e Tracking ID. Sem isso o AliExpress continua sendo minerado, mas os links ficam sem comissão.
- **Magalu:** informe o nome da sua loja Magazine Você. Links da Magalu cadastrados manualmente são convertidos automaticamente.
- **Shein e Temu:** gere o link de afiliado no programa da loja e cole no campo "Seu link de afiliado" ao cadastrar a oferta.

## 4. Cadastro manual de ofertas (Magalu, Shein, Temu ou qualquer loja)

Na aba **Ofertas**, preencha com os dados **exatamente como aparecem na página do produto**:
link do produto, título, preço atual, preço anterior riscado, imagem (opcional), link de afiliado (opcional) e validade em dias.
A oferta sai do ar sozinha quando a validade termina.

## 5. Postagens para os grupos

Com o painel logado, abra o site: aparecem os botões de seleção nos cards e **📢 Enviar p/ Grupo**, que gera o texto pronto para WhatsApp/Telegram com o link de afiliado e a data em que o preço foi conferido.

## 6. Mineração pelo terminal

```bash
npm run mine                 # todos os termos configurados
npm run mine -- "air fryer"  # só um termo
```

## 7. Usuários do site (consumidores e empresas)

Qualquer pessoa pode criar conta em **/conta** como:

- **Consumidor**: acessa as ofertas com desconto.
- **Empresa**: além das ofertas, cria uma **loja dentro do site** (página própria em `/loja/nome-da-loja`) e publica produtos com desconto de duas formas:
  - **Cadastro manual**: nome, link, preço anterior, preço com desconto, imagem e por quantos dias fica no ar (até 30).
  - **Importação automática pelo link da loja**: funciona com lojas Shopify, WooCommerce e feed XML do Google Shopping (Nuvemshop, Tray, Loja Integrada, VTEX etc.). Só entram produtos em que a própria loja informa preço normal e promocional, em reais. Atualiza a cada 2 horas; produto que some da loja sai do ar em 3 dias.

Essas contas **não** acessam o painel /admin.

### Liberar cadastros (aba Usuários do painel)

Para consumidores e empresas, separadamente, escolha:
- **Aberto**: a conta funciona na hora.
- **Com aprovação** (padrão): você aprova ou recusa cada cadastro. A aba mostra um contador vermelho com os pendentes.
- **Fechado**: ninguém consegue se cadastrar.

### Gerenciar usuários e lojas

Em **Usuários → Gerenciar** você pode:
- **Aprovar / recusar** cadastros;
- **Suspender** por X dias (punição temporária; a conta volta sozinha ao fim do prazo);
- **Banir** (permanente) e **Reativar**;
- **Impedir de publicar** (a empresa continua entrando, mas não publica nem importa produtos);
- **Ocultar a loja** do site;
- **Ocultar ou excluir** publicações uma a uma, ou **excluir todas**;
- **Excluir o perfil** (apaga conta, loja e produtos), com opção de **bloquear o e-mail** para não voltar.

Suspensão, banimento e loja oculta tiram os produtos do site na hora. O motivo informado aparece para o usuário quando ele tenta entrar. Todas as ações ficam no **Histórico de moderação**.

### Dados pedidos no cadastro

- **Todos:** nome completo, CPF, data de nascimento (mínimo 18 anos), celular/WhatsApp, endereço completo (o CEP preenche rua, bairro, cidade e estado sozinho), e-mail, senha e aceite dos [Termos e Privacidade](/privacidade).
- **Empresas, além disso:** razão social, nome fantasia, CNPJ, inscrição estadual (opcional), telefone da empresa, ramo de atividade, site (opcional) e endereço da empresa (ou "mesmo endereço").
- CPF e CNPJ são validados e só podem ter **uma conta cada**. Ao excluir um perfil com bloqueio, o e-mail, o CPF e o CNPJ ficam bloqueados.
- O usuário edita os próprios dados em **Minha conta → Meus dados** (exceto e-mail, CPF e CNPJ). No painel, **Usuários → Gerenciar** mostra a ficha completa; a busca aceita nome, e-mail, CPF, CNPJ ou loja.

## 8. Login, primeiro acesso e anúncios

**Tela de login (`/conta`)**: abas "Entrar" e "Criar conta". Dá para usar **e-mail e senha** ou o botão **Entrar com Google**. Criar conta pede só e-mail e senha; os dados vêm no passo seguinte.

**Primeiro acesso** (vale para e-mail e Google):
1. A pessoa escolhe o perfil: **Consumidor** ou **Empresarial**.
2. Preenche os dados (pessoais e, se for empresa, da empresa) e aceita os termos.
3. Conforme a regra da aba Usuários do painel, a conta é liberada na hora ou fica **aguardando aprovação**. Enquanto isso a pessoa entra, mas só vê a tela de espera.

**Ativar o login com Google**: painel → Usuários → "Login com Google". Siga o passo a passo da tela (Google Cloud → Credenciais → ID do cliente OAuth → Aplicativo da Web), cole o endereço de retorno mostrado no painel e salve o ID e a chave secreta. Sem isso o botão do Google fica escondido.

**Criador de anúncios** (Minha conta → Anúncios → Criar anúncio): fotos (envio de arquivo ou link, até 6, a primeira é a capa), título, categoria, condição, marca, modelo, descrição, preço normal e promocional (o desconto é calculado), parcelamento, cupom, frete e valor, prazo de entrega, estoque, garantia, SKU, código de barras, link de compra, WhatsApp e por quantos dias o anúncio fica no ar. Há uma prévia ao vivo do card. Cada anúncio ganha a página `/anuncio/<número>` com galeria, descrição, ficha técnica e os botões "Comprar na loja" e "Tirar dúvida no WhatsApp". Anúncios vencidos podem ser editados e renovados.

### Login obrigatório

Por padrão, **a primeira página do site é o login**: quem não está logado é levado para `/conta`, e só contas liberadas (e o administrador) veem as ofertas. Para abrir o site ao público, mude em **Painel → Usuários → "Quem pode ver as ofertas"**. A tela de login sempre mostra o botão **Entrar com Google**; enquanto ele não for configurado no painel, o botão avisa que ainda não está ativo.
