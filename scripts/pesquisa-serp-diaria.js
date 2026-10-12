// Pesquisa diária na SerpAPI: percorre data/entrada/pautas-chat_01/PAUTAS.csv na ordem e roda
// scripts/pesquisa-serp-manual.js para cada palavra pendente, até MAX_BUSCAS buscas reais.
// Pautas com resposta válida (até 14 dias) são puladas pelo script manual, sem gastar busca.
// Para ao bater MAX_BUSCAS, ao esgotar a cota do mês ou ao acabar a lista.
//   SERP_API_KEY=... node scripts/pesquisa-serp-diaria.js
import fs from 'fs';
import { execFileSync } from 'child_process';

const CHAVE = (process.env.SERP_API_KEY || '').trim();
const MAX_BUSCAS = Number(process.env.MAX_BUSCAS || 5);
const LIMITE_MES = Number(process.env.SERPAPI_LIMITE_MES || 240);
const PASTA = 'data/entrada/pautas-chat_01/resposta';
const USO_FILE = `${PASTA}/uso-serpapi.json`;
const PAUTAS = 'data/entrada/pautas-chat_01/PAUTAS.csv';
const TENTATIVAS_MAX = 40; // limite de segurança contra erros em sequência

if (!CHAVE) throw new Error('SERP_API_KEY ausente: o secret SERP___APIKEY precisa existir no repositório.');

const lerJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const buscasNoMes = () => {
  const mes = new Date().toISOString().slice(0, 7);
  const uso = lerJson(USO_FILE, { mes, buscas: 0 });
  return uso.mes === mes ? uso.buscas : 0;
};

const linhas = fs.readFileSync(PAUTAS, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const cabecalho = linhas[0].split(';');
const iPalavra = cabecalho.indexOf('palavra_chave');
if (iPalavra < 0) throw new Error('coluna palavra_chave não encontrada em PAUTAS.csv');
const palavras = linhas.slice(1).map((l) => l.split(';')[iPalavra]?.trim()).filter(Boolean);

let feitas = 0;
let tentativas = 0;
for (const palavra of palavras) {
  if (feitas >= MAX_BUSCAS || tentativas >= TENTATIVAS_MAX) break;
  if (buscasNoMes() >= LIMITE_MES) { console.log(`Cota do mês esgotada (${LIMITE_MES}). Parando.`); break; }
  tentativas++;
  const antes = buscasNoMes();
  try {
    execFileSync('node', ['scripts/pesquisa-serp-manual.js'], {
      env: { ...process.env, PALAVRA: palavra, SERP_API_KEY: CHAVE },
      stdio: 'inherit',
    });
  } catch {
    console.log(`"${palavra}": falhou, seguindo para a próxima.`);
    continue;
  }
  if (buscasNoMes() > antes) feitas++;
}

console.log(`Concluído: ${feitas} busca(s) nova(s) nesta execução (máximo ${MAX_BUSCAS}). Respostas em ${PASTA}/`);
