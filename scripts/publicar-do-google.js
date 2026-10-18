#!/usr/bin/env node
/**
 * publicar-do-google.js — publica os artigos prontos da pasta data/entrada/google/
 *
 * Publica 1 artigo por acionamento (padrão). Só sai do lugar quando você aciona o workflow manual.
 *
 * Fluxo (chamado pelo workflow "Publicação de artigos (manual)"):
 *   1. Lê os .txt de data/entrada/google/ (fonte real dos artigos entregues pelo redator),
 *      pula os que já estão publicados no site e seleciona até MAX_POR_DIA novos (padrão 1).
 *   2. Move os alvos para um lote isolado e roda o importador nesse lote
 *      (scripts/importar-artigo.js com ENTRADA_LOTE) → valida, audita, baixa fotos e guarda no estoque.
 *      Quem não passa volta para data/entrada/google/ com o .relatorio.md do motivo.
 *   3. Marca como publicado no banco (data/articles.json) → o push faz o deploy na Vercel.
 *   4. Move os .txt publicados para data/entrada/processados/ (evita republicação).
 *   5. Atualiza automaticamente os status:
 *        - calendario-publicacao.csv → PUBLICADO (sucesso) ou ERRO PUBLICAÇÃO (falha)
 *        - pautas-mestre.csv         → status_publicacao + status_serp das palavras envolvidas
 *
 * Variáveis de ambiente:
 *   MAX_POR_DIA (padrão 1) | FOTO_NA_PUBLICACAO=1 (busca foto só na hora de publicar)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIR_GOOGLE = path.join(ROOT, 'data/entrada/google');
const CAL_FILE = path.join(ROOT, 'data/entrada/pautas-chat_01/calendario-publicacao.csv');
const MASTER_FILE = path.join(ROOT, 'data/conteudo/pautas-mestre.csv');
const ARTICLES_FILE = path.join(ROOT, 'data/articles.json');
const SITE = 'https://40mais.blog';
const MAX = Math.max(1, parseInt(process.env.MAX_POR_DIA || '1', 10) || 1); // 1 artigo por acionamento (padrão)

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- CSV (ponto-e-vírgula, aspas duplas; tolerante ao BOM/escape legado) ----------
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
const descapar = (v) => String(v == null ? '' : v).replace(/^"+|"+$/g, '').replace(/""/g, '"').trim();
const encodeCsv = (rows) => rows.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\n') + '\n';
const readRows = (file) => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l, i, a) => l.length || i < a.length - 1).map(parseCsvLine).map((r) => r.map(descapar));

// ---------- entrada google: keyword declarada em cada .txt ----------
function keywordsDaPasta() {
  const map = new Map(); // caminho -> palavra_chave
  if (!fs.existsSync(DIR_GOOGLE)) return map;
  for (const f of fs.readdirSync(DIR_GOOGLE).filter((x) => x.endsWith('.txt'))) {
    const raw = fs.readFileSync(path.join(DIR_GOOGLE, f), 'utf8').slice(0, 2000);
    const kw = (raw.match(/^PALAVRA_CHAVE:\s*(.+)$/m) || [])[1]?.trim();
    if (kw) map.set(f, kw);
  }
  return map;
}

// ---------- atualização do calendário ----------
function atualizarCalendario(alterados) {
  if (!fs.existsSync(CAL_FILE)) { console.log('⚠️  Calendário não encontrado, pulando.'); return; }
  const rows = readRows(CAL_FILE);
  const h = rows[0];
  const iArt = h.findIndex((c) => /ARTIGO/i.test(c));
  const iSt = h.findIndex((c) => /STATUS/i.test(c));
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    const alvo = alterados.find((a) => a.artigo && norm(a.artigo) === norm(rows[i][iArt]) && rows[i][iSt] === 'PRONTO PARA PUBLICAR');
    if (alvo) { rows[i][iSt] = alvo.status; n++; }
  }
  fs.writeFileSync(CAL_FILE, '\uFEFF' + encodeCsv(rows));
  console.log(`🗓️  calendario-publicacao.csv: ${n} linha(s) atualizada(s).`);
}

// ---------- atualização da planilha mestre (2 colunas de status) ----------
function atualizarMestre(palavras, stPub, stSerp) {
  if (!fs.existsSync(MASTER_FILE)) return;
  const rows = readRows(MASTER_FILE);
  const h = rows[0];
  const iKey = h.indexOf('palavra_chave');
  if (iKey < 0) return;
  let iPub = h.indexOf('status_publicacao');
  if (iPub < 0) { iPub = h.length; h.push('status_publicacao'); for (let i = 1; i < rows.length; i++) rows[i].push(''); }
  let iSerp = h.indexOf('status_serp');
  if (iSerp < 0) { iSerp = h.length; h.push('status_serp'); for (let i = 1; i < rows.length; i++) rows[i].push(''); }
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    if (palavras.some((k) => k && norm(k) === norm(rows[i][iKey]))) {
      if (stPub) rows[i][iPub] = stPub;
      if (stSerp) rows[i][iSerp] = stSerp;
      n++;
    }
  }
  fs.writeFileSync(MASTER_FILE, '\uFEFF' + encodeCsv(rows));
  console.log(`📒 pautas-mestre.csv: ${n} linha(s) → ${stPub}${stSerp ? ' / ' + stSerp : ''}.`);
}

// ---------- verifica se o artigo realmente subiu no site ----------
async function confirmadoNoSite(slug) {
  try {
    const res = await fetch(`${SITE}/${slug}/`, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    return res.status === 200;
  } catch { return false; }
}

// ---------- main ----------
const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// banco de artigos (para checar o que já está publicado e evitar republicação)
const dbInicial = JSON.parse(fs.readFileSync(ARTICLES_FILE, 'utf8'));
const jaPublicadas = new Set(dbInicial.articles.filter((a) => a.status === 'published').map((a) => a.slug));

// se uma execução anterior caiu no meio, os .txt do lote voltam para a pasta google antes de começar
const LOTE_ANTERIOR = path.join(ROOT, 'data/entrada/_lote-publicacao');
if (fs.existsSync(LOTE_ANTERIOR)) {
  for (const f of fs.readdirSync(LOTE_ANTERIOR)) {
    const destino = path.join(DIR_GOOGLE, f);
    if (!fs.existsSync(destino)) { fs.renameSync(path.join(LOTE_ANTERIOR, f), destino); console.log(`♻️  devolvido de um lote interrompido: ${f}`); }
  }
  fs.rmSync(LOTE_ANTERIOR, { recursive: true, force: true });
}

const pasta = keywordsDaPasta();
if (!pasta.size) { console.log('📥 Nenhum .txt em data/entrada/google/. Nada a publicar.'); process.exit(0); }

// 1) fila de candidatos: todos os .txt novos de data/entrada/google/, em ordem de nome,
//    pulando palavras-chave cujo slug já está publicado no site
const candidatos = [];
const jaNoAr = [];
for (const [f, kw] of pasta) {
  const slugKw = slugify(kw);
  const slugArq = slugify(f.replace(/\.txt$/, ''));
  if (jaPublicadas.has(slugKw) || jaPublicadas.has(slugArq)) { jaNoAr.push({ arquivo: f, keyword: kw, slug: slugKw }); continue; }
  candidatos.push({ artigo: kw, arquivo: f, keyword: kw });
}
// anotar no calendário as linhas dos arquivos que já estão no ar (coerência entre planilhas)
if (jaNoAr.length) atualizarCalendario(jaNoAr.map((j) => ({ artigo: j.keyword, status: 'PUBLICADO' })));
if (jaNoAr.length) console.log(`⏭️  Pulados (já publicados): ${jaNoAr.map((j) => j.keyword).join(', ')}`);
if (!candidatos.length) { console.log('Nenhum artigo novo pronto para publicar (todos os .txt da pasta já estão no ar).'); process.exit(0); }
console.log(`🎯 Meta desta execução: ${MAX} artigo(s) | fila: ${candidatos.length} candidato(s) (${candidatos.map((c) => c.artigo).join(', ')})`);

// 2 + 3) tentar um candidato por vez até publicar MAX. Cada tentativa vai sozinha para um lote isolado e o
//        importador recebe só esse lote em ENTRADA_LOTE (sem isso ele varre data/entrada inteira e o limite
//        acima não vale nada). Quem é recusado volta para data/entrada/google/ com o .relatorio.md do motivo,
//        e a fila continua: uma recusa não derruba a execução.
const DIR_LOTE = path.join(ROOT, 'data/entrada/_lote-publicacao');
const dirProc = path.join(ROOT, 'data/entrada/processados');
fs.mkdirSync(dirProc, { recursive: true });
const agora = new Date().toISOString();
const publicados = [];
const falhas = [];

for (const alvo of candidatos) {
  if (publicados.length >= MAX) break;
  console.log(`\n──── tentando: ${alvo.artigo} (${alvo.arquivo})`);
  fs.rmSync(DIR_LOTE, { recursive: true, force: true });
  fs.mkdirSync(DIR_LOTE, { recursive: true });
  fs.renameSync(path.join(DIR_GOOGLE, alvo.arquivo), path.join(DIR_LOTE, alvo.arquivo));

  const r = spawnSync('node', ['scripts/importar-artigo.js'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ENTRADA_LOTE: DIR_LOTE } });
  console.log((r.stdout || '') + (r.stderr || ''));

  // o importador reescreve data/articles.json: o que vale como sucesso é o registro no banco, não o log
  const db = JSON.parse(fs.readFileSync(ARTICLES_FILE, 'utf8'));
  const slugEsperado = slugify(alvo.keyword);
  const slugArquivo = slugify(alvo.arquivo.replace(/\.txt$/, ''));
  const art = db.articles.find((a) => a.slug === slugEsperado || a.slug === slugArquivo || norm(a.primaryKeyword || a.validacao?.palavraChave || '') === norm(alvo.keyword));

  let publicou = false;
  if (!art) {
    falhas.push(alvo);
    console.log(`  ❌ ${alvo.artigo}: importação não concluída (ver .relatorio.md na pasta google)`);
  } else if (art.segurar) {
    falhas.push({ ...alvo, motivo: 'segurado para revisão humana' });
    console.log(`  ✋ /${art.slug}/ está segurado (revisão humana): não publica.`);
  } else if (art.status === 'published') {
    publicou = true; // já estava no ar: só arquiva o .txt para não voltar à fila
    console.log(`  ⏭️  /${art.slug}/ já estava publicado; arquivando o .txt.`);
  } else {
    art.status = 'published'; art.publishedAt = agora; art.estoque = false; art.publicadoDoEstoqueEm = agora;
    db.stats = db.stats || {};
    db.stats.published = db.articles.filter((a) => a.status === 'published').length;
    fs.writeFileSync(ARTICLES_FILE, JSON.stringify(db, null, 2));
    publicados.push({ ...alvo, slug: art.slug });
    publicou = true;
    console.log(`  📤 marcado para publicação: /${art.slug}/`);
  }

  // o .txt aprovado vai para processados/ (evita republicação); o recusado volta para google/ com o relatório
  const noLote = path.join(DIR_LOTE, alvo.arquivo);
  const relLote = noLote.replace(/\.txt$/, '.relatorio.md');
  const destino = publicou ? dirProc : DIR_GOOGLE;
  if (fs.existsSync(noLote)) fs.renameSync(noLote, path.join(destino, alvo.arquivo));
  if (fs.existsSync(relLote)) {
    if (publicou) fs.rmSync(relLote);
    else fs.renameSync(relLote, path.join(DIR_GOOGLE, path.basename(relLote)));
  }
  // o importador move o .txt aprovado direto para processados/; o relatório antigo na pasta google perde a validade
  const relGoogle = path.join(DIR_GOOGLE, alvo.arquivo.replace(/\.txt$/, '.relatorio.md'));
  if (publicou && fs.existsSync(relGoogle)) fs.rmSync(relGoogle);
  fs.rmSync(DIR_LOTE, { recursive: true, force: true });
}

if (publicados.length < MAX) console.log(`\n⚠️  Publicados ${publicados.length} de ${MAX}: a fila acabou antes da meta.`);

// 4) status automáticos
const alteradosCal = [];
for (const p of publicados) alteradosCal.push({ artigo: p.artigo, status: 'PUBLICADO' });
for (const f of falhas) alteradosCal.push({ artigo: f.artigo, status: 'ERRO PUBLICAÇÃO' });
atualizarCalendario(alteradosCal);
atualizarMestre(publicados.map((p) => p.keyword), 'PUBLICADO', 'PESQUISA CONCLUÍDA');
atualizarMestre(falhas.map((f) => f.keyword), 'ERRO PUBLICAÇÃO', null);

// 5) resumo para o log do workflow
const resumo = { candidatos: candidatos.length, tentativas: publicados.length + falhas.length, meta: MAX, publicados: publicados.map((p) => ({ artigo: p.artigo, slug: p.slug })), erros: falhas.map((f) => ({ artigo: f.artigo, motivo: f.motivo || 'importação/recusa' })) };
console.log('\n📊 RESUMO: ' + JSON.stringify(resumo));
try { fs.writeFileSync(path.join(ROOT, 'data/entrada/google/.ultimo-run.json'), JSON.stringify({ em: agora, ...resumo }, null, 2)); } catch {}

// confirmação no site acontece após o deploy (Vercel); workflow pode reconfirmar depois
if (process.env.CHECK_SITE === '1') {
  for (const p of publicados) {
    const ok = await confirmadoNoSite(p.slug);
    console.log(`  🔎 ${SITE}/${p.slug}/ → ${ok ? '200 ✅' : 'ainda fora do ar (deploy em andamento?)'}`);
  }
}
if (!publicados.length) { console.error('❌ Nenhum artigo publicado nesta execução.'); process.exit(1); }
