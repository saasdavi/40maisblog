#!/usr/bin/env node
/**
 * estoque-para-google.js — leva os artigos prontos do estoque (data/articles.json) para a fila da
 * pasta data/entrada/google/, que é de onde o site gera as páginas (src/lib/artigos-diretos.ts).
 *
 * Os artigos do estoque já estão completos: texto, imagem de capa (quase todas baixadas no repo,
 * em /images/<slug>/), imagens do corpo embutidas no HTML, fontes e pontuação. Este script só
 * reescreve isso no formato da pasta, sem buscar foto nova e sem refazer auditoria.
 *
 * Cada artigo vira um .txt com o nome do slug e SEM DATA_PUBLICACAO: ou seja, entra na fila, não
 * publicado. Quem publica continua sendo scripts/publicar-direto.js, 1 por acionamento.
 *
 * No data/articles.json o registro é mantido como histórico, marcado com movidoParaGoogle e com
 * estoque: false, para não aparecer duas vezes na fila nem ser publicado pelos dois caminhos.
 *
 * Variáveis de ambiente:
 *   MAX_ARTIGOS (padrão: todos) | DRY_RUN=1 (só mostra o que faria)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import ArticleRobot from './article-robot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data/entrada/google');
const MAX = parseInt(process.env.MAX_ARTIGOS || '0', 10) || Infinity;
const DRY = process.env.DRY_RUN === '1';

const robot = new ArticleRobot();
fs.mkdirSync(DIR, { recursive: true });

// Uma linha de cabeçalho não pode quebrar: o leitor da pasta lê campo por linha.
const umaLinha = (v) => String(v == null ? '' : v).replace(/\s*\n\s*/g, ' ').trim();

const prontos = robot.prontosNoEstoque();
if (!prontos.length) { console.log('📦 Nada pronto no estoque.'); process.exit(0); }
console.log(`📦 ${prontos.length} artigo(s) prontos no estoque${MAX === Infinity ? '' : `; levando até ${MAX}`}.`);

const levados = [];
const pulados = [];

for (const art of prontos) {
  if (levados.length >= MAX) break;
  const destino = path.join(DIR, `${art.slug}.txt`);

  if (fs.existsSync(destino)) { pulados.push({ slug: art.slug, motivo: 'já existe um .txt com esse nome na pasta' }); continue; }
  if (!art.content || !/<(?:p|h2|h3|ul|ol|blockquote|div)\b/i.test(art.content)) { pulados.push({ slug: art.slug, motivo: 'sem corpo em HTML' }); continue; }

  const cab = [
    `PALAVRA_CHAVE: ${umaLinha(art.primaryKeyword || art.validacao?.palavraChave || art.slug)}`,
    `TITLE: ${umaLinha(art.title)}`,
    `DESCRIPTION: ${umaLinha(art.description)}`,
    `CAPA_ALT: ${umaLinha(art.imageAlt || art.title)}`,
  ];
  // A capa já existe (quase sempre um arquivo local do próprio repositório): vai como CAPA_URL para
  // o publicador não gastar API de foto nem trocar por uma imagem pior.
  if (art.featuredImage) cab.push(`CAPA_URL: ${umaLinha(art.featuredImage)}`);
  if (art.imageCredit?.author) cab.push(`CAPA_CREDITO: ${umaLinha(art.imageCredit.author)} | ${umaLinha(art.imageCredit.url)} | ${umaLinha(art.imageCredit.source)}`);
  for (const f of art.sources || []) if (f?.url) cab.push(`FONTE: ${umaLinha(f.title || f.url)} | ${umaLinha(f.url)}`);
  if (art.scores?.notaChat != null) cab.push(`NOTA_CHAT: ${String(art.scores.notaChat).replace('.', ',')}`);

  const texto = `${cab.join('\n')}\n---\n${art.content.trim()}\n`;

  if (!DRY) {
    fs.writeFileSync(destino, texto);
    art.estoque = false;
    art.movidoParaGoogle = new Date().toISOString();
  }
  levados.push({ slug: art.slug, keyword: art.primaryKeyword || art.slug, capa: art.featuredImage || '(sem capa)' });
  console.log(`  ➡️  ${art.slug}.txt  ←  "${art.primaryKeyword || art.slug}"`);
}

if (!DRY && levados.length) robot.gravar();

for (const p of pulados) console.log(`  ⏭️  ${p.slug}: ${p.motivo}`);
console.log(`\n📊 ${levados.length} levado(s) para a fila, ${pulados.length} pulado(s).${DRY ? ' (DRY_RUN: nada foi gravado)' : ''}`);
console.log('Nenhum deles está publicado: entram na fila sem DATA_PUBLICACAO e saem 1 por acionamento da publicação direta.');
