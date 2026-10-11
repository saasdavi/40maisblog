// Pesquisa a próxima pauta da fila no Google (SerpAPI, 1 busca por artigo) e prepara o briefing que o redator lê.
//   SERP_API_KEY=... node scripts/serp-api.js [--keyword "palavra"] [--mock arquivo.json] [--so-se-sem-estoque]
// Grava o top orgânico, as perguntas do Google (PAA) e as buscas relacionadas em data/pesquisa/serp-resultados.json
// e roda scripts/briefing.js para essa pauta. Cota: contador mensal em data/pesquisa/serpapi-uso.json (limite 240 de 250).
import fs from 'fs';
import { execFileSync } from 'child_process';
import ArticleRobot from './article-robot.js';

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const SERP_FILE = 'data/pesquisa/serp-resultados.json';
const USO_FILE = 'data/pesquisa/serpapi-uso.json';
const LIMITE_MES = Number(process.env.SERPAPI_LIMITE_MES || 240);
const VALIDADE_DIAS = 14;
const lerJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
// fora dos concorrentes: vídeo, rede social, loja, buscador e enciclopédia
const EXCLUIDOS = /(youtube\.com|youtu\.be|instagram\.com|facebook\.com|tiktok\.com|twitter\.com|x\.com|reddit\.com|linkedin\.com|pinterest\.com|wikipedia\.org|amazon\.|mercadolivre\.|shopee\.|google\.)/i;
const AUTORIDADE = /(gov\.br|\.gov\b|who\.int|nih\.gov|scielo|sbn\.org|cardiol\.br|endocrino\.org|sbd\.org|febrasgo|sbgg|fiocruz|\.edu\b|\.edu\.br|mayoclinic|medlineplus|hopkinsmedicine|harvard\.edu|bvsalud)/i;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function resumirSerp(j) {
  const organicos = (j.organic_results || []).map((o) => o.link).filter((l) => l && !EXCLUIDOS.test(host(l)));
  const top3 = organicos.slice(0, 3), top5 = organicos.slice(0, 5);
  return {
    top3Urls: top3, topoUrls: top5,
    perguntas: (j.related_questions || []).map((q) => q.question).filter(Boolean).slice(0, 8),
    relacionadas: (j.related_searches || []).map((q) => q.query).filter(Boolean).slice(0, 8),
    aiOverview: !!j.ai_overview,
    autoridadesTop3: top3.map(host).filter((h) => AUTORIDADE.test(h)),
    autoridadesTop5: top5.map(host).filter((h) => AUTORIDADE.test(h)),
    topoDoGoogle: top5.map(host).join(', '),
  };
}

async function main() {
  const chave = (process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY || '').trim();
  const mock = arg('--mock');
  if (!chave && !mock) { console.log('⚠️  SERP_API_KEY ausente: sem pesquisa nova no Google; o redator usa o que já está em data/pesquisa/serp-resultados.json.'); return; }

  const robo = new ArticleRobot();
  // execuções que só publicam do estoque não escrevem nada: não gastam busca (--so-se-sem-estoque)
  if (process.argv.includes('--so-se-sem-estoque') && robo.prontosNoEstoque().length > 0) { console.log(`Estoque pronto (${robo.prontosNoEstoque().length}): esta execução só publica, sem pesquisa na SerpAPI.`); return; }
  const keyword = arg('--keyword') || robo.escolherPauta()[0]?.keyword;
  if (!keyword) { console.log('Sem pauta livre na fila: nada a pesquisar.'); return; }

  const serp = lerJson(SERP_FILE, {});
  const atual = serp[keyword];
  const hoje = new Date().toISOString().slice(0, 10);
  if (atual?.fonte?.startsWith('SerpAPI') && (Date.now() - Date.parse(atual.data)) / 864e5 < VALIDADE_DIAS && !mock) {
    console.log(`"${keyword}": pesquisa da SerpAPI de ${atual.data} ainda vale (${VALIDADE_DIAS} dias); sem gastar busca.`);
  } else {
    const mes = hoje.slice(0, 7);
    let uso = lerJson(USO_FILE, { mes, buscas: 0 });
    if (uso.mes !== mes) uso = { mes, buscas: 0 };
    if (uso.buscas >= LIMITE_MES) { console.log(`⚠️  Cota do mês: ${uso.buscas}/${LIMITE_MES} buscas SerpAPI usadas; sem pesquisa nova.`); return; }
    let j;
    if (mock) j = lerJson(mock, {});
    else {
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(keyword)}&gl=br&hl=pt&num=10&api_key=${encodeURIComponent(chave)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`SerpAPI ${r.status}: ${(await r.text()).slice(0, 200).replace(chave, '***')}`);
      j = await r.json();
      if (j.error || j.search_metadata?.status !== 'Success') throw new Error(`SerpAPI: ${j.error || 'resposta sem status Success'}`);
      uso.buscas++; fs.mkdirSync('data/pesquisa', { recursive: true }); fs.writeFileSync(USO_FILE, JSON.stringify(uso));
    }
    serp[keyword] = { ...(atual || {}), data: hoje, fonte: 'SerpAPI (Google Brasil)', ...resumirSerp(j) };
    fs.writeFileSync(SERP_FILE, JSON.stringify(serp, null, 1));
    console.log(`"${keyword}": ${serp[keyword].top3Urls.length} orgânicos, ${serp[keyword].perguntas.length} perguntas, ${serp[keyword].relacionadas.length} relacionadas${mock ? '' : ` (busca ${uso.buscas}/${LIMITE_MES} do mês)`}`);
  }
  execFileSync(process.execPath, ['scripts/briefing.js', '--so', keyword], { stdio: 'inherit' });
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error('❌ SerpAPI:', e.message); process.exit(0); }); // falha da pesquisa não derruba o dia
