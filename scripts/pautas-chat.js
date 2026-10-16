// Pautas para os ChatGPT (redação fora do robô): divide os temas que ainda faltam entre N agentes, sem repetir tema.
// Uso: node scripts/pautas-chat.js   (AGENTES=4 por padrão)  → uma pasta por agente: data/entrada/pautas-chat_01/ ... pautas-chat_04/ (PAUTAS.md, LEIA-ME.md)
// Fonte única: data/conteudo/pautas-mestre.csv. Só lista pautas cuja SERP foi concluída.
// Fora da lista: tema que já é artigo (publicado ou estoque), que está na fila do robô, ou cujo arquivo já foi entregue em data/entrada/.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const AGENTES = Math.max(1, Number(process.env.AGENTES || 4));
const POR_DIA = 3;
const NA_TELA = 60; // linhas no .md de cada agente
const pasta = (k) => path.join(RAIZ, 'data/entrada', `pautas-chat_${String(k + 1).padStart(2, '0')}`);

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lerJson = (p, d) => { try { return JSON.parse(fs.readFileSync(path.join(RAIZ, p), 'utf8')); } catch { return d; } };

const csv = fs.readFileSync(path.join(RAIZ, 'data/conteudo/pautas-mestre.csv'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
const parseCsvLine = (line) => { const out = []; let value = '', quoted = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; } else if (ch === ';' && !quoted) { out.push(value); value = ''; } else value += ch; } out.push(value); return out; };
const cab = parseCsvLine(csv[0]);
const linhas = csv.slice(1).map((l) => Object.fromEntries(parseCsvLine(l).map((c, i) => [cab[i], c])));

const feitos = new Set();
for (const a of lerJson('data/articles.json', { articles: [] }).articles) { feitos.add(slug(a.primaryKeyword)); feitos.add(a.slug); }
for (const k of (lerJson('data/keywords-validated.json', {}).keywords || [])) if (k && k.keyword) feitos.add(slug(k.keyword)); // fila do robô (Gemini/Claude)
for (const sub of ['data/entrada/google', 'data/entrada/processados', 'data/entrada']) {
  const d = path.join(RAIZ, sub);
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith('.txt')) feitos.add(slug(f.replace(/\.txt$/, '')));
}

const vistos = new Set();
const temas = linhas.filter((x) => String(x.status_artigo || '').trim().toUpperCase() === 'PESQUISA CONCLUÍDA').filter((x) => {
  const s = slug(x.palavra_chave);
  if (!s || feitos.has(s) || vistos.has(s)) return false;
  vistos.add(s); return true;
});
// Tema com nicho a conferir (a busca pode ser de outra coisa: marca, produto, celebridade) vai para o fim da lista, marcado.
const conferir = (x) => /sim/.test(String(x.sensivel_revisao || '').toLowerCase());
temas.sort((a, b) => conferir(a) - conferir(b));

const esc = (s) => String(s || '').replace(/\|/g, '/');
for (let k = 0; k < AGENTES; k++) {
  const nome = `CHATGPT-${String(k + 1).padStart(2, '0')}`;
  const meus = temas.filter((_, i) => i % AGENTES === k);
  const OUT = pasta(k);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'PAUTAS.md'), [
    `# Pautas do ${nome}`, '',
    `Gerado por \`scripts/pautas-chat.js\` em ${new Date().toISOString().slice(0, 10)}. ${meus.length} temas com SERP concluída só deste agente (nenhum outro ChatGPT recebe estes), ≈ ${Math.ceil(meus.length / POR_DIA)} dias a ${POR_DIA} por dia. A fonte única continua sendo \`data/conteudo/pautas-mestre.csv\`.`, '',
    `**Como usar:** a cada dia, pegue os **${POR_DIA} primeiros** desta lista, escreva seguindo \`data/entrada/google/LEIA-ME.md\` e entregue cada um em \`data/entrada/google/\` com o nome da coluna "Arquivo". A lista se atualiza sozinha: tema entregue ou que virou artigo sai daqui.`, '',
    `Os "subtemas" são buscas da mesma família: viram seções \`<h2>\` do mesmo artigo, não artigos novos.`, '',
    `**Antes de escrever, confira a intenção no Google.** Se a palavra for ambígua (ex.: "melissa" também é marca de calçado), escreva sobre o sentido de saúde usando o subtema como guia ("melissa para que serve"). Se a busca não for de saúde, pule o tema e siga para o próximo.`, '',
    '| Nº | Palavra-chave | Arquivo | Buscas/mês | Subtemas (H2) | Atenção |', '|---|---|---|---|---|---|',
    ...meus.slice(0, NA_TELA).map((x, i) => `| ${i + 1} | ${esc(x.palavra_chave)} | \`${slug(x.palavra_chave)}.txt\` | ${x.buscas_mes_exato || '—'} | ${esc(x.long_tails_com_volume) || '—'} | ${conferir(x) ? 'confira na busca se a intenção é de saúde; se não for, pule' : ''} |`), '',
  ].join('\n'));
  fs.writeFileSync(path.join(OUT, 'LEIA-ME.md'), [
    `# Pasta do agente ${nome}`, '',
    `Esta pasta é só do **${nome}**: \`PAUTAS.md\` (os próximos temas) e os temas selecionados a partir de \`data/conteudo/pautas-mestre.csv\`. Os outros ${AGENTES - 1} agentes têm as pastas \`pautas-chat_01\` a \`pautas-chat_${String(AGENTES).padStart(2, '0')}\`, sem nenhum tema repetido.`, '',
    `- Produza ${POR_DIA} artigos por dia, sempre os primeiros de \`PAUTAS.md\`.`,
    '- Formato e SEO: `data/entrada/google/LEIA-ME.md`. Regras de nota e fila: `DECISOES-DO-DONO.md`.',
    '- **Entrega**: o artigo pronto vai para `data/entrada/google/` (não para esta pasta), com o nome da coluna "Arquivo".',
    '- A lista é regenerada a cada publicação diária (`node scripts/pautas-chat.js`): tema entregue sai sozinho.', '',
  ].join('\n'));
}

console.log(`pautas-chat: ${temas.length} temas livres em ${AGENTES} agentes (${Math.floor(temas.length / AGENTES)}+ cada)`);
