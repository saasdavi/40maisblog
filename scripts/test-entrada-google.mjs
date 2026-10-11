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
assert.ok(!/^REVISADO:/m.test(cab), 'sem trava de revisão: não precisa de REVISADO');
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
// Nenhuma regra automática segura artigo: só `segurar: true` (decisão do dono)
{
  const base = { status: 'draft', estoque: true, origem: 'importado', scores: { auditoria: 80, total: 78, atencao: ['tema sensível sem REVISADO: sim'] } };
  assert.strictEqual(r.precisaRevisao(base), false, 'nota baixa ou tema sensível não seguram mais');
  assert.strictEqual(r.precisaRevisao({ ...base, segurar: true }), true, 'segurar: true segura');
  const guardado = r.db.articles; r.db.articles = [base, { ...base, scores: { ...base.scores, notaChat: 9.2 } }, { ...base, segurar: true }];
  assert.strictEqual(r.prontosNoEstoque().length, 1, 'o artigo com nota do chat entra; o de auditoria 80 não; o segurado não');
  r.db.articles = guardado;
}
console.log('ok: nota do chat (NOTA_CHAT) e sem trava de revisão');

// Promessa: quem ALERTA contra o "milagroso" não é bloqueado; quem promete é achado
{
  const { achaPromessas } = await import('./article-robot.js');
  assert.deepStrictEqual(achaPromessas('Suplementos "milagrosos" Produtos vendidos como "colesterol bom em cápsula" não têm eficácia comprovada.'), []);
  assert.deepStrictEqual(achaPromessas('Não consuma fórmulas fitoterápicas comerciais milagrosas que prometem a limpeza de metais.'), []);
  assert.deepStrictEqual(achaPromessas('Evite fórmulas milagrosas vendidas na internet.'), []);
  assert.ok(achaPromessas('Nossa fórmula milagrosa trata o problema em uma semana.').length >= 1, 'promessa de verdade é achada');
  assert.ok(achaPromessas('Resultado garantido em 30 dias, cura definitiva.').length >= 1);
}
console.log('ok: promessa só quando promete');
