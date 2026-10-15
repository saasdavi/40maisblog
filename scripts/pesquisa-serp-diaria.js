// Pesquisa diária na SerpAPI: percorre data/conteudo/pautas-mestre.csv e pesquisa só as linhas com
// status_artigo = "LIVRE PARA SERP", por maior volume (buscas_mes_exato), até MAX_BUSCAS buscas reais.
// Cada pauta com SERP válida vira "PESQUISA CONCLUÍDA" no CSV; isso não significa artigo pronto ou publicado.
// Palavras com resposta válida (até 14 dias) ficam de fora antes de contar tentativa.
// Para ao bater MAX_BUSCAS, ao esgotar a cota do mês ou ao acabar a lista.
// Se não houver nenhuma pauta "a gerar", sai com erro para não parecer sucesso.
//   SERP_API_KEY=... node scripts/pesquisa-serp-diaria.js
import fs from 'fs';
import { execFileSync } from 'child_process';

const CHAVE = (process.env.SERP_API_KEY || '').trim();
const MAX_BUSCAS = Number(process.env.MAX_BUSCAS || 1);
const LIMITE_MES = Number(process.env.SERPAPI_LIMITE_MES || 240);
const VALIDADE_DIAS = 14;
const PASTA = 'data/entrada/pautas-chat_01/resposta';
const USO_FILE = `${PASTA}/uso-serpapi.json`;
const PAUTAS = 'data/conteudo/pautas-mestre.csv';
const STATUS_A_GERAR = 'LIVRE PARA SERP';
const STATUS_PRONTA = 'PESQUISA CONCLUÍDA';
const TENTATIVAS_MAX = 40; // limite de segurança contra erros em sequência

if (!CHAVE) throw new Error('SERP_API_KEY ausente: o secret SERP___APIKEY precisa existir no repositório.');

const slug = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lerJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const buscasNoMes = () => {
  const mes = new Date().toISOString().slice(0, 7);
  const uso = lerJson(USO_FILE, { mes, buscas: 0 });
  return uso.mes === mes ? uso.buscas : 0;
};
const respostaValida = (palavra) => {
  const atual = lerJson(`${PASTA}/${slug(palavra)}.json`, null);
  const idade = atual?.data ? (Date.now() - Date.parse(atual.data)) / 864e5 : Infinity;
  return Boolean(atual && atual.palavra && slug(atual.palavra) === slug(palavra) && Array.isArray(atual.concorrentes) && Number.isFinite(idade) && idade >= 0 && idade < VALIDADE_DIAS);
};

// CSV com ';' e campos entre aspas, BOM no início e fim de linha CRLF. Preserva tudo que não muda.
const BOM = '﻿';
const texto = fs.readFileSync(PAUTAS, 'utf8');
const temBom = texto.startsWith(BOM);
const linhas = texto.replace(/^﻿/, '').split('\r\n');
const cabecalho = linhas[0].split(';').map((c) => c.replace(/^"|"$/g, '').trim());
const col = (nome) => {
  const i = cabecalho.indexOf(nome);
  if (i < 0) throw new Error(`coluna ${nome} não encontrada em ${PAUTAS}`);
  return i;
};
const iPalavra = col('palavra_chave');
const iVolume = col('buscas_mes_exato');
const iStatus = col('status_artigo');
const campos = (l) => l.split(';').map((c) => c.replace(/^"|"$/g, '').trim());
const aQuote = (s) => `"${s}"`;

const candidatas = linhas.slice(1)
  .filter((l) => l)
  .map(campos)
  .filter((c) => c[iStatus] === STATUS_A_GERAR && c[iPalavra])
  .sort((a, b) => (Number(b[iVolume]) || 0) - (Number(a[iVolume]) || 0))
  .map((c) => c[iPalavra]);

if (candidatas.length === 0) {
  console.log(`Nenhuma pauta com status "${STATUS_A_GERAR}" em ${PAUTAS}. Nada para pesquisar; execução encerrada sem erro.`);
  process.exit(0);
}

// marca a pauta como pronta no CSV, mexendo só na linha dela
const marcarPronta = (palavra) => {
  const atual = fs.readFileSync(PAUTAS, 'utf8').replace(/^﻿/, '');
  const ls = atual.split('\r\n');
  const i = ls.findIndex((l, n) => n > 0 && l && campos(l)[iPalavra] === palavra && campos(l)[iStatus] === STATUS_A_GERAR);
  if (i < 0) return;
  const f = ls[i].split(';');
  f[iStatus] = aQuote(STATUS_PRONTA);
  ls[i] = f.join(';');
  fs.writeFileSync(PAUTAS, (temBom ? BOM : '') + ls.join('\r\n'));
};

const jaPesquisadas = candidatas.filter(respostaValida);
for (const palavra of jaPesquisadas) marcarPronta(palavra);
const palavras = candidatas.filter((p) => !respostaValida(p));
console.log(`${candidatas.length} pautas "${STATUS_A_GERAR}"; ${jaPesquisadas.length} já com JSON válido recente e marcadas PESQUISA CONCLUÍDA; ${palavras.length} pendentes de pesquisa.`);

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
  if (respostaValida(palavra)) {
    if (buscasNoMes() > antes) {
      feitas++;
      // Expõe a palavra-chave recém-pesquisada ao próximo step do GitHub Actions.
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `pesquisa=${palavra.replace(/[\\r\\n]/g, ' ')}\\n`);
      }
    }
    marcarPronta(palavra);
    console.log(`"${palavra}": JSON confirmado e status atualizado para PESQUISA CONCLUÍDA.`);
  } else {
    console.log(`"${palavra}": execução terminou sem JSON válido; status preservado como LIVRE PARA SERP.`);
  }
}

console.log(`Concluído: ${feitas} busca(s) nova(s) nesta execução (máximo ${MAX_BUSCAS}). Respostas em ${PASTA}/`);
