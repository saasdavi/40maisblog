// Teste do redator Gemini com reserva Claude e da leitura da SerpAPI, sem rede: node scripts/test-gemini-fallback.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

const estado = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'llm-')), 'llm-estado.json');
process.env.LLM_ESTADO = estado;
process.env.DAILY_LIMIT = '100'; process.env.BATCH_SIZE = '5'; // para escolherPauta() devolver pautas mesmo depois do teto do dia
process.env.PAUTAS_FALHAS = path.join(path.dirname(estado), 'pautas-falhas.json');
process.env.ANTHROPIC_API_KEY = 'teste-claude';
const { default: ArticleRobot } = await import('./article-robot.js');
const { resumirSerp, pularBusca } = await import('./serp-api.js');

let chamadas = [];
let gemini = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ARTIGO GEMINI' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 } }), text: async () => '' });
const claude = () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ARTIGO CLAUDE' }], usage: { input_tokens: 1, output_tokens: 2 }, stop_reason: 'end_turn' }), text: async () => '' });
globalThis.fetch = async (url) => { chamadas.push(String(url).includes('generativelanguage') ? 'gemini' : 'claude'); return String(url).includes('generativelanguage') ? gemini() : claude(); };
const lerEstado = () => JSON.parse(fs.readFileSync(estado, 'utf8'));
const robo = () => new ArticleRobot();

// 1. Gemini responde: usa o Gemini
process.env.GEMINI_API_KEY = 'teste-gemini';
let r = robo();
assert.strictEqual(await r.escrever('p'), 'ARTIGO GEMINI');
assert.strictEqual(r.provedorUsado, 'gemini');
assert.deepStrictEqual(chamadas, ['gemini']);
assert.strictEqual(lerEstado().chamadas, 1);

// 2. Gemini 429: Claude assume e o estado do dia fica "claude"
gemini = () => ({ ok: false, status: 429, text: async () => 'RESOURCE_EXHAUSTED' });
chamadas = []; r = robo();
assert.strictEqual(await r.escrever('p'), 'ARTIGO CLAUDE');
assert.strictEqual(r.provedorUsado, 'claude');
assert.deepStrictEqual(chamadas, ['gemini', 'claude']);
assert.strictEqual(lerEstado().provedor, 'claude');

// 3. Depois da falha, o resto do dia vai direto ao Claude (nem chama o Gemini)
chamadas = []; r = robo();
assert.strictEqual(await r.escrever('p'), 'ARTIGO CLAUDE');
assert.deepStrictEqual(chamadas, ['claude']);

// 4. Dia novo: o estado antigo não vale, volta ao Gemini
fs.writeFileSync(estado, JSON.stringify({ data: '2020-01-01', provedor: 'claude', chamadas: 99 }));
gemini = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ARTIGO GEMINI' }] }, finishReason: 'STOP' }] }), text: async () => '' });
chamadas = []; r = robo();
assert.strictEqual(await r.escrever('p'), 'ARTIGO GEMINI');

// 5. Resposta cortada do Gemini (MAX_TOKENS) passa ao Claude
fs.rmSync(estado);
gemini = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'meio artigo' }] }, finishReason: 'MAX_TOKENS' }] }), text: async () => '' });
chamadas = []; r = robo();
assert.strictEqual(await r.escrever('p'), 'ARTIGO CLAUDE');

// 6. Artigo do Gemini reprovado na auditoria: o Claude assume o resto do dia
fs.rmSync(estado);
gemini = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ARTIGO GEMINI' }] }, finishReason: 'STOP' }] }), text: async () => '' });
r = robo(); await r.escrever('p'); r.geminiFalhou();
assert.strictEqual(lerEstado().provedor, 'claude');

// 7. Sem GEMINI_API_KEY: só o Claude
fs.rmSync(estado); delete process.env.GEMINI_API_KEY; chamadas = []; r = robo();
assert.strictEqual(await r.escrever('p'), 'ARTIGO CLAUDE');
assert.deepStrictEqual(chamadas, ['claude']);

// 8. SerpAPI: tira vídeo e rede social, guarda top 3, perguntas e autoridades
const s = resumirSerp({
  organic_results: [{ link: 'https://www.youtube.com/watch?v=1' }, { link: 'https://www.gov.br/saude/pt-br/x' }, { link: 'https://blog.exemplo.com.br/a' }, { link: 'https://www.instagram.com/p/1' }, { link: 'https://www.scielo.br/j/x' }],
  related_questions: [{ question: 'O que é X?' }, { question: 'Como tratar X?' }],
  related_searches: [{ query: 'x sintomas' }], ai_overview: {},
});
assert.deepStrictEqual(s.top3Urls, ['https://www.gov.br/saude/pt-br/x', 'https://blog.exemplo.com.br/a', 'https://www.scielo.br/j/x']);
assert.deepStrictEqual(s.perguntas, ['O que é X?', 'Como tratar X?']);
assert.deepStrictEqual(s.autoridadesTop3, ['gov.br', 'scielo.br']);
assert.strictEqual(s.aiOverview, true);
console.log('ok: gemini-fallback + serp-api');

// 9. novoHoje: só conta artigo PUBLICADO hoje (dia de Brasília) e escrito por IA
{
  const rb = robo();
  rb.db.articles = [{ status: 'published', publishedAt: new Date().toISOString() }, { status: 'draft', escritoPor: 'gemini', publishedAt: new Date().toISOString() }];
  assert.strictEqual(rb.novoHoje(), false);
  rb.db.articles.push({ status: 'published', escritoPor: 'gemini', publishedAt: new Date().toISOString() });
  assert.strictEqual(rb.novoHoje(), true);
  rb.db.articles = [{ status: 'published', escritoPor: 'claude', publishedAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString() }];
  assert.strictEqual(rb.novoHoje(), false, 'artigo de ontem não conta');
}
console.log('ok: novoHoje');

// 10. Pauta que reprova 2 vezes é pulada (não gasta Gemini/Claude de novo)
{
  const rb = robo();
  const primeira = rb.escolherPauta()[0].keyword;
  rb.registrarFalhaPauta(primeira, 'nota 70');
  assert.strictEqual(rb.escolherPauta()[0].keyword, primeira, 'com 1 falha ainda tenta de novo');
  rb.registrarFalhaPauta(primeira, 'nota 72');
  assert.notStrictEqual(rb.escolherPauta()[0].keyword, primeira, 'com 2 falhas pula');
  assert.strictEqual(rb.lerFalhasPauta()[primeira].tentativas, 2);
}
console.log('ok: pauta que falha é pulada');

// 11. SerpAPI: execução que só publica do estoque não gasta busca
{
  const rb = robo();
  const comEstoque = rb.prontosNoEstoque().length > 0;
  rb.db.articles = rb.db.articles.filter((a) => !(a.status === 'published' && a.escritoPor));
  assert.strictEqual(pularBusca(rb, false), false, 'novo de hoje não saiu: pesquisa');
  assert.strictEqual(pularBusca(rb, true), comEstoque, 'só publica do estoque: não pesquisa se há estoque');
  rb.db.articles.push({ status: 'published', escritoPor: 'gemini', publishedAt: new Date().toISOString() });
  assert.strictEqual(pularBusca(rb, false), comEstoque, 'novo de hoje já saiu: não pesquisa se há estoque');
  const vazio = robo(); vazio.prontosNoEstoque = () => [];
  assert.strictEqual(pularBusca(vazio, true), false, 'sem estoque: pesquisa sempre (a execução vai escrever)');
}
console.log('ok: serp-api pula a busca quando só publica');
