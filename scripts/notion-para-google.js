#!/usr/bin/env node
/**
 * notion-para-google.js — baixa artigos prontos do Notion para data/entrada/google/
 *
 * O artigo no Notion deve ser uma SUBPÁGINA da página mãe (NOTION_PAGE_ID), com o
 * MESMO conteúdo de um .txt do contrato `data/entrada/google/LEIA-ME.md`:
 *   - cabeçalho: PALAVRA_CHAVE:, TITLE:, DESCRIPTION:, CAPA_ALT:, FONTE:, NOTA_CHAT: ...
 *   - uma linha só com "---" separando o cabeçalho do corpo
 *   - corpo em HTML simples (<p> <h2> <h3> <ul> <li> <strong> ...) ou texto puro
 *
 * Uso:  NOTION_API_KEY=secret NOTION_PAGE_ID=3eb3...8f64 node scripts/notion-para-google.js
 * Variáveis: MAX_ARTIGOS (padrão 1) | FORCAR=sim (rebaixa artigos que já existem)
 * Sem dependências externas: usa fetch nativo (Node >= 18).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'data', 'entrada', 'google');

const NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();
const NOTION_PAGE_ID = (process.env.NOTION_PAGE_ID || '').trim().replace(/-/g, '');
const MAX_ARTIGOS = Math.max(1, parseInt(process.env.MAX_ARTIGOS || '1', 10) || 1);
const FORCAR = process.env.FORCAR === 'sim';
const NOME_BASE = (process.env.NOME_BASE || 'Fila de Artigos').trim();

// ---------- helpers Notion ----------
async function notionRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.message || result.code || `HTTP ${response.status}`;
    throw new Error(`Notion API recusou a operação (${response.status}): ${message}`);
  }
  return result;
}

// Lista TODOS os blocos filhos, seguindo a paginação (cursor) — a API devolve no máx. 100 por chamada.
async function listarBlocosFilhos(blockId) {
  const todos = [];
  let cursor;
  do {
    const query = new URLSearchParams({ page_size: '100' });
    if (cursor) query.set('start_cursor', cursor);
    const result = await notionRequest(
      `https://api.notion.com/v1/blocks/${blockId}/children?${query.toString()}`
    );
    todos.push(...(result.results || []));
    cursor = result.has_more ? result.next_cursor : undefined;
  } while (cursor);
  return todos;
}

const richText = (block) => {
  const tipo = block[block.type];
  const rt = tipo?.rich_text || tipo?.title || [];
  return rt.map((t) => t.plain_text ?? '').join('');
};

// ---------- nome do arquivo ----------
function slugTitulo(titulo) {
  return String(titulo)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')           // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')               // espaços/especiais viram hífen
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function caminhoDisponivel(slug) {
  // "palavra-chave.txt"; se já existir, evita sobrescrever outro artigo com "palavra-chave-2.txt"
  let nome = `${slug}.txt`;
  let n = 2;
  while (fs.existsSync(path.join(OUTPUT_DIR, nome)) && !FORCAR) {
    nome = `${slug}-${n++}.txt`;
    if (n > 50) return null; // excesso de duplicatas: desiste desta página
  }
  return nome;
}

// ---------- conversão dos blocos do Notion para o formato .txt ----------
function blocosParaTexto(blocks) {
  const linhas = [];
  let emLista = null; // 'ul' | 'ol' | null

  const fechaLista = () => {
    if (emLista) {
      linhas.push(emLista === 'ul' ? '</ul>' : '</ol>');
      emLista = null;
    }
  };
  const abreLista = (tipo) => {
    if (emLista !== tipo) {
      fechaLista();
      linhas.push(tipo === 'ul' ? '<ul>' : '<ol>');
      emLista = tipo;
    }
  };

  for (const block of blocks) {
    const texto = richText(block).trim();
    switch (block.type) {
      case 'paragraph':
        fechaLista();
        // bloco vazio ainda conta como linha: preserva o "---" separado em blocos próprios
        linhas.push(texto);
        break;
      case 'heading_1':
        fechaLista();
        // corpo não pode ter <h1> (regra do importador): Heading 1 vira H2
        linhas.push(texto ? `<h2>${texto}</h2>` : '');
        break;
      case 'heading_2':
        fechaLista();
        linhas.push(texto ? `<h2>${texto}</h2>` : '');
        break;
      case 'heading_3':
        fechaLista();
        linhas.push(texto ? `<h3>${texto}</h3>` : '');
        break;
      case 'bulleted_list_item':
        abreLista('ul');
        if (texto) linhas.push(`<li>${texto}</li>`);
        break;
      case 'numbered_list_item':
        abreLista('ol');
        if (texto) linhas.push(`<li>${texto}</li>`);
        break;
      case 'to_do':
        abreLista('ul');
        if (texto) linhas.push(`<li>${texto}</li>`);
        break;
      case 'quote':
        fechaLista();
        if (texto) linhas.push(`<blockquote>${texto}</blockquote>`);
        break;
      case 'code':
        fechaLista();
        if (texto) linhas.push(texto); // código: conteúdo cru (ex.: HTML colado pelo redator)
        break;
      case 'callout':
        fechaLista();
        if (texto) linhas.push(texto);
        break;
      case 'divider':
        fechaLista();
        linhas.push('---');
        break;
      default:
        // child_page, image, embed etc.: ignorados silenciosamente
        break;
    }
  }
  fechaLista();
  return linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Se o corpo não veio com tags HTML (comum ao colar do Notion), converte texto puro em HTML simples.
// O cabeçalho (antes da linha "---") é preservado cru: são pares CAMPO: valor de uma linha cada.
function converterCorpo(texto) {
  if (/<p>|<h2>/i.test(texto)) return texto; // já vem formatado pelo redator
  const linhas = texto.split('\n');
  const out = [];
  let paragrafo = [];       // linhas de texto corrido acumuladas
  let itens = [];           // itens consecutivos de lista (- / • / *)
  const flushParagrafo = () => {
    if (paragrafo.length) { out.push(`<p>${paragrafo.join(' ').trim()}</p>`); paragrafo = []; }
  };
  const flushItens = () => {
    if (itens.length) { out.push(`<ul>${itens.map((t) => `<li>${t}</li>`).join('')}</ul>`); itens = []; }
  };
  for (const raw of linhas) {
    const l = raw.trim();
    if (!l) { flushParagrafo(); flushItens(); continue; } // linha em branco fecha tudo
    const li = l.match(/^[-•*]\s+(.+)$/);
    if (li) { flushParagrafo(); itens.push(li[1].trim()); continue; }
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushParagrafo(); flushItens();
      const nivel = h[1].length; // # vira h2 (o h1 é o título do artigo)
      out.push(`<h${Math.min(nivel + 1, 3)}>${h[2]}</h${Math.min(nivel + 1, 3)}>`);
      continue;
    }
    flushItens();
    paragrafo.push(l);
  }
  flushParagrafo(); flushItens();
  return out.join('\n');
}

function garantirHtml(conteudo) {
  const m = conteudo.match(/^([\s\S]*?)^\s*---\s*\n+([\s\S]*)$/m);
  if (!m) return converterCorpo(conteudo);
  return `${m[1].trimEnd()}\n---\n${converterCorpo(m[2])}`;
}

// Validação mínima do contrato LEIA-ME.md antes de gravar (evita lixo na fila de publicação).
function validarConteudo(texto, pageTitle) {
  const problemas = [];
  const corpo = texto.includes('\n---\n') || texto.startsWith('---\n')
    ? texto.split(/\n---\n|^---\n/)[1] || ''
    : '';
  if (!/^PALAVRA_CHAVE:\s*.+/im.test(texto)) problemas.push('sem campo PALAVRA_CHAVE:');
  if (!corpo.trim()) problemas.push('sem separador "---" seguido de corpo (contrato LEIA-ME.md)');
  if (problemas.length) {
    console.log(`[AVISO] "${pageTitle}" NÃO segue o contrato de data/entrada/google/LEIA-ME.md: ${problemas.join('; ')}. Salvo mesmo assim para revisão manual.`);
  }
  return problemas;
}


// ---------- base de dados (a "Fila de Artigos") ----------
// Cada linha é um artigo: "Conteúdo TXT completo" traz o .txt pronto, e "Caminho no GitHub" marca
// o que já foi movido para data/entrada/google/. CAMPO_APROVADO (opcional) é o nome de uma coluna
// de aprovação: só entra a linha em que ela estiver marcada (checkbox), "sim" ou "aprovado".
const CAMPO_APROVADO = (process.env.CAMPO_APROVADO || '').trim();
const textoDaProp = (prop) => (prop?.title || prop?.rich_text || []).map((t) => t.plain_text ?? '').join('');
const aprovada = (prop) => {
  if (!prop) return false;
  if (prop.checkbox === true) return true;
  if (prop.select?.name) return /aprovad|sim/i.test(prop.select.name);
  return /^(sim|aprovado)$/i.test(textoDaProp(prop).trim());
};

async function consultarBase(databaseId) {
  const todas = [];
  let cursor;
  do {
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const result = await notionRequest(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    todas.push(...(result.results || []));
    cursor = result.has_more ? result.next_cursor : undefined;
  } while (cursor);
  return todas;
}

// Acha a base pelo nome: primeiro entre os filhos diretos da página mãe; se não estiver lá
// (ex.: dentro de outra subpágina), procura entre as bases que a integração enxerga.
async function localizarBases(blocks) {
  const diretas = blocks.filter((b) => b.type === 'child_database');
  if (diretas.length) return diretas.map((b) => b.id);

  const busca = await notionRequest('https://api.notion.com/v1/search', {
    method: 'POST',
    body: JSON.stringify({ query: NOME_BASE, filter: { property: 'object', value: 'database' }, page_size: 20 }),
  });
  const encontradas = (busca.results || []).filter(
    (db) => textoDaProp(db).trim().toLowerCase() === NOME_BASE.toLowerCase()
  );
  for (const db of encontradas) console.log(`[INFO] Base "${NOME_BASE}" encontrada fora dos filhos diretos: ${db.id}`);
  return encontradas.map((db) => db.id);
}

const descreverBloco = (b) => (b[b.type]?.title ? `${b.type} "${b[b.type].title}"` : b.type);

async function importarDaBase(databaseId) {
  const linhas = await consultarBase(databaseId);
  console.log(`[INFO] Base com ${linhas.length} registro(s).`);
  if (!linhas.length) {
    console.error(`[ERRO] A base "${NOME_BASE}" (${databaseId}) não tem nenhuma linha. Confira se a integração enxerga as linhas.`);
    process.exit(1);
  }
  let baixados = 0, pulados = 0, falhas = 0;
  for (const row of linhas) {
    if (baixados >= MAX_ARTIGOS) {
      console.log(`[INFO] Limite de MAX_ARTIGOS=${MAX_ARTIGOS} atingido.`);
      break;
    }
    const props = row.properties || {};
    const palavra = textoDaProp(props['PALAVRA_CHAVE']).trim();
    const conteudo = textoDaProp(props['Conteúdo TXT completo']).trim();
    if (!palavra || !conteudo) { pulados++; continue; }
    if (textoDaProp(props['Caminho no GitHub']).trim()) { pulados++; continue; } // já movido
    if (CAMPO_APROVADO && !aprovada(props[CAMPO_APROVADO])) { pulados++; continue; }

    const slug = slugTitulo(palavra);
    const jaExiste = fs.readdirSync(OUTPUT_DIR).some((f) => f === `${slug}.txt` || new RegExp(`^${slug}(-\\d+)?\\.txt$`).test(f));
    if (jaExiste && !FORCAR) { console.log(`[PULO] "${palavra}" já está na pasta (slug "${slug}").`); pulados++; continue; }

    try {
      const nome = caminhoDisponivel(slug);
      if (!nome) { console.log(`[AVISO] Muitas duplicatas para "${slug}".`); falhas++; continue; }
      validarConteudo(conteudo, palavra);
      const filePath = path.join(OUTPUT_DIR, nome);
      fs.writeFileSync(filePath, conteudo + '\n', 'utf-8');
      const caminhoRel = path.relative(ROOT, filePath);
      await notionRequest(`https://api.notion.com/v1/pages/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: { 'Caminho no GitHub': { rich_text: [{ text: { content: caminhoRel } }] } } }),
      });
      console.log(`[OK] Movido para ${caminhoRel} e marcado no Notion.`);
      baixados++;
    } catch (err) {
      console.error(`[ERRO] Falha com "${palavra}": ${err.message}`);
      falhas++;
    }
  }
  console.log(`[FIM] ${baixados} movido(s), ${pulados} pulado(s), ${falhas} falha(s).`);
  if (falhas && !baixados) process.exit(1);
}

// ---------- main ----------
async function main() {
  if (!NOTION_API_KEY) {
    console.error('[ERRO] NOTION_API_KEY ausente. Configure o secret no repositório (Settings → Secrets → NOTION_API_KEY).');
    process.exit(1);
  }
  if (!NOTION_PAGE_ID) {
    console.error('[ERRO] NOTION_PAGE_ID ausente. Informe o ID da página mãe dos artigos (32 caracteres hex).');
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`[INFO] Buscando subpáginas de artigos na página ${NOTION_PAGE_ID} do Notion...`);

  let blocks;
  try {
    blocks = await listarBlocosFilhos(NOTION_PAGE_ID);
  } catch (e) {
    console.error('[ERRO] Falha ao ler blocos da página. Verifique o ID e se a integração tem acesso (Connections → "Edit access").');
    console.error(`       Detalhe: ${e.message}`);
    process.exit(1);
  }

  const bases = await localizarBases(blocks);
  if (bases.length) {
    for (const baseId of bases) await importarDaBase(baseId);
    return;
  }

  const paginas = blocks.filter((b) => b.type === 'child_page' && b.child_page?.title?.trim());
  if (!paginas.length) {
    // Falha de propósito: sem base nem subpágina, o run não pode aparecer verde.
    console.error(`[ERRO] Nenhuma base "${NOME_BASE}" nem subpágina de artigo encontrada na página ${NOTION_PAGE_ID}.`);
    console.error(`       Filhos diretos da página: ${blocks.map(descreverBloco).join(', ') || 'nenhum'}`);
    console.error('       Confira se a base está dentro desta página e se a integração tem acesso a ela (Connections → "Edit access").');
    process.exit(1);
  }

  let baixados = 0, pulados = 0, falhas = 0;
  for (const page of paginas) {
    if (baixados >= MAX_ARTIGOS) {
      console.log(`[INFO] Limite de MAX_ARTIGOS=${MAX_ARTIGOS} atingido; as demais páginas ficam para o próximo run.`);
      break;
    }
    const pageTitle = page.child_page.title.trim();
    const slug = slugTitulo(pageTitle);
    if (!slug) {
      console.log(`[AVISO] Página sem nome utilizável ("${pageTitle}"), ignorada.`);
      continue;
    }

    // Pula se já existe (nome exato OU qualquer variante -N) e não está forcando
    const jaExiste = fs.readdirSync(OUTPUT_DIR).some((f) => f === `${slug}.txt` || new RegExp(`^${slug}(-\\d+)?\\.txt$`).test(f));
    if (jaExiste && !FORCAR) {
      console.log(`[PULO] "${pageTitle}" já foi baixado (slug "${slug}").`);
      pulados++;
      continue;
    }

    try {
      const children = await listarBlocosFilhos(page.id);
      let texto = blocosParaTexto(children);
      if (!texto.trim()) {
        console.log(`[AVISO] Página "${pageTitle}" está vazia.`);
        continue;
      }
      texto = garantirHtml(texto);
      validarConteudo(texto, pageTitle);

      const nome = caminhoDisponivel(slug);
      if (!nome) {
        console.log(`[AVISO] Muitas duplicatas para "${slug}"; use FORCAR=sim ou renomeie a página no Notion.`);
        continue;
      }
      const filePath = path.join(OUTPUT_DIR, nome);
      fs.writeFileSync(filePath, texto + '\n', 'utf-8');
      console.log(`[OK] Salvo: ${path.relative(ROOT, filePath)} (${texto.length} caracteres)`);
      baixados++;
    } catch (err) {
      console.error(`[ERRO] Falha ao baixar "${pageTitle}": ${err.message}`);
      falhas++;
    }
  }

  console.log(`[FIM] ${baixados} baixado(s), ${pulados} já existia(m), ${falhas} falha(s).`);
  if (falhas && !baixados) process.exit(1);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
