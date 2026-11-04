// Backup automático do banco: uma cópia por dia (de madrugada), compactada, em data/backups/auto.
// Roda numa thread separada (VACUUM INTO + gzip) para o site não travar durante a cópia. Guarda os últimos dias
// (backup_dias) e um por semana das últimas 4 semanas. Com backup_pasta_externa preenchida (ex.: pasta do Google Drive
// ou OneDrive sincronizada no servidor), também copia para lá: é o que protege se o servidor inteiro falhar.
// Os arquivos têm senhas (hash) e chaves de API: só o admin baixa, e a pasta data/ nunca é servida pelo site.
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const db = require('./db');
const settings = require('./settings');

const DIR = path.join(path.dirname(db.DB_PATH), 'backups', 'auto');
const HORA_MINIMA = 4; // no horário de Brasília (pouco movimento)
const NOME = /^ofertas-(\d{4}-\d{2}-\d{2})\.db\.gz$/;
let rodando = false;
let ultimoErro = null;

const hojeSp = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const horaSp = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));

function arquivos() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(n => NOME.test(n)).sort().reverse()
    .map(nome => { const st = fs.statSync(path.join(DIR, nome)); return { nome, tamanho: st.size, em: st.mtime.toISOString() }; });
}

// Thread: copia o banco com o site no ar, confere a cópia e compacta
const TRABALHO = `
const { workerData: w, parentPort } = require('worker_threads');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs'), zlib = require('zlib'), { pipeline } = require('stream/promises');
(async () => {
  fs.rmSync(w.tmp, { force: true });
  const origem = new DatabaseSync(w.banco);
  origem.exec('PRAGMA busy_timeout = 60000');
  origem.prepare('VACUUM INTO ?').run(w.tmp);
  origem.close();
  const copia = new DatabaseSync(w.tmp, { readOnly: true });
  const ok = copia.prepare('PRAGMA quick_check').get().quick_check;
  const ofertas = copia.prepare('SELECT COUNT(*) n FROM offers').get().n;
  copia.close();
  if (ok !== 'ok') throw new Error('a cópia não passou na conferência: ' + ok);
  await pipeline(fs.createReadStream(w.tmp), zlib.createGzip({ level: 6 }), fs.createWriteStream(w.destino + '.parcial'));
  fs.rmSync(w.tmp, { force: true });
  fs.renameSync(w.destino + '.parcial', w.destino);
  parentPort.postMessage({ ofertas });
})().catch(e => { try { fs.rmSync(w.tmp, { force: true }); fs.rmSync(w.destino + '.parcial', { force: true }); } catch {} parentPort.postMessage({ erro: e.message }); });
`;

function copiar(destino) {
  return new Promise((ok, falha) => {
    const t = new Worker(TRABALHO, { eval: true, workerData: { banco: db.DB_PATH, tmp: `${destino}.tmp`, destino } });
    t.once('message', m => (m.erro ? falha(new Error(m.erro)) : ok(m)));
    t.once('error', falha);
  });
}

// Mantém os últimos N dias e, além deles, o mais novo de cada uma das 4 semanas anteriores
function limpar(pasta = DIR) {
  const dias = Math.min(Math.max(settings.getNumber('backup_dias', 7), 1), 60);
  const nomes = fs.readdirSync(pasta).filter(n => NOME.test(n)).sort().reverse();
  const semanas = new Set();
  let removidos = 0;
  nomes.forEach((nome, i) => {
    if (i < dias) return;
    const semana = Math.floor(Date.parse(NOME.exec(nome)[1]) / (7 * 86400000));
    if (semanas.size < 4 && !semanas.has(semana)) { semanas.add(semana); return; }
    fs.rmSync(path.join(pasta, nome), { force: true });
    removidos++;
  });
  return removidos;
}

function avisar(titulo, texto) {
  try {
    db.run(`INSERT OR IGNORE INTO admin_notificacoes (chave, tipo, titulo, texto, link) VALUES (?, 'backup', ?, ?, '/admin#account')`,
      `backup-${hojeSp()}`, titulo, texto);
  } catch { /* tabela ainda não existe */ }
}

async function fazer() {
  if (rodando) return { ok: false, motivo: 'Um backup já está em andamento.' };
  rodando = true;
  const nome = `ofertas-${hojeSp()}.db.gz`;
  const destino = path.join(DIR, nome);
  const inicio = Date.now();
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const r = await copiar(destino);
    limpar();
    // Cópia fora do servidor (pasta sincronizada): se falhar, o backup local continua valendo e o admin é avisado
    const externa = String(settings.get('backup_pasta_externa') || '').trim();
    let externo = null;
    if (externa) {
      try {
        if (!path.isAbsolute(externa) || !fs.existsSync(externa)) throw new Error('pasta não encontrada');
        await fs.promises.copyFile(destino, path.join(externa, nome));
        limpar(externa);
        externo = true;
      } catch (e) {
        externo = false;
        avisar('Backup externo falhou', `O backup de hoje foi feito no servidor, mas não foi copiado para a pasta externa: ${e.message}.`);
      }
    }
    ultimoErro = null;
    const tamanho = fs.statSync(destino).size;
    return { ok: true, nome, tamanho, ofertas: r.ofertas, externo, segundos: Math.round((Date.now() - inicio) / 1000) };
  } catch (e) {
    ultimoErro = { em: new Date().toISOString(), mensagem: e.message };
    console.error('[BACKUP]', e.message);
    avisar('O backup automático falhou', `O banco não foi copiado hoje: ${e.message}.`);
    return { ok: false, motivo: e.message };
  } finally { rodando = false; }
}

function estado() {
  const lista = arquivos();
  const ultimo = lista[0] || null;
  return {
    rodando, erro: ultimoErro, lista, ultimo,
    atrasado: !ultimo || Date.now() - Date.parse(ultimo.em) > 36 * 3600 * 1000,
    pasta_externa: String(settings.get('backup_pasta_externa') || ''), dias: settings.getNumber('backup_dias', 7),
  };
}

// Caminho de um backup para baixar (só nomes do próprio formato: nada de ../)
function caminho(nome) {
  if (!NOME.test(String(nome))) return null;
  const p = path.join(DIR, nome);
  return fs.existsSync(p) ? p : null;
}

function iniciar() {
  const conferir = () => {
    if (rodando || horaSp() < HORA_MINIMA) return;
    if (fs.existsSync(path.join(DIR, `ofertas-${hojeSp()}.db.gz`))) return;
    fazer().then(r => { if (r.ok) console.log(`[BACKUP] ${r.nome}: ${(r.tamanho / 1048576).toFixed(1)} MB em ${r.segundos} s`); });
  };
  setTimeout(conferir, 5 * 60 * 1000); // depois do arranque (o servidor pode ter ficado desligado na hora marcada)
  setInterval(conferir, 30 * 60 * 1000);
}

module.exports = { fazer, estado, caminho, iniciar, limpar };
