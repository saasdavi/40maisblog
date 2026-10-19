#!/usr/bin/env node
/**
 * atualizar-status-pautas-notion.js — ajusta a coluna "Status do artigo" da base "Pautas" no Notion.
 *
 *   "PRONTO"              -> "Publicado"        (já está no ar no blog)
 *   "PESQUISA CONCLUÍDA"  -> "Pesquisa pronta"  (tem pesquisa SERP, ainda não virou artigo)
 *   "LIVRE PARA SERP"     -> não muda
 *
 * Só altera o status. Não apaga nem cria linhas.
 *
 * Uso (teste, sem rede): node scripts/atualizar-status-pautas-notion.js
 * Uso (gravação):        NOTION_API_KEY=secret_... node scripts/atualizar-status-pautas-notion.js --gravar
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARQUIVO = path.join(ROOT, 'data', 'conteudo', 'pautas-mestre.json');
const BASE_ID = '3fe242e3913c81808146cff5ba5a4f8a'; // base "Pautas"
const COLUNA = 'Status do artigo';
const NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();
const GRAVAR = process.argv.includes('--gravar');
const PAUSA_MS = 340;

const MAPA = {
  'PRONTO': 'Publicado',
  'PESQUISA CONCLUÍDA': 'Pesquisa pronta',
};

const chave = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

async function notion(url, body, metodo) {
  const r = await fetch(url, {
    method: metodo || (body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Notion (${r.status}): ${json.message || 'erro'}`);
  return json;
}

// Página da base por palavra-chave (chave normalizada) -> { id, status atual }
async function paginasDaBase() {
  const mapa = new Map();
  let cursor;
  do {
    const r = await notion(`https://api.notion.com/v1/databases/${BASE_ID}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const row of r.results || []) {
      const titulo = (row.properties?.['Palavra-chave']?.title || []).map((x) => x.plain_text).join('');
      mapa.set(chave(titulo), { id: row.id, atual: row.properties?.[COLUNA]?.select?.name ?? null });
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return mapa;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pautas = JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8')).pautas;
  const trocas = pautas
    .filter((x) => MAPA[x.status_artigo])
    .map((x) => ({ palavra: x.palavra_chave, de: x.status_artigo, para: MAPA[x.status_artigo] }));
  const contagem = {};
  for (const t of trocas) contagem[`${t.de} -> ${t.para}`] = (contagem[`${t.de} -> ${t.para}`] || 0) + 1;
  console.log(`[INFO] ${trocas.length} pauta(s) para ajustar:`, contagem);

  if (!GRAVAR) {
    console.log('[TESTE] Nada foi enviado ao Notion. Para gravar, rode com NOTION_API_KEY e --gravar.');
    return;
  }
  if (!NOTION_API_KEY) {
    console.error('[ERRO] NOTION_API_KEY ausente.');
    process.exit(1);
  }

  const paginas = await paginasDaBase();
  console.log(`[INFO] ${paginas.size} linha(s) na base.`);
  let ajustadas = 0, jaOk = 0, nao = 0, falhas = 0;
  for (const t of trocas) {
    const pg = paginas.get(chave(t.palavra));
    if (!pg) { nao++; console.log(`[AVISO] não encontrada na base: ${t.palavra}`); continue; }
    if (pg.atual === t.para) { jaOk++; continue; }
    try {
      await notion(`https://api.notion.com/v1/pages/${pg.id}`, {
        properties: { [COLUNA]: { select: { name: t.para } } },
      }, 'PATCH');
      ajustadas++;
    } catch (err) {
      falhas++;
      console.error(`[ERRO] ${t.palavra}: ${err.message}`);
    }
    await dormir(PAUSA_MS);
  }
  console.log(`[FIM] ${ajustadas} ajustada(s), ${jaOk} já estava(m) certa(s), ${nao} não encontrada(s), ${falhas} falha(s).`);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
