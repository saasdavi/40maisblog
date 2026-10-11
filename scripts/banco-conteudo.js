// Banco de conteúdo: um índice do que existe de conteúdo pronto para usar, publicado e ainda por escrever.
//   node scripts/banco-conteudo.js
// Fonte da verdade dos textos: data/articles.json. Este script NÃO muda artigos; gera/atualiza:
//   data/conteudo/INDICE.md e INDICE.json   (visão geral e lista por artigo)
//   data/conteudo/prontos/<slug>.json        (cada artigo PRONTO do estoque: título, descrição, HTML, fontes, imagens, alt, nota)
//   data/conteudo/prontos/<slug>.html        (só o corpo, para copiar e usar)
// Status: publicado (no ar) | pronto (escrito, aprovado, guardado como rascunho) | pauta validada (falta escrever) | planejado (ainda por validar).
import fs from 'fs';
import ArticleRobot from './article-robot.js';

const lerJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const a = lerJson('data/articles.json', []);
const lista = Array.isArray(a) ? a : a.articles || [];
const fila = lerJson('data/keywords-validated.json', { keywords: [] }).keywords;
const plano = lerJson('data/plano-editorial.json', { totais: {}, calendario: [] });
const pontes = lerJson('data/pontes.json', { linkaPara: {} }).linkaPara;

// previsão de publicação: dia do plano editorial em que a palavra aparece
const previsao = new Map();
for (const d of plano.calendario || []) for (const p of d.pautas || []) if (p.tema) previsao.set(p.tema.toLowerCase(), d.data);

const publicados = lista.filter((x) => x.status === 'published');
// "pronto" = a fila real do robô (prontosNoEstoque): nota 90+ e sem revisão pendente. Os que precisam de revisão não entram.
const naFila = new Set(new ArticleRobot().prontosNoEstoque().map((x) => x.slug));
const prontos = lista.filter((x) => naFila.has(x.slug));
const emRevisao = lista.filter((x) => x.status === 'draft' && x.estoque === true && !naFila.has(x.slug));
const usadas = new Set(lista.filter((x) => x.status === 'published' || x.estoque).map((x) => (x.primaryKeyword || '').toLowerCase()));
const semTexto = fila.filter((k) => k.serp?.facil === true && (k.fontes || []).length >= 2 && !k.substitui && !usadas.has(k.keyword.toLowerCase()));
const metricas = (x) => ({ palavras: x.wordCount, h2: (x.content.match(/<h2/gi) || []).length, imagens: (x.content.match(/<img/gi) || []).length + (x.featuredImage ? 1 : 0), fontes: (x.sources || []).length, auditoria: x.scores?.auditoria ?? null });

fs.mkdirSync('data/conteudo/prontos', { recursive: true });
const linhas = [];
for (const x of lista.filter((y) => y.status === 'published' || y.estoque)) {
  const pronto = naFila.has(x.slug);
  linhas.push({ slug: x.slug, titulo: x.title, palavraChave: x.primaryKeyword, cluster: x.cluster, volume: x.volume, status: pronto ? 'pronto' : x.status === 'draft' ? 'em revisão' : 'publicado', ...metricas(x), publicadoEm: x.publishedAt || null, escritoEm: x.estocadoEm || x.createdAt || null, previstoPara: pronto ? previsao.get((x.primaryKeyword || '').toLowerCase()) || null : null, pontesSugeridas: (pontes[x.primaryKeyword] || []).map((p) => p.para) });
  if (pronto) {
    fs.writeFileSync(`data/conteudo/prontos/${x.slug}.json`, JSON.stringify({ slug: x.slug, title: x.title, description: x.description, primaryKeyword: x.primaryKeyword, cluster: x.cluster, volume: x.volume, wordCount: x.wordCount, readingTime: x.readingTime, sources: x.sources, featuredImage: x.featuredImage, imageAlt: x.imageAlt, imageCredit: x.imageCredit, images: x.images, scores: x.scores, validador: x.validador, validacao: x.validacao || null, content: x.content }, null, 1));
    fs.writeFileSync(`data/conteudo/prontos/${x.slug}.html`, x.content);
  }
}
// remove arquivos de prontos que já foram publicados (saíram do estoque)
const vivos = new Set(prontos.map((x) => x.slug));
for (const f of fs.readdirSync('data/conteudo/prontos')) { const sl = f.replace(/\.(json|html)$/, ''); if (!vivos.has(sl)) fs.unlinkSync(`data/conteudo/prontos/${f}`); }

const resumo = { publicados: publicados.length, prontosParaUsar: prontos.length, pautasValidadasSemTexto: semTexto.length, planejadasAValidar: (plano.totais?.['a-checar'] || 0) + (plano.totais?.['a-validar'] || 0), vagas: plano.totais?.vaga || 0, espacosDoPlano: plano.espacos || null };
const diasProntos = Math.floor(prontos.length / 2), diasEscrever = Math.floor(semTexto.length / 3); // do estoque saem 2 por dia (o 3º é artigo novo escrito por IA)
fs.mkdirSync('data/conteudo', { recursive: true });
fs.writeFileSync('data/conteudo/INDICE.json', JSON.stringify({ resumo, artigos: linhas }, null, 1));
const md = ['# Banco de conteúdo', '', 'Fonte dos textos: `data/articles.json`. Atualizado por `node scripts/banco-conteudo.js` (roda nos workflows de produção e de estoque).', '',
  '| O que | Quantidade | Dias |', '|---|---|---|',
  `| **Pronto para usar** (a fila do robô; saem 2 por dia) | **${prontos.length}** | ${diasProntos} |`,
  `| Precisa de revisão (o robô não publica) | ${emRevisao.length} | |`,
  `| Publicado (no ar) | ${publicados.length} | |`,
  `| Pauta validada, falta escrever | ${semTexto.length} | ${diasEscrever} |`,
  `| Planejado, falta validar no Google | ${resumo.planejadasAValidar} | ${Math.floor(resumo.planejadasAValidar / 3)} |`,
  `| Vagas (sem tema levantado) | ${resumo.vagas} | |`, '',
  `Dias de conteúdo já escrito + pauta validada: **${diasProntos + diasEscrever}** (estoque a 2 por dia; pauta validada, 1 por dia).`, '',
  '## Prontos para usar', '', prontos.length ? '| Artigo | Palavras | Auditoria | Previsto para |\n|---|---|---|---|' : '_Nenhum ainda: rode o workflow "Escrever estoque de artigos"._',
  ...linhas.filter((l) => l.status === 'pronto').map((l) => `| ${l.titulo} | ${l.palavras} | ${l.auditoria ?? '-'} | ${l.previstoPara || '-'} |`), '',
  '## Publicados', '', '| Artigo | Palavras | Auditoria | Publicado em |', '|---|---|---|---|',
  ...linhas.filter((l) => l.status === 'publicado').map((l) => `| ${l.titulo} | ${l.palavras} | ${l.auditoria ?? '-'} | ${(l.publicadoEm || '').slice(0, 10)} |`), '',
  '## Pautas validadas esperando texto (próximas a escrever)', '', ...semTexto.slice(0, 40).map((k) => `- ${k.keyword} (${k.volume}/mês)${k.sensivel ? ' [sensível: trava até revisão]' : ''}`), ''].join('\n');
fs.writeFileSync('data/conteudo/INDICE.md', md);
console.log(JSON.stringify(resumo));
