# Ofertou! — Guia de uso

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
- **KaBuM!:** minerada automaticamente pela busca do catálogo da própria loja, com o mesmo preço que ela exibe ("De" riscado → preço à vista no PIX; numa oferta relâmpago, o preço da oferta). Produtos sem preço riscado na KaBuM! não entram. Para ganhar comissão: cadastre-se no programa de afiliados da KaBuM!, gere o link de afiliado de qualquer produto e cole em Painel → Afiliados → KaBuM!. O site usa esse link como modelo para todas as ofertas. Sem isso, os links vão direto para a KaBuM! sem comissão.
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
npm run mine -- "air fryer"  # só um termo (no site: digite o produto no campo "Buscar produto nas lojas…" da barra de postagens e aperte Enter)
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
- **Vídeo (opcional):** além da imagem, a campanha pode ter um vídeo curto **sem som** — MP4 (H.264) ou WEBM, até **15 segundos** e **8 MB** (ideal até 4 MB), na mesma proporção da imagem do espaço. Ele toca sozinho, mudo e em repetição; a imagem vira a **capa** (aparece enquanto o vídeo carrega e para quem economiza dados ou desativou animações no celular). Dá para mandar um vídeo para computador e outro para celular. Essas exigências também aparecem na página /anuncie.
- Com mais de uma campanha no mesmo espaço, elas se **revezam** a cada visita.
- O painel mostra **visualizações, cliques e a taxa de clique** de cada campanha, para você passar o resultado ao anunciante.
- Todo banner aparece com o selo **Patrocinado**, como pede o Código de Defesa do Consumidor e o CONAR. Não aceite anúncios enganosos ou de produtos ilegais.

## 10. Postagens nas redes sociais

**Quem usa:** o administrador e os usuários que você liberar em **Painel → Usuários → Gerenciar → Permitir postagens nas redes** (só contas ativas). Eles publicam nas contas que você configurou.

1. Na página de ofertas, toque no **✓** dos produtos: eles ficam marcados e você continua na mesma página (tocar de novo desmarca). A barra verde **Postagens** mostra quantos foram escolhidos e tem **★ Melhor de cada categoria** (escolhe, em cada categoria, o produto com mais chance de venda: desconto real, cliques no site, menor preço dos últimos 30 dias, loja conhecida e preço de compra por impulso), **Selecionar página** e **Limpar seleção**. Quando terminar, clique em **Ir para postagens** (ou no atalho que aparece no rodapé).
2. Na tela de postagens, cada produto tem o texto pronto e **editável** (fica salvo no navegador), além de botões manuais: copiar texto, baixar imagem, WhatsApp e Telegram.
3. Para publicar sozinho: marque as redes, deixe marcados os produtos em **Incluir** e clique em **Postar automaticamente** (clique de novo para confirmar). O site publica um produto a cada 3 segundos e mostra o resultado de cada rede; dá para **Parar** no meio.

**Redes com postagem automática** (configure em **Painel → Redes sociais**, que tem o passo a passo de cada uma):

| Rede | O que é preciso |
|---|---|
| Telegram | Bot criado no @BotFather, adicionado como administrador do canal ou grupo |
| Facebook | Página do Facebook + token de acesso da página |
| Instagram | Conta profissional ligada à página + mesmo token (só publica com foto) |
| X (Twitter) | App no developer.x.com com permissão "Read and write" (4 chaves) |

**WhatsApp:** não tem API oficial para grupos. A postagem automática usa um **número separado** conectado por um destes serviços (Painel → Redes sociais → WhatsApp):

- **Z-API** (z-api.io): pago, na nuvem, não precisa de servidor. Informe o ID e o token da instância e, se estiver ativado, o token de segurança da conta.
- **Evolution API** (v2): grátis, roda no seu computador ou na VPS com Docker. Informe o endereço, a chave (apikey) e o nome da instância.

Depois clique em **Testar conexão**, **Carregar grupos do número**, marque os grupos de destino e **Salvar grupos**. Cada oferta vai com foto e texto para todos os grupos marcados, com pausa de alguns segundos entre os grupos e o intervalo configurado (padrão 90 s) entre uma oferta e outra.

> O WhatsApp pode banir números automatizados. Use um chip só para isso (de preferência com algumas semanas de uso), mantenha o intervalo e poste só em grupos onde as pessoas entraram por vontade própria.

### Marca d'água nas imagens

As fotos das postagens vão num quadrado 1080×1080 com o selo do site: a Capi + "Ofertou!" (e o endereço do site, quando ele estiver configurado em "Endereço público do site").

- Configure em **Painel → Redes sociais → Marca d'água**: ligar/desligar, texto, posição (cantos ou centro) e opacidade. A prévia mostra o resultado numa oferta real.
- Vale para WhatsApp, Telegram, Facebook e para o botão **Baixar imagem** da tela de postagens (a miniatura de cada produto já mostra a versão com marca).
- No **Instagram**, a marca só entra quando o site tiver endereço público (VPS), porque o Instagram baixa a foto pelo endereço; antes disso, ele recebe a foto da loja.
- As imagens prontas ficam guardadas em data/marca (são refeitas se você mudar a configuração) e as com mais de 7 dias são apagadas sozinhas.

### Postagens agendadas (manhã, tarde e noite)

Em **Painel → Redes sociais → Postagens agendadas**: ligue o agendamento, confira os horários (padrão **09:00, 14:00 e 20:00**, horário de Brasília), a quantidade por horário (padrão **5**) e as redes (padrão WhatsApp).

- Em cada horário entram primeiro as ofertas da **fila**: na tela de postagens, o botão **Adicionar à fila agendada** guarda os produtos incluídos com o texto editado.
- Se a fila tiver menos ofertas que o necessário, o site completa com as **melhores do momento** (maior desconto até 80%, categorias variadas, nada que tenha sido postado nos últimos 7 dias). Dá para desligar e postar só o que estiver na fila.
- Ofertas da fila que saíram do ar antes do horário são puladas. A fila, o resultado de cada postagem e o botão **Postar uma rodada agora** (para testar) ficam no mesmo painel.
- O agendamento só funciona com o site ligado (no seu computador ou na VPS). Se o computador estiver desligado no horário, a rodada acontece quando ele voltar, até 2 horas depois.

O link publicado leva direto à loja com o seu código de afiliado. Quando o site tiver endereço público (Painel → Usuários → "Endereço público do site"), o link passa pelo site e o clique é contado. O histórico das publicações fica em Painel → Redes sociais.

## 11. Clientes da ferramenta (venda de acesso)

Você pode vender o acesso à ferramenta. Cada cliente usa as ofertas mineradas pelo site com **os links de afiliado dele** e posta **nos canais dele** — o site principal e as suas configurações continuam só seus.

**No seu painel (Painel → Clientes):**

- **Cadastrar:** nome, e-mail (login), senha inicial, validade em dias e observações (plano, valor). Envie ao cliente o endereço `/cliente`, o e-mail e a senha.
- **+30 dias / Renovar…:** soma dias à validade (a partir de hoje, se já tiver vencido).
- **Bloquear / Desbloquear**, **Nova senha** e **Excluir** a qualquer momento.
- Quando a validade vence ou você bloqueia, o cliente perde o acesso e as postagens agendadas dele param.

**O que o cliente faz (em /cliente):**

1. **Links de afiliado:** Amazon (tag), Mercado Livre (matt_word e matt_tool), KaBuM! (link de qualquer produto), AliExpress e Shopee (chaves da API de afiliados dele) e Magalu.
2. **Redes sociais:** WhatsApp (Z-API ou Evolution, número dele), Telegram, Facebook/Instagram, X e marca d'água com o nome dele (sem a Capi).
3. **Ofertas:** navega pelas ofertas do site, marca com ✓ e vai para **Postagens** — os textos já saem com os links dele e publicam nos canais dele. Também pode pôr ofertas na fila.
4. **Agendamento** próprio (horários, quantidade, redes) e **histórico** só das postagens dele.

**Segurança:** o cliente nunca vê nem usa as suas chaves, links ou canais. Se ele não configurou o link de uma loja, os produtos dessa loja vão sem comissão (nunca com a sua) e o painel avisa. Ele não acessa o painel admin, a busca nas lojas nem o histórico do site.

## 12. Planos pagos (assinaturas)

A página de entrada (**/conta**) é a página inicial do site: apresentação, números de ofertas ao vivo, como funciona, recursos, os planos à venda lado a lado, comparativo do que cada plano inclui (montado sozinho a partir das funções de cada plano), perguntas frequentes e o login. Ao clicar em um plano, a pessoa vai para **/assinar**, preenche os dados e paga. Após a confirmação, a conta é criada (ou renovada), ela recebe um e-mail com a data de vencimento e é levada para as ofertas.

Planos que vêm prontos (dá para editar, excluir e criar outros):

| Plano | Para quem | Preço sugerido (30 dias) |
|---|---|---|
| **Caçador de Ofertas** | consumidor | **grátis, sem vencimento** |
| **Loja Parceira** | empresas | R$ 49,90 |
| **Afiliado Pro** | quem quer vender com os próprios links (vira *cliente da ferramenta*) | R$ 79,90 |

**Criar, editar e excluir planos:** **Painel → Planos → Planos à venda**. Use **+ Criar plano** ou **Editar** em um cartão. Cada plano tem:
1. **O básico:** nome, preço (ou **Plano grátis**: sem pagamento, liberado na hora), dias de acesso por compra (ou **Sem vencimento**), ordem na página e se está **à venda**.
2. **Tipos de acesso** (marque um ou mais): *Consumidor* (conta no site liberada na hora), *Empresa* (página da loja, anúncios e importação de catálogo, com **limite de produtos** próprio; 0 = limite geral) e/ou *Ferramenta de afiliado* (painel /cliente com links próprios e postagem automática). Com *Consumidor* e *Empresa* juntos, quem assina escolhe o tipo da conta na compra. Com *Ferramenta* junto de um deles, a conta do site também ganha o painel de afiliado, com o mesmo login e a mesma validade.
3. **Funções do perfil:** quantas conquistas na vitrine, tamanho do resumo, quantos links, imagem de capa, cores extras, cores em degradê, endereço personalizado (/perfil/nome), moldura exclusiva e o texto do selo.
4. **Página inicial:** frase de chamada, "ideal para", etiqueta de destaque (ex.: *Mais vendido*), ícone e a lista de benefícios — o botão **Gerar a partir das funções** escreve a lista sozinho.
5. **Pagamento:** link de pagamento do plano (se usar a forma *Link de pagamento*) e o ID do produto no app (Google Play / App Store).

**Planos grátis** aparecem na página inicial com o botão **Começar grátis**: a pessoa preenche o cadastro e a conta é liberada na hora (sem pagamento e sem aprovação). O plano grátis é **permanente até um upgrade**: não vence; quando a pessoa assina um plano pago, os dias do pago contam a partir da compra, e quando o pago vence a conta volta sozinha para o grátis (sem bloquear o login). Contas de empresa só voltam para um grátis se existir um plano grátis com o tipo Empresa; sem ele, continuam pedindo para renovar. Eles não são vendidos pela Google Play / App Store; dentro do app, também são ativados pelo site.

**Excluir:** um plano sem assinantes é apagado de vez. Com assinantes, ele sai da venda e da lista, mas continua valendo (com as mesmas funções) para quem já pagou até o fim do prazo; para renovar, a pessoa escolhe outro plano. Os tipos de acesso de um plano com assinantes não podem ser trocados — crie um plano novo.

**Formas de recebimento** (Painel → Planos → Formas de recebimento). Cada uma tem *Ativo/Desligado*; para trocar uma chave, conta ou link, é só editar e salvar:
- **Mercado Pago (recomendado):** cole o *Access Token* de produção (mercadopago.com.br/developers → Suas integrações → Credenciais de produção). Liga **Pix com QR code** e **cartão de crédito/débito** (com parcelas, se quiser). Confirmação automática.
- **Pix pela sua chave:** tipo e chave Pix, nome do recebedor e banco. Usado quando o Pix do Mercado Pago está desligado.
- **Transferência bancária:** banco, agência, conta, tipo, titular e CPF/CNPJ.
- **Link de pagamento:** para cartão sem Mercado Pago — crie um link de valor fixo (PagBank, InfinitePay, PicPay, Stone…) para cada plano e cole no campo **Link de pagamento** do plano (Planos à venda → Editar).
- **WhatsApp para comprovantes** e um **recado** opcional na tela de pagamento.

Nas formas com comprovante, o pedido fica em **Pedidos de assinatura** e você clica **Confirmar pagamento**. Sem nenhuma forma ligada, o cliente ainda finaliza a compra (dados + confirmação) com o pagamento **a combinar**: o pedido aparece no painel, ele fala com você pelo WhatsApp e você clica **Confirmar pagamento**.

**E-mail de confirmação:** configure o SMTP em Painel → Planos (ex.: Gmail com *senha de app*: smtp.gmail.com, porta 465) e use **Enviar e-mail de teste**. Sem SMTP o pagamento funciona, mas o e-mail não é enviado (dá para reenviar depois pelo botão do pedido).

**Vencimento:** ao vencer, o acesso às ofertas é bloqueado e a conta mostra o link **Renovar**. Renovar soma os dias ao prazo que ainda restava.

**Contas sem plano:** depois de criar a conta (ou entrar com o Google), a pessoa vê primeiro os planos pagos (acesso imediato após o pagamento) e, abaixo, os 3 perfis gratuitos — Consumidor, Empresarial e **Usuário da ferramenta** — que passam pela sua aprovação (Painel → Usuários). Ao aprovar um usuário da ferramenta, ele ganha o painel de afiliado (aba Clientes) pelo número de dias do plano de ferramenta.

**Google na compra:** na tela de pagamento há o botão **Cadastrar com Google**; a pessoa volta já logada e só completa os dados e paga.

## 13. Perfis e conquistas

Todo mundo que acessa o site tem um perfil em **/perfil** (link "Perfil" no topo do site, "Meu perfil" no painel do afiliado e no painel admin): foto, capa, nome, título, cidade, resumo, cor, moldura da foto, links e uma vitrine de conquistas. Cada perfil tem um endereço próprio (`/perfil/nome`) para compartilhar; só quem tem acesso ao site consegue ver.

| O que dá para personalizar | Gratuito | Caçador de Ofertas | Loja Parceira | Afiliado Pro | Admin |
|---|---|---|---|---|---|
| Conquistas na vitrine | 3 | 4 | 6 | 8 | 12 |
| Capa do perfil | — | ✓ | ✓ | ✓ | ✓ |
| Links (Instagram, grupo de WhatsApp…) | — | 1 | 4 | 5 | 6 |
| Cores em degradê | — | — | — | ✓ | ✓ |
| Endereço personalizado | — | — | — | ✓ | ✓ |
| Molduras | pelo nível | pelo nível | pelo nível | + moldura Pro | todas + coroa |

**Conquistas** (bronze → diamante, cada uma dá XP e o XP define o nível):
- Para todos: tempo de conta, **idas à loja** pelos links do site (contadas sozinhas) e **compras confirmadas pelo seu código de afiliado**.
- Afiliados: ofertas postadas, **cliques nos links** deles (contados sozinhos quando o site tem endereço https: os links postados passam por `/ir/...`) e **vendas como afiliado**.
- Empresas: anúncios publicados, cliques nos anúncios e **vendas da loja**.

**Comunidade e seguidores:** na tela de ofertas há o quadro **👥 Comunidade** (na lateral; no celular, botão no topo) com todos os perfis. Pesquise digitando **#nome** — ali ou na própria busca de ofertas — e toque em **Seguir**. A janela "Ver todos" tem as abas **Todos**, **Seguindo** e **Seguidores**. No computador, ao passar o mouse num perfil aparece a miniatura com a capa, o nível, os seguidores e todas as conquistas já ganhas. Quem visita um perfil vê só o que a pessoa configurou e as conquistas que ela já tem: o progresso, o XP e os números são só do dono e do admin.

**Vendas e compras confirmadas:** as lojas não informam vendas ao site automaticamente. Você confere nos relatórios dos programas de afiliados (ou com a empresa) e registra: abra o perfil da pessoa logado como admin → quadro **Admin** → tipo + quantidade → **Registrar** (use número negativo para corrigir). No mesmo quadro dá para **ocultar** um perfil ou **remover foto, capa e textos**.

**Manter conectado:** quem não está conectado sempre cai na tela de entrar/criar conta. Quem entra uma vez continua conectado:
- **Plano pago** (inclusive o Afiliado Pro): durante **todo o prazo contratado**. Quando o plano vence, a sessão acaba e, ao tentar entrar, aparece *"Seu plano … venceu em DD/MM. Reative o plano…"* com o botão **Reativar plano** (abre a página do plano já no modo renovar; os dias novos começam quando o pagamento é confirmado). Quem entra com o Google vai direto para essa página.
- **Conta gratuita aprovada:** enquanto usar o site (expira após 6 meses sem uso).
- **Painel admin:** expira após 30 dias sem uso.

## 14. Anúncios do Google (AdSense)

Os espaços de publicidade que estiverem **sem campanha de anunciante** mostram anúncios do Google, e você recebe pelo AdSense. Campanhas de empresas cadastradas em Painel → Publicidade continuam tendo prioridade. Dentro do app das lojas os anúncios do Google não aparecem (regra do AdSense).

1. O site precisa estar **no ar no seu domínio com https** (o Google não aprova endereço local nem da Vercel temporária).
2. Crie a conta em https://adsense.google.com e adicione o domínio.
3. **Painel → Publicidade → Google AdSense:** cole o **ID de editor** (`ca-pub-…`) e salve. O site coloca sozinho o código de verificação em todas as páginas e publica o arquivo `/ads.txt`.
4. No AdSense, peça a **análise do site** (de alguns dias a 2 semanas). Como as ofertas ficam atrás do login, o Google analisa a página inicial (apresentação, planos, perguntas frequentes) — mantenha-a completa.
5. Aprovado: em AdSense → Anúncios → **Por bloco de anúncios**, crie um bloco **display** para cada espaço (topo, meio, lateral e páginas), cole o número de cada `data-ad-slot` no painel e ligue **Mostrar anúncios do Google**.
6. Pagamentos: o Google paga direto na sua conta bancária quando o saldo passa do mínimo (cerca de R$ 100); cadastre os dados de pagamento e impostos no AdSense.

## 15. Ganhos dos programas de afiliados

**Painel → Ganhos** registra as vendas feitas pelos seus links e mostra, por plataforma (Amazon, Mercado Livre, Shopee, Magalu, AliExpress, KaBuM!/Awin): saldo **disponível**, valor **a liberar**, **mínimo para saque** e quanto já foi recebido.

- **Registrar vendas:** exporte o relatório de comissões em **CSV** no portal de cada programa e importe em "Importar vendas" (o site reconhece as colunas pelo nome; confira e clique em Importar — repetir a importação atualiza, não duplica). Também dá para adicionar vendas à mão.
- **Saldo disponível:** comissões *confirmadas* entram no saldo depois do prazo de liberação de cada programa. Os mínimos e prazos vêm preenchidos com o que os guias informam hoje — **confira no portal de cada programa** e ajuste em **Regras**.
- **Aviso de saque:** quando o saldo disponível passa do mínimo, aparece um aviso na aba Ganhos, no **sininho 🔔** do topo do painel, no seu **perfil** e por e-mail (se o SMTP estiver configurado). O site confere a cada hora.
- **Depois de sacar** (ou de cair o pagamento automático), clique em **Registrar saque** para zerar o saldo e preparar o próximo aviso.
- **Saque automático:** nenhum programa permite pedir saque por integração. Para o dinheiro cair direto no **Mercado Pago**, cadastre os dados bancários da sua conta Mercado Pago (app do Mercado Pago → Seu perfil → Seus dados → Dados da conta: banco 323, agência e conta) como conta de recebimento no portal de cada programa.

## 16. Mensagens, catálogo das empresas e pedidos

**Mensagens:** o botão **Mensagens** fica no canto inferior direito de todas as páginas, com o número de mensagens não lidas e pedidos de mensagem. Ele abre um painel por cima da página com as conversas: ler, responder, aceitar/recusar/bloquear (menu ⋯) e os **pedidos** (Pix copia e cola, pagar no Mercado Pago/link, Já paguei, Confirmar pagamento, Enviado, Cancelar). Links para /mensagens (e-mails, pedido recém-feito) abrem esse painel. Em Minha conta há também a aba **Mensagens**.
- **Conversa pessoal:** no perfil de qualquer pessoa ou empresa, toque em **💬 Mensagem**. A primeira mensagem chega como **pedido de mensagem** (aviso no site e, com o e-mail configurado, por e-mail). Quem recebe escolhe **Aceitar**, **Recusar** ou **Bloquear**; responder também aceita. Até aceitar, quem pediu manda no máximo 3 mensagens; se for recusado, só pode pedir de novo depois de 30 dias.
- **Atendimento da loja:** pela página da loja, pelo perfil da empresa ou pela prévia de um produto (**Conversar com a loja**). Entra direto, sem aceite, e a empresa pode bloquear.
- Toda conversa é um ticket (**CV-000123**) com o histórico completo.

**Catálogo e prévia do produto:** na página da loja (**/loja/nome**) e no perfil da empresa, cada produto abre uma prévia com fotos, preço, descrição e os botões **Fazer pedido**, **Conversar com a loja** e (nos importados) **Ver no site da loja**.

**Pedidos:** o cliente escolhe a quantidade, a forma de pagamento e escreve observações (endereço, cor…). O pedido vira um ticket (**PD-000123**) dentro da conversa com a loja. Situações: aguardando pagamento → pagamento informado (cliente toca em "Já paguei") → **pago** (a loja confirma) → enviado → concluído (ou cancelado). O cliente só cancela antes de a loja confirmar o pagamento. Cada mudança fica registrada com data, hora e quem fez.

**Formas de pagamento da empresa** (Minha conta → **Vendas e pagamentos**; sem nenhuma forma ativa, os pedidos chegam do mesmo jeito e a loja envia o pagamento pela conversa): **Pix** (chave da empresa; o site gera o "copia e cola" já com o valor do pedido), **cartão** (link de pagamento da própria empresa: Mercado Pago, PagBank, InfinitePay…). O dinheiro vai direto para a empresa — o site não cobra nem recebe. Na mesma aba ficam os **números da loja**: compras finalizadas pelo site (pedidos com pagamento confirmado) e valor vendido, pedidos recebidos, acessos à página da loja e ao perfil, produtos abertos no catálogo, cliques no site oficial e nos links dos produtos, e os produtos mais vistos.

**Meus pedidos:** todos (consumidores, empresas e afiliados) veem os pedidos que fizeram em Minha conta → **Meus pedidos**.

**No painel:** aba **Atendimento** com os números de cada empresa, todos os pedidos e todas as conversas (busca por nome, produto ou número do ticket; clique para ver o histórico completo). Na ficha de cada usuário (aba **Usuários**) aparecem as conversas, os pedidos feitos e, nas empresas, os pedidos recebidos e os números da loja. A política de privacidade avisa que conversas e pedidos ficam registrados e podem ser consultados pela administração para resolver disputas e abusos.

**Taxa de uso do site (padrão 1%)** — Painel → **Atendimento** → *Taxa de uso do site*. A taxa é somada ao valor dos produtos em todo pedido feito às lojas parceiras pelo site; o cliente vê "Produtos + Taxa de uso do site (1%) = Total" antes de confirmar. Com 0%, não há acréscimo.
- **Loja com Mercado Pago conectado (automático):** o cliente paga pelo Mercado Pago (Pix ou cartão), o pedido é confirmado sozinho e o próprio Mercado Pago divide o pagamento: o valor dos produtos vai para a loja e a taxa cai **direto no saldo da sua conta Mercado Pago**. Para ativar: em mercadopago.com.br/developers, com a sua conta, crie uma aplicação (modelo marketplace/pagamentos online), cadastre a URL de redirecionamento mostrada no painel (`https://SEU-DOMINIO/api/mp/oauth/retorno`) e cole o **Client ID** e o **Client Secret** no painel. Cada empresa clica em **Conectar minha conta Mercado Pago** em Minha conta → Vendas e pagamentos. Só funciona com o site online em https (VPS).
- **Outras formas (Pix da loja ou link de cartão):** a loja recebe produto + taxa e a taxa fica como **débito da loja** a partir da confirmação do pagamento (pedido cancelado não gera taxa). A loja vê o valor a repassar com um Pix "copia e cola" para a **sua** chave (Planos → Formas de recebimento → Pix pela sua chave, com a cidade) e toca em **Já paguei a taxa** — você recebe um aviso no 🔔. Confira o Pix e clique em **Recebi** na tabela de Empresas (aba Atendimento) para dar baixa.
- "Valor vendido" da loja é sem a taxa; a tabela de Empresas mostra a taxa total, a separada automaticamente, a já repassada e a que falta receber.

## 17. Minha conta + perfil, página profissional das lojas, catálogos e avaliações

**Perfil e conta no mesmo lugar:** em **Minha conta**, a primeira aba é **Meu perfil** (o perfil estilo Steam completo, com Editar perfil). O endereço /perfil leva para lá. No topo da página de ofertas, o botão com a sua foto abre o menu com **Minha conta e perfil** e **Sair**. (Admin e clientes só da ferramenta continuam com o perfil em /perfil.)

**Vitrine de conquistas:** mostra só o emoji de cada conquista; ao passar o mouse (ou tocar, no celular) aparece a prévia com nome, descrição, nível e data.

**Página da loja (/loja/nome):** banner, logo, cor da loja, frase de destaque, selo de verificada, nota em estrelas, seguidores, produtos vendidos, entrega e atendimento, botões **Fale com lojista**, **Seguir**, site, WhatsApp e Instagram, as conquistas da empresa e as abas **Todos os produtos**, um aba por **catálogo**, **Avaliações** e **Sobre a loja** (apresentação, horário, endereço, contatos e políticas de entrega e troca). O perfil público de uma empresa abre a página da loja.

**Editor da loja** (Minha conta → **Minha loja**): nome, frase de destaque, apresentação, logo e banner (enviar imagem), cor da loja, contatos, horário, endereço, políticas e se as avaliações aparecem. Na mesma aba: **Catálogos** (criar, editar, excluir; escolher os produtos de cada um) e **Avaliações dos clientes** (responder publicamente).

**Avaliações:** 1 a 5 estrelas com mensagem, uma por pessoa e loja (dá para editar ou apagar). Quem comprou pela loja no site aparece com **✓ Compra verificada**. A loja recebe aviso por e-mail (com o SMTP configurado) e pode responder. O admin, logado, vê o botão **Ocultar/Mostrar** em cada avaliação na página da loja. A nota média aparece no topo da loja e no cartão de parceiro da Comunidade.
