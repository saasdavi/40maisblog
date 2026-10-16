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
  // Garante que a pasta de saída existe
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`[INFO] Buscando ate ${MAX_ARTIGOS} artigo(s) do Notion...`);

  let response;
  try {
    response = await notion.blocks.children.list({
      block_id: PAGE_ID,
      page_size: MAX_ARTIGOS,
    });
  } catch (e) {
    console.error(`[ERRO] Falha ao ler blocos da pagina ${PAGE_ID}. Verifique se o ID e valido e se a chave API tem permissao.`);
    throw e;
  }

  if (!response.results || response.results.length === 0) {
    console.log('[INFO] Nenhum bloco encontrado nesta pagina.');
    return;
  }

  let baixados = 0;

  for (const block of response.results) {
    // Processa apenas paginas filhas
    if (block.type !== 'child_page') continue;
    
    const pageTitle = block.child_page?.title;
    if (!pageTitle) {
      console.log('[AVISO] Bloco ignorado: sem titulo.');
      continue;
    }

    // Regex segura: remove acentos, espacos e caracteres especiais, substituindo por _
    // Ex: "Como Perder Peso!" vira "como_perder_peso"
    const safeName = pageTitle
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-zA-Z0-9\s]/g, '')                   // Remove caracteres especiais
      .trim()
      .replace(/\s+/g, '_')                              // Espacos viram underline
      .toLowerCase();

    const filePath = path.join(OUTPUT_DIR, `${safeName}.txt`);

    // Pula se ja existe e nao esta forcando
    if (fs.existsSync(filePath) && !FORCAR) {
      console.log(`[PULO] "${pageTitle}" ja existe em ${filePath}`);
      continue;
    }

    // Busca conteudo interno da pagina filha
    try {
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

      // Salva apenas se houver conteudo
      if (textContent.trim()) {
        fs.writeFileSync(filePath, textContent.trim(), 'utf-8');
        console.log(`[OK] Salvo: ${filePath}`);
        baixados++;
      } else {
        console.log(`[AVISO] Pagina "${pageTitle}" esta vazia.`);
      }
    } catch (err) {
      console.error(`[ERRO] Falha ao ler conteudo de "${pageTitle}": ${err.message}`);
    }
  }

  console.log(`[FIM] Processo concluido. ${baixados} artigo(s) processado(s).`);
}

main().catch(err => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
