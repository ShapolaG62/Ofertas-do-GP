# Ofertas do GP

Site que minera **ofertas reais** das lojas online e publica com seus links de afiliado.
Nenhuma oferta é criada por IA nem inventada: o sistema só aceita produtos em que **a própria loja exibe o preço anterior riscado**, e uma oferta sai do ar sozinha quando deixa de ser encontrada na loja.

## Lojas

| Loja | Como as ofertas entram |
|---|---|
| Mercado Livre | API oficial (com credenciais no painel) ou leitura da busca pública. O ML costuma bloquear robôs; a API oficial é o caminho recomendado. |
| Amazon | Leitura automática da busca pública. |
| Shopee | API oficial do Shopee Afiliados (precisa de App ID e senha da API). |
| AliExpress | API oficial de afiliados (se configurada) ou leitura automática da busca pública. |
| Magalu | Cadastro manual no painel (links convertidos para sua loja Magazine Você). |
| Shein | Cadastro manual no painel. |
| Temu | Cadastro manual no painel. |

Magalu, Shein e Temu bloqueiam leitura automática (inclusive com navegador real) e não oferecem API pública de produtos.

## Como rodar no seu computador

Requisito: [Node.js 22 ou mais novo](https://nodejs.org).

```bash
npm install
npm start
```

- Site: http://localhost:3000
- Painel: http://localhost:3000/admin (no primeiro acesso você cria a senha)

No Windows também dá para dar dois cliques em `start.bat`.

## Estrutura

```
server.js              servidor web
src/
  db.js                banco SQLite (arquivo data/ofertas.db)
  settings.js          configurações editáveis pelo painel
  auth.js              login do painel
  miner.js             agenda e executa a mineração
  offers.js            grava, valida e expira ofertas
  stores/              um arquivo por loja
  routes/              API pública e API do painel
public/
  index.html           site (estrutura)
  css/site.css         visual do site
  js/site.js           filtros, ordenação e ferramentas do admin
  images/pet-capi*.png mascote Capi (render 3D)
  admin.html           painel administrativo
scripts/mine-once.js   minera uma vez pelo terminal (npm run mine)
```

Para acrescentar uma loja nova, crie um arquivo em `src/stores/` seguindo o modelo dos existentes e registre em `src/stores/index.js`.

## Regras de veracidade

- Só entra oferta com preço anterior **maior** que o atual, informado pela loja, e desconto entre o mínimo configurado e 95%.
- Oferta automática que não aparece na loja há mais de 24h (configurável) sai do site; depois de 30 dias é apagada.
- Oferta manual expira na data definida no cadastro.
- O selo "Menor preço 30 dias" só aparece com histórico real de pelo menos 7 dias.

Guias: [GUIA_DE_USO.md](GUIA_DE_USO.md) e [PASSO_A_PASSO_VPS.md](PASSO_A_PASSO_VPS.md).
