import fs from 'node:fs';
import path from 'node:path';

export type ArtigoDireto = {
  slug: string;
  title: string;
  description: string;
  content: string;
  primaryKeyword: string;
  featuredImage?: string;
  imageAlt?: string;
  imageCredit?: { author: string; url: string; source: string };
  wordCount: number;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  status: 'published';
  origem: 'pasta-google';
  sources: { title: string; url: string }[];
  keywords: { primaryKeyword: string; secondaryKeywords: string[] };
};

const slugify = (value: string) => value.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const valor = (header: Map<string, string>, key: string, fallback = '') =>
  header.get(key)?.trim() || fallback;

export function carregarArtigosDiretos(): ArtigoDireto[] {
  const dir = path.resolve('data/entrada/google');
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt') && entry.name.toLowerCase() !== 'leia-me.txt')
    .flatMap((entry) => {
      try {
        const raw = fs.readFileSync(path.join(dir, entry.name), 'utf8').replace(/\r\n/g, '\n');
        const separator = raw.match(/^---\s*$/m);
        if (!separator || separator.index === undefined) return [];
        const headerText = raw.slice(0, separator.index);
        const content = raw.slice(separator.index + separator[0].length).trim();
        if (!content || !/<(?:p|h2|h3|ul|ol|blockquote|div)\b/i.test(content)) return [];

        const header = new Map<string, string>();
        const sources: { title: string; url: string }[] = [];
        for (const line of headerText.split('\n')) {
          const match = line.match(/^([A-Z][A-Z0-9_]*):\s*(.*)$/);
          if (!match) continue;
          if (match[1] === 'FONTE') {
            const parts = match[2].split('|').map((part) => part.trim()).filter(Boolean);
            const url = parts.at(-1) || '';
            if (/^https?:\/\//i.test(url)) sources.push({ title: parts.slice(0, -1).join(' — ') || url, url });
          } else header.set(match[1], match[2]);
        }

        const keyword = valor(header, 'PALAVRA_CHAVE', entry.name.replace(/\.txt$/i, ''));
        const slug = slugify(entry.name.replace(/\.txt$/i, '')) || slugify(keyword);
        const title = valor(header, 'TITLE', keyword);
        const description = valor(header, 'DESCRIPTION', title);
        const wordCount = content.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').trim().split(/\s+/).filter(Boolean).length;
        const publishedAt = valor(header, 'DATA_PUBLICACAO', valor(header, 'PUBLICADO_EM')) || undefined;
        const imageId = valor(header, 'CAPA_ID', valor(header, 'CAPA_PEXELS_ID'));
        const featuredImage = /^\d+$/.test(imageId) ? `https://images.pexels.com/photos/${imageId}/pexels-photo-${imageId}.jpeg?auto=compress&cs=tinysrgb&w=1200` : undefined;

        return [{
          slug, title, description, content, primaryKeyword: keyword,
          ...(featuredImage ? { featuredImage } : {}),
          imageAlt: valor(header, 'CAPA_ALT', title),
          wordCount, ...(publishedAt ? { publishedAt, createdAt: publishedAt, updatedAt: publishedAt } : {}),
          status: 'published' as const, origem: 'pasta-google' as const,
          sources, keywords: { primaryKeyword: keyword, secondaryKeywords: [] }
        }];
      } catch (error) {
        console.warn(`Não foi possível ler o artigo direto ${entry.name}:`, error);
        return [];
      }
    })
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
}
