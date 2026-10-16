// Temas (categorias) do blog. As regras ficam em data/temas-regras.json (as mesmas usadas por scripts/mapear-categorias.js).
// Um artigo vira tema pela palavra-chave e pelo título; sem regra que case, cai em "Saúde geral".
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { carregarArtigosDiretos } from './artigos-diretos';

export interface Tema { slug: string; nome: string; descricao: string }
interface Regras { temas: Tema[]; regras: { tema: string; padrao: string }[] }

const dados: Regras = JSON.parse(readFileSync(resolve('data/temas-regras.json'), 'utf-8'));
const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const regs = dados.regras.map((r) => ({ tema: r.tema, re: new RegExp(norm(r.padrao)) }));
export const TEMAS: Tema[] = dados.temas;
const GERAL = TEMAS.find((t) => t.slug === 'saude-geral') as Tema;

export function temaDe(texto: string): Tema {
  const slug = (regs.find((r) => r.re.test(norm(texto))) || { tema: 'saude-geral' }).tema;
  return TEMAS.find((t) => t.slug === slug) || GERAL;
}

export interface ArtigoLista {
  slug: string; title: string; description: string; featuredImage: string; imageAlt?: string;
  wordCount?: number; publishedAt?: string; tema: Tema;
}

// Artigos publicados, do mais novo para o mais antigo.
export function artigosPublicados(): ArtigoLista[] {
  let antigos: ArtigoLista[] = [];
  try {
    const dadosArt = JSON.parse(readFileSync(resolve('data/articles.json'), 'utf-8'));
    antigos = (dadosArt.articles || [])
      .filter((a: any) => a.status === 'published' && a.slug)
      .map((a: any) => ({ slug: a.slug, title: a.title, description: a.description, featuredImage: a.featuredImage || '/images/hero-bg.svg', imageAlt: a.imageAlt, wordCount: a.wordCount, publishedAt: a.publishedAt || a.createdAt, tema: temaDe(`${a.primaryKeyword || ''} ${a.title}`) }));
  } catch {
    console.warn('Arquivo legado articles.json indisponível; usando artigos da pasta Google.');
  }

  const diretos: ArtigoLista[] = carregarArtigosDiretos().map((a) => ({
    slug: a.slug, title: a.title, description: a.description,
    featuredImage: a.featuredImage || '/images/hero-bg.svg', imageAlt: a.imageAlt,
    wordCount: a.wordCount, publishedAt: a.publishedAt,
    tema: temaDe(`${a.primaryKeyword} ${a.title}`)
  }));
  const slugsDiretos = new Set(diretos.map((a) => a.slug));
  return [...diretos, ...antigos.filter((a) => !slugsDiretos.has(a.slug))]
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
}

// Temas que já têm pelo menos um artigo publicado (com contagem), para o menu e as páginas de tema.
export function temasComArtigos(artigos: ArtigoLista[]): (Tema & { total: number })[] {
  return TEMAS.map((t) => ({ ...t, total: artigos.filter((a) => a.tema.slug === t.slug).length })).filter((t) => t.total > 0);
}
