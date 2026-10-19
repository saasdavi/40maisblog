#!/usr/bin/env node
/**
 * importar-pasta-para-notion.js — cria uma linha na "Fila de Artigos" para cada .txt de data/entrada/google/
 *
 * Uso (teste, sem rede, só mostra o que seria gravado):
 *   node scripts/importar-pasta-para-notion.js
 *
 * Uso (gravação real, com a sua chave do Notion):
 *   NOTION_API_KEY=secret_... node scripts/importar-pasta-para-notion.js --gravar
 *
 * Regras:
 *   - Status: "Em revisão" (padrão; use STATUS=... para mudar).
 *   - NOTA_CHAT: só preenchida quando o próprio arquivo traz a nota. Sem nota, o campo fica vazio.
 *   - O texto completo vai em "Conteúdo TXT completo" em pedaços de até 1.900 caracteres,
 *     porque o Notion recusa um trecho de texto acima de 2.000 caracteres.
 *   - Não duplica: se a palavra-chave já existe na fila, a linha é pulada.
 *   - "Caminho no GitHub" recebe o caminho do arquivo, para o workflow de importação não copiar de novo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PASTA = path.join(ROOT, 'data', 'entrada', 'google');
const DATABASE_ID = '3eb32d888f64491c9e20c13e6f6a6b24';
const NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();
const GRAVAR = process.argv.includes('--gravar');
const STATUS = (process.env.STATUS || 'Em revisão').trim();
const TAMANHO_PEDACO = 1900;
const PAUSA_MS = 350; // o Notion aceita cerca de 3 requisições por segundo

// ---------- leitura do arquivo ----------
function lerArtigo(arquivo) {
  const texto = fs.readFileSync(arquivo, 'utf-8');
  const m = texto.match(/^([\s\S]*?)^\s*---\s*\n+([\s\S]*)$/m);
  const cabecalho = m ? m[1] : '';
  const corpo = m ? m[2] : texto;
  const campos = {};
  for (const linha of cabecalho.split('\n')) {
    const c = linha.match(/^([A-Z][A-Z0-9_ ]*):\s*(.*)$/);
    if (c && !(c[1].trim() in campos)) campos[c[1].trim()] = c[2].trim();
  }
  return { texto, campos, corpo };
}

function notaDoArquivo({ texto, campos }) {
  const converte = (s) => {
    const n = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
  };
  if (campos['NOTA_CHAT']) return converte(campos['NOTA_CHAT']);
  if (campos['NOTA FINAL']) return converte(campos['NOTA FINAL'].split('/')[0]);
  const m = texto.match(/NOTA[^\n]{0,40}?(\d{1,2}[,.]\d)\s*\/\s*10/i);
  return m ? converte(m[1]) : null;
}

const slugTitulo = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

// ---------- montagem das propriedades do Notion ----------
const rt = (texto) => ({ rich_text: texto ? [{ type: 'text', text: { content: String(texto).slice(0, 1900) } }] : [] });

function textoLongo(texto) {
  const pedacos = [];
  for (let i = 0; i < texto.length; i += TAMANHO_PEDACO) {
    pedacos.push({ type: 'text', text: { content: texto.slice(i, i + TAMANHO_PEDACO) } });
  }
  return { rich_text: pedacos };
}

function montarLinha(arquivo) {
  const { texto, campos } = lerArtigo(arquivo);
  const nome = path.basename(arquivo);
  const palavra = campos['PALAVRA_CHAVE'] || nome.replace(/\.txt$/, '');
  const nota = notaDoArquivo({ texto, campos });
  const caminhoRepo = path.relative(ROOT, arquivo);
  return {
    palavra,
    propriedades: {
      PALAVRA_CHAVE: { title: [{ type: 'text', text: { content: palavra.slice(0, 1900) } }] },
      TITLE: rt(campos['TITLE']),
      DESCRIPTION: rt(campos['DESCRIPTION']),
      Slug: rt(slugTitulo(palavra)),
      CAPA_ALT: rt(campos['CAPA_ALT']),
      CAPA_ID: rt(campos['CAPA_ID']),
      FOTO1_ID: rt(campos['FOTO1_ID']),
      FOTO1_ALT: rt(campos['FOTO1_ALT']),
      FOTO1_SECAO: rt(campos['FOTO1_SECAO']),
      FOTO2_ID: rt(campos['FOTO2_ID']),
      FOTO2_ALT: rt(campos['FOTO2_ALT']),
      FOTO2_SECAO: rt(campos['FOTO2_SECAO']),
      'FONTE 1': rt(campos['FONTE 1']),
      'FONTE 2': rt(campos['FONTE 2']),
      'FONTE 3': rt(campos['FONTE 3']),
      NOTA_CHAT: { number: nota },
      Status: { status: { name: STATUS } },
      'Conteúdo TXT completo': textoLongo(texto),
      'Caminho no GitHub': rt(caminhoRepo),
      'Observações de revisão': rt(`Importado de ${caminhoRepo} em ${new Date().toISOString().slice(0, 10)}.`),
    },
    nota,
    caminhoRepo,
    tamanho: texto.length,
  };
}

// ---------- chamadas ao Notion ----------
async function notion(url, body) {
  const resposta = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const json = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`Notion (${resposta.status}): ${json.message || 'erro'}`);
  return json;
}

async function palavrasJaNaFila() {
  const existentes = new Set();
  let cursor;
  do {
    const corpo = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const r = await notion(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, corpo);
    for (const row of r.results || []) {
      const t = (row.properties?.PALAVRA_CHAVE?.title || []).map((x) => x.plain_text).join('');
      if (t) existentes.add(t.trim().toLowerCase());
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return existentes;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- principal ----------
async function main() {
  const arquivos = fs.readdirSync(PASTA).filter((f) => f.endsWith('.txt')).sort()
    .map((f) => path.join(PASTA, f));
  const linhas = arquivos.map(montarLinha);
  const comNota = linhas.filter((l) => l.nota !== null).length;
  const semTitulo = linhas.filter((l) => !l.propriedades.TITLE.rich_text.length).length;
  const pedacos = linhas.reduce((s, l) => s + l.propriedades['Conteúdo TXT completo'].rich_text.length, 0);
  console.log(`[INFO] ${arquivos.length} arquivo(s) em data/entrada/google. Com nota: ${comNota}. Sem TITLE no cabeçalho: ${semTitulo}. Pedaços de texto: ${pedacos}.`);
  console.log(`[INFO] Status das linhas novas: "${STATUS}".`);

  if (!GRAVAR) {
    console.log('[TESTE] Nada foi enviado ao Notion. Para gravar, rode com NOTION_API_KEY e --gravar.');
    return;
  }
  if (!NOTION_API_KEY) {
    console.error('[ERRO] NOTION_API_KEY ausente.');
    process.exit(1);
  }

  const jaExistem = await palavrasJaNaFila();
  console.log(`[INFO] A fila já tem ${jaExistem.size} palavra(s)-chave. Essas serão puladas.`);

  let criadas = 0, puladas = 0, falhas = 0;
  for (const linha of linhas) {
    if (jaExistem.has(linha.palavra.trim().toLowerCase())) { puladas++; continue; }
    try {
      await notion('https://api.notion.com/v1/pages', {
        parent: { database_id: DATABASE_ID },
        properties: linha.propriedades,
      });
      criadas++;
      console.log(`[OK] ${linha.palavra}`);
    } catch (err) {
      falhas++;
      console.error(`[ERRO] ${linha.palavra}: ${err.message}`);
    }
    await dormir(PAUSA_MS);
  }
  console.log(`[FIM] ${criadas} criada(s), ${puladas} pulada(s), ${falhas} falha(s).`);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
