// Sistema de pontuação automática de artigos (sem API). Nota final 0-100 + decisão.
// Uso: import { pontuar } from './pontuacao.js'   |   CLI: node scripts/pontuacao.js --todos  (grava data/conteudo/PONTUACAO.md)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { demandaDe, norm } from './demanda-lib.js';

const OFICIAL = /(gov\.br|\.gov\b|sbn\.org|scielo|who\.int|nih\.gov|ncbi\.nlm|medlineplus|heart\.org|cardiol\.br|sbd\.org|endocrino\.org|nhs\.uk|cdc\.gov|mayoclinic|hopkinsmedicine|harvard\.edu|bvsalud|bvs\.|fiocruz|anvisa|sbem|sbc\.org|ama-assn|sbgg|sbmfc|inca\.gov|einstein\.br|hospitaloswaldocruz|hcor\.com|drauziovarella|msdmanuals|thyroid\.org|diabetes\.org|kidney\.org|hospitalsiriolibanes|portal\.pucrs|\.edu\b|usp\.br|unifesp)/i;
const SENS = /\b(minoxidil|isotretin\w*|tretin\w*|hidroquinon\w*|ozempic|mounjaro|wegovy|semaglut\w*|tirzepat\w*|finasterid\w*|melatonin\w*|antidepress\w*|cancer|melanoma|quimio\w*|creatinina|ureia|hemograma|ferritina|tsh|psa|reposicao hormonal|colesterol|pressao|diabetes|insulin\w*|prostata|tireoid\w*|hipotireoidismo)\b/;
const toks = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 2));
const jacc = (a, b) => { const i = [...a].filter((x) => b.has(x)).length; return i / Math.max(1, a.size + b.size - i); };

export function pontuar({ art, aud, outros = [], revisado = false, imagensPrevistas = null }) {
  const palavras = art.wordCount || 0;
  const dem = demandaDe(art.primaryKeyword);
  const fontes = art.sources || [];
  const ofic = fontes.filter((f) => OFICIAL.test(f.url || '')).length;
  // 1 qualidade técnica (auditoria do robô)
  const qualidade = aud?.nota ?? 0;
  // 2 demanda
  const d = !dem ? 25 : dem.volume >= 10000 ? 100 : dem.volume >= 1000 ? 80 : 45;
  // 3 fontes: registrar a cobertura como indicador informativo; não interfere na nota nem na aprovação.
  const f = fontes.length >= 3 && ofic >= 2 ? 100 : fontes.length >= 3 && ofic >= 1 ? 80 : fontes.length >= 2 && ofic >= 1 ? 65 : fontes.length >= 2 ? 45 : 15;
  // 4 originalidade / canibalização contra o resto do blog
  const meu = toks(`${art.primaryKeyword} ${art.title}`);
  let maxSim = 0, parecido = null;
  for (const o of outros) { if (o.slug === art.slug) continue; const s = jacc(meu, toks(`${o.primaryKeyword} ${o.title}`)); if (s > maxSim) { maxSim = s; parecido = o.primaryKeyword; } }
  const orig = maxSim >= 0.8 ? 0 : maxSim >= 0.65 ? 40 : maxSim >= 0.5 ? 70 : 100;
  // 5 formato e cobertura
  const internos = [...(art.content || '').matchAll(/href="(\/[a-z0-9-]+\/)"/g)].length;
  // foto buscada na hora de publicar (fotoPendente): conta as imagens previstas no plano
  const imgs = imagensPrevistas ?? ((art.images || []).length + (art.featuredImage ? 1 : 0));
  const formato = (palavras >= 1500 ? 60 : palavras >= 1200 ? 50 : palavras >= 1000 ? 30 : 0) + (imgs >= 3 ? 20 : imgs >= 2 ? 10 : 0) + (internos >= 2 ? 20 : internos ? 10 : 0);
  // 6 segurança editorial
  const sensivel = SENS.test(norm(art.primaryKeyword));
  const seg = aud?.bloqueios?.length ? 0 : sensivel && !revisado ? 40 : 100;
  const total = Math.round(qualidade * 0.4 + d * 0.2 + orig * 0.15 + formato * 0.15 + seg * 0.1);
  const motivos = [];
  if (aud?.bloqueios?.length) motivos.push(...aud.bloqueios.map((b) => `BLOQUEIO: ${b}`));
  if (!dem) motivos.push('demanda NÃO medida: palavra-chave fora de demanda-validada.json');
  else if (dem.volume < 1000) motivos.push(`demanda baixa (${dem.volume}/mês)`);
  if (ofic < 2) motivos.push(`só ${ofic} fonte(s) oficial(is) de ${fontes.length} (ideal 2+)`);
  if (maxSim >= 0.5) motivos.push(`parecido com "${parecido}" (${Math.round(maxSim * 100)}%): risco de canibalização`);
  if (palavras < 1200) motivos.push(`${palavras} palavras (ideal 1.200+)`);
  if (internos < 2) motivos.push(`${internos} link(s) interno(s) (mín 2)`);
  if (imgs < 3) motivos.push(`${imgs} imagem(ns) (ideal 3)`);
  if (sensivel && !revisado) motivos.push('tema sensível sem REVISADO: sim');
  if (aud?.alertas?.length) motivos.push(...aud.alertas.map((a) => `ajuste: ${a}`));
  const decisao = aud?.bloqueios?.length || total < 70 || maxSim >= 0.8 ? 'DEVOLVER' : total >= 85 && !(sensivel && !revisado) ? 'PUBLICAR' : 'SEGURAR (corrigir)';
  return { total, decisao, partes: { qualidade, demanda: d, fontes: f, originalidade: orig, formato, seguranca: seg }, demanda: dem ? { volume: dem.volume, classe: dem.classe } : null, oficiais: ofic, motivos };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) && process.argv.includes('--todos')) {
  const { default: ArticleRobot } = await import('./article-robot.js');
  const robot = new ArticleRobot();
  const arts = robot.db.articles;
  const linhas = arts.map((a) => { a._substitui = a.slug; const aud = robot.auditar(a, null); delete a._substitui; const p = pontuar({ art: a, aud, outros: arts, revisado: true }); return { a, p }; }).sort((x, y) => y.p.total - x.p.total);
  const cont = {}; for (const { p } of linhas) cont[p.decisao] = (cont[p.decisao] || 0) + 1;
  let md = `# Pontuação dos artigos (gerado por scripts/pontuacao.js)\n\nNota final = qualidade técnica 40% + demanda 20% + originalidade 15% + formato 15% + segurança 10%. Fontes são indicador informativo e não alteram a nota nem a aprovação. PUBLICAR ≥ 85 sem bloqueio; SEGURAR 70–84; DEVOLVER < 70 ou bloqueio. Resumo: ${Object.entries(cont).map(([k, v]) => `${k} ${v}`).join(' | ')}\n\n| Nota | Decisão | Artigo | Qualidade | Demanda | Fontes | Origin. | Formato | Principais pontos |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const { a, p } of linhas) md += `| ${p.total} | ${p.decisao} | ${a.primaryKeyword} (${a.status === 'published' ? 'no ar' : 'estoque'}) | ${p.partes.qualidade} | ${p.partes.demanda} | ${p.partes.fontes} | ${p.partes.originalidade} | ${p.partes.formato} | ${p.motivos.slice(0, 3).join('; ').replace(/\|/g, '/')} |\n`;
  fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/conteudo/PONTUACAO.md'), md);
  console.log(Object.entries(cont).map(([k, v]) => `${k}: ${v}`).join(' | '));
  for (const { a, p } of linhas.slice(0, 5)) console.log(p.total, p.decisao, a.primaryKeyword);
  for (const { a, p } of linhas.slice(-8)) console.log(p.total, p.decisao, a.primaryKeyword, '|', p.motivos.slice(0, 2).join('; '));
}
