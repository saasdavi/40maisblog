/**
 * Generate sitemap.xml for SEO
 * Automatically includes all published articles
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLES_FILE = path.join(__dirname, '../data/articles.json');
const SITEMAP_FILE = path.join(__dirname, '../public/sitemap.xml');
const SITE_URL = 'https://40mais.blog';

// Escapa caracteres especiais do XML (&, <, >, aspas) em textos e URLs
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

// Imagem precisa de URL absoluta (o Google rejeita caminho relativo)
const urlAbsoluta = (u) => (u.startsWith('http') ? u : `${SITE_URL}${u.startsWith('/') ? '' : '/'}${u}`);

function generateSitemap() {
  try {
    const articlesData = JSON.parse(fs.readFileSync(ARTICLES_FILE, 'utf-8'));
    const articles = articlesData.articles || [];

    // Get published articles
    const publishedArticles = articles.filter(a => a.status === 'published');

    // Static pages
    const staticPages = [
      { url: '/', changefreq: 'daily', priority: '1.0' },
      { url: '/artigos/', changefreq: 'daily', priority: '0.9' },
      { url: '/sobre', changefreq: 'monthly', priority: '0.8' },
      { url: '/contato', changefreq: 'monthly', priority: '0.7' },
      { url: '/politica-privacidade', changefreq: 'yearly', priority: '0.5' },
      { url: '/termos-uso', changefreq: 'yearly', priority: '0.5' }
    ];

    // Build XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
`;

    // Add static pages
    staticPages.forEach(page => {
      xml += `
  <url>
    <loc>${SITE_URL}${page.url}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
    });

    // Add articles
    publishedArticles.forEach(article => {
      const pubDate = article.publishedAt
        ? new Date(article.publishedAt).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      xml += `
  <url>
    <loc>${esc(`${SITE_URL}/${article.slug}`)}</loc>
    <lastmod>${pubDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>`;

      // Add featured image
      if (article.featuredImage) {
        xml += `
    <image:image>
      <image:loc>${esc(urlAbsoluta(article.featuredImage))}</image:loc>
      <image:title>${esc(article.title)}</image:title>
      <image:caption>${esc(article.description)}</image:caption>
    </image:image>`;
      }

      xml += `
  </url>`;
    });

    xml += `
</urlset>`;

    // Write sitemap
    fs.writeFileSync(SITEMAP_FILE, xml);
    console.log(`✅ Sitemap gerado: ${publishedArticles.length} artigos + 5 páginas estáticas`);
    console.log(`   Arquivo: public/sitemap.xml`);

  } catch (error) {
    console.error('❌ Erro ao gerar sitemap:', error.message);
    process.exit(1);
  }
}

generateSitemap();
