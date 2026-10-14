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
