// Envia a pesquisa SERP recém-gerada para a página dedicada de pesquisas no Notion.
// Requer NOTION_API_KEY com acesso à página "Pesquisas SerpAPI — Arquivo de pesquisas".
// Só é chamado quando o JSON da pesquisa foi alterado nesta execução.
import fs from 'node:fs';

const keyword = (process.env.PALAVRA || '').trim();
const notionKey = (process.env.NOTION_API_KEY || '').trim();
const parentPageId = '3fa242e3913c81918cd1d38f9d54ecca';
const folder = 'data/entrada/pautas-chat_01/resposta';

function slug(value) {
  // Remover marcas Unicode sem faixas ambíguas: preserva todas as letras ASCII.
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  if (!keyword) throw new Error('PALAVRA vazia; não é possível identificar a pesquisa.');
  if (!notionKey) {
    throw new Error('NOTION_API_KEY ausente: a pesquisa não pode ser enviada ao Notion. Configure o secret no repositório.');
  }

  const path = `${folder}/${slug(keyword)}.json`;
  if (!fs.existsSync(path)) throw new Error(`Arquivo de pesquisa não encontrado: ${path}`);
  const raw = fs.readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  const title = `Pesquisa SERP — ${data.palavra || keyword} — ${data.data || new Date().toISOString().slice(0, 10)}`;

  // A API do Notion limita cada trecho de texto a 2.000 caracteres.
  const richText = [];
  for (let i = 0; i < raw.length; i += 1800) {
    richText.push({ type: 'text', text: { content: raw.slice(i, i + 1800) } });
  }
  if (richText.length > 100) {
    throw new Error('Pesquisa JSON excede o limite de 100 trechos de texto do Notion; não foi enviada para evitar perda de conteúdo.');
  }

  const body = {
    parent: { type: 'page_id', page_id: parentPageId },
    properties: {
      title: { title: [{ type: 'text', text: { content: title.slice(0, 1800) } }] }
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `Palavra-chave: ${data.palavra || keyword} | Data: ${data.data || 'não informada'} | Origem: SerpAPI — Google Brasil` } }]
        }
      },
      {
        object: 'block',
        type: 'code',
        code: { language: 'json', rich_text: richText }
      }
    ]
  };

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json();
  if (!response.ok) {
    const message = result.message || result.code || `HTTP ${response.status}`;
    throw new Error(`Notion API recusou a pesquisa (${response.status}): ${message}`);
  }
  console.log(`Pesquisa completa enviada ao Notion: ${title} — ${result.url}`);
}

main().catch((error) => {
  console.error('ERRO ao enviar pesquisa ao Notion:', error.message);
  process.exit(1);
});
