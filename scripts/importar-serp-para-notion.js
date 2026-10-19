#!/usr/bin/env node
/**
 * importar-serp-para-notion.js — cria uma página no arquivo "Pesquisas SerpAPI" para cada pesquisa
 * de data/entrada/pautas-chat_01/resposta/*.json (exceto uso-serpapi.json).
 *
 * Uso (teste, sem rede):
 *   node scripts/importar-serp-para-notion.js
 * Uso (gravação real):
 *   NOTION_API_KEY=secret_... node scripts/importar-serp-para-notion.js --gravar
 *
 * Cada página recebe: resumo (concorrentes, perguntas, buscas relacionadas, AI Overview)
 * e, no fim, o JSON bruto em blocos de código, para não perder nada da resposta.
 * Pula páginas que já existem com o mesmo título.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PASTA = path.join(ROOT, 'data', 'entrada', 'pautas-chat_01', 'resposta');
const PAGINA_ARQUIVO = '3fa242e3913c81918cd1d38f9d54ecca'; // "Pesquisas SerpAPI — Arquivo de pesquisas"
const NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();
const GRAVAR = process.argv.includes('--gravar');
const PAUSA_MS = 400;
const LIMITE_TEXTO = 1900;

const texto = (s) => String(s ?? '').slice(0, LIMITE_TEXTO);
const rt = (s) => [{ type: 'text', text: { content: texto(s) } }];
const bloco = (type, conteudo) => ({ object: 'block', type, [type]: conteudo });
const paragrafo = (s) => bloco('paragraph', { rich_text: rt(s) });
const titulo3 = (s) => bloco('heading_3', { rich_text: rt(s) });
const item = (s) => bloco('bulleted_list_item', { rich_text: rt(s) });

function montarBlocos(p) {
  const blocos = [
    paragrafo(`Data: ${p.data ?? '—'} · Fonte: ${p.fonte ?? '—'} · AI Overview: ${p.ai_overview ? 'sim' : 'não'}`),
    titulo3('Concorrentes'),
    ...(p.concorrentes ?? []).map((c) =>
      item(`${c.posicao}. ${c.titulo ?? '—'} — ${c.palavras ?? '?'} palavras — ${c.link ?? ''}`)),
    titulo3('Perguntas do público'),
    ...(p.perguntas ?? []).map((q) => item(String(q))),
    titulo3('Buscas relacionadas'),
    ...(p.relacionadas ?? []).map((r) => item(String(r))),
    titulo3('Dados brutos (JSON)'),
  ];
  // A API aceita no máximo 100 blocos por requisição: o JSON bruto ocupa o que sobrar.
  const json = JSON.stringify(p, null, 2);
  for (let i = 0; i < json.length && blocos.length < 100; i += LIMITE_TEXTO) {
    blocos.push(bloco('code', { language: 'json', rich_text: rt(json.slice(i, i + LIMITE_TEXTO)) }));
  }
  return blocos;
}

function lerPesquisas() {
  return fs.readdirSync(PASTA)
    .filter((f) => f.endsWith('.json') && !f.startsWith('uso-'))
    .sort()
    .map((f) => {
      const p = JSON.parse(fs.readFileSync(path.join(PASTA, f), 'utf-8'));
      return { arquivo: f, titulo: `Pesquisa SERP — ${p.palavra} — ${p.data}`, p };
    });
}

async function notion(url, body) {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
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

async function titulosExistentes() {
  const existentes = new Set();
  let cursor;
  do {
    const r = await notion('https://api.notion.com/v1/search', {
      query: 'Pesquisa SERP',
      filter: { property: 'object', value: 'page' },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const pg of r.results || []) {
      const t = (pg.properties?.title?.title || []).map((x) => x.plain_text).join('');
      if (t) existentes.add(t.trim());
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return existentes;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pesquisas = lerPesquisas();
  console.log(`[INFO] ${pesquisas.length} pesquisa(s) em data/entrada/pautas-chat_01/resposta/ (uso-serpapi.json fica de fora).`);
  if (!GRAVAR) {
    console.log('[TESTE] Nada foi enviado ao Notion. Para gravar, rode com NOTION_API_KEY e --gravar.');
    console.log(`[TESTE] Exemplo do primeiro título: "${pesquisas[0]?.titulo}" com ${montarBlocos(pesquisas[0].p).length} bloco(s).`);
    return;
  }
  if (!NOTION_API_KEY) {
    console.error('[ERRO] NOTION_API_KEY ausente.');
    process.exit(1);
  }
  const existentes = await titulosExistentes();
  let criadas = 0, puladas = 0, falhas = 0;
  for (const { titulo, p } of pesquisas) {
    if (existentes.has(titulo)) { puladas++; continue; }
    try {
      await notion('https://api.notion.com/v1/pages', {
        parent: { type: 'page_id', page_id: PAGINA_ARQUIVO },
        properties: { title: { title: rt(titulo) } },
        children: montarBlocos(p),
      });
      criadas++;
      console.log(`[OK] ${titulo}`);
    } catch (err) {
      falhas++;
      console.error(`[ERRO] ${titulo}: ${err.message}`);
    }
    await dormir(PAUSA_MS);
  }
  console.log(`[FIM] ${criadas} criada(s), ${puladas} já existia(m), ${falhas} falha(s).`);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
