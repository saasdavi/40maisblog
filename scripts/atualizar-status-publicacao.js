import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const status = process.env.DEPLOY_STATUS === 'PUBLICADO' ? 'PUBLICADO' : 'FALHA EXECUÇÃO';
const slugs = (process.env.ARTIGOS_SLUGS || '').split(',').map(x => x.trim()).filter(Boolean);
const articlesPath = path.join(root, 'data/articles.json');
const articlesData = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const articles = (articlesData.articles || []).filter(a => slugs.includes(a.slug));
const keywords = articles.map(a => a.primaryKeyword || (a.validacao && a.validacao.palavraChave) || a.slug).filter(Boolean);

function parseCsvLine(line) {
  const out = []; let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ';' && !quoted) { out.push(value); value = ''; }
    else value += ch;
  }
  out.push(value); return out;
}
function encodeCsv(rows) {
  return rows.map(row => row.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\n') + '\n';
}
function updateCsv(file, keyHeader, statusHeader, targetKeywords) {
  if (!fs.existsSync(file)) return 0;
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((line, i, arr) => line.length || i < arr.length - 1);
  if (!lines.length) return 0;
  const rows = lines.map(parseCsvLine);
  const header = rows[0];
  const ki = header.indexOf(keyHeader), si = header.indexOf(statusHeader);
  if (ki < 0 || si < 0) { console.warn('Cabeçalhos ' + keyHeader + '/' + statusHeader + ' ausentes em ' + file); return 0; }
  let changed = 0;
  for (let i = 1; i < rows.length; i++) {
    if (targetKeywords.some(k => norm(k) === norm(rows[i][ki]))) { rows[i][si] = status; changed++; }
  }
  fs.writeFileSync(file, '\uFEFF' + encodeCsv(rows));
  console.log(file + ': ' + changed + ' linha(s) atualizada(s) para ' + status);
  return changed;
}

let targetKeywords = [...keywords];
if (!targetKeywords.length) {
  const file = path.join(root, 'data/conteudo/calendario-12-meses.csv');
  if (fs.existsSync(file)) {
    const rows = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(parseCsvLine);
    const h = rows[0] || [];
    const dateI = h.indexOf('data'), keyI = h.indexOf('palavra_chave'), situationI = h.indexOf('situacao');
    const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const pending = rows.slice(1).filter(r => r[keyI] && !['PUBLICADO', 'FALHA EXECUÇÃO'].includes(String(r[situationI] || '').toUpperCase()));
    const chosen = pending.find(r => r[dateI] === today) || pending[0];
    if (chosen) targetKeywords = [chosen[keyI]];
  }
}
if (!targetKeywords.length) targetKeywords = ['execução sem pauta selecionada'];

updateCsv(path.join(root, 'data/conteudo/calendario-12-meses.csv'), 'palavra_chave', 'situacao', targetKeywords);
updateCsv(path.join(root, 'data/conteudo/pautas-mestre.csv'), 'palavra_chave', 'status_artigo', targetKeywords);

const jsonPath = path.join(root, 'data/conteudo/calendario-12-meses.json');
if (fs.existsSync(jsonPath)) {
  const cal = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  let count = 0;
  for (const slot of cal.slots || []) {
    if (targetKeywords.some(k => norm(k) === norm(slot.palavra))) { slot.situacao = status; count++; }
  }
  fs.writeFileSync(jsonPath, JSON.stringify(cal, null, 2) + '\n');
  console.log(jsonPath + ': ' + count + ' vaga(s) atualizada(s)');
}

const logPath = path.join(root, 'data/conteudo/execucoes-publicacao.csv');
const first = !fs.existsSync(logPath);
const logRows = targetKeywords.map(keyword => [new Date().toISOString(), status, keyword, slugs.join(','), process.env.DEPLOY_URL_CHECK || '', process.env.GITHUB_RUN_ID || '']);
if (first) fs.writeFileSync(logPath, '\uFEFFdata_hora;status;palavra_chave;slugs;verificacao_url;github_run_id\n');
fs.appendFileSync(logPath, encodeCsv(logRows));
console.log('Log de execução atualizado: ' + logPath);
