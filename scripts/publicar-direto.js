#!/usr/bin/env node
/**
 * publicar-direto.js — publica os artigos da pasta data/entrada/google/ pelo caminho direto.
 *
 * O site já monta as páginas lendo essa pasta (src/lib/artigos-diretos.ts), como documenta a
 * seção 5 de data/entrada/google/LEIA-ME.md: o artigo não precisa do importador legado nem do
 * data/articles.json. Só faltavam duas coisas para a página subir completa:
 *   - a foto de capa, que só aparece quando o cabeçalho traz CAPA_ID (ou agora CAPA_URL);
 *   - a data, que só aparece quando o cabeçalho traz DATA_PUBLICACAO.
 *
 * Este script carimba as duas no próprio .txt, na hora de publicar:
 *   1. Lê os .txt da pasta e separa os que ainda NÃO têm DATA_PUBLICACAO (= ainda não publicados).
 *   2. Pega os MAX_POR_DIA primeiros (padrão 1).
 *   3. Resolve a foto (Pexels/Pixabay/Unsplash) e grava CAPA_URL, CAPA_ID e CAPA_CREDITO.
 *   4. Grava DATA_PUBLICACAO. É esse carimbo que tira o arquivo da fila, então acionar duas
 *      vezes nunca republica o mesmo artigo e nada precisa mudar de pasta.
 *   5. O commit do .txt alterado + o build da Vercel põem a página no ar.
 *
 * Arquivo colado da IA do Google (texto puro, sem a linha "---") é convertido antes com
 * normalizarEntradaGoogle(), o mesmo conversor que o importador usa: sem isso o site ignora o
 * arquivo, porque a página só é gerada com separador e corpo em HTML.
 *
 * Quem falha fica na pasta sem carimbo, com o motivo no log, e a fila segue para o próximo.
 *
 * Variáveis de ambiente:
 *   MAX_POR_DIA (padrão 1) | PEXEL_API_KEY / PIXABAY_API_KEY / UNSPLASH_ACCESS_KEY (foto)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import ArticleRobot from './article-robot.js';
import { buscaDoAlt, ehSaidaGoogle, normalizarEntradaGoogle } from './lib/entrada-google.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data/entrada/google');
const MAX = Math.max(1, parseInt(process.env.MAX_POR_DIA || '1', 10) || 1);

const robot = new ArticleRobot();

const cabecalhoDe = (raw) => { const i = raw.indexOf('\n---\n'); return i < 0 ? null : raw.slice(0, i); };
const campo = (cab, chave) => (cab.match(new RegExp(`^${chave}:\\s*(.+)$`, 'm')) || [])[1]?.trim();

// Substitui o campo se já existir, senão acrescenta no fim do cabeçalho.
function gravarCampo(cab, chave, valor) {
  const linha = new RegExp(`^${chave}:.*$`, 'm');
  return linha.test(cab) ? cab.replace(linha, () => `${chave}: ${valor}`) : `${cab.replace(/\n+$/, '')}\n${chave}: ${valor}`;
}

// Data de hoje em São Paulo, carimbada ao meio-dia UTC: assim a conversão de fuso na página
// (toLocaleDateString com America/Sao_Paulo) nunca cai no dia anterior.
function dataDeHoje() {
  return `${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T12:00:00.000Z`;
}

// ---------- 1. fila ----------
if (!fs.existsSync(DIR)) { console.log('📥 data/entrada/google/ não existe. Nada a publicar.'); process.exit(0); }

const fila = [];
const jaNoAr = [];
const invalidos = [];
for (const arquivo of fs.readdirSync(DIR).filter((f) => f.endsWith('.txt') && f.toLowerCase() !== 'leia-me.txt').sort()) {
  const caminho = path.join(DIR, arquivo);
  let raw = fs.readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n');
  // O carimbo é conferido ANTES de normalizar: normalizarEntradaGoogle reconstrói o cabeçalho e
  // descarta campos que não conhece, o que apagaria a DATA_PUBLICACAO e republicaria o artigo.
  if (/^(?:DATA_PUBLICACAO|PUBLICADO_EM):\s*\S/m.test(raw)) { jaNoAr.push(arquivo); continue; }
  // Saída colada da IA do Google: texto puro vira HTML e ganha o separador, senão o site ignora.
  if (ehSaidaGoogle(raw) || cabecalhoDe(raw) === null) {
    try {
      const g = normalizarEntradaGoogle(raw, { artigos: robot.db.articles, publicados: robot.linksInternos(), precisaRevisao: (a) => robot.precisaRevisao(a) });
      if (g.erros.length) throw new Error(g.erros.join('; '));
      g.avisos.forEach((a) => console.log(`  ⚠️  ${arquivo}: ${a}`));
      raw = g.texto;
      console.log(`🔁 ${arquivo}: convertido do formato colado da IA para HTML.`);
    } catch (e) { invalidos.push({ arquivo, motivo: `conversão falhou: ${e.message}` }); console.log(`⚠️  ${arquivo}: ${e.message}`); continue; }
  }
  const cab = cabecalhoDe(raw);
  if (cab === null) { invalidos.push({ arquivo, motivo: 'sem a linha "---"' }); console.log(`⚠️  ${arquivo}: sem a linha "---"; o site ignora esse arquivo.`); continue; }
  fila.push({ arquivo, caminho, raw, cab });
}

if (jaNoAr.length) console.log(`⏭️  Já no ar (${jaNoAr.length}): ${jaNoAr.join(', ')}`);
if (!fila.length) { console.log('Nenhum artigo novo para publicar: todos os .txt da pasta já têm DATA_PUBLICACAO.'); process.exit(0); }
console.log(`🎯 Meta desta execução: ${MAX} artigo(s) | fila: ${fila.length} candidato(s) (${fila.map((f) => f.arquivo.replace(/\.txt$/, '')).join(', ')})`);

if (!process.env.PEXEL_API_KEY && !process.env.PIXABAY_API_KEY && !process.env.UNSPLASH_ACCESS_KEY) {
  console.log('⚠️  Nenhuma chave de banco de fotos no ambiente; só publica arquivo que já tenha CAPA_ID ou CAPA_URL.');
}

// ---------- 2. publicar um por vez ----------
const publicados = [];
const falhas = [];

for (const alvo of fila) {
  if (publicados.length >= MAX) break;
  console.log(`\n──── publicando: ${alvo.arquivo}`);

  const kw = campo(alvo.cab, 'PALAVRA_CHAVE') || alvo.arquivo.replace(/\.txt$/, '');
  const alt = campo(alvo.cab, 'CAPA_ALT') || campo(alvo.cab, 'TITLE') || kw;
  const idAtual = campo(alvo.cab, 'CAPA_ID') || campo(alvo.cab, 'CAPA_PEXELS_ID') || '';
  const urlAtual = campo(alvo.cab, 'CAPA_URL');
  const creditoAtual = campo(alvo.cab, 'CAPA_CREDITO');

  // Busca a foto quando falta imagem ou crédito. Com CAPA_ID já no cabeçalho, a consulta é
  // pelo próprio id (buscarFoto trata os dois casos) e serve só para trazer o crédito.
  let foto = null;
  if (!urlAtual || !creditoAtual) {
    try {
      foto = await robot.buscarFoto(buscaDoAlt(alt, kw), null, new Set(), /^\d+$/.test(idAtual) ? idAtual : null);
    } catch (e) { console.log(`  ⚠️  busca de foto: ${e.message}`); }
  }

  if (!foto && !urlAtual && !/^\d+$/.test(idAtual)) {
    falhas.push({ arquivo: alvo.arquivo, motivo: 'sem foto de capa (nenhum banco de fotos devolveu imagem e o cabeçalho não traz CAPA_ID/CAPA_URL)' });
    console.log('  ❌ sem foto de capa: não publica. Informe CAPA_ID no cabeçalho ou configure a chave do banco de fotos.');
    continue;
  }

  let cab = alvo.cab;
  if (foto) {
    cab = gravarCampo(cab, 'CAPA_URL', foto.url);
    const pexels = String(foto.id).match(/^pexels:(\d+)$/);
    if (pexels) cab = gravarCampo(cab, 'CAPA_ID', pexels[1]);
    cab = gravarCampo(cab, 'CAPA_CREDITO', `${foto.credit.author} | ${foto.credit.url} | ${foto.credit.source}`);
    console.log(`  📷 foto: ${foto.id} (${foto.credit.author} / ${foto.credit.source})`);
  } else {
    console.log(`  📷 foto: mantida a do cabeçalho (${urlAtual || `Pexels ${idAtual}`})`);
  }

  const data = dataDeHoje();
  cab = gravarCampo(cab, 'DATA_PUBLICACAO', data);
  fs.writeFileSync(alvo.caminho, cab + alvo.raw.slice(alvo.cab.length));

  publicados.push({ arquivo: alvo.arquivo, slug: alvo.arquivo.replace(/\.txt$/, ''), data });
  console.log(`  📤 publicado: /${alvo.arquivo.replace(/\.txt$/, '')}/ em ${data.slice(0, 10)}`);
}

if (publicados.length < MAX) console.log(`\n⚠️  Publicados ${publicados.length} de ${MAX}: a fila acabou antes da meta.`);

// ---------- 3. resumo ----------
const resumo = { candidatos: fila.length, meta: MAX, publicados, erros: [...falhas, ...invalidos] };
console.log('\n📊 RESUMO: ' + JSON.stringify(resumo));
try { fs.writeFileSync(path.join(DIR, '.ultimo-run.json'), JSON.stringify({ em: new Date().toISOString(), ...resumo }, null, 2)); } catch {}

if (!publicados.length) { console.error('❌ Nenhum artigo publicado nesta execução.'); process.exit(1); }
