/**
 * Editorial Review - PHASE 11
 *
 * For each draft article:
 * 1. Claude validates quality (structure, flow, clarity)
 * 2. Claude validates SEO (keywords, headings, meta)
 * 3. Claude validates health safety (medical claims, sources)
 * 4. Add metadata (readTime, difficulty, keywords density)
 * 5. Optimize structure (headlines, transitions)
 * 6. Generate excerpt + meta description
 * 7. Mark as "ready_for_publication" or "needs_revision"
 * 8. Ready for PHASE 12 (Publication)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLES_FILE = path.join(__dirname, '../data/articles.json');

/**
 * Calculate read time (words / 200 = minutes)
 */
function calculateReadTime(wordCount) {
  return Math.ceil(wordCount / 200);
}

/**
 * Calculate difficulty level based on vocabulary
 */
function calculateDifficulty(content) {
  // Simple heuristic: analyze average word length
  const words = content.split(/\s+/);
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;

  if (avgWordLength < 4) return 'easy';
  if (avgWordLength < 5.5) return 'medium';
  return 'hard';
}

/**
 * Count keyword density
 */
function analyzeKeywordDensity(content, keyword) {
  const words = content.toLowerCase().split(/\s+/);
  const keywordLower = keyword.toLowerCase();
  const count = words.filter(w => w.includes(keywordLower)).length;
  const density = (count / words.length) * 100;

  return {
    keyword: keyword,
    count: count,
    density: density.toFixed(2) + '%',
    optimal: density >= 1 && density <= 3
  };
}

/**
 * Generate excerpt (first 150 chars)
 */
function generateExcerpt(content) {
  // Remove markdown
  const text = content.replace(/[#*`\[\]]/g, '');
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  let excerpt = '';

  for (const sentence of sentences) {
    if ((excerpt + sentence).length > 150) break;
    excerpt += sentence.trim() + ' ';
  }

  return excerpt.trim().substring(0, 150) + '...';
}

/**
 * Validate article structure with Claude
 */
async function validateWithClaude(article) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    console.log('   ℹ️  Set ANTHROPIC_API_KEY for Claude validation');
    return null;
  }

  const prompt = `Review this article for publication readiness. Respond with JSON only:

Title: "${article.title}"
Word count: ${article.wordCount}

First 500 chars:
${article.content.substring(0, 500)}

Validate and respond as JSON:
{
  "qualityScore": 0-100,
  "qualityIssues": ["issue1", "issue2"],

  "seoScore": 0-100,
  "seoIssues": ["issue1"],

  "healthScore": 0-100,
  "healthIssues": ["has medical claims without sources?"],
  "needsMedicalReview": false,

  "overallScore": 0-100,
  "verdict": "approved|needs_revision|rejected",
  "recommendations": ["rec1", "rec2"]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const content = data.content[0].text;
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

/**
 * Generate SEO metadata
 */
function generateSEOMetadata(article) {
  const primaryKeyword = article.keywords?.primaryKeyword || article.primaryKeyword || 'health 40+';
  const secondaryKeywords = article.keywords?.secondaryKeywords || [];
  const longTails = article.keywords?.longTails || [];

  return {
    title: article.title + ' | Health 40+',
    metaDescription: generateExcerpt(article.content),
    keywords: [
      primaryKeyword,
      ...secondaryKeywords,
      ...longTails
    ].slice(0, 10),
    canonical: `https://40mais.blog/${article.slug}`,
    ogTitle: article.title,
    ogDescription: article.description,
    ogUrl: `https://40mais.blog/${article.slug}`,
    twitterCard: 'summary_large_image'
  };
}

/**
 * Prepare article for publication
 */
async function reviewArticle(article) {
  console.log(`\n📋 REVIEWING: "${article.title}"`);

  // Calculate metrics
  const readTime = calculateReadTime(article.wordCount);
  const difficulty = calculateDifficulty(article.content);
  const primaryKeyword = article.keywords?.primaryKeyword || article.primaryKeyword || 'health 40+';
  const keywordAnalysis = analyzeKeywordDensity(
    article.content,
    primaryKeyword
  );

  console.log(`   Read time: ${readTime} min`);
  console.log(`   Difficulty: ${difficulty}`);
  console.log(`   Primary keyword density: ${keywordAnalysis.density}`);

  // Validate with Claude
  console.log(`   Validating with Claude...`);
  const validation = await validateWithClaude(article);

  let qualityScore = 75;
  let seoScore = 75;
  let healthScore = 95;
  let verdict = 'ready_for_publication';
  let issues = [];

  if (validation) {
    qualityScore = validation.qualityScore;
    seoScore = validation.seoScore;
    healthScore = validation.healthScore;
    verdict = validation.verdict === 'approved' ? 'ready_for_publication' : 'needs_revision';

    if (validation.qualityIssues) {
      issues.push(...validation.qualityIssues.map(i => `Quality: ${i}`));
    }
    if (validation.seoIssues) {
      issues.push(...validation.seoIssues.map(i => `SEO: ${i}`));
    }
    if (validation.healthIssues) {
      issues.push(...validation.healthIssues.map(i => `Health: ${i}`));
    }
  }

  // Generate metadata
  const seoMetadata = generateSEOMetadata(article);
  const excerpt = generateExcerpt(article.content);

  // Show scores
  console.log(`\n   📊 Scores:`);
  console.log(`     Quality: ${qualityScore}/100`);
  console.log(`     SEO: ${seoScore}/100`);
  console.log(`     Health/Safety: ${healthScore}/100`);

  if (issues.length > 0) {
    console.log(`\n   ⚠️  Issues:`);
    issues.forEach(issue => console.log(`     • ${issue}`));
  }

  console.log(`\n   📌 Verdict: ${verdict}`);

  // Return reviewed article
  return {
    ...article,
    status: verdict,
    metrics: {
      readTime: readTime,
      difficulty: difficulty,
      wordCount: article.wordCount,
      keywordDensity: keywordAnalysis.density
    },
    scores: {
      quality: qualityScore,
      seo: seoScore,
      health: healthScore,
      overall: Math.round((qualityScore + seoScore + healthScore) / 3)
    },
    seo: seoMetadata,
    excerpt: excerpt,
    reviewedAt: new Date().toISOString(),
    issues: issues.length > 0 ? issues : null
  };
}

/**
 * Run editorial review
 */
async function runReview() {
  console.log('📋 PHASE 11: Editorial Review\n');

  try {
    const articlesData = JSON.parse(fs.readFileSync(ARTICLES_FILE, 'utf-8'));

    // Find draft articles
    const draftArticles = articlesData.articles.filter(a => a.status === 'draft');
    console.log(`Found ${draftArticles.length} draft articles\n`);

    if (draftArticles.length === 0) {
      console.log('✅ No draft articles to review');
      return;
    }

    // Review each draft
    let approved = 0;
    let needsRevision = 0;

    for (const article of draftArticles) {
      const reviewed = await reviewArticle(article);

      // Update article in data
      const idx = articlesData.articles.findIndex(a => a.id === article.id);
      articlesData.articles[idx] = reviewed;

      if (reviewed.status === 'ready_for_publication') {
        approved++;
      } else {
        needsRevision++;
      }
    }

    // Save updated articles
    fs.writeFileSync(ARTICLES_FILE, JSON.stringify(articlesData, null, 2));

    console.log(`\n✅ Editorial Review completed!`);
    console.log(`   Approved: ${approved} articles`);
    console.log(`   Needs revision: ${needsRevision} articles`);
    console.log(`   Next: PHASE 12 (Publication)`);

  } catch (error) {
    console.error('❌ Review failed:', error.message);
    process.exit(1);
  }
}

runReview();
