// Extensão do Chrome para download: o .zip é montado da pasta extensao-comissao, então está sempre na versão atual.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PASTA = path.join(__dirname, '..', 'extensao-comissao');
const NOME_NO_ZIP = 'ofertou-extensao';

const versao = () => JSON.parse(fs.readFileSync(path.join(PASTA, 'manifest.json'), 'utf8')).version;

function dataDos(d) {
  return { hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dia: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

function montar(arquivos) {
  const partes = [], central = [];
  let posicao = 0;
  for (const a of arquivos) {
    const nome = Buffer.from(`${NOME_NO_ZIP}/${a.nome}`, 'utf8');
    const comprimido = zlib.deflateRawSync(a.dados, { level: 9 });
    const crc = zlib.crc32(a.dados);
    const { hora, dia } = dataDos(a.data);
    const comum = Buffer.alloc(26);
    comum.writeUInt16LE(20, 0);         // versão necessária
    comum.writeUInt16LE(0x0800, 2);     // nomes em UTF-8
    comum.writeUInt16LE(8, 4);          // deflate
    comum.writeUInt16LE(hora, 6);
    comum.writeUInt16LE(dia, 8);
    comum.writeUInt32LE(crc, 10);
    comum.writeUInt32LE(comprimido.length, 14);
    comum.writeUInt32LE(a.dados.length, 18);
    comum.writeUInt16LE(nome.length, 22);
    comum.writeUInt16LE(0, 24);
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), comum, nome, comprimido]);
    const fim = Buffer.alloc(14);
    fim.writeUInt32LE(0, 2);            // sem comentário nem disco
    fim.writeUInt32LE(0, 6);
    fim.writeUInt32LE(posicao, 10);
    central.push(Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02, 20, 0]), comum, fim, nome]));
    partes.push(local);
    posicao += local.length;
  }
  const diretorio = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(posicao, 16);
  return Buffer.concat([...partes, diretorio, fim]);
}

let guardado = { chave: '', zip: null };
function zip() {
  const arquivos = fs.readdirSync(PASTA, { withFileTypes: true }).filter(e => e.isFile()).map(e => {
    const f = path.join(PASTA, e.name);
    return { nome: e.name, data: fs.statSync(f).mtime, caminho: f };
  });
  const chave = arquivos.map(a => `${a.nome}:${a.data.getTime()}`).join('|');
  if (guardado.chave !== chave) guardado = { chave, zip: montar(arquivos.map(a => ({ ...a, dados: fs.readFileSync(a.caminho) }))) };
  return guardado.zip;
}

module.exports = { versao, zip, NOME_NO_ZIP };
