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
| **Publicidade** | Banners de empresas anunciantes (campanhas com período, visualizações e cliques) e pedidos de quem quer anunciar. |
| **Site** | Link do grupo do WhatsApp, WhatsApp para anunciantes, Telegram, Instagram, Google AdSense e Analytics. |
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
npm run mine                 # próximo lote de termos (rodízio)
npm run mine -- "air fryer"  # só um termo
```

### Termos e categorias

A lista padrão tem mais de 300 termos (os mais buscados nos marketplaces), organizados nas categorias do site:

Informática · Celulares, tablets e relógios · Games · TV, áudio e casa inteligente · Eletrodomésticos · Cozinha e eletroportáteis · Casa, móveis e decoração · Ferramentas e construção · Beleza e cuidados pessoais · Saúde e bem-estar · Esporte e fitness · Moda e acessórios · Bebês e brinquedos · Automotivo · Pet shop

- Cada rodada busca **60 termos** (Painel → Mineração → "Termos por rodada") e a próxima continua de onde a anterior parou. Com mineração a cada 120 minutos, a lista inteira é percorrida a cada ~12 horas, dentro da validade de 24 horas das ofertas.
- A categoria de cada produto é decidida pelo **título** da oferta (ex.: "Cadeira Gamer" → Games, "Processador de Alimentos" → Cozinha, "Shampoo para cães" → Pet shop). O "| categoria" do termo só é usado quando o título não deixa claro.
- Para editar a lista: Painel → Mineração → Termos de busca (um por linha, `termo | categoria`).

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

### Entrar como administrador

Na tela de login do site (`/conta`), digite **`admin`** no campo de e-mail e a **senha do painel**. Você vai direto para o painel. O painel (`/admin`) e o botão "Painel" só aparecem para quem entrou como admin; qualquer outra pessoa que tente abrir `/admin` é levada para o login. Para trocar a senha: Painel → Conta.

## 9. Publicidade de empresas (banners)

O site tem espaços reservados para propaganda de empresas que entrarem em contato:

| Espaço | Onde aparece | Tamanho da arte |
|---|---|---|
| Topo da página inicial | Logo abaixo do mascote, antes das ofertas | 1200 x 200 (celular: 600 x 300) |
| Meio da lista de ofertas | Depois da 8ª oferta de cada página | 1200 x 150 (celular: 600 x 300) |
| Acima dos filtros | Coluna da esquerda, só no computador | 300 x 300 |
| Páginas de loja e de anúncio | No fim das páginas das lojas parceiras e dos anúncios | 1200 x 200 (celular: 600 x 300) |

- **Espaço livre** mostra o cartão “Anuncie sua marca aqui” com o botão **Quero anunciar**, que abre uma conversa no seu WhatsApp (+55 62 8241-7271) com a mensagem já escrita. O número pode ser trocado em **Painel → Site → WhatsApp para anunciantes**. A página **/anuncie** continua disponível, com o formulário e o mesmo botão de WhatsApp. Ali a empresa vê os espaços e envia um pedido de contato (nome, empresa, e-mail, WhatsApp e mensagem).
- **Pedidos** chegam em **Painel → Publicidade → Pedidos de empresas** (o número vermelho na aba mostra os novos). Clique em **Criar campanha** para já abrir o formulário com os dados da empresa.
- **Campanha:** anunciante, espaço, link de destino (https), arte para computador e, opcionalmente, para celular (envie o arquivo JPG/PNG/WEBP até 3 MB), datas de início e término. Ela entra no ar sozinha no dia de início e sai no fim do dia de término. Dá para pausar, editar ou excluir a qualquer momento.
- Com mais de uma campanha no mesmo espaço, elas se **revezam** a cada visita.
- O painel mostra **visualizações, cliques e a taxa de clique** de cada campanha, para você passar o resultado ao anunciante.
- Todo banner aparece com o selo **Patrocinado**, como pede o Código de Defesa do Consumidor e o CONAR. Não aceite anúncios enganosos ou de produtos ilegais.

## 10. Postagens nas redes sociais

**Quem usa:** o administrador e os usuários que você liberar em **Painel → Usuários → Gerenciar → Permitir postagens nas redes** (só contas ativas). Eles publicam nas contas que você configurou.

1. Na página de ofertas, toque no **✓** de um produto: ele entra na lista e abre a tela **/postagens**. Para escolher mais, use **+ Escolher mais produtos**. A barra "Postagens" também tem **Selecionar página** e **1 por categoria**. Tocar no ✓ de um produto já escolhido o desmarca.
2. Na tela de postagens, cada produto tem o texto pronto e **editável** (fica salvo no navegador), além de botões manuais: copiar texto, baixar imagem, WhatsApp e Telegram.
3. Para publicar sozinho: marque as redes, deixe marcados os produtos em **Incluir** e clique em **Postar automaticamente** (clique de novo para confirmar). O site publica um produto a cada 3 segundos e mostra o resultado de cada rede; dá para **Parar** no meio.

**Redes com postagem automática** (configure em **Painel → Redes sociais**, que tem o passo a passo de cada uma):

| Rede | O que é preciso |
|---|---|
| Telegram | Bot criado no @BotFather, adicionado como administrador do canal ou grupo |
| Facebook | Página do Facebook + token de acesso da página |
| Instagram | Conta profissional ligada à página + mesmo token (só publica com foto) |
| X (Twitter) | App no developer.x.com com permissão "Read and write" (4 chaves) |

**WhatsApp:** não tem API oficial para postar em grupos, então lá é sempre pelo botão manual (abre o WhatsApp com o texto pronto).

O link publicado leva direto à loja com o seu código de afiliado. Quando o site tiver endereço público (Painel → Usuários → "Endereço público do site"), o link passa pelo site e o clique é contado. O histórico das publicações fica em Painel → Redes sociais.
