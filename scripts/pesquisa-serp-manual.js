// Pesquisa manual de UMA palavra-chave na SerpAPI (Google Brasil). Não usa as regras do robô:
// não pula por estoque, não gera briefing, não mexe na fila de pautas.
//   SERP_API_KEY=... PALAVRA="melatonina" node scripts/pesquisa-serp-manual.js
// Grava data/entrada/pautas-chat_01/resposta/<slug>.json e o contador uso-serpapi.json na mesma pasta.
import fs from 'fs';

const PALAVRA = (process.env.PALAVRA || '').trim();
const CHAVE = (process.env.SERP_API_KEY || '').trim();
const LIMITE_MES = Number(process.env.SERPAPI_LIMITE_MES || 240);
const VALIDADE_DIAS = 14;
// Tudo fica nesta pasta: resultado e contador de cota (senão a cota zera a cada execução).
const PASTA = 'data/entrada/pautas-chat_01/resposta';
const USO_FILE = `${PASTA}/uso-serpapi.json`;

const slug = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lerJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };

async function main() {
  if (!PALAVRA) throw new Error('PALAVRA vazia: informe a palavra-chave no workflow.');
  if (!CHAVE) throw new Error('SERP_API_KEY ausente: o secret SERP___APIKEY precisa existir no repositório.');

  const arquivo = `${PASTA}/${slug(PALAVRA)}.json`;
  const atual = lerJson(arquivo, null);
  if (atual && (Date.now() - Date.parse(atual.data)) / 864e5 < VALIDADE_DIAS) {
    console.log(`"${PALAVRA}": já pesquisada em ${atual.data}; válida por ${VALIDADE_DIAS} dias, sem gastar busca.`);
    return;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const mes = hoje.slice(0, 7);
  let uso = lerJson(USO_FILE, { mes, buscas: 0 });
  if (uso.mes !== mes) uso = { mes, buscas: 0 };
  if (uso.buscas >= LIMITE_MES) {
    console.log(`Cota do mês esgotada: ${uso.buscas}/${LIMITE_MES} buscas. Nada pesquisado.`);
    return;
  }

  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(PALAVRA)}&gl=br&hl=pt&num=10&api_key=${encodeURIComponent(CHAVE)}`;
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok || j.error || j.search_metadata?.status !== 'Success') {
    throw new Error(`SerpAPI ${r.status}: ${(j.error || 'resposta sem status Success').replace(CHAVE, '***')}`);
  }

  const organicos = (j.organic_results || []).slice(0, 5).map((o, i) => ({
    posicao: i + 1, titulo: o.title || '', link: o.link || '', trecho: o.snippet || '',
  }));
  const resultado = {
    palavra: PALAVRA,
    data: hoje,
    fonte: 'SerpAPI (Google Brasil)',
    organicos,
    perguntas: (j.related_questions || []).map((q) => q.question).filter(Boolean),
    relacionadas: (j.related_searches || []).map((q) => q.query).filter(Boolean),
    ai_overview: !!j.ai_overview,
  };

  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(resultado, null, 1));
  uso.buscas++;
  fs.writeFileSync(USO_FILE, JSON.stringify(uso));
  console.log(`"${PALAVRA}": ${organicos.length} resultados, ${resultado.perguntas.length} perguntas, ${resultado.relacionadas.length} relacionadas. Busca ${uso.buscas}/${LIMITE_MES} no mês. Gravado em ${arquivo}`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
