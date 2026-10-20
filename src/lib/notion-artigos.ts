import { parseArtigoTexto, type ArtigoDireto } from './artigo-texto';

// Artigos que o Activepieces agendou no Calendário editorial do Notion.
// Só entram as linhas com status "Publicando" ou "Publicado". O texto vem da página da Fila de Artigos
// (campo "Conteúdo TXT completo"). Sem NOTION_API_KEY, ou se o Notion falhar, a lista fica vazia
// e o build segue só com os arquivos de data/entrada/google.

const CALENDARIO_ID = '58068a6e36fa41788de974dae56f1a4c';
const NOTION = 'https://api.notion.com/v1';
const CHAVE = (process.env.NOTION_API_KEY || '').trim();

async function pedir(url: string, metodo: 'GET' | 'POST', corpo?: unknown) {
  const resposta = await fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${CHAVE}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`Notion (${resposta.status}): ${json.message || 'erro'}`);
  return json;
}

const texto = (rich: { plain_text?: string }[] = []) => rich.map((r) => r.plain_text ?? '').join('');

async function linhasDoCalendario() {
  const linhas: any[] = [];
  let cursor: string | undefined;
  do {
    const r = await pedir(`${NOTION}/databases/${CALENDARIO_ID}/query`, 'POST', {
      page_size: 100,
      start_cursor: cursor,
      filter: {
        or: [
          { property: 'Status', select: { equals: 'Publicando' } },
          { property: 'Status', select: { equals: 'Publicado' } },
        ],
      },
      sorts: [{ property: 'Data', direction: 'ascending' }],
    });
    linhas.push(...(r.results || []));
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return linhas;
}

async function carregarDoNotion(): Promise<ArtigoDireto[]> {
  if (!CHAVE) {
    console.warn('NOTION_API_KEY ausente: build sem artigos do Notion.');
    return [];
  }
  try {
    const artigos: ArtigoDireto[] = [];
    for (const linha of await linhasDoCalendario()) {
      try {
        const props = linha.properties;
        const link: string = props['Artigo na Fila']?.url || '';
        const id = link.match(/([0-9a-f]{32})/i)?.[1];
        if (!id) continue;
        const fila = await pedir(`${NOTION}/pages/${id}`, 'GET');
        const conteudo = texto(fila.properties?.['Conteúdo TXT completo']?.rich_text);
        const palavra = texto(props['Palavra-chave']?.rich_text) || id;
        const data: string | undefined = props['Data']?.date?.start;
        const artigo = parseArtigoTexto(conteudo, `${palavra}.txt`, data, 'notion');
        // Só entra com foto, como combinado.
        if (artigo && artigo.featuredImage) artigos.push(artigo);
      } catch (erro) {
        console.warn('Artigo do calendário ignorado:', erro);
      }
    }
    return artigos;
  } catch (erro) {
    console.warn('Não foi possível ler o calendário do Notion; usando só os arquivos.', erro);
    return [];
  }
}

export const artigosDoNotion: ArtigoDireto[] = await carregarDoNotion();
