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
  origem: 'pasta-google' | 'notion';
  sources: { title: string; url: string }[];
  keywords: { primaryKeyword: string; secondaryKeywords: string[] };
};

const slugify = (value: string) => value.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const valor = (header: Map<string, string>, key: string, fallback = '') =>
  header.get(key)?.trim() || fallback;

// Lê o texto de um artigo (cabeçalho KEY: valor, linha ---, corpo em HTML).
// Usado pelos arquivos de data/entrada/google e pelo texto guardado no Notion.
// Sem data de publicação (cabeçalho ou fallback), o artigo não vira página.
export function parseArtigoTexto(raw: string, nome: string, dataFallback?: string, origem: ArtigoDireto['origem'] = 'pasta-google'): ArtigoDireto | null {
  const texto = raw.replace(/\r\n/g, '\n');
  const separator = texto.match(/^---\s*$/m);
  if (!separator || separator.index === undefined) return null;
  const headerText = texto.slice(0, separator.index);
  const content = texto.slice(separator.index + separator[0].length).trim();
  if (!content || !/<(?:p|h2|h3|ul|ol|blockquote|div)\b/i.test(content)) return null;

  const header = new Map<string, string>();
  const sources: { title: string; url: string }[] = [];
  for (const line of headerText.split('\n')) {
    const match = line.match(/^([A-Z][A-Z0-9_]*):\s*(.*)$/);
    if (!match) continue;
    if (match[1] === 'FONTE') {
      const parts = match[2].split('|').map((part) => part.trim()).filter(Boolean);
      const url = parts.length ? parts[parts.length - 1] : '';
      if (/^https?:\/\//i.test(url)) sources.push({ title: parts.slice(0, -1).join(' — ') || url, url });
    } else header.set(match[1], match[2]);
  }

  const nomeSemExtensao = nome.replace(/\.txt$/i, '');
  const keyword = valor(header, 'PALAVRA_CHAVE', nomeSemExtensao);
  const slug = slugify(nomeSemExtensao) || slugify(keyword);
  const title = valor(header, 'TITLE', keyword);
  const description = valor(header, 'DESCRIPTION', title);
  const wordCount = content.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  // DATA_PUBLICACAO é o que marca o artigo como publicado (scripts/publicar-direto.js a carimba).
  const publishedAt = valor(header, 'DATA_PUBLICACAO', valor(header, 'PUBLICADO_EM', dataFallback || ''));
  if (!publishedAt) return null;

  const imageId = valor(header, 'CAPA_ID', valor(header, 'CAPA_PEXELS_ID'));
  // CAPA_URL vale para qualquer banco de fotos; CAPA_ID é o atalho do Pexels.
  const capaUrl = valor(header, 'CAPA_URL');
  const featuredImage = /^(?:https?:\/\/|\/)/i.test(capaUrl) ? capaUrl
    : /^\d+$/.test(imageId) ? `https://images.pexels.com/photos/${imageId}/pexels-photo-${imageId}.jpeg?auto=compress&cs=tinysrgb&w=1200`
    : undefined;
  // CAPA_CREDITO: "Autor | url | Fonte" (a licença dos bancos de fotos pede atribuição).
  const partesCredito = valor(header, 'CAPA_CREDITO').split('|').map((parte) => parte.trim()).filter(Boolean);
  const imageCredit = partesCredito.length >= 3
    ? { author: partesCredito[0], url: partesCredito[1], source: partesCredito[2] }
    : undefined;

  return {
    slug, title, description, content, primaryKeyword: keyword,
    ...(featuredImage ? { featuredImage } : {}),
    ...(imageCredit ? { imageCredit } : {}),
    imageAlt: valor(header, 'CAPA_ALT', title),
    wordCount, publishedAt, createdAt: publishedAt, updatedAt: publishedAt,
    status: 'published', origem,
    sources, keywords: { primaryKeyword: keyword, secondaryKeywords: [] }
  };
}
