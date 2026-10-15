// Pesquisa manual de UMA palavra-chave na SerpAPI (Google Brasil) e leitura dos concorrentes.
// Não usa as regras do robô: não pula por estoque, não gera briefing, não mexe na fila de pautas.
//   SERP_API_KEY=... PALAVRA="melatonina" node scripts/pesquisa-serp-manual.js
// Grava data/entrada/pautas-chat_01/resposta/<slug>.json e o contador uso-serpapi.json na mesma pasta.
// A busca usa 1 consulta da SerpAPI. As páginas são lidas direto (sem custo), respeitando robots.txt.
import fs from 'fs';

const PALAVRA = (process.env.PALAVRA || '').trim();
const CHAVE = (process.env.SERP_API_KEY || '').trim();
const LIMITE_MES = Number(process.env.SERPAPI_LIMITE_MES || 240);
const VALIDADE_DIAS = 14;
const PASTA = 'data/entrada/pautas-chat_01/resposta';
const USO_FILE = `${PASTA}/uso-serpapi.json`;
const UA = 'MenteCuriosaBot/1.0 (+https://www.mentecuriosa.blog)';
const PAUSA_MS = 2000;
// fora dos concorrentes: vídeo, rede social, loja, buscador e enciclopédia
const AUTORIDADE = /(gov\.br|\.gov\b|who\.int|nih\.gov|scielo|sbn\.org|cardiol\.br|endocrino\.org|sbd\.org|febrasgo|sbgg|fiocruz|\.edu\b|\.edu\.br|mayoclinic|medlineplus|hopkinsmedicine|harvard\.edu|bvsalud|\.org\.br)/i;
const EXCLUIDOS = /(youtube\.com|youtu\.be|instagram\.com|facebook\.com|tiktok\.com|twitter\.com|x\.com|reddit\.com|linkedin\.com|pinterest\.com|wikipedia\.org|amazon\.|mercadolivre\.|shopee\.|google\.)/i;

const slug = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lerJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const semTags = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// robots.txt: se não der para ler, não lê a página (mesma regra do enriquecer_serp.py)
async function podeLer(link) {
  const u = new URL(link);
  try {
    const r = await fetch(`${u.protocol}//${u.host}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    if (r.status === 404) return true;
    if (!r.ok) return false;
    const bloco = (await r.text()).split(/\n\s*\n/).find((b) => /user-agent:\s*(\*|menteculiosa)/i.test(b)) || '';
    const proibidos = [...bloco.matchAll(/^disallow:\s*(\S*)/gim)].map((m) => m[1]).filter(Boolean);
    return !proibidos.some((p) => u.pathname.startsWith(p));
  } catch { return false; }
}

async function lerPagina(link) {
  if (!(await podeLer(link))) return { lida: false, motivo: 'robots.txt não permite ou não foi possível ler' };
  try {
    const r = await fetch(link, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { lida: false, motivo: `HTTP ${r.status}` };
    const html = await r.text();
    const h2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => semTags(m[1])).filter((t) => t && t.length <= 120).slice(0, 12);
    const titulo = semTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const palavras = semTags(html).split(' ').filter(Boolean).length;
    return { lida: true, titulo, h2, palavras };
  } catch (e) {
    return { lida: false, motivo: e.message };
  }
}

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

  const concorrentes = (j.organic_results || []).filter((o) => o.link && !EXCLUIDOS.test(new URL(o.link).hostname)).slice(0, 5);
  const paginas = [];
  for (const [i, o] of concorrentes.entries()) {
    const leitura = await lerPagina(o.link);
    paginas.push({ posicao: i + 1, titulo: o.title || '', link: o.link, trecho: o.snippet || '', ...leitura });
    await esperar(PAUSA_MS);
  }

  // Fontes oficiais: só domínios de autoridade da própria busca, cada uma aberta e verificada
  const oficiais = (j.organic_results || []).filter((o) => o.link && AUTORIDADE.test(new URL(o.link).hostname)).slice(0, 5);
  const fontesOficiais = [];
  for (const o of oficiais) {
    const leitura = await lerPagina(o.link);
    fontesOficiais.push({ titulo: o.title || '', link: o.link, ...leitura });
    await esperar(PAUSA_MS);
  }

  // Links internos: artigos já publicados com palavras em comum com a palavra-chave
  const artigosFile = 'data/articles.json';
  const publicados = (lerJson(artigosFile, { articles: [] }).articles || lerJson(artigosFile, [])).filter((a) => a.status === 'published' && a.slug);
  const tokens = (t) => new Set(String(t).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const base = tokens(PALAVRA);
  const linksInternos = publicados
    .map((a) => ({ titulo: a.title || '', url: `/${a.slug}`, comum: [...tokens(`${a.title || ''} ${a.keyword || ''}`)].filter((w) => base.has(w)).length }))
    .filter((a) => a.comum > 0)
    .sort((x, y) => y.comum - x.comum)
    .slice(0, 5)
    .map(({ titulo, url }) => ({ titulo, url }));

  const resultado = {
    palavra: PALAVRA,
    data: hoje,
    fonte: 'SerpAPI (Google Brasil)',
    concorrentes: paginas,
    fontes_oficiais: fontesOficiais,
    links_internos_sugeridos: linksInternos,
    perguntas: (j.related_questions || []).map((q) => q.question).filter(Boolean),
    relacionadas: (j.related_searches || []).map((q) => q.query).filter(Boolean),
    ai_overview: !!j.ai_overview,
  };

  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(resultado, null, 1));
  // Expõe a palavra-chave ao workflow para enviar somente pesquisas realmente novas ao Notion.
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `pesquisa=${PALAVRA.replace(/[\\r\\n]/g, ' ')}\\n`);
  }
  uso.buscas++;
  fs.writeFileSync(USO_FILE, JSON.stringify(uso));
  const lidas = paginas.filter((p) => p.lida).length;
  const oficiaisLidas = fontesOficiais.filter((f) => f.lida).length;
  console.log(`"${PALAVRA}": ${paginas.length} concorrentes (${lidas} lidas), ${fontesOficiais.length} fontes oficiais (${oficiaisLidas} lidas), ${linksInternos.length} links internos, ${resultado.perguntas.length} perguntas. Busca ${uso.buscas}/${LIMITE_MES} no mês. Gravado em ${arquivo}`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
