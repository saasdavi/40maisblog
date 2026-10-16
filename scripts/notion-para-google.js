// scripts/notion-para-google.js
const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const PAGE_ID = process.env.NOTION_PAGE_ID;
const MAX_ARTIGOS = parseInt(process.env.MAX_ARTIGOS || '1', 10);
const FORCAR = process.env.FORCAR === 'sim';
const OUTPUT_DIR = 'data/entrada/google';

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`🔍 Buscando até ${MAX_ARTIGOS} artigo(s)...`);

  let response;
  try {
    response = await notion.blocks.children.list({
      block_id: PAGE_ID,
      page_size: MAX_ARTIGOS,
    });
  } catch (e) {
    console.error("Erro ao ler blocos. Verifique se o ID é de uma PÁGINA.");
    throw e;
  }

  let baixados = 0;
  for (const block of response.results) {
    if (block.type !== 'child_page') continue;

    const pageTitle = block.child_page.title;
    const safeName = pageTitle.replace(/[^a-z0-9áàâãéèêíïóôõöúçñ\s]/gi, '_').toLowerCase();
    const filePath = path.join(OUTPUT_DIR, `${safeName}.txt`);

    if (fs.existsSync(filePath) && !FORCAR) {
      console.log(`⏭️  Pulando "${pageTitle}" (já existe)`);
      continue;
    }

    const contentResponse = await notion.blocks.children.list({ block_id: block.id });
    let textContent = '';
    for (const child of contentResponse.results) {
      if (child.paragraph?.text) {
        textContent += child.paragraph.text.map(t => t.plain_text).join('') + '\n\n';
      } else if (child.heading_1?.text || child.heading_2?.text || child.heading_3?.text) {
         const h = child.heading_1 || child.heading_2 || child.heading_3;
         textContent += '# ' + h.text.map(t => t.plain_text).join('') + '\n\n';
      }
    }

    if (textContent.trim()) {
        fs.writeFileSync(filePath, textContent.trim(), 'utf-8');
        console.log(`✅ Salvo: ${filePath}`);
        baixados++;
    }
  }
  console.log(`🏁 Conclusão: ${baixados} artigo(s) processado(s).`);
}

main().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
