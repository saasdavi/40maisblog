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

// Capa vem pronta do Notion: campos "Capa URL" (link https) e "Capa crédito" (JSON com author, url, source).
// A busca de foto (Pexels, Pixabay, Unsplash) roda no Activepieces, na aprovação, e não aqui.
// O build só lê os campos: nenhuma chamada de API de imagem, então o deploy não pesa.
function capaDoCalendario(props: Record<string, any>): Pick<ArtigoDireto, 'featuredImage' | 'imageCredit'> | null {
  const url: string = props['Capa URL']?.url || '';
  if (!/^https:\/\//.test(url)) return null;
  let credito: ArtigoDireto['imageCredit'];
  try {
    const c = JSON.parse(texto(props['Capa crédito']?.rich_text));
    if (c?.author && c?.source) credito = { author: c.author, url: c.url || '', source: c.source };
  } catch {
    credito = undefined;
  }
  return { featuredImage: url, imageCredit: credito };
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
        // Data + Horário com o fuso de Brasília. Só a data viraria meia-noite UTC e apareceria no dia anterior.
        const dia: string | undefined = props['Data']?.date?.start;
        const hora: string = props['Horário']?.select?.name || '00:00';
        const data = dia ? `${dia}T${hora}:00-03:00` : undefined;
        const artigo = parseArtigoTexto(conteudo, `${palavra}.txt`, data, 'notion');
        if (!artigo) continue;
        // Sem CAPA no texto, usa a capa já gravada no Notion. Sem capa, o artigo não entra.
        if (!artigo.featuredImage) {
          const capa = capaDoCalendario(props);
          if (!capa) {
            console.warn(`Artigo "${palavra}" sem capa no Notion (Capa URL vazia): fica de fora até o Activepieces preencher.`);
            continue;
          }
          Object.assign(artigo, capa, { imageAlt: artigo.title });
        }
        artigos.push(artigo);
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
