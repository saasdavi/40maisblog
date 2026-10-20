import fs from 'node:fs';
import path from 'node:path';
import { parseArtigoTexto, type ArtigoDireto } from './artigo-texto';
import { artigosDoNotion } from './notion-artigos';

export type { ArtigoDireto } from './artigo-texto';

// Artigos do Notion (calendário agendado pelo Activepieces) e, como reserva, os arquivos de data/entrada/google.
// Se o mesmo slug existir nos dois, vence o Notion.
export function carregarArtigosDiretos(): ArtigoDireto[] {
  const dir = path.resolve('data/entrada/google');
  const doArquivo: ArtigoDireto[] = !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt') && entry.name.toLowerCase() !== 'leia-me.txt')
    .flatMap((entry) => {
      try {
        const raw = fs.readFileSync(path.join(dir, entry.name), 'utf8');
        const artigo = parseArtigoTexto(raw, entry.name);
        return artigo ? [artigo] : [];
      } catch (error) {
        console.warn(`Não foi possível ler o artigo direto ${entry.name}:`, error);
        return [];
      }
    });

  const slugsDoNotion = new Set(artigosDoNotion.map((a) => a.slug));
  return [...artigosDoNotion, ...doArquivo.filter((a) => !slugsDoNotion.has(a.slug))]
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
}
