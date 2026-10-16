// Importa artigos escritos FORA do robô (ex.: ChatGPT) sem gastar API da Anthropic.
// Lê data/entrada/*.txt, roda a auditoria do robô (regras automáticas), baixa fotos (Pexels/Pixabay)
// e guarda como rascunho pronto (status draft + estoque:true). Reprovados ficam com relatório .md ao lado.
// Formato do arquivo: cabeçalho "CHAVE: valor", uma linha "---" e o corpo em HTML (veja data/entrada/LEIA-ME.md).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ArticleRobot from './article-robot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '../data/entrada');
import { demandaDe } from './demanda-lib.js';
import { pontuar } from './pontuacao.js';
import { ehSaidaGoogle, normalizarEntradaGoogle, lerFontes } from './lib/entrada-google.js';
import { decidirImportacao } from './lib/decisao-importacao.js';
// NOTA_CHAT: nota final (0 a 10) que o chat deu ao próprio artigo; ele só entrega com 9,0 ou mais. Aceita 9,2 | 9.2 | 92.
const lerNotaChat = (v) => { if (!v) return null; const n = parseFloat(String(v).replace(',', '.')); if (!Number.isFinite(n)) return null; return n > 10 ? n / 10 : n; };
const de10 = (n) => (n / 10).toFixed(1).replace('.', ',');

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const robot = new ArticleRobot();
const lista = (sub) => { const d = path.join(DIR, sub); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.txt') && f !== 'LEIA-ME.txt').map((f) => path.join(sub, f)) : []; };
const arquivos = [...lista(''), ...lista('google')]; // data/entrada/*.txt e data/entrada/google/*.txt (saída colada da IA do Google)
if (!arquivos.length) { console.log('📥 Nada em data/entrada/.'); process.exit(0); }

let guardados = 0;
for (const nome of arquivos) {
  const caminho = path.join(DIR, nome);
  let raw = fs.readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n');
  const relatorio = (linhas) => fs.writeFileSync(caminho.replace(/\.txt$/, '.relatorio.md'), `# ${nome}\n\n${linhas.map((l) => `- ${l}`).join('\n')}\n`);
  console.log(`\n📥 ${nome}`);
  try {
    if (ehSaidaGoogle(raw)) { // saída colada da IA do Google: recorta a Fase 2 e converte para o formato do importador
      const g = normalizarEntradaGoogle(raw, { artigos: robot.db.articles, publicados: robot.linksInternos(), precisaRevisao: (a) => robot.precisaRevisao(a) });
      g.avisos.forEach((a) => console.log(`  ⚠️  ${a}`));
      if (g.erros.length) throw new Error(g.erros.join('; '));
      raw = g.texto;
    }
    const d = robot.parse(raw);
    const get = (k) => (raw.slice(0, raw.indexOf('\n---\n')).match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim();
    const keyword = get('PALAVRA_CHAVE');
    if (!keyword) throw new Error('falta PALAVRA_CHAVE no cabeçalho');
    const lf = lerFontes([...raw.slice(0, raw.indexOf('\n---\n')).matchAll(/^FONTE:\s*(.+)$/gm)].map((m) => m[1]));
    if (lf.erros.length) lf.erros.forEach((e) => console.log(`  ⚠️  FONTE (não bloqueia importação): ${e}`));
    const fontes = lf.fontes.map((f) => ({ title: f.title, url: f.url, texto: '' }));
    if (fontes.length < 2) console.log(`  ⚠️  Apenas ${fontes.length} fonte(s) com URL válida; importação continua e a pontuação técnica pode refletir isso.`);
    const pauta = robot.kw.find((k) => k.keyword.toLowerCase() === keyword.toLowerCase()) || { keyword, volume: null, cluster: get('CLUSTER') || null };
    if (get('SLUG')) pauta.slug = get('SLUG'); // artigo revisado que substitui um do estoque com outro endereço
    if (/<Article[A-Za-z]*|<hr\b|<h1\b/i.test(d.body)) throw new Error('o HTML tem componentes de código (<Article...>), <hr> ou <h1>: peça à IA HTML simples (veja data/entrada/MODELO-PARA-A-IA.md)');
    const cab = raw.slice(0, raw.indexOf('\n---\n'));
    const concorrentes = [...cab.matchAll(/^CONCORRENTE:\s*(.+)$/gm)].map((m) => m[1].trim());
    const lacunas = [...cab.matchAll(/^LACUNA:\s*(.+)$/gm)].map((m) => m[1].trim());
    const dem = demandaDe(keyword);
    if (pauta.volume == null && dem) pauta.volume = dem.volume;
    console.log(`  demanda: ${dem ? `${dem.volume} buscas/mês (${dem.classe}${dem.tendencia ? ', ' + dem.tendencia : ''}${dem.porSimilar ? ', por frase parecida: ' + dem.frase : ''})` : 'NÃO MEDIDA (palavra-chave fora de data/pesquisa/demanda-validada.json)'}`);
    const notaChat = lerNotaChat(get('NOTA_CHAT'));
    if (notaChat !== null) console.log(`  ✍️  NOTA_CHAT ${String(notaChat).replace('.', ',')}/10`);
    const art = robot.montar(pauta, d, fontes);
    const aud = robot.auditar(art, null);
    console.log(`  ${art.wordCount} palavras | auditoria ${aud.nota}/100 (nota ${de10(aud.nota)}/10)${aud.bloqueios.length ? ' | BLOQUEIOS: ' + aud.bloqueios.join('; ') : ''}`);
    // Regras em DECISOES-DO-DONO.md e scripts/lib/decisao-importacao.js (promessa e tema sensível não travam; promessa vira aviso)
    const pre = decidirImportacao({ notaChat, aud });
    const confiavel = pre.confiavel;
    const promessas = pre.avisos.map((x) => x.replace(/^aviso: /, ''));
    if (pre.acao === 'recusar') { relatorio([`Nota ${de10(aud.nota)}/10`, ...pre.motivos.map((b) => `RECUSA: ${b}`), ...aud.alertas]); console.log('  ⛔ recusado; veja o .relatorio.md'); continue; }
    let fotoPendente = false;
    if (!(await robot.imagem(art))) {
      if (process.env.FOTO_NA_PUBLICACAO !== '1') { relatorio(['Sem imagens: confira PEXEL_API_KEY/PIXABAY_API_KEY/UNSPLASH_ACCESS_KEY e as buscas de foto do cabeçalho.']); continue; }
      // Guarda o artigo sem foto, com a busca de fotos (imagePlan); a foto é buscada na hora de publicar.
      for (const k of ['featuredImage', 'imageAlt', 'imageCredit', 'images', 'imageIds']) delete art[k];
      fotoPendente = true;
      console.log('  📷 sem foto agora: guardado com as buscas de foto; a foto é buscada na hora de publicar');
    }
    // pontuação técnica: tema sensível não pesa (regra do dono) e promessa não zera a segurança (é só aviso)
    const pont = pontuar({ art, aud: { ...aud, bloqueios: aud.bloqueios.filter((b) => !/^SEG: promessa/.test(b)) }, outros: robot.db.articles, revisado: true, imagensPrevistas: fotoPendente ? 3 : null });
    console.log(`  🎯 pontuação ${pont.total}/100 (nota ${de10(pont.total)}/10) → ${pont.decisao} (qualidade ${pont.partes.qualidade} | demanda ${pont.partes.demanda} | fontes ${pont.partes.fontes} | originalidade ${pont.partes.originalidade} | formato ${pont.partes.formato})`);
    if (pont.motivos.length) console.log(`     pontos de atenção: ${pont.motivos.slice(0, 4).join('; ')}`);
    const duplicado = pont.motivos.some((m) => { const x = m.match(/^parecido com .*\((\d+)%\)/); return x && Number(x[1]) >= 80; });
    const dec = decidirImportacao({ notaChat, aud, pont, duplicado });
    if (dec.acao === 'recusar') { relatorio([`Pontuação ${pont.total}/100`, ...dec.motivos.map((m) => `RECUSA: ${m}`)]); console.log('  ⛔ recusado pela pontuação; veja o .relatorio.md'); continue; }
    const segurar = dec.acao === 'segurar';
    if (segurar) console.log(`  ✋ SEGURADO (segurar: true, não publica até você liberar): ${dec.motivos[0]}`);
    const agora = new Date().toISOString();
    delete art.bodyOriginal; delete art._substitui;
    Object.assign(art, fotoPendente ? { fotoPendente: true } : {}, { status: 'draft', estoque: true, estocadoEm: agora, scores: { auditoria: aud.nota, ...(notaChat !== null ? { notaChat } : {}), demanda: dem ? dem.classe : 'não medida', total: pont.total, decisao: pont.decisao, partes: pont.partes, atencao: [...pont.motivos.filter((m) => !/^BLOQUEIO: SEG: promessa/.test(m)), ...promessas.map((x) => `aviso: ${x}`)].slice(0, 8) }, validador: 'Auditoria automática (sem API); texto escrito fora do robô', origem: 'importado', ...(confiavel ? { redator: 'chat' } : {}), ...(segurar ? { segurar: true, segurarMotivo: { notaChat, pontuacaoImportador: pont.total, motivos: dec.motivos } } : {}),
      validacao: { palavraChave: keyword, demanda: dem ? { volume: dem.volume, classe: dem.classe, tendencia: dem.tendencia, concorrencia: dem.concorrencia, fonte: dem.fonte, fraseMedida: dem.frase, porSimilar: dem.porSimilar } : { classe: 'não medida' }, volume: pauta.volume, cluster: pauta.cluster, apoio: (pauta.secundarias || []).map((x) => x.palavra), perguntasDoGoogle: pauta.absorve || [], concorrentes: concorrentes.length ? concorrentes : 'não informado (concorrente não conferido)', lacunasCobertas: lacunas, serp: pauta.serp || null, fontesDaPauta: fontes.map((f) => f.url), notas: pauta.notas || '', briefing: robot.readJson(`data/briefings/${slugify(keyword)}.json`, null), validadoEm: agora, observacao: 'originalidade contra o concorrente não conferida automaticamente' } });
    const i = robot.db.articles.findIndex((x) => x.slug === art.slug);
    if (i >= 0) { art.createdAt = robot.db.articles[i].createdAt || art.createdAt; robot.db.articles[i] = art; } else robot.db.articles.push(art);
    robot.gravar();
    fs.mkdirSync(path.join(DIR, 'processados'), { recursive: true });
    fs.renameSync(caminho, path.join(DIR, 'processados', path.basename(nome)));
    fs.rmSync(caminho.replace(/\.txt$/, '.relatorio.md'), { force: true });
    if (promessas.length) console.log(`  ⚠️  aviso (não trava): ${promessas.join(' | ')}`);
    guardados++;
    console.log(`  📦 guardado no estoque: /${art.slug}/ (nota ${de10(aud.nota)}/10)`);
  } catch (e) { relatorio([e.message]); console.error(`  ❌ ${e.message}`); }
}
console.log(`\n📊 ${guardados} de ${arquivos.length} guardados.`);
