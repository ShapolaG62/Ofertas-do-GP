// WhatsApp do site e dos clientes da ferramenta: tudo passa pela API própria (src/whatsapp-proprio.js).
// Use um número separado só para as postagens: o WhatsApp pode banir números automatizados.
const proprio = () => require('./whatsapp-proprio');
const donoDe = s => proprio().donoDe(s.cliente_id);

// Pronto para enviar? Sem número conectado neste dono, diz o que falta.
function config(s) {
  const dono = donoDe(s);
  return proprio().pronto(dono) ? { tipo: 'proprio', dono } : { erro: 'Conecte o WhatsApp no painel: clique em Conectar e leia o QR code.' };
}

async function status(s) {
  const e = proprio().status(donoDe(s));
  return { conectado: e.conectado, mensagem: e.conectado ? 'Número conectado.' : (e.erro || 'Número desconectado: clique em Conectar e leia o QR code.') };
}

// Grupos deste número: só os que ele criou e administra
const listarGrupos = s => proprio().carregarGrupos(donoDe(s));
const resumoGrupos = s => proprio().resumoGrupos(donoDe(s));

// Quantas pessoas há em cada grupo: Map(id → total). Grupo que não responder fica de fora.
async function tamanhoGrupos(s, ids) {
  const out = new Map();
  for (const g of await proprio().carregarGrupos(donoDe(s), { todos: true })) {
    if (ids.includes(g.id) && Number.isInteger(g.membros)) out.set(g.id, g.membros);
  }
  return out;
}

// Envia foto com legenda (ou só texto, sem foto) para um grupo ou celular.
// imagem: endereço https da foto ou o arquivo (Buffer JPEG).
const enviar = (s, destino, { imagem, texto }) => proprio().enviar(donoDe(s), destino, { imagem, texto });

function gruposEscolhidos(s) {
  try {
    const g = JSON.parse(s.whatsapp_groups || '[]');
    return Array.isArray(g) ? g.filter(x => x && x.id).map(x => ({ ...x, categorias: Array.isArray(x.categorias) ? x.categorias.map(String) : [] })) : [];
  } catch { return []; }
}
// Grupos que recebem uma oferta deste tipo (grupo sem tipo marcado recebe todas)
const gruposDaOferta = (s, categoria) => gruposEscolhidos(s).filter(g => !g.categorias.length || g.categorias.includes(categoria));

// Grupos escolhidos para esta postagem. porTipo: cada produto vai só para os grupos do tipo dele (o que foi marcado no
// painel; grupo sem marcação usa o tipo que o nome indica). Sem porTipo, vai para todos os grupos escolhidos.
function comDestinos(s, grupos, porTipo = true) {
  const salvos = new Map(gruposEscolhidos(s).map(g => [g.id, g]));
  const { categoriasDoNome } = require('./temas-grupos');
  const lista = (grupos || []).filter(g => g && g.id).map(g => {
    const salvo = salvos.get(String(g.id));
    const nome = g.nome || salvo?.nome || String(g.id);
    let categorias = [];
    if (porTipo) categorias = salvo ? salvo.categorias : categoriasDoNome(nome);
    return { id: String(g.id), nome, categorias };
  });
  return { ...s, whatsapp_groups: JSON.stringify(lista) };
}

module.exports = { config, status, listarGrupos, resumoGrupos, tamanhoGrupos, enviar, gruposEscolhidos, gruposDaOferta, comDestinos };
