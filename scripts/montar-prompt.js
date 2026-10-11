// Monta o PROMPT 2 (escrever artigo) já preenchido com os dados da planilha mestre. Cole em qualquer IA (GPT, Gemini, DeepSeek, Qwen, Perplexity).
//   node scripts/montar-prompt.js "psoríase no couro cabeludo"   → imprime e grava data/conteudo/prompts/<slug>.md
import fs from 'fs';
import { indiceLongTails, longTails } from './lib/longtails.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { norm, demandaDe } from './demanda-lib.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const kw = process.argv.slice(2).join(' ').trim();
if (!kw) { console.error('uso: node scripts/montar-prompt.js "palavra-chave"'); process.exit(1); }
const ler = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(raiz, f), 'utf8')); } catch { return d; } };
const chave = (s) => norm(s).split(' ').sort().join(' ');
const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dem = demandaDe(kw);
const itens = ler('data/pesquisa/demanda-validada.json', { itens: {} }).itens;
const meus = new Set(norm(kw).split(' ').filter((t) => t.length > 2));
const satelites = Object.values(itens).filter((e) => chave(e.frase) !== chave(kw) && e.volume >= 100 && [...meus].length && [...meus].every((t) => norm(e.frase).includes(t))).sort((a, b) => b.volume - a.volume).slice(0, 8).map((e) => `${e.frase} (${e.volume})`);
const sp = Object.entries(ler('data/pesquisa/serp-resultados.json', {})).find(([k]) => chave(k) === chave(kw))?.[1];
const con = ler(`data/pesquisa/concorrentes/${slugify(kw)}.json`, null);
const arts = ler('data/articles.json', { articles: [] }).articles;
const rel = (a) => [...meus].filter((t) => norm(`${a.primaryKeyword} ${a.title}`).includes(t)).length;
const links = arts.filter((a) => a.status === 'published').map((a) => ({ a, r: rel(a) })).sort((x, y) => y.r - x.r).slice(0, 8).map(({ a }) => `/${a.slug}/ (${a.primaryKeyword})`);
// Texto dos concorrentes guardado pelo coletor neste computador (.cache/serp/<palavra>/*.txt): vai no prompt para a IA LER antes de escrever
// Long tails com demanda medida (demanda-validada.json): viram subtópicos (H2/H3) do artigo
const lts = longTails(kw, indiceLongTails(ler('data/pesquisa/demanda-validada.json', { itens: {} }).itens), { max: 12 });
const ltBloco = lts.length ? `\n\nLONG TAILS COM DEMANDA RELACIONADAS (volume mensal medido). Cubra as de até 999 buscas como subtópicos naturais (H2 ou H3, sem repetir a frase exata); as de 1.000 ou mais merecem artigo próprio, então apenas cite o tema e aponte um link interno se existir:\n${lts.map((e) => `- ${e.frase} (${e.volume})`).join('\n')}` : '';
const dirTxt = path.join(raiz, '.cache', 'serp', slugify(kw));
const textos = fs.existsSync(dirTxt) ? fs.readdirSync(dirTxt).filter((f) => f.endsWith('.txt')).sort().map((f) => ({ f, t: fs.readFileSync(path.join(dirTxt, f), 'utf8').split(/\s+/).slice(0, 2500).join(' ') })) : [];
const textoBloco = textos.length ? `\n\nTEXTO DOS CONCORRENTES DO TOPO (leia para entender cobertura, ordem e profundidade. Escreva um artigo ORIGINAL com suas palavras e estrutura; NÃO copie frases nem a sequência de parágrafos; NÃO use fatos que não estejam nas fontes oficiais)\n${textos.map(({ f, t }) => `--- ${f.replace(/\.txt$/, '')} ---\n${t}`).join('\n\n')}` : '';
const concBloco = con ? `CONCORRENTES (dados reais coletados em ${con.data}; use só para estrutura, NÃO copie)\n${con.paginas.filter((p) => !p.erro).map((p, i) => `${i + 1} | ${p.tituloGoogle || p.titulo} | ${p.url} | ${p.palavras} palavras | H2: ${(p.secoes || []).slice(0, 8).join('; ')}`).join('\n')}\nMediana do topo: ${con.medianaPalavras ?? 'n/d'} palavras (escreva pelo menos ${Math.max(1300, Math.round((con.medianaPalavras || 0) * 1.15))}).\nH2 que 2+ concorrentes têm (cubra todos): ${(con.h2Comuns || []).join('; ') || 'n/d'}\nPERGUNTAS DO GOOGLE: ${(sp?.perguntas || []).join(' | ') || 'n/d'}\nLACUNAS (o topo não responde bem; cubra): ${(con.lacunas || []).join(' | ') || 'n/d'}\nDificuldade no Google: ${sp?.nivel || sp?.veredito || 'n/d'}` : 'CONCORRENTES: não coletados ainda (concorrente não conferido). Escreva pelas regras abaixo e inclua as perguntas que as pessoas costumam ter sobre o tema.';
const prompt = `Você é redator do blog Saúde 40+ (público de 40+ anos, português do Brasil). Escreva UM artigo sobre **${kw}** (demanda: ${dem ? dem.volume + ' buscas/mês' : 'não medida'}; tema do blog: ${dem?.tema || ''}). Frases que o MESMO artigo deve cobrir como subtópicos: ${satelites.join('; ') || 'nenhuma'}.

Seja MELHOR que o topo do Google: responda as perguntas e preencha as lacunas. Reescreva com suas palavras e estrutura própria; nada de copiar.

${concBloco}${con?.termosComuns?.length ? `\nVocabulário que o topo usa (use os termos naturalmente): ${con.termosComuns.join(', ')}` : ''}${con ? `\nFontes oficiais citadas pelo topo (confira se abrem antes de usar): ${[...new Set(con.paginas.flatMap((p) => p.fontesOficiais || []))].slice(0, 8).join(' ; ') || 'n/d'}` : ''}${ltBloco}${textoBloco}

FORMATO DE SAÍDA (exato; sem Markdown, sem cercas de código):
PALAVRA_CHAVE: ${kw}
TITLE: até 46 caracteres, contém a palavra-chave
DESCRIPTION: entre 125 e 155 caracteres, contém a palavra-chave
CAPA_BUSCA: busca de foto em inglês (cena concreta, sem marca)
CAPA_ALT: alt em português descrevendo a foto (25+ caracteres)
FOTO1_BUSCA: ...
FOTO1_ALT: ...
FOTO1_LEGENDA: até 120 caracteres
FOTO1_SECAO: número do h2
FOTO2_BUSCA: ...
FOTO2_ALT: ...
FOTO2_LEGENDA: ...
FOTO2_SECAO: número do h2 diferente do da foto 1
FONTE: Título | https://link-real-que-abre   (3 a 5 linhas, ao menos 2 institucionais)
${con ? `CONCORRENTE: (uma linha por concorrente acima, no formato: título | URL | dificuldade)\nLACUNA: (uma linha por lacuna que o artigo cobre)\n` : ''}---
<corpo em HTML simples: p, h2, h3, ul, li, strong, a; sem h1, sem hr, sem componentes, sem data>

CORPO: 1º parágrafo (até 45 palavras) responde a pergunta e contém a palavra-chave exata; 6 a 9 <h2> (a maioria em forma de pergunta); parágrafos de até 45 palavras; frases curtas; uma seção com as perguntas do Google; <h2>Quando procurar um médico</h2>; <h2>Resumindo</h2> com 2 parágrafos. Mínimo de 1.300 palavras; palavra-chave exata no máximo 3% do texto. Links internos (2 ou mais, formato <a href="/slug/">texto natural</a>), só desta lista: ${links.join('; ') || 'nenhum disponível (não coloque)'}.

SEGURANÇA: número, porcentagem ou dose só se estiver numa FONTE (sem fonte, sem número). Mínimo de 3 fontes reais com link que abre, 2+ institucionais (Ministério da Saúde, sociedade médica, SciELO, NIH/MedlinePlus, OMS, universidade, hospital de referência); não invente link. Proibido prometer cura, resultado garantido, "milagre" ou "sem efeitos colaterais" (as palavras podem aparecer quando negam ou explicam, como em "não tem cura"); diagnóstico ("você tem"); dose; indicar marca; link de compra; "neste artigo", "vamos explorar", "mergulhar", "jornada", "vale ressaltar", "é importante destacar", "em suma", "concluindo", "no cenário atual". Tema sensível: informativo, "o médico decide". Não escreva a seção de Fontes nem o aviso de saúde (o sistema acrescenta).

ANTES DE RESPONDER confira e corrija (não mostre a conferência): título ≤ 46 caracteres com a palavra-chave; descrição de 125 a 155 caracteres; palavra-chave no 1º parágrafo; ≥ 1.300 palavras; ≥ 6 h2; "Quando procurar um médico" e "Resumindo" presentes; nenhum parágrafo > 45 palavras; ≥ 3 FONTE reais; nenhum número sem fonte; nenhuma dose, marca ou promessa.
`;
fs.mkdirSync(path.join(raiz, 'data/conteudo/prompts'), { recursive: true });
const f = path.join(raiz, `data/conteudo/prompts/${slugify(kw)}.md`);
fs.writeFileSync(f, prompt);
console.log(prompt);
console.error(`\n💾 gravado em data/conteudo/prompts/${slugify(kw)}.md`);
