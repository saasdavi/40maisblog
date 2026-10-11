// Teste da decisão do importador e do bloqueio de publicação de artigo segurado: node scripts/test-decisao-importacao.mjs
import assert from 'assert';
import { decidirImportacao } from './lib/decisao-importacao.js';
process.env.DAILY_LIMIT = '100';
const { default: ArticleRobot } = await import('./article-robot.js');

const aud = (nota, bloqueios = []) => ({ nota, bloqueios, alertas: [] });
const pont = (total, motivos = []) => ({ total, motivos });

// 1. Aprovação automática: NOTA_CHAT ≥ 9 e pontuação técnica ≥ 90
let d = decidirImportacao({ notaChat: 9.2, aud: aud(96), pont: pont(95) });
assert.strictEqual(d.acao, 'aceitar'); assert.strictEqual(d.confiavel, true);

// 2. Divergência: NOTA_CHAT ≥ 9 e pontuação < 90 → segurar, com as duas notas no motivo
d = decidirImportacao({ notaChat: 9.5, aud: aud(80), pont: pont(84, ['3 parágrafos > 50 palavras']) });
assert.strictEqual(d.acao, 'segurar');
assert.match(d.motivos[0], /NOTA_CHAT 9,5\/10.*pontuação técnica do importador 84\/100/);
assert.ok(d.motivos.includes('3 parágrafos > 50 palavras'));
// auditoria baixa com NOTA_CHAT ≥ 9 não recusa antes da pontuação
assert.strictEqual(decidirImportacao({ notaChat: 9, aud: aud(70) }).acao, 'pendente');

// 3. NOTA_CHAT abaixo de 9: não é confiável; segue a regra antiga (auditoria ≥ 85 e pontuação ≥ 70)
d = decidirImportacao({ notaChat: 8.9, aud: aud(80) });
assert.strictEqual(d.acao, 'recusar'); assert.strictEqual(d.confiavel, false);
assert.strictEqual(decidirImportacao({ notaChat: 8.9, aud: aud(90), pont: pont(80) }).acao, 'aceitar', 'regra antiga: entra no estoque (e fica fora da fila por nota < 90)');
assert.strictEqual(decidirImportacao({ notaChat: 8.9, aud: aud(90), pont: pont(65) }).acao, 'recusar');

// 4. Falha técnica recusa mesmo com NOTA_CHAT ≥ 9
d = decidirImportacao({ notaChat: 9.8, aud: aud(99, ['FORMATO: <h1> no corpo']) });
assert.strictEqual(d.acao, 'recusar'); assert.deepStrictEqual(d.motivos, ['FORMATO: <h1> no corpo']);

// 5. Duplicata recusa mesmo com NOTA_CHAT ≥ 9
d = decidirImportacao({ notaChat: 9.5, aud: aud(95), pont: pont(95, ['parecido com "x" (85%): risco de canibalização']), duplicado: true });
assert.strictEqual(d.acao, 'recusar');

// 6. Promessa e tema sensível não recusam nem seguram (promessa vira aviso)
d = decidirImportacao({ notaChat: 9.2, aud: aud(95, ['SEG: promessa proibida: "cura garantida"']), pont: pont(93) });
assert.strictEqual(d.acao, 'aceitar'); assert.strictEqual(d.avisos.length, 1);

// 7. Artigo com segurar: true não é publicado automaticamente
{
  const r = new ArticleRobot();
  r.gravar = () => {}; r.imagem = async () => true; r.restanteHoje = () => 10;
  const base = { status: 'draft', estoque: true, origem: 'importado', scores: { auditoria: 95, total: 95, atencao: [] } };
  const seg = { ...base, slug: 'segurado', segurar: true, scores: { ...base.scores, notaChat: 9.5, total: 84 } };
  const ok = { ...base, slug: 'liberado', scores: { ...base.scores, notaChat: 9.2 } };
  r.db.articles = [seg, ok];
  assert.deepStrictEqual(r.prontosNoEstoque().map((a) => a.slug), ['liberado']);
  assert.strictEqual(await r.publicarDoEstoque(5), 1);
  assert.strictEqual(seg.status, 'draft', 'o segurado continua rascunho');
  assert.strictEqual(ok.status, 'published');
  seg.segurar = false; // o dono libera
  assert.deepStrictEqual(r.prontosNoEstoque().map((a) => a.slug), ['segurado'], 'depois que o dono libera (segurar: false), entra na fila');
}
console.log('ok: decisão do importador e bloqueio de artigo segurado');
