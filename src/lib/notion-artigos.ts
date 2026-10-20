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

// Foto de capa pela palavra-chave, tentando Pexels, Pixabay e Unsplash nessa ordem.
// Cada API só é usada se a chave correspondente existir (PEXELS_API_KEY, PIXABAY_API_KEY, UNSPLASH_ACCESS_KEY).
// Sem nenhuma foto, o artigo não entra no site.
const CHAVE_PEXELS = (process.env.PEXELS_API_KEY || '').trim();
const CHAVE_PIXABAY = (process.env.PIXABAY_API_KEY || '').trim();
const CHAVE_UNSPLASH = (process.env.UNSPLASH_ACCESS_KEY || '').trim();

type Foto = NonNullable<ArtigoDireto['imageCredit']> & { imagem: string };

async function fotoPexels(palavra: string): Promise<Foto | null> {
  if (!CHAVE_PEXELS) return null;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(palavra)}&per_page=1&orientation=landscape&locale=pt-BR`;
  const foto = (await (await fetch(url, { headers: { Authorization: CHAVE_PEXELS } })).json()).photos?.[0];
  if (!foto) return null;
  return { imagem: foto.src?.large2x || foto.src?.large, author: foto.photographer, url: foto.photographer_url, source: 'Pexels' };
}

async function fotoPixabay(palavra: string): Promise<Foto | null> {
  if (!CHAVE_PIXABAY) return null;
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(CHAVE_PIXABAY)}&q=${encodeURIComponent(palavra)}&lang=pt&image_type=photo&orientation=horizontal&per_page=3&safesearch=true`;
  const foto = (await (await fetch(url)).json()).hits?.[0];
  if (!foto) return null;
  return { imagem: foto.largeImageURL, author: foto.user, url: foto.pageURL, source: 'Pixabay' };
}

async function fotoUnsplash(palavra: string): Promise<Foto | null> {
  if (!CHAVE_UNSPLASH) return null;
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(palavra)}&per_page=1&orientation=landscape`;
  const foto = (await (await fetch(url, { headers: { Authorization: `Client-ID ${CHAVE_UNSPLASH}` } })).json()).results?.[0];
  if (!foto) return null;
  // Regra do Unsplash: avisar o download da foto ao usá-la.
  await fetch(foto.links.download_location, { headers: { Authorization: `Client-ID ${CHAVE_UNSPLASH}` } });
  return { imagem: foto.urls.regular, author: foto.user.name, url: foto.user.links.html, source: 'Unsplash' };
}

async function preencherCapa(artigo: ArtigoDireto, palavra: string) {
  for (const buscar of [fotoPexels, fotoPixabay, fotoUnsplash]) {
    try {
      const foto = await buscar(palavra);
      if (!foto) continue;
      artigo.featuredImage = foto.imagem;
      artigo.imageAlt = artigo.title;
      artigo.imageCredit = { author: foto.author, url: foto.url, source: foto.source };
      return;
    } catch (erro) {
      console.warn(`Busca de foto falhou para "${palavra}":`, erro);
    }
  }
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
        // Sem CAPA no texto, busca foto pela palavra-chave (Pexels, Pixabay, Unsplash). Sem foto, o artigo não entra.
        if (!artigo.featuredImage) await preencherCapa(artigo, palavra);
        if (artigo.featuredImage) artigos.push(artigo);
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
