// Pautas para os ChatGPT (redação fora do robô): divide os temas que ainda faltam entre N agentes, sem repetir tema.
// Uso: node scripts/pautas-chat.js   (AGENTES=4 por padrão)  → data/entrada/pautas-chat/CHATGPT-01.md ... e .csv
// Fonte: data/conteudo/calendario-12-meses.csv, vagas "novo (IA)" com tema a validar (as pautas validadas ficam para o robô Gemini/Claude).
// Fora da lista: tema que já é artigo (publicado ou estoque), que está na fila do robô, ou cujo arquivo já foi entregue em data/entrada/.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const AGENTES = Math.max(1, Number(process.env.AGENTES || 4));
const POR_DIA = 3;
const NA_TELA = 60; // linhas no .md de cada agente (o .csv tem a lista inteira)
const OUT = path.join(RAIZ, 'data/entrada/pautas-chat');

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lerJson = (p, d) => { try { return JSON.parse(fs.readFileSync(path.join(RAIZ, p), 'utf8')); } catch { return d; } };

const csv = fs.readFileSync(path.join(RAIZ, 'data/conteudo/calendario-12-meses.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const cab = csv[0].split(';').map((c) => c.replace(/^"|"$/g, ''));
const linhas = csv.slice(1).map((l) => Object.fromEntries(l.split(';').map((c, i) => [cab[i], c.replace(/^"|"$/g, '')])));

const feitos = new Set();
for (const a of lerJson('data/articles.json', { articles: [] }).articles) { feitos.add(slug(a.primaryKeyword)); feitos.add(a.slug); }
for (const k of (lerJson('data/keywords-validated.json', {}).keywords || [])) if (k && k.keyword) feitos.add(slug(k.keyword)); // fila do robô (Gemini/Claude)
for (const sub of ['data/entrada/google', 'data/entrada/processados', 'data/entrada']) {
  const d = path.join(RAIZ, sub);
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith('.txt')) feitos.add(slug(f.replace(/\.txt$/, '')));
}

const vistos = new Set();
const temas = linhas.filter((x) => x.tipo.startsWith('novo') && x.situacao !== 'pauta validada').filter((x) => {
  const s = slug(x.palavra_chave);
  if (!s || feitos.has(s) || vistos.has(s)) return false;
  vistos.add(s); return true;
});
// Tema com nicho a conferir (a busca pode ser de outra coisa: marca, produto, celebridade) vai para o fim da lista, marcado.
const conferir = (x) => /nicho a conferir/.test(x.situacao);
temas.sort((a, b) => conferir(a) - conferir(b));

fs.mkdirSync(OUT, { recursive: true });
const esc = (s) => String(s || '').replace(/\|/g, '/');
for (let k = 0; k < AGENTES; k++) {
  const nome = `CHATGPT-${String(k + 1).padStart(2, '0')}`;
  const meus = temas.filter((_, i) => i % AGENTES === k);
  fs.writeFileSync(path.join(OUT, `${nome}.csv`), '﻿ordem;palavra_chave;arquivo;tema;buscas_mes;buscas_familia;subtemas_h2;sensivel\n' + meus.map((x, i) => [i + 1, x.palavra_chave, `${slug(x.palavra_chave)}.txt`, x.tema, x.buscas_mes_cabeca, x.buscas_soma_familia, x.satelites_no_mesmo_artigo, x.sensivel_revisao, conferir(x) ? 'sim' : ''].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, `${nome}.md`), [
    `# Pautas do ${nome}`, '',
    `Gerado por \`scripts/pautas-chat.js\` em ${new Date().toISOString().slice(0, 10)}. ${meus.length} temas só deste agente (nenhum outro ChatGPT recebe estes), ≈ ${Math.ceil(meus.length / POR_DIA)} dias a ${POR_DIA} por dia. Lista completa em \`${nome}.csv\`.`, '',
    `**Como usar:** a cada dia, pegue os **${POR_DIA} primeiros** desta lista, escreva seguindo \`data/entrada/google/LEIA-ME.md\` e entregue cada um em \`data/entrada/google/\` com o nome da coluna "Arquivo". A lista se atualiza sozinha: tema entregue ou que virou artigo sai daqui.`, '',
    `Os "subtemas" são buscas da mesma família: viram seções \`<h2>\` do mesmo artigo, não artigos novos.`, '',
    `**Antes de escrever, confira a intenção no Google.** Se a palavra for ambígua (ex.: "melissa" também é marca de calçado), escreva sobre o sentido de saúde usando o subtema como guia ("melissa para que serve"). Se a busca não for de saúde, pule o tema e siga para o próximo.`, '',
    '| Nº | Palavra-chave | Arquivo | Buscas/mês | Subtemas (H2) | Atenção |', '|---|---|---|---|---|---|',
    ...meus.slice(0, NA_TELA).map((x, i) => `| ${i + 1} | ${esc(x.palavra_chave)} | \`${slug(x.palavra_chave)}.txt\` | ${x.buscas_mes_cabeca || '—'} | ${esc(x.satelites_no_mesmo_artigo) || '—'} | ${conferir(x) ? 'confira na busca se a intenção é de saúde; se não for, pule' : ''} |`), '',
  ].join('\n'));
}
fs.writeFileSync(path.join(OUT, 'LEIA-ME.md'), [
  '# Pautas para os ChatGPT', '',
  `Os temas que ainda faltam produzir, divididos entre ${AGENTES} agentes (\`CHATGPT-01\` a \`CHATGPT-${String(AGENTES).padStart(2, '0')}\`), sem repetir tema entre eles. Cada agente produz ${POR_DIA} artigos por dia, sempre os primeiros da sua lista.`, '',
  `Total de temas livres: **${temas.length}** (temas novos do calendário de 12 meses, por ordem de prioridade). As pautas já validadas da fila do robô ficam com o artigo novo diário do robô (Gemini/Claude) e não aparecem aqui.`, '',
  'Formato de entrega: `data/entrada/google/LEIA-ME.md`. Regras de nota e fila: `DECISOES-DO-DONO.md`.', '',
  'Atualização: `node scripts/pautas-chat.js` (roda também em cada publicação diária).', '',
].join('\n'));
console.log(`pautas-chat: ${temas.length} temas livres em ${AGENTES} agentes (${Math.floor(temas.length / AGENTES)}+ cada)`);
