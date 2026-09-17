# Ofertas do GP - Guia Completo de Locais e Configuração

Guia de referência com os caminhos exatos dos arquivos para configurar os sites de mineração (Mercado Livre, Amazon, etc.) e os links dos grupos (WhatsApp, Telegram, Instagram).

---

## 📍 1. Onde Configurar os Sites de Mineração (Amazon, Mercado Livre, etc.)

- **Arquivo**: [`miner.js`](file:///c:/Users/tiosh/Downloads/saveweb2zip-com-mineradordeofertasbr-com%20%281%29/miner.js#L8)
- **Caminho Completo no Windows**:
  `c:\Users\tiosh\Downloads\saveweb2zip-com-mineradordeofertasbr-com (1)\miner.js`

### Como Adicionar Novos Produtos para Minerar Automático (Linha 8):
Edite a constante `MINING_QUERIES` no arquivo `miner.js`:

```javascript
const MINING_QUERIES = [
  // 📱 Celulares & Tablets
  { query: 'iphone 15 pro max', cat: 'celulares' },
  // 💻 Informática & PC Gamer
  { query: 'notebook gamer dell lenovo', cat: 'informatica' },
  // 🎮 Consoles & Games
  { query: 'playstation 5 console slim', cat: 'games' },
  // 🍳 Cozinha & Eletros
  { query: 'air fryer fritadeira eletrica', cat: 'cozinha' },
  // 👟 Moda, Saúde, Ferramentas, Pets, etc...
  { query: 'seu produto desejado', cat: 'sua_categoria' }
];
```

### Onde estão os Scrapers das Lojas no Código:
- **Mercado Livre**: Função `mineMercadoLivre` na [Linha 47 de miner.js](file:///c:/Users/tiosh/Downloads/saveweb2zip-com-mineradordeofertasbr-com%20%281%29/miner.js#L47)
- **Amazon BR**: Função `mineAmazon` na [Linha 113 de miner.js](file:///c:/Users/tiosh/Downloads/saveweb2zip-com-mineradordeofertasbr-com%20%281%29/miner.js#L113)

---

## 📍 2. Caminho Exato dos Links dos Grupos (WhatsApp, Telegram, Instagram)

- **Arquivo**: [`db.js`](file:///c:/Users/tiosh/Downloads/saveweb2zip-com-mineradordeofertasbr-com%20%281%29/db.js#L65)
- **Caminho Completo no Windows**:
  `c:\Users\tiosh\Downloads\saveweb2zip-com-mineradordeofertasbr-com (1)\db.js`

### Como Alterar no Código (`db.js` - Linha 65):
Vá até o bloco `const defaults = { ... }`:

```javascript
const defaults = {
  telegram_channel_id: "@ofertasdogp",                             // Linha 66: Telegram
  wa_invite_link: "https://chat.whatsapp.com/KRMTOE1KWMzK5CzopNC41e", // Linha 67: Link do Grupo WhatsApp
  instagram_username: "ofertasdogp.br",                           // Linha 68: Instagram
};
```

---

## 🚀 3. Como Operar o Site
- **Acesse**: `http://localhost:3000`
- **Minerar ao vivo**: Pressione ENTER na busca ou clique em `⚡ Minerar Ofertas Ao Vivo`.
- **Selecionar Ofertas**: Use o botão `[✓]` no canto dos cards ou `☑️ Selecionar Visíveis`.
- **Gerar Postagens**: Na barra inferior flutuante, clique em `📢 Gerar Postagens do Grupo`.

---

## 💰 4. Como Pegar e Usar Seus Links de Afiliado para Mineração

O minerador converte automaticamente todos os produtos minerados para os seus links de afiliado com a sua tag associada.

### Onde Pegar seus IDs de Afiliado:
1. **Amazon Associates (Brasil)**:
   - Cadastre-se em: `https://associados.amazon.com.br`
   - O seu ID fica no canto superior direito do painel (exemplo: `ofertasdogp-20`).
2. **Mercado Livre Afiliados**:
   - Cadastre-se em: `https://afiliados.mercadolivre.com.br`
   - O seu ID/ferramenta no painel é conhecido como `matt_tool` (exemplo: `12345678`).
3. **Shopee Afiliados**:
   - Cadastre-se em: `https://affiliate.shopee.com.br`
   - O seu ID de parceiro/UTM (exemplo: `shopee_gp`).

### Como Configurar no Projeto:
No arquivo [`db.js`](file:///c:/Users/tiosh/Downloads/saveweb2zip-com-mineradordeofertasbr-com%20%281%29/db.js#L65), adicione suas tags no objeto `defaults`:

```javascript
const defaults = {
  telegram_channel_id: "@ofertasdogp",
  wa_invite_link: "https://chat.whatsapp.com/KRMTOE1KWMzK5CzopNC41e",
  instagram_username: "ofertasdogp.br",
  amazon_tag: "sua_tag_amazon-20",      // <-- Sua tag da Amazon
  ml_affiliate_id: "seu_id_ml",          // <-- Seu ID do Mercado Livre
  shopee_affiliate_id: "seu_id_shopee"   // <-- Seu ID da Shopee
};
```

Alternativamente, envie um comando POST para salvar via API:
```json
POST http://localhost:3000/api/settings
{
  "amazon_tag": "sua_tag_amazon-20",
  "ml_affiliate_id": "seu_id_ml",
  "shopee_affiliate_id": "seu_id_shopee"
}
```
Assim que salvas, qualquer oferta minerada receberá sua tag automaticamente!

