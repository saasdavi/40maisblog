// Sincroniza um JSON SERP com a página de pesquisas do Notion sem criar duplicatas.
import fs from 'node:fs';

const keyword = (process.env.PALAVRA || '').trim();
const notionKey = (process.env.NOTION_API_KEY || '').trim();
const parentPageId = '3fa242e3913c81918cd1d38f9d54ecca';
const folder = 'data/entrada/pautas-chat_01/resposta';

function slug(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function notionRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${notionKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Notion API ${response.status}: ${result.message || result.code || 'erro desconhecido'}`);
  return result;
}

async function main() {
  if (!keyword) throw new Error('PALAVRA vazia; não é possível identificar a pesquisa.');
  if (!notionKey) throw new Error('NOTION_API_KEY ausente; envio cancelado.');
  const path = `${folder}/${slug(keyword)}.json`;
  if (!fs.existsSync(path)) throw new Error(`Arquivo de pesquisa não encontrado: ${path}`);
  const raw = fs.readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  const title = `Pesquisa SERP — ${data.palavra || keyword} — ${data.data || 'data não informada'}`;

  const existing = await notionRequest('https://api.notion.com/v1/search', {
    method: 'POST',
    body: JSON.stringify({ query: title, page_size: 100 })
  });
  const duplicate = (existing.results || []).find((page) => {
    const pageTitle = (page.properties?.title?.title || page.properties?.Name?.title || [])
      .map((part) => part.plain_text || part.text?.content || '').join('');
    const parent = (page.parent?.page_id || '').replace(/-/g, '');
    return page.object === 'page' && parent === parentPageId && pageTitle === title;
  });
  if (duplicate) {
    console.log(`Já existe no Notion; nenhuma duplicata criada: ${title} — ${duplicate.url}`);
    return;
  }

  const richText = [];
  for (let i = 0; i < raw.length; i += 1800) richText.push({ type: 'text', text: { content: raw.slice(i, i + 1800) } });
  if (richText.length > 100) throw new Error('JSON excede o limite de 100 trechos; envio cancelado para evitar perda de conteúdo.');

  const body = {
    parent: { type: 'page_id', page_id: parentPageId },
    properties: { title: { title: [{ type: 'text', text: { content: title.slice(0, 1800) } }] } },
    children: [
      { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `Palavra-chave: ${data.palavra || keyword} | Data: ${data.data || 'não informada'} | Origem: SerpAPI — Google Brasil | Arquivo: ${path}` } }] } },
      { object: 'block', type: 'code', code: { language: 'json', rich_text: richText } }
    ]
  };
  const result = await notionRequest('https://api.notion.com/v1/pages', { method: 'POST', body: JSON.stringify(body) });
  console.log(`Pesquisa completa enviada ao Notion: ${title} — ${result.url}`);
}

main().catch((error) => {
  console.error('ERRO ao sincronizar pesquisa com o Notion:', error.message);
  process.exit(1);
});
