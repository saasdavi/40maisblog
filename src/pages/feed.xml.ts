// Feed RSS 2.0 dos artigos publicados. Gerado no build, em /feed.xml (/feed é redirecionado por vercel.json).
import type { APIRoute } from 'astro';
import { SITE } from '../config/site';
import { artigosPublicados } from '../lib/temas';

const ITENS = 50;

const escapaXml = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Imagem de capa do artigo: testa os nomes de campo mais comuns.
const imagemDoArtigo = (a: any): string => {
  const img = a.imagem ?? a.image ?? a.cover ?? a.featuredImage ?? '';
  if (!img) return '';
  try {
    return new URL(String(img), SITE.url).href;
  } catch {
    return '';
  }
};

export const GET: APIRoute = () => {
  const artigos = artigosPublicados().slice(0, ITENS);
  const ultimo = artigos[0]?.publishedAt ? new Date(artigos[0].publishedAt) : new Date();

  const itens = artigos
    .map((a) => {
      const link = new URL(`/${a.slug}`, SITE.url).href;
      const pubDate = a.publishedAt ? new Date(a.publishedAt).toUTCString() : '';
      const imagem = imagemDoArtigo(a);
      return `    <item>
      <title>${escapaXml(a.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${escapaXml(a.description)}</description>
      <category>${escapaXml(a.tema.nome)}</category>${imagem ? `
      <enclosure url="${escapaXml(imagem)}" type="image/jpeg" />` : ''}${pubDate ? `
      <pubDate>${pubDate}</pubDate>` : ''}
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapaXml(SITE.name)}</title>
    <link>${SITE.url}/</link>
    <description>${escapaXml(SITE.description)}</description>
    <language>${SITE.lang}</language>
    <lastBuildDate>${ultimo.toUTCString()}</lastBuildDate>
    <atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml" />
${itens}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
