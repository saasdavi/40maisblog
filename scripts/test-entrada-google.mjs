// Teste do conversor da saída da IA do Google: node scripts/test-entrada-google.mjs
import fs from 'fs';
import assert from 'assert';
import ArticleRobot from './article-robot.js';
import { normalizarEntradaGoogle, ehPaginaInicial, ajustarTitulo, textoParaHtml } from './lib/entrada-google.js';

const r = new ArticleRobot();
const opts = { artigos: r.db.articles, publicados: r.linksInternos(), precisaRevisao: (a) => r.precisaRevisao(a) };
const ler = (f) => fs.readFileSync(new URL(`./fixtures/${f}.txt`, import.meta.url), 'utf8');

// TSH alto: Fase 2 recortada, cabeçalho convertido, HTML montado
const t = normalizarEntradaGoogle(ler('google-tsh-alto'), opts);
assert.deepStrictEqual(t.erros, []);
const [cab, corpo] = t.texto.split('\n---\n');
assert.match(cab, /^PALAVRA_CHAVE: tsh alto$/m);
assert.ok(cab.match(/^TITLE: (.*)$/m)[1].length <= 49, 'título até 49');
assert.match(cab, /^CAPA_PEXELS_ID: 2280571$/m);
assert.match(cab, /^FOTO2_PEXELS_ID: 7524949$/m);
assert.ok(!/CAPA_URL|CAPA_CREDITO|DOWNLOAD/.test(cab), 'campos do PC ficam de fora');
assert.strictEqual((cab.match(/^FONTE:/gm) || []).length, 3);
assert.match(cab, /^REVISADO: sim$/m, 'tema sensível em revisão herda REVISADO');
assert.match(corpo, /<h2>Quando procurar um médico<\/h2>/);
assert.match(corpo, /<h2>Resumindo<\/h2>/);
assert.match(corpo, /<ul><li>Seu exame de rotina/);
assert.strictEqual((corpo.match(/href="\/[a-z0-9-]+\/"/g) || []).length, 2, '2 links internos');
assert.ok(!/FASE 3|NOTA FINAL|Este material possui|Protocolo de Endocrinologia de Adultos \|/.test(corpo), 'sem Fase 3, sem aviso e sem a seção Fontes');

// Fonte sem link direto reprova com o motivo
const f = normalizarEntradaGoogle(ler('google-ferritina-fonte-ruim'), opts);
assert.ok(f.erros.some((e) => /nih\.gov/.test(e)), 'nih.gov reprova');

// Página inicial não é fonte; página do dado é
assert.ok(ehPaginaInicial('https://nih.gov') && ehPaginaInicial('https://www.gov.br/saude'));
assert.ok(!ehPaginaInicial('https://pubmed.ncbi.nlm.nih.gov/34067164/') && !ehPaginaInicial('https://www.who.int/health-topics'));

// Título: corta itens do fim e mantém a palavra-chave
assert.strictEqual(ajustarTitulo('Ferritina Alta: Causas, Sintomas e O Que Fazer para Tratar', 'ferritina alta'), 'Ferritina Alta: Causas e Sintomas');
assert.strictEqual(ajustarTitulo('Insônia: Causas e Tratamento', 'insônia'), 'Insônia: Causas e Tratamento');

// Dois títulos separados por um parágrafo viram dois H2 (H3 só quando o título vem logo depois de outro título)
assert.ok(!/<h3>/.test(textoParaHtml(['Título A', 'Parágrafo comprido o bastante para não ser confundido com um título de seção, porque termina com ponto final.'])));
console.log('ok: entrada-google');

// Nota do chat: o normalizador mantém NOTA_CHAT no cabeçalho
{
  const comNota = ler('google-tsh-alto').replace(/^(PALAVRA_CHAVE:.*)$/m, '$1\nNOTA_CHAT: 9,2');
  const n = normalizarEntradaGoogle(comNota, opts);
  assert.match(n.texto.split('\n---\n')[0], /^NOTA_CHAT: 9,2$/m, 'NOTA_CHAT preservada');
}
// Artigo com NOTA_CHAT ≥ 9 não fica parado por pontuação baixa e conta como pronto no estoque
{
  const base = { status: 'draft', estoque: true, origem: 'importado', scores: { auditoria: 80, total: 78, atencao: [] } };
  assert.strictEqual(r.precisaRevisao(base), true, 'sem nota do chat: total 78 pede revisão');
  const chat = { ...base, scores: { ...base.scores, notaChat: 9.2 } };
  assert.strictEqual(r.precisaRevisao(chat), false, 'nota do chat 9,2: não pede revisão');
  const sensivel = { ...chat, scores: { ...chat.scores, atencao: ['tema sensível sem REVISADO: sim'] } };
  assert.strictEqual(r.precisaRevisao(sensivel), true, 'tema sensível continua pedindo revisão');
  const guardado = r.db.articles; r.db.articles = [chat, base];
  assert.strictEqual(r.prontosNoEstoque().length, 1, 'só o artigo com nota do chat entra nos prontos');
  r.db.articles = guardado;
}
console.log('ok: nota do chat (NOTA_CHAT)');
