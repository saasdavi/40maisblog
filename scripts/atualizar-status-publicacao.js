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
function updateMaster(targetKeywords) {
  const file = path.join(root, 'data/conteudo/pautas-mestre.csv');
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((line, i, arr) => line.length || i < arr.length - 1);
  const rows = lines.map(parseCsvLine);
  const header = rows[0];
  const keyI = header.indexOf('palavra_chave');
  if (keyI < 0) throw new Error('pautas-mestre.csv sem coluna palavra_chave');
  let statusI = header.indexOf('status_publicacao');
  if (statusI < 0) { statusI = header.length; header.push('status_publicacao'); rows[0] = header; for (let i = 1; i < rows.length; i++) rows[i].push(''); }
  let changed = 0;
  for (let i = 1; i < rows.length; i++) {
    if (targetKeywords.some(k => norm(k) === norm(rows[i][keyI]))) { rows[i][statusI] = status; changed++; }
  }
  fs.writeFileSync(file, '\uFEFF' + encodeCsv(rows));
  console.log(file + ': ' + changed + ' linha(s) atualizada(s) para status_publicacao=' + status);
  return changed;
}

let targetKeywords = [...keywords];
if (!targetKeywords.length) {
  const file = path.join(root, 'data/conteudo/pautas-mestre.csv');
  const rows = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  const h = rows[0] || [], keyI = h.indexOf('palavra_chave'), pubI = h.indexOf('status_publicacao');
  const pending = rows.slice(1).filter(r => r[keyI] && (pubI < 0 || !['PUBLICADO', 'FALHA EXECUÇÃO'].includes(String(r[pubI] || '').toUpperCase())));
  if (pending[0]) targetKeywords = [pending[0][keyI]];
}
if (!targetKeywords.length) targetKeywords = ['execução sem pauta selecionada'];

updateMaster(targetKeywords);

const logPath = path.join(root, 'data/conteudo/execucoes-publicacao.csv');
const first = !fs.existsSync(logPath);
const logRows = targetKeywords.map(keyword => [new Date().toISOString(), status, keyword, slugs.join(','), process.env.DEPLOY_URL_CHECK || '', process.env.GITHUB_RUN_ID || '']);
if (first) fs.writeFileSync(logPath, '\uFEFFdata_hora;status;palavra_chave;slugs;verificacao_url;github_run_id\n');
fs.appendFileSync(logPath, encodeCsv(logRows));
console.log('Log de execução atualizado: ' + logPath);
