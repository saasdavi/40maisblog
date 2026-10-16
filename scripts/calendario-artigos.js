// Gera o relatório Markdown do calendário de artigos: publicados, prontos para publicação futura e que precisam de revisão.
// Datas = ordem real da fila do robô (3/dia, a partir do próximo dia sem publicação). A programação usa calendario-12-meses.json.
//   node scripts/calendario-artigos.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ArticleRobot from './article-robot.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const robot = new ArticleRobot();
const arts = robot.db.articles;
const POR_DIA = 3;
const sens = (a) => (a.scores?.atencao || []).some((m) => m.includes('sensível'));
const precisaRevisar = (a) => (a.scores?.total ?? 0) < 90 || sens(a);
const motivo = (a) => {
  const m = a.scores?.atencao || [], c = [];
  if (sens(a)) c.push('tema sensível sem REVISADO');
  if ((a.scores?.total ?? 0) < 90) {
    if (m.some((t) => t.includes('demanda NÃO medida'))) c.push('demanda não medida');
    else if (m.some((t) => t.includes('demanda baixa'))) c.push('demanda baixa');
    if (m.some((t) => t.includes('canibalização'))) c.push('parecido com outro artigo');
    if (m.some((t) => t.includes('imagem(ns)'))) c.push('faltam imagens');
    if (!c.length) c.push(`nota ${a.scores?.total} abaixo de 90`);
  }
  return c.join('; ');
};
const brt = (d) => new Date(d.getTime() - 3 * 3600 * 1000);
const dia = (d) => brt(d).toISOString().slice(0, 10);
const br = (iso) => iso.split('-').reverse().join('/');
const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

const publicados = arts.filter((a) => a.status === 'published').sort((x, y) => x.publishedAt.localeCompare(y.publishedAt));
const fila = robot.prontosNoEstoque(); // ordem real em que o robô publica (artigos em revisão ficam de fora)
const foraFila = arts.filter((a) => a.estoque && a.status === 'draft' && !fila.includes(a)); // em revisão: o robô não publica
const hojeIso = dia(new Date());
const hoje = publicados.filter((a) => dia(new Date(a.publishedAt)) === hojeIso).length;
// primeiro dia com vaga: hoje se ainda cabe, senão amanhã
const d0 = new Date(hojeIso + 'T12:00:00Z'); if (hoje >= POR_DIA) d0.setUTCDate(d0.getUTCDate() + 1);
const data = (i) => { const d = new Date(d0); d.setUTCDate(d.getUTCDate() + Math.floor((i + (hoje >= POR_DIA ? 0 : hoje)) / POR_DIA)); return d.toISOString().slice(0, 10); };
// datas e artigo novo do dia vêm do calendário de 12 meses (scripts/calendario-editorial.js), a fonte única da programação
let cal12 = { slots: [] }; try { cal12 = JSON.parse(fs.readFileSync(path.join(raiz, 'data/conteudo/calendario-12-meses.json'), 'utf8')); } catch { /* ainda não gerado */ }
const diaDoEstoque = new Map(cal12.slots.filter((x) => x.slug).map((x) => [x.slug, x.data]));
const novos = cal12.slots.filter((x) => x.tipo === 'novo (IA)').slice(0, 21);
const plano = fila.map((a, i) => ({ a, dia: diaDoEstoque.get(a.slug) || data(i), n: i + 1 }));
const prontos = plano;
const revisar = [];

const L = [];
L.push('# Calendário de artigos', '', `Gerado por \`scripts/calendario-artigos.js\` em ${br(hojeIso)}. Por dia: 1 artigo novo escrito por IA (Gemini, reserva Claude) + 2 do estoque pronto (tabela 2, na ordem do robô, coluna **Nº**). Quando o estoque acaba, os 3 do dia são escritos pela API. Plano de 12 meses: \`calendario-12-meses.md\`.`, '',
  `| Situação | Artigos |`, '|---|---|', `| Publicados | ${publicados.length} |`, `| Prontos para publicação futura (nota 90+, sem revisão pendente) | ${prontos.length} |`,
  `| Precisam de revisão (o robô não publica até serem revisados) | ${revisar.length + foraFila.length} |`, '',
  `O robô pula os artigos da tabela 3 até serem revisados e reimportados.`, '',
  `## 1. Artigos publicados (${publicados.length})`, '', '| Data | Artigo | Nota |', '|---|---|---|',
  ...publicados.map((a) => `| ${br(dia(new Date(a.publishedAt)))} | ${esc(a.title)} (\`/${a.slug}/\`) | ${a.scores?.total ?? a.scores?.auditoria ?? '—'} |`), '',
  `## 1b. Artigo novo (IA) dos próximos dias`, '', '| Data | Palavra-chave | Situação |', '|---|---|---|',
  ...novos.map((x) => `| ${br(x.data)} | ${esc(x.palavra)} | ${esc(x.situacao)} |`), '',
  `## 2. Prontos para publicação futura (${prontos.length})`, '', '| Nº | Data prevista | Artigo | Palavra-chave | Nota | Origem |', '|---|---|---|---|---|---|',
  ...prontos.map((x) => `| ${x.n} | ${br(x.dia)} | ${esc(x.a.title)} (\`/${x.a.slug}/\`) | ${esc(x.a.primaryKeyword)} | ${x.a.scores.notaChat >= 9 ? `${String(x.a.scores.notaChat).replace('.', ',')}/10 (chat)` : x.a.scores.total} | ${x.a.redator === 'chat' ? 'chat' : x.a.origem === 'importado' ? 'importado' : x.a.escritoPor || 'robô'} |`), '',
  `## 3. Precisam de revisão (${revisar.length + foraFila.length})`, '', '| Nº | Data prevista se ninguém revisar | Artigo | Palavra-chave | Nota | Motivo |', '|---|---|---|---|---|---|',
  ...revisar.map((x) => `| ${x.n} | ${br(x.dia)} | ${esc(x.a.title)} (\`/${x.a.slug}/\`) | ${esc(x.a.primaryKeyword)} | ${x.a.scores.total} | ${motivo(x.a)} |`),
  ...foraFila.map((a) => `| — | em revisão | ${esc(a.title)} (\`/${a.slug}/\`) | ${esc(a.primaryKeyword)} | ${a.scores?.total ?? a.scores?.auditoria ?? '—'} | ${motivo(a) || 'auditoria ' + a.scores?.auditoria + ' (precisa passar de 85)'} |`), '');
fs.writeFileSync(path.join(raiz, 'data/conteudo/CALENDARIO-ARTIGOS.md'), L.join('\n'));

console.log(`publicados ${publicados.length} | prontos ${prontos.length} | revisar ${revisar.length + foraFila.length} (fora da fila ${foraFila.length}) | último dia da fila ${plano.at(-1)?.dia}`);
