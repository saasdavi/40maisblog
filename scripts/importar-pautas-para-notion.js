#!/usr/bin/env node
/**
 * importar-pautas-para-notion.js — cria a base "Pautas" no Notion e uma linha por pauta de
 * data/conteudo/pautas-mestre.json (2.002 linhas, 31 colunas).
 *
 * Uso (teste, sem rede): node scripts/importar-pautas-para-notion.js
 * Uso (gravação):        NOTION_API_KEY=secret_... node scripts/importar-pautas-para-notion.js --gravar
 *
 * A base é criada na página "Saúde 40+ — Central" (se ainda não existir). Linhas cuja palavra-chave
 * já está na base são puladas, então pode rodar de novo sem duplicar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARQUIVO = path.join(ROOT, 'data', 'conteudo', 'pautas-mestre.json');
const PAGINA_PAI = '3fa242e3913c8168' + '9b04de1f60ccd99e'; // "Saúde 40+ — Central"
const NOME_BASE = 'Pautas';
const NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();
const GRAVAR = process.argv.includes('--gravar');
const PAUSA_MS = 340;
const PEDACO = 1900;

// Coluna da planilha -> [nome no Notion, tipo]
const MAPA = [
  ['palavra_chave', 'Palavra-chave', 'title'],
  ['tema', 'Tema', 'text'],
  ['grupo', 'Grupo', 'select'],
  ['status_artigo', 'Status do artigo', 'select'],
  ['buscas_mes_exato', 'Buscas por mês', 'number'],
  ['concorrencia_ads', 'Concorrência Ads', 'select'],
  ['tendencia', 'Tendência', 'text'],
  ['nota_auditoria', 'Nota de auditoria', 'text'],
  ['sensivel_revisao', 'Sensível à revisão', 'text'],
  ['google_checado', 'Google checado', 'text'],
  ['produzir_amanha_sugerido', 'Produzir amanhã (sugerido)', 'text'],
  ['origem', 'Origem', 'text'],
  ['dificuldade_google', 'Dificuldade Google', 'select'],
  ['autoridades_top5', 'Autoridades top 5', 'text'],
  ['concorrente_1_url', 'Concorrente 1 URL', 'text'],
  ['concorrente_1_palavras', 'Concorrente 1 palavras', 'number'],
  ['mediana_palavras_topo', 'Mediana palavras do topo', 'number'],
  ['h2_comuns_no_topo', 'H2 comuns no topo', 'text'],
  ['perguntas_do_google', 'Perguntas do Google', 'text'],
  ['lacunas_do_topo', 'Lacunas do topo', 'text'],
  ['termos_usados_pelo_topo', 'Termos usados pelo topo', 'text'],
  ['concorrentes_detalhe', 'Concorrentes (detalhe)', 'text'],
  ['urls_topo_google', 'URLs do topo no Google', 'text'],
  ['nivel', 'Nível', 'select'],
  ['visitas_mes_se_pagina1_3pct', 'Visitas/mês se página 1 (3%)', 'number'],
  ['visitas_mes_se_top3_18pct', 'Visitas/mês se top 3 (18%)', 'number'],
  ['tipo', 'Tipo', 'select'],
  ['qtd_long_tails', 'Qtd. long tails', 'number'],
  ['volume_somado_long_tails', 'Volume somado long tails', 'number'],
  ['long_tails_com_volume', 'Long tails com volume', 'text'],
];

const schema = () => Object.fromEntries(MAPA.map(([, nome, tipo]) => [
  nome,
  tipo === 'title' ? { title: {} }
    : tipo === 'number' ? { number: { format: 'number' } }
    : tipo === 'select' ? { select: { options: [] } }
    : { rich_text: {} },
]));

// Notion aceita no máximo 2.000 caracteres por trecho de texto: quebramos em pedaços.
const pedacos = (s) => {
  const t = String(s ?? '');
  const out = [];
  for (let i = 0; i < t.length; i += PEDACO) out.push({ type: 'text', text: { content: t.slice(i, i + PEDACO) } });
  return out;
};
const textoRico = (s) => ({ rich_text: pedacos(s).slice(0, 100) });
const numero = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return v === '' || v == null || !Number.isFinite(n) ? null : n;
};
const opcao = (v) => {
  const t = String(v ?? '').replace(/,/g, ';').trim().slice(0, 100);
  return t ? { select: { name: t } } : { select: null };
};

function propriedades(linha) {
  const props = {};
  for (const [col, nome, tipo] of MAPA) {
    const v = linha[col];
    if (tipo === 'title') props[nome] = { title: pedacos(v || '—').slice(0, 1) };
    else if (tipo === 'number') props[nome] = { number: numero(v) };
    else if (tipo === 'select') props[nome] = opcao(v);
    else props[nome] = textoRico(v);
  }
  return props;
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

async function acharOuCriarBase() {
  const busca = await notion('https://api.notion.com/v1/search', {
    query: NOME_BASE,
    filter: { property: 'object', value: 'database' },
    page_size: 20,
  });
  const existente = (busca.results || []).find((db) =>
    (db.title || []).map((t) => t.plain_text).join('').trim() === NOME_BASE
    && db.parent?.page_id?.replace(/-/g, '') === PAGINA_PAI);
  if (existente) {
    console.log(`[INFO] Base "${NOME_BASE}" já existe: ${existente.id}`);
    return existente.id;
  }
  const nova = await notion('https://api.notion.com/v1/databases', {
    parent: { type: 'page_id', page_id: PAGINA_PAI },
    title: [{ type: 'text', text: { content: NOME_BASE } }],
    properties: schema(),
  });
  console.log(`[OK] Base "${NOME_BASE}" criada: ${nova.id}`);
  return nova.id;
}

async function palavrasJaNaBase(baseId) {
  const existentes = new Set();
  let cursor;
  do {
    const r = await notion(`https://api.notion.com/v1/databases/${baseId}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const row of r.results || []) {
      const t = (row.properties?.['Palavra-chave']?.title || []).map((x) => x.plain_text).join('').trim();
      if (t) existentes.add(t.toLowerCase());
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return existentes;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const linhas = JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8')).pautas;
  console.log(`[INFO] ${linhas.length} pauta(s) em data/conteudo/pautas-mestre.json, ${MAPA.length} colunas.`);
  if (!GRAVAR) {
    console.log(`[TESTE] Nada foi enviado. Primeira linha: "${linhas[0].palavra_chave}", ${Object.keys(propriedades(linhas[0])).length} propriedades.`);
    return;
  }
  if (!NOTION_API_KEY) {
    console.error('[ERRO] NOTION_API_KEY ausente.');
    process.exit(1);
  }
  const baseId = await acharOuCriarBase();
  const jaExistem = await palavrasJaNaBase(baseId);
  let criadas = 0, puladas = 0, falhas = 0;
  for (const linha of linhas) {
    const chave = String(linha.palavra_chave || '').trim().toLowerCase();
    if (!chave || jaExistem.has(chave)) { puladas++; continue; }
    try {
      await notion('https://api.notion.com/v1/pages', {
        parent: { database_id: baseId },
        properties: propriedades(linha),
      });
      jaExistem.add(chave);
      criadas++;
    } catch (err) {
      falhas++;
      console.error(`[ERRO] ${linha.palavra_chave}: ${err.message}`);
    }
    if ((criadas + falhas) % 100 === 0) console.log(`[INFO] ${criadas} criada(s) até agora.`);
    await dormir(PAUSA_MS);
  }
  console.log(`[FIM] ${criadas} criada(s), ${puladas} pulada(s), ${falhas} falha(s).`);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
