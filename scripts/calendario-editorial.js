// Calendário de 12 meses: 365 dias x 3 vagas por dia. Sem API. Saída: data/conteudo/calendario-12-meses.csv, .md e .json,
// data/conteudo/calendario-excluidos.csv (o que ficou de fora, com o motivo). Rode: node scripts/calendario-editorial.js
//
// Programação do dia: vaga 1 = artigo NOVO escrito por IA (Gemini, reserva Claude, SerpAPI antes); vagas 2 e 3 = estoque pronto (sem IA).
//   vaga 1: sempre artigo novo (IA). Vagas 2 e 3: os prontos reais (prontosNoEstoque, na ordem do robô); quando o estoque pronto acaba,
//   essas vagas também viram artigo novo escrito por IA pela API (3 por dia). Tema do novo: próxima pauta validada da fila do robô
//   (escolherPauta); acabando a fila, o próximo tema do conjunto abaixo
// Conjunto de temas (nada se perde): frases medidas de demanda-validada.json (1.000+ buscas) + todas as linhas de pautas-mestre.csv
// (grupos 2, 2b e 3) + camadas a-checar/a-validar do plano-editorial.json, agrupadas em famílias (pauta-mãe + satélites no mesmo artigo),
// sem o que já virou artigo. Cada frase termina no calendário, já coberta por artigo, ou em calendario-excluidos.csv com o motivo.
process.env.BATCH_SIZE = '100000'; process.env.DAILY_LIMIT = '100000'; // escolherPauta() devolve a fila inteira, na ordem do robô
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { norm } from './demanda-lib.js';
import { SAUDE, LIXO } from './lib/saude.js';
const { default: ArticleRobot } = await import('./article-robot.js');

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(raiz, f), 'utf8')); } catch { return fb; } };
const lerCsv = (f) => fs.readFileSync(path.join(raiz, f), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1).map((l) => { const c = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ';' && !q) { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return c; });
const sa = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SUF = new Set(['para', 'que', 'serve', 'efeitos', 'colaterais', 'como', 'usar', 'causas', 'causa', 'sintomas', 'tratamento', 'funciona', 'beneficios', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'e', 'em', 'no', 'na', 'dos', 'das', 'quanto', 'qual', 'quais', 'tomar', 'faz', 'bem', 'mal', 'melhor', 'natural', 'valor', 'preco', 'oral', 'comprimido', 'capsula', 'capsulas']);
const toks = (f) => norm(f).split(' ').filter((t) => t && !SUF.has(t));
const chave = (f) => { const t = toks(f); return (t.length <= 2 ? t : t.slice(0, 2)).join(' '); };
const FERRAMENTA = /\b(calcular|calculadora|calculo|simulador|online gratis|download|baixar (pdf|planilha|app|aplicativo|ebook))\b/;
// fora do nicho (café, lanches, carnes, locais): o filtro SAUDE sozinho deixava de fora temas de saúde reais (hipoglicemia, proteção solar), então o corte é pela lista de ruído
const RUIDO = /\b(cafe|cafes|cafeteiras?|dolce gusto|nespresso|nescafe|3 coracoes|tres coracoes|capsulas? de cafe|lanches?|lanchonetes?|sanduiches?|distribuidoras?|bebidas|cervejas?|churrasco|acougue|picanha|alcatra|wagyu|bife|carnes?|aquario|aposentadoria|perto de mim|proximo|mercado|supermercado|restaurantes?|coca cola|refrigerantes?|isosource|barra de cereal|sorvetes?|bolos?|tortas?|pizzas?|hamburguer|marmita|delivery|casamento|escort)\b/;
const COMERCIAL = /\b(comprar|preco|onde comprar|promocao|cupom|farmacia|desconto|barato|loja)\b/;

const robot = new ArticleRobot();
const arts = robot.db.articles;

// 1) o que já é artigo (publicado, estoque, em revisão) ou pauta validada: não entra como tema novo
const cobertas = new Set();
for (const a of arts) { cobertas.add(chave(a.primaryKeyword)); for (const s of a.validacao?.apoio || []) cobertas.add(chave(s)); }
const validadas = robot.escolherPauta(); // vaga 1, na ordem do robô
for (const p of validadas) { cobertas.add(chave(p.keyword)); for (const s of p.secundarias || []) cobertas.add(chave(s.palavra)); }

// 2) todas as frases de todas as fontes
const frases = new Map(); // norm -> { frase, vol, tema, sens, sobe, grupo, origem }
const juntar = (frase, vol, tema, sens, sobe, grupo, origem) => {
  const n = norm(frase); if (!n) return;
  const e = frases.get(n);
  if (!e) frases.set(n, { frase, vol, tema, sens, sobe, grupo, origem: [origem] });
  else { if (vol > e.vol) { e.vol = vol; e.frase = frase; e.tema = tema || e.tema; } e.sens ||= sens; e.sobe ||= sobe; e.grupo = e.grupo < grupo ? e.grupo : grupo; if (!e.origem.includes(origem)) e.origem.push(origem); }
};
for (const r of lerCsv('data/conteudo/pautas-mestre.csv')) {
  const [grupo, tema, frase, vol, , tend, , , sens] = r; const g = grupo.startsWith('2b') ? 2 : grupo.startsWith('2') ? 1 : 3;
  juntar(frase, parseInt(vol, 10) || 0, tema, sens === 'sim', tend === 'subindo', g, 'pautas-mestre.csv');
}
for (const e of Object.values(lerJson('data/pesquisa/demanda-validada.json', { itens: {} }).itens)) if (e.volume >= 1000) juntar(e.frase, e.volume, e.tema, false, e.tendencia === 'subindo', 1, 'demanda-validada.json');
const plano = lerJson('data/plano-editorial.json', { calendario: [] });
for (const d of plano.calendario || []) for (const p of d.pautas || []) if (p.status === 'a-checar' || p.status === 'a-validar') juntar(p.tema, p.volume || 0, p.cluster, !!p.sensivel, false, p.status === 'a-checar' ? 1 : 2, 'plano-editorial.json');

// 3) exclusões com motivo e famílias
const excluidos = []; const fam = new Map(); let jaCobertas = 0;
for (const e of frases.values()) {
  const s = sa(e.frase);
  const motivo = LIXO.test(s) ? 'ruído / fora do nicho (LIXO)' : RUIDO.test(s) ? 'ruído / fora do nicho (café, lanches, carnes, locais)' : FERRAMENTA.test(s) ? 'ferramenta ou arquivo, não artigo' : COMERCIAL.test(s) ? 'intenção de compra' : null;
  if (motivo) { excluidos.push({ ...e, motivo }); continue; }
  const k = chave(e.frase); if (!k) { excluidos.push({ ...e, motivo: 'frase sem termo útil' }); continue; }
  if (cobertas.has(k)) { jaCobertas++; continue; }
  const c = fam.get(k) || { tema: e.tema, cabeca: e.frase, vmax: 0, soma: 0, sats: [], sens: false, sobe: false, grupo: 3, saude: false, membros: [] };
  c.membros.push({ frase: e.frase, vol: e.vol, origem: e.origem });
  c.saude ||= SAUDE.test(s); // a família é de saúde se qualquer frase dela for
  c.soma += e.vol; c.sens ||= e.sens; c.sobe ||= e.sobe; c.grupo = Math.min(c.grupo, e.grupo);
  if (e.vol > c.vmax) { if (c.vmax) c.sats.push(c.cabeca); c.cabeca = e.frase; c.vmax = e.vol; c.tema = e.tema || c.tema; } else c.sats.push(e.frase);
  fam.set(k, c);
}
// ordem: medidas de 1.000+ (por demanda somada, em alta primeiro), depois ganha-pão 100–999, depois as sem medida
const rank = (c) => (c.vmax >= 1000 ? 0 : c.vmax >= 100 ? 1 : 2);
const pool = [...fam.values()].sort((a, b) => rank(a) - rank(b) || (b.saude ? 1 : 0) - (a.saude ? 1 : 0) || (b.soma + (b.sobe ? 5000 : 0)) - (a.soma + (a.sobe ? 5000 : 0)));

// 4) agenda: 365 dias a partir de amanhã (dia de Brasília)
const hojeBR = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const inicio = new Date(hojeBR + 'T12:00:00Z'); inicio.setUTCDate(inicio.getUTCDate() + 1);
const DIAS = 365;
const estoque = robot.prontosNoEstoque();
let iVal = 0, iEst = 0; const saida = [];
const dTxt = (d) => new Date(inicio.getTime() + d * 86400000).toISOString().slice(0, 10);
const pegaDoPool = (temas, sens) => {
  let i = pool.findIndex((c) => !temas.has(c.tema) && !(c.sens && sens));
  if (i < 0) i = pool.findIndex((c) => !(c.sens && sens));
  return i < 0 ? null : pool.splice(i, 1)[0];
};
for (let d = 0; d < DIAS; d++) {
  const data = dTxt(d); const temas = new Set(); let sens = false; const doDia = [];
  const poolRow = (tipo, quem) => {
    const c = pegaDoPool(temas, sens);
    if (!c) return { tipo: 'VAGA (levantar tema)', quem: '', situacao: 'sem tema', tema: '', frase: '', vol: '', soma: '', sens: '', sats: '' };
    temas.add(c.tema); sens ||= c.sens;
    return { tipo, quem, situacao: (c.vmax ? 'tema novo: validar no Google' : 'tema novo: medir no Planner e validar') + (c.saude ? '' : ' (nicho a conferir)'), tema: c.tema || '', frase: c.cabeca, vol: c.vmax || '', soma: c.soma || '', sens: c.sens ? 'sim' : '', sats: c.sats.slice(0, 5).join(' | ') };
  };
  // artigo novo escrito por IA: pauta validada primeiro; acabando a fila validada, o próximo tema do conjunto
  const novo = () => {
    if (iVal < validadas.length) { const p = validadas[iVal++]; temas.add(p.cluster); sens ||= !!p.sensivel; return { tipo: 'novo (IA)', quem: 'Gemini, reserva Claude, SerpAPI antes', situacao: 'pauta validada', tema: p.cluster || '', frase: p.keyword, vol: p.volume || '', soma: '', sens: p.sensivel ? 'sim' : '', sats: (p.secundarias || []).slice(0, 5).map((x) => x.palavra).join(' | ') }; }
    return poolRow('novo (IA)', 'Gemini, reserva Claude, SerpAPI antes');
  };
  doDia.push(novo()); // vaga 1
  for (let j = 0; j < 2; j++) { // vagas 2 e 3: estoque pronto; acabando, também artigo novo pela API
    if (iEst < estoque.length) { const a = estoque[iEst++]; doDia.push({ tipo: 'estoque (pronto)', quem: 'pronto, sem IA', situacao: 'pronto', tema: a.cluster || '', frase: a.primaryKeyword, vol: a.volume || '', soma: '', sens: '', sats: '', slug: a.slug }); }
    else doDia.push(novo());
  }
  doDia.forEach((x, j) => saida.push({ data, mes: data.slice(0, 7), n: j + 1, ...x }));
}
// o que sobrou do conjunto fica na fila de espera (depois dos 12 meses)
for (const c of pool) for (const m of c.membros) excluidos.push({ frase: m.frase, vol: m.vol, tema: c.tema, origem: m.origem, motivo: 'fila de espera: depois dos 12 meses' });

// 5) saídas
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const cab = ['data', 'mes', 'n_do_dia', 'tipo', 'tema', 'palavra_chave', 'buscas_mes_cabeca', 'buscas_soma_familia', 'sensivel_revisao', 'satelites_no_mesmo_artigo', 'quem_escreve', 'situacao'];
fs.writeFileSync(path.join(raiz, 'data/conteudo/calendario-12-meses.csv'), '﻿' + [cab.join(';'), ...saida.map((x) => [x.data, x.mes, x.n, x.tipo, x.tema, x.frase, x.vol, x.soma || '', x.sens, x.sats, x.quem, x.situacao].map(q).join(';'))].join('\n') + '\n');
fs.writeFileSync(path.join(raiz, 'data/conteudo/calendario-12-meses.json'), JSON.stringify({ gerado: hojeBR, inicio: dTxt(0), dias: DIAS, slots: saida.map((x) => ({ data: x.data, n: x.n, tipo: x.tipo, palavra: x.frase, slug: x.slug || null, situacao: x.situacao })) }));
fs.writeFileSync(path.join(raiz, 'data/conteudo/calendario-excluidos.csv'), '﻿' + ['frase;buscas_mes;tema;origem;motivo', ...excluidos.sort((a, b) => (b.vol || 0) - (a.vol || 0)).map((e) => [e.frase, e.vol || '', e.tema || '', (e.origem || []).join(' + '), e.motivo].map(q).join(';'))].join('\n') + '\n');

const por = {}; for (const x of saida) { const m = (por[x.mes] ||= { novoVal: 0, novoTema: 0, est: 0, vaga: 0 }); if (x.tipo === 'novo (IA)') (x.situacao === 'pauta validada' ? m.novoVal++ : m.novoTema++); else if (x.tipo === 'estoque (pronto)') m.est++; else m.vaga++; }
const T = Object.values(por).reduce((a, v) => ({ nv: a.nv + v.novoVal, nt: a.nt + v.novoTema, e: a.e + v.est, v: a.v + v.vaga }), { nv: 0, nt: 0, e: 0, v: 0 });
const T0 = { e: estoque.length };
let md = `# Calendário editorial de 12 meses (3 por dia)\n\nGerado por \`scripts/calendario-editorial.js\` em ${hojeBR}. Início ${dTxt(0)}. Substitui o calendário antigo de 06/10.\n\n`
  + `**Programação do dia:** vaga 1 = artigo **novo** escrito por IA (Gemini, reserva Claude, com a pesquisa da SerpAPI antes); vagas 2 e 3 = **estoque pronto**, publicado direto, sem IA. Quando o estoque pronto acaba (${T0.e} artigos, ≈ ${Math.ceil(T0.e / 2)} dias), as vagas 2 e 3 também passam a ser artigo novo escrito por IA pela API: 3 por dia. Se o novo falhar num dia, o estoque cobre a vaga (enquanto houver).\n\n`
  + `Temas: pautas validadas da fila do robô primeiro; depois famílias de \`pautas-mestre.csv\`, \`demanda-validada.json\` e \`plano-editorial.json\` por demanda somada, alternando tema e no máximo 1 tema sensível por dia (tema sensível só publica depois de \`REVISADO: sim\`). Tema novo = a IA pesquisa o Google (SerpAPI) antes de escrever. O que ficou de fora está em \`calendario-excluidos.csv\`, com o motivo.\n\n`
  + `| Mês | Novo (pauta validada) | Novo (tema a validar) | Estoque pronto | Vaga |\n|---|---|---|---|---|\n`;
for (const [m, v] of Object.entries(por)) md += `| ${m} | ${v.novoVal} | ${v.novoTema} | ${v.est} | ${v.vaga} |\n`;
md += `\n**Total:** ${T.nv} novos de pauta validada + ${T.nt} novos de tema a validar + ${T.e} do estoque pronto + ${T.v} vagas = ${T.nv + T.nt + T.e + T.v}.\n`;
fs.writeFileSync(path.join(raiz, 'data/conteudo/calendario-12-meses.md'), md);

// 6) cobertura: toda frase de saúde com 1.000+ buscas em demanda-validada.json tem destino
const noCal = new Set(); for (const x of saida) { noCal.add(chave(x.frase)); for (const s of (x.sats || '').split(' | ')) if (s) noCal.add(chave(s)); }
const dem = Object.values(lerJson('data/pesquisa/demanda-validada.json', { itens: {} }).itens).filter((e) => e.volume >= 1000);
const exSet = new Set(excluidos.map((e) => norm(e.frase)));
let nCal = 0, nArt = 0, nEx = 0, sem = [];
for (const e of dem) { const k = chave(e.frase); if (exSet.has(norm(e.frase))) nEx++; else if (cobertas.has(k)) nArt++; else if (noCal.has(k)) nCal++; else sem.push(e); }
console.log(`Calendário: ${saida.length} vagas | novos ${T.nv + T.nt} (validados ${T.nv}) | estoque pronto ${T.e} | vagas ${T.v}`);
console.log(`Cobertura das ${dem.length} frases com 1.000+ buscas: no calendário ${nCal} | já são artigo/pauta ${nArt} | excluídas com motivo ${nEx} | sem destino ${sem.length}`);
if (sem.length) console.log('SEM DESTINO:', sem.slice(0, 20).map((e) => `${e.frase} (${e.volume})`).join('; '));
console.log(`Excluídas/fila de espera: ${excluidos.length} (data/conteudo/calendario-excluidos.csv)`);
