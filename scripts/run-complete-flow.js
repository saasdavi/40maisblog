/**
 * Complete Production Flow - All Phases
 *
 * FASE 10 → 11 → 12
 * Produção → Revisão → Publicação
 *
 * Executa o fluxo completo de produção de artigos
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const KEYWORDS_FILE = path.join(PROJECT_ROOT, 'data/keywords.json');
const ARTICLES_FILE = path.join(PROJECT_ROOT, 'data/articles.json');

/**
 * Run FASE 10: Content Production
 */
function runPhase10() {
  console.log('\n═══════════════════════════════════════');
  console.log('📝 FASE 10: Content Production');
  console.log('═══════════════════════════════════════\n');

  try {
    execSync('node scripts/production.js', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });
    console.log('\n✅ FASE 10 Concluída\n');
    return true;
  } catch (error) {
    console.error('\n❌ FASE 10 Falhou');
    return false;
  }
}

/**
 * Run FASE 11: Editorial Review
 */
function runPhase11() {
  console.log('\n═══════════════════════════════════════');
  console.log('📋 FASE 11: Editorial Review');
  console.log('═══════════════════════════════════════\n');

  try {
    execSync('node scripts/review-article.js', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });
    console.log('\n✅ FASE 11 Concluída\n');
    return true;
  } catch (error) {
    console.error('\n❌ FASE 11 Falhou');
    return false;
  }
}

/**
 * Run FASE 12: Publication
 */
function runPhase12() {
  console.log('\n═══════════════════════════════════════');
  console.log('📢 FASE 12: Publication Pipeline');
  console.log('═══════════════════════════════════════\n');

  try {
    execSync('node scripts/publish-article.js', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });
    console.log('\n✅ FASE 12 Concluída\n');
    return true;
  } catch (error) {
    console.error('\n❌ FASE 12 Falhou');
    return false;
  }
}

/**
 * Show final summary
 */
function showSummary() {
  console.log('\n═══════════════════════════════════════');
  console.log('📊 RESUMO DO FLUXO COMPLETO');
  console.log('═══════════════════════════════════════\n');

  try {
    const articlesData = JSON.parse(fs.readFileSync(ARTICLES_FILE, 'utf-8'));

    const draft = articlesData.articles.filter(a => a.status === 'draft').length;
    const ready = articlesData.articles.filter(a => a.status === 'ready_for_publication').length;
    const published = articlesData.articles.filter(a => a.status === 'published').length;

    console.log(`📊 Status dos Artigos:`);
    console.log(`   📝 Draft: ${draft}`);
    console.log(`   ✅ Ready for Publication: ${ready}`);
    console.log(`   🌐 Published: ${published}`);

    const publishedArticles = articlesData.articles.filter(a => a.status === 'published');

    if (publishedArticles.length > 0) {
      console.log(`\n🎉 Artigos Publicados:`);
      publishedArticles.forEach((article, idx) => {
        console.log(`\n   ${idx + 1}. ${article.title}`);
        console.log(`      📌 Keyword: ${article.keywords.primaryKeyword}`);
        if (article.url) console.log(`      🌐 URL: ${article.url}`);
        console.log(`      📊 Quality: ${article.scores.quality}/100 | SEO: ${article.scores.seo}/100 | Health: ${article.scores.health}/100`);
        console.log(`      ⏱️  Read time: ${article.metrics.readTime} min | Words: ${article.metrics.wordCount}`);
        if (article.featuredImage) console.log(`      🖼️  Featured image: ✓`);
      });
    }

    console.log(`\n🌐 Blog:`);
    console.log(`   https://40mais.blog\n`);

  } catch (error) {
    console.log(`Erro ao gerar resumo: ${error.message}\n`);
  }
}

/**
 * Main
 */
function main() {
  console.log('\n╔═════════════════════════════════════════════════════╗');
  console.log('║   🚀 COMPLETE PRODUCTION FLOW                        ║');
  console.log('║                                                       ║');
  console.log('║   FASE 10: Produção                                   ║');
  console.log('║   FASE 11: Revisão                                    ║');
  console.log('║   FASE 12: Publicação + Imagens                       ║');
  console.log('║                                                       ║');
  console.log('║   Resultado: Artigo publicado no blog!                ║');
  console.log('╚═════════════════════════════════════════════════════╝\n');

  try {
    // Check validated keywords
    const keywordsData = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf-8'));
    const validated = keywordsData.keywords.filter(k => k.status === 'validated');

    if (validated.length === 0) {
      console.log('⚠️  Nenhum keyword validado encontrado');
      console.log('   Execute primeiro: node scripts/validate-keywords.js\n');
      process.exit(1);
    }

    console.log(`✅ ${validated.length} keywords validados\n`);

    // Run phases
    const phase10Ok = runPhase10();
    const phase11Ok = runPhase11();
    const phase12Ok = runPhase12();

    // Show summary
    showSummary();

    console.log('\n═══════════════════════════════════════');
    if (phase10Ok && phase11Ok && phase12Ok) {
      console.log('✅ FLUXO COMPLETO - SUCESSO!');
    } else {
      console.log('⚠️  Fluxo completado com avisos');
    }
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Erro:', error.message, '\n');
    process.exit(1);
  }
}

main();
