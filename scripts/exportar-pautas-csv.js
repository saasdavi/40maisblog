// Gera o CSV mestre de pautas em 3 grupos (UTF-8 com BOM, separador ;): data/conteudo/pautas-mestre.csv
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { norm } from './demanda-lib.js';
import { SAUDE, LIXO } from './lib/saude.js';
import { indiceLongTails, longTails } from './lib/longtails.js';
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (f, d = null) => { try { return JSON.parse(fs.readFileSync(path.join(raiz, f), 'utf8')); } catch { return d; } };
const sa = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const chave = (s) => norm(s).split(' ').sort().join(' ');
const dem = ler('data/pesquisa/demanda-validada.json').itens;
const arts = ler('data/articles.json').articles;
const kv = ler('data/keywords-validated.json'); const kvl = kv.keywords || kv;
const serp = ler('data/pesquisa/serp-resultados.json', {});
const serpK = new Set(Object.keys(serp).map(chave));
const temas = Object.fromEntries(ler('data/temas-regras.json').temas.map((t) => [t.slug, t.nome]));
const regs = ler('data/temas-regras.json').regras.map((r) => ({ tema: r.tema, re: new RegExp(sa(r.padrao)) }));
const tema = (t) => temas[(regs.find((r) => r.re.test(sa(t))) || { tema: 'saude-geral' }).tema];
const SENS = /\b(minoxidil|minoq\w*|isotretin\w*|tretin\w*|hidroquinon\w*|ozempic|mounjaro|wegovy|semaglut\w*|tirzepat\w*|finasterid\w*|dutasterid\w*|melatonin\w*|antidepress\w*|cancer|melanoma|quimio\w*|creatinina|ureia|hemograma|ferritina|tsh|psa|reposicao hormonal|colesterol|pressao|diabetes|insulin\w*|prostata|cobreiro|herpes)\b/;
const GENERICO = /\b(pitaya|laranja|pera|caqui|goiaba|atemoia|fruta do conde|ovos|acucar|chas|carboidratos|bebidas alcoolicas|proteinas|fibras|alcachofra|gengibre|cha de gengibre|frutas|agua|almoco|lanches|cromo|colina|ferro|botox|msm|fruta|frutas|lichia|roma|ice|bebida|bebidas|cisternas|charque|nutricao|laticinios|emagrece|peeling|preenchimento labial|lifting facial|potassio|iodo|vitamina k)\b/;
const RUIDO = /\b(cafeteira|expresso|starbucks|restaurante|delivery|comprar|preco|loja|marca|mercado|bolo|torta|panela|fritadeira|liquidificador|balanca|garrafa|copo|aquario|perto de mim|proximo|distribuidora|dolce gusto|capsulas?|churrasco|picanha|acougue|bife|alcatra|costela|download|baixar|aplicativo|curso|clinica|farmacia|morena|loiro|loira|ruivo|trancas?|corte|cortes|penteados?|tintura|coloracao|ombre|sombre|coque|rabo de cavalo|nutricionista|dia mundial|aniversario|dia das maes|educacao infantil|melissa|whey|sanduiche|carne de|carnes|hamburguer|espetinho|cerveja|gin|vodka|skol|boutique|pao de|comida|deposito|estacao|mcdonald|ingles|fruta do dragao|unimed|verduras e legumes|altas horas|lanche 24|mais 1|bebidas com|casa da|lanche do|cafe|cafe da manha ingles|imc calculo|calculo imc|imc calcular|calcular imc|calculadora)\b/;
const conc = (frase) => { const d = ler(`data/pesquisa/concorrentes/${String(frase).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`); const sp = Object.entries(serp).find(([k]) => chave(k) === chave(frase))?.[1]; if (!sp) return ['', '', '', '', '', '', '', '', '', '', '']; const p1 = d?.paginas?.[0]; return [sp.nivel || sp.veredito || '', (sp.autoridadesTop5 || []).join(', '), p1?.url || sp.topoUrls?.[0] || '', p1?.palavras ?? '', d?.medianaPalavras ?? '', (d?.h2Comuns || []).join(' | '), (sp.perguntas || []).join(' | '), (d?.lacunas || []).join(' | '), (d?.termosComuns || []).join(', '), (d?.paginas || []).filter((x) => !x.erro).map((x, i) => `#${i + 1} ${x.host}: ${x.palavras}p, ${x.h2}H2, img ${x.imagensComAlt}/${x.imagens} alt, kw título ${x.kwNoTitulo ? 'sim' : 'nao'}, kw H1 ${x.kwNoH1 ? 'sim' : 'nao'}, ${x.kwUsos ?? '?'} usos, fontes oficiais ${(x.fontesOficiais || []).length}`).join(' || '), (sp.topoUrls || []).join(' | ')]; };
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const linhas = [];
const usados = new Set();
const dd = (k) => dem[chave(k)] || null;
const temArt = (k) => arts.find((a) => chave(a.primaryKeyword || '') === chave(k));
const prioridade = (e, sens) => (!GENERICO.test(sa(e.frase)) && e.volume >= 5000 && e.volume <= 150000 && e.concorrencia !== 'HIGH' && e.tendencia !== 'caindo' && !sens ? 'SIM' : '');
// Grupo 1: artigos
for (const a of arts) { const k = a.primaryKeyword; const e = dd(k); usados.add(chave(k)); linhas.push(['1 validada + artigo', tema(k), k, e?.volume ?? '', e?.concorrencia ?? '', e?.tendencia ?? '', a.status === 'published' ? 'no ar' : 'estoque', a.scores?.auditoria ?? '', SENS.test(sa(k)) ? 'sim' : '', serpK.has(chave(k)) ? 'sim' : '', '', a.slug]); }
// Grupo 2: validadas sem artigo (antigas + ≥1.000 da demanda)
const g2 = new Map();
for (const k of kvl) if (!temArt(k.keyword)) { const e = dd(k.keyword); g2.set(chave(k.keyword), { frase: k.keyword, volume: e?.volume ?? k.volume ?? '', concorrencia: e?.concorrencia ?? k.competition ?? '', tendencia: e?.tendencia ?? '', origem: 'pauta antiga validada' }); }
for (const e of Object.values(dem)) { const ck = chave(e.frase); if (e.volume >= 1000 && !RUIDO.test(sa(e.frase)) && !temArt(e.frase) && !g2.has(ck)) g2.set(ck, { ...e, origem: e.fonte }); }
const g2l = [...g2.values()].filter((e) => !usados.has(chave(e.frase))).sort((a, b) => (b.volume || 0) - (a.volume || 0));
for (const e of g2l) { const sens = SENS.test(sa(e.frase)); usados.add(chave(e.frase)); linhas.push(['2 validada sem artigo', tema(e.frase), e.frase, e.volume, e.concorrencia || '', e.tendencia || '', '', '', sens ? 'sim' : '', serpK.has(chave(e.frase)) ? 'sim' : '', prioridade(e, sens), e.origem]); }
// Estratégia dos termos menores (blog novo): ganha-pão = 100–999 buscas, intenção própria (não é variação de uma pauta já listada), saúde, sem lixo
const SUF = new Set(['para', 'que', 'serve', 'efeitos', 'colaterais', 'como', 'usar', 'causas', 'causa', 'sintomas', 'tratamento', 'funciona', 'beneficios', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'e', 'em', 'no', 'na', 'quanto', 'tempo', 'qual', 'melhor', 'faz', 'mal', 'tem', 'ter', 'fazer']);
const famK = (f) => { const t = norm(f).split(' ').filter((x) => x && !SUF.has(x)); return t.length <= 2 ? t.join(' ') : t.slice(0, 2).join(' '); };
const familiasUsadas = new Set([...arts.map((a) => famK(a.primaryKeyword)), ...g2l.map((e) => famK(e.frase))]);
const gp = new Map();
for (const e of Object.values(dem)) {
  if (e.volume < 100 || e.volume > 999 || RUIDO.test(sa(e.frase)) || LIXO.test(sa(e.frase)) || !SAUDE.test(sa(e.frase)) || e.concorrencia === 'HIGH' || e.tendencia === 'caindo') continue;
  if (sa(e.frase).split(/\s+/).length < 3) continue;
  const fk = famK(e.frase); if (!fk || familiasUsadas.has(fk) || usados.has(chave(e.frase))) continue;
  const atual = gp.get(fk); if (!atual || e.volume > atual.volume) gp.set(fk, e);
}
for (const e of [...gp.values()].sort((a, b) => b.volume - a.volume)) { const sens = SENS.test(sa(e.frase)); usados.add(chave(e.frase)); linhas.push(['2b ganha-pão (100-999)', tema(e.frase), e.frase, e.volume, e.concorrencia || '', e.tendencia || '', '', '', sens ? 'sim' : '', serpK.has(chave(e.frase)) ? 'sim' : '', '', e.fonte]); }
// Grupo 3: não validadas -> rodar no Planner
const g3 = new Set();
const add3 = (f, o) => { const k = chave(f); if (k && !usados.has(k) && !g3.has(k)) { g3.add(k); linhas.push(['3 rodar no Planner', tema(f), f, '', '', '', '', '', SENS.test(sa(f)) ? 'sim' : '', '', '', o]); } };
for (const f of ['alimentacao-peso', 'cabelo', 'cabelo-expandido', 'cabelo-arvore']) for (const l of ler(`data/pesquisa/validadas/${f}.json`, { linhas: [] }).linhas) if (l.exato == null && l.intencao !== 'estética') add3(l.frase, `sem dado em ${f}`);
for (const f of ['pele', 'sono', 'suplementos']) for (const r of ler(`data/pesquisa/${f}-volumes.json`, [])) if (!r.v && !RUIDO.test(sa(r.k))) add3(r.k, `sem dado em ${f}`);
const caneta = fs.readFileSync(path.join(raiz, 'data/pesquisa/arvores/caneta-jejum.md'), 'utf8');
for (const l of caneta.split('\n')) { const m = l.match(/^\d+\. \*\*[^:]+:\*\* (.+)\.$/) || l.match(/^\d+\. \*\*[^(]+\([\d-]+\):\*\* (.+)\.$/); if (m) for (const p of m[1].split(';')) add3(p.trim().replace(/^caneta e /, 'caneta emagrecedora e '), 'caneta+jejum (mapa-mestre, não medido)'); }
for (const f of ['caneta emagrecedora', 'caneta emagrecedora e jejum', 'ozempic', 'mounjaro', 'wegovy', 'semaglutida', 'tirzepatida', 'jejum intermitente', 'ozempic ou mounjaro', 'wegovy ou mounjaro', 'quanto emagrece com caneta', 'caneta emagrecedora efeitos colaterais']) add3(f, 'caneta+jejum (cabeças)');
const EXTRA0 = ['dificuldade_google', 'autoridades_top5', 'concorrente_1_url', 'concorrente_1_palavras', 'mediana_palavras_topo', 'h2_comuns_no_topo', 'perguntas_do_google', 'lacunas_do_topo', 'termos_usados_pelo_topo', 'concorrentes_detalhe', 'urls_topo_google'];
const cab0 = ['grupo', 'tema', 'palavra_chave', 'buscas_mes_exato', 'concorrencia_ads', 'tendencia', 'status_artigo', 'nota_auditoria', 'sensivel_revisao', 'google_checado', 'produzir_amanha_sugerido', 'origem'];
const EXTRA = [...EXTRA0, 'nivel', 'visitas_mes_se_pagina1_3pct', 'visitas_mes_se_top3_18pct', 'tipo', 'qtd_long_tails', 'volume_somado_long_tails', 'long_tails_com_volume'];
const idxLT = indiceLongTails(dem);
const cab = [...cab0, ...EXTRA];
linhas.forEach((l) => {
  l.push(...conc(l[2])); const v = parseInt(l[3], 10);
  if (!v) l.push('', '', ''); else l.push(v >= 5000 ? 'pilar' : v >= 1000 ? 'media' : 'ganha-pao', Math.round(v * 0.03), Math.round(v * 0.18));
  const nw = norm(l[2]).split(' ').length; const lt = longTails(l[2], idxLT, { max: 10, ruido: RUIDO }); const todas = longTails(l[2], idxLT, { max: 1000, ruido: RUIDO });
  l.push(nw === 1 ? 'cabeca' : nw === 2 ? 'media (2 palavras)' : 'long tail', todas.length, todas.reduce((a, e) => a + e.volume, 0) || '', lt.map((e) => `${e.frase} (${e.volume})`).join(' | '));
});
fs.mkdirSync(path.join(raiz, 'data/conteudo'), { recursive: true });
const out = '﻿' + [cab.join(';'), ...linhas.map((r) => r.map(q).join(';'))].join('\r\n') + '\r\n';
const sem55 = '\uFEFF' + [cab.join(';'), ...linhas.filter((l) => !l[0].startsWith('1')).map((r) => r.map(q).join(';'))].join('\r\n') + '\r\n';
fs.writeFileSync(path.join(raiz, 'data/conteudo/pautas-mestre.csv'), sem55);
const c = (g) => linhas.filter((l) => l[0].startsWith(g)).length;
const n2b = linhas.filter((l) => l[0].startsWith('2b')).length;
console.log(`ganha-pão: ${n2b} | CSV: g1 ${c('1')} | g2 ${c('2')} (sugeridas amanhã: ${linhas.filter((l) => l[10] === 'SIM').length}) | g3 ${c('3')} | total ${linhas.length}`);
