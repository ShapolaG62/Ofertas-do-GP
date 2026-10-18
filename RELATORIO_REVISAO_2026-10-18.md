# Revisão e limpeza do site — 18/10/2026

## Backup
Antes de qualquer exclusão, o banco foi copiado para `data/backup-antes-limpeza-2026-10-18.db` (48 MB). A cópia fica **só no computador** (a pasta `data/` não vai para o GitHub). Use-a se precisar recuperar algo; apague quando tiver certeza de que não precisa.

## 1. Contas de teste apagadas (confirmado pelo dono do site)
- **Shapola teste:** conta de empresa (tioshapola@gmail.com), com:
  - a loja e os 50 produtos dela, o catálogo, os números da loja;
  - os 3 pedidos de teste e as 3 conversas (8 mensagens);
  - as 3 assinaturas de teste, as conquistas e os seguidores;
  - o cliente da ferramenta com o mesmo e-mail.
- **Jose Adailson:** conta de consumidor (jamsnettomarinho@gmail.com) e o perfil dela.
- **Fotos enviadas:** 4 arquivos que não eram mais usados (capa da loja, avatar e duas fotos).
- **O que ficou:** só o administrador (perfil e capa intactos). As ~69 mil ofertas mineradas continuam.

## 2. Itens removidos para deixar o site mais leve
| Item | Espaço |
|---|---|
| IA de recorte de fotos (modelo `data/modelos` + motor `onnxruntime-node`) | ~460 MB |
| Cache antigo de recortes (`data/recorte`) | 18 MB |
| Banco da versão antiga (`data/legacy-offers.db`) | 4,6 MB |
| Tabela do encurtador externo (`links_curtos`, não é mais usado) | — |
| `supabase_schema.sql` (não usado) | removido do GitHub |
| `Apresentacao-Ofertas-do-GP.pptx` | saiu do GitHub; continua na pasta local |

Resultado: o servidor passou de ~610 MB para ~134 MB (sem contar o backup).

A vitrine da página inicial passou a usar o recorte simples, sem perder função. Se um dia quiser a IA de volta, rode `npm run ia`; o modelo é baixado sozinho.

## 3. O que foi conferido e está bom
- **Banco de dados (49 MB):** sem espaço desperdiçado e sem dados soltos. O histórico de preço só tem ofertas que existem, e as ofertas antigas saem sozinhas.
- **Arquivos do site:** todos os scripts das páginas estão em uso. CSS e JS vão comprimidos (brotli) e ficam guardados no navegador do visitante por 1 ano; só são baixados de novo quando há atualização.
- **Imagens do site:** 188 KB no total.

## 4. Sugestão para depois
A página inicial baixa todas as ~53 mil ofertas de uma vez: cerca de **1,75 MB comprimido** na primeira visita; nas seguintes, só o que mudou. No celular com 4G isso pode levar alguns segundos. Carregar as ofertas aos poucos, conforme a pessoa rola a página, deixaria a primeira abertura bem mais rápida. É uma mudança maior, recomendada antes de divulgar o site em grande escala.
