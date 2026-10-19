#!/usr/bin/env node
/**
 * remover-duplicadas-pautas-notion.js — deixa apenas 1 pauta de cada grupo de duplicadas na base "Pautas".
 *
 * Duplicada = mesma palavra-chave, ignorando acento, caixa, plural e ordem das palavras.
 * Fica a pauta de maior volume de buscas; se empatar, a de status mais avançado (PRONTO > PESQUISA
 * CONCLUÍDA > LIVRE PARA SERP); se ainda empatar, a primeira da planilha.
 * As outras são ARQUIVADAS no Notion (vão para a lixeira e podem ser restauradas por 30 dias).
 *
 * Uso (teste, sem rede): node scripts/remover-duplicadas-pautas-notion.js
 * Uso (gravação):        NOTION_API_KEY=secret_... node scripts/remover-duplicadas-pautas-notion.js --gravar
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARQUIVO = path.join(ROOT, 'data', 'conteudo', 'pautas-mestre.json');
const BASE_ID = '3fe242e3913c81808146cff5ba5a4f8a'; // base "Pautas"
const NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();
const GRAVAR = process.argv.includes('--gravar');
const PAUSA_MS = 340;
const PRIORIDADE = { 'PRONTO': 3, 'PESQUISA CONCLUÍDA': 2, 'LIVRE PARA SERP': 1 };

const chaveGrupo = (s) => {
  const w = String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return w.map((t) => (t.endsWith('s') && t.length > 3 ? t.slice(0, -1) : t)).sort().join(' ');
};
const chaveExata = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function gruposParaArquivar(pautas) {
  const grupos = new Map();
  pautas.forEach((x, i) => {
    const k = chaveGrupo(x.palavra_chave);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push({ ...x, _i: i });
  });
  const arquivar = [];
  for (const membros of grupos.values()) {
    if (membros.length < 2) continue;
    membros.sort((a, b) =>
      (Number(b.buscas_mes_exato) || 0) - (Number(a.buscas_mes_exato) || 0)
      || (PRIORIDADE[b.status_artigo] || 0) - (PRIORIDADE[a.status_artigo] || 0)
      || a._i - b._i);
    const [manter, ...resto] = membros;
    for (const r of resto) arquivar.push({ palavra: r.palavra_chave, manter: manter.palavra_chave });
  }
  return arquivar;
}

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

async function paginasPorPalavra() {
  const mapa = new Map();
  let cursor;
  do {
    const r = await notion(`https://api.notion.com/v1/databases/${BASE_ID}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const row of r.results || []) {
      const titulo = (row.properties?.['Palavra-chave']?.title || []).map((x) => x.plain_text).join('');
      mapa.set(chaveExata(titulo), row.id);
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return mapa;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pautas = JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8')).pautas;
  const arquivar = gruposParaArquivar(pautas);
  console.log(`[INFO] ${arquivar.length} duplicada(s) para arquivar, em ${new Set(arquivar.map((a) => a.manter)).size} grupo(s).`);
  for (const a of arquivar) console.log(`  manter "${a.manter}" | arquivar "${a.palavra}"`);

  if (!GRAVAR) {
    console.log('[TESTE] Nada foi arquivado. Para gravar, rode com NOTION_API_KEY e --gravar.');
    return;
  }
  if (!NOTION_API_KEY) {
    console.error('[ERRO] NOTION_API_KEY ausente.');
    process.exit(1);
  }

  const paginas = await paginasPorPalavra();
  let arquivadas = 0, naoEncontradas = 0, falhas = 0;
  for (const a of arquivar) {
    const id = paginas.get(chaveExata(a.palavra));
    if (!id) { naoEncontradas++; console.log(`[AVISO] não encontrada na base: "${a.palavra}"`); continue; }
    try {
      await notion(`https://api.notion.com/v1/pages/${id}`, { archived: true }, 'PATCH');
      arquivadas++;
    } catch (err) {
      falhas++;
      console.error(`[ERRO] "${a.palavra}": ${err.message}`);
    }
    await dormir(PAUSA_MS);
  }
  console.log(`[FIM] ${arquivadas} arquivada(s), ${naoEncontradas} não encontrada(s), ${falhas} falha(s).`);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
