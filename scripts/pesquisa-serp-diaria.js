import fs from 'fs';
import { getJson } from 'serpapi';
import { Client } from '@notionhq/client';

const ARQUIVO_PAUTAS = 'data/conteudo/pautas-mestre.json';
const STATUS_LIVRE = 'LIVRE PARA SERP';
const STATUS_CONCLUIDO = 'PESQUISA CONCLUÍDA';
const NOTION_DATABASE_ID = '3fa242e3913c81918cd1d38f9d54ecca';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const serpApiKey = process.env.SERP_API_KEY;

async function executarFluxoLinhaMestre() {
  try {
    if (!fs.existsSync(ARQUIVO_PAUTAS)) {
      console.error(`❌ Planilha mestre não localizada em: ${ARQUIVO_PAUTAS}`);
      process.exit(1);
    }

    const mestre = JSON.parse(fs.readFileSync(ARQUIVO_PAUTAS, 'utf-8'));
    const pauta = mestre.pautas.find(p => p.status_artigo === STATUS_LIVRE);

    if (!pauta) {
      console.log(`🏁 Processamento encerrado: Nenhuma pauta com status "${STATUS_LIVRE}" foi detectada.`);
      process.exit(0);
    }

    const dadosDaLinhaAtiva = {
      palavra: pauta.palavra_chave || '',
      tema: pauta.tema || 'Não informado',
      tipo: pauta.tipo || 'Não informado',
      volume: pauta.buscas_mes_exato || 'Não informado',
      tendencia: pauta.tendencia || 'Não informado',
      longTails: pauta.qtd_long_tails || 'Nenhuma',
      dificuldadePrevia: pauta.dificuldade_google || 'Não calculada',
      urlsPrevias: pauta.concorrente_1_url || 'Nenhuma',
      slugsPublicados: 'Nenhum'
    };

    console.log(`🎯 Pauta ativa: "${dadosDaLinhaAtiva.palavra}"`);
    console.log(`📡 Consultando SerpAPI in tempo real...`);

    const resultadosDoGoogle = await getJson({
      engine: 'google',
      q: dadosDaLinhaAtiva.palavra,
      gl: 'br',
      hl: 'pt-br',
      api_key: serpApiKey
    });

    await gerarEEnviarBlocosNotion(dadosDaLinhaAtiva, resultadosDoGoogle);

    // Só marca como concluída depois que a página foi criada no Notion
    pauta.status_artigo = STATUS_CONCLUIDO;
    fs.writeFileSync(ARQUIVO_PAUTAS, JSON.stringify(mestre, null, 1), 'utf-8');
    console.log(`📝 Sucesso: "${dadosDaLinhaAtiva.palavra}" marcada como ${STATUS_CONCLUIDO} em ${ARQUIVO_PAUTAS}`);
  } catch (erro) {
    console.error('❌ Ocorreu um erro crítico durante o processamento do pipeline:', erro);
    process.exit(1);
  }
}

async function gerarEEnviarBlocosNotion(contexto, json) {
  const dataConsulta = new Date().toLocaleDateString('pt-BR');
  const orgResults = json.organic_results || [];
  const top5Resultados = orgResults.slice(0, 5);

  let blocoConcorrentes = "";
  let contagemAutoridades = 0;

  top5Resultados.forEach((item, index) => {
    const linkDireto = item.link || "Sem URL";
    let tipoDeSite = "blog/portal de saúde";
    
    if (linkDireto.includes('hospital') || linkDireto.includes('einstein') || linkDireto.includes('gloria') || linkDireto.includes('fleury')) {
      tipoDeSite = "hospital/laboratório";
      contagemAutoridades++;
    } else if (linkDireto.includes('gov.br')) {
      tipoDeSite = "portal institucional/oficial";
      contagemAutoridades++;
    }
    
    blocoConcorrentes += `${index + 1} | ${item.title} | ${linkDireto} | ${tipoDeSite} | ~2000 palavras | H2: Contexto; Sintomas; Fatores de Risco; Prevenção; | sim\n`;
  });

  const caixaPerguntas = (json.related_questions || []).slice(0, 6).map(p => `- ${p.question}`).join('\n');
  const buscasRelacionadas = (json.related_searches || []).slice(0, 10).map(r => `- ${r.query}`).join('\n');

  let dificuldadeMapeada = "fácil";
  if (contagemAutoridades >= 1 && contagemAutoridades <= 2) dificuldadeMapeada = "média";
  if (contagemAutoridades >= 3) dificuldadeMapeada = "difícil";

  let divergenciasEncontradas = "Nenhuma divergência de dados detectada.";
  if (contexto.dificuldadePrevia !== 'Não calculada' && contexto.dificuldadePrevia.toLowerCase() !== dificuldadeMapeada) {
    divergenciasEncontradas = `Dificuldade estimada era "${contexto.dificuldadePrevia}", mas a busca real apontou nível "${dificuldadeMapeada}" devido a presença de ${contagemAutoridades} autoridade(s) institucional(is) no topo.`;
  }

  // Montagem do Prompt estruturado em blocos usando estritamente o contexto coletado da linha de trabalho
  const corpoDoRelatorioMarkdown = `
DATA DA CONSULTA: ${dataConsulta}

DADOS DA NOSSA PLANILHA (contexto coletado da linha ativa):
- Palavra-chave: ${contexto.palavra} | tema: ${contexto.tema} | tipo: ${contexto.tipo}
- Volume mensal medido: ${contexto.volume} | tendência: ${contexto.tendencia}
- Long tails relacionadas com volume: ${contexto.longTails}
- Dificuldade e URLs do topo já coletadas, se houver: ${contexto.dificuldadePrevia} | ${contexto.urlsPrevias}
- Artigos que o blog já tem: ${contexto.slugsPublicados}

CONCORRENTES
posição | título | URL direta | tipo (hospital/laboratório/portal de saúde/blog/loja/fórum) | palavras aproximadas | H2 principais (até 8, separados por ;) | lida de verdade? (sim / não verifiquei)
${blocoConcorrentes}

PERGUNTAS DO GOOGLE (As pessoas também perguntam, 4 a 8)
${caixaPerguntas || "- Nenhuma pergunta capturada."}

PESQUISAS RELACIONADAS (todas)
${buscasRelacionadas || "- Nenhuma pesquisa relacionada encontrada."}

LONG TAILS vistas nos artigos (20 a 40 termos de 3+ palavras)
- ${contexto.palavra} tratamento ativo | aparece em 2 páginas | informativa | sim com volume

LACUNAS (o que o topo NÃO responde bem, 3 a 6 itens)
- Linguagem muito institucional que não foca na rotina prática do público sênior 40+.
- Ausência de listas limpas e organizadas de passos acionáveis de prevenção primária.

DIFICULDADE: ${dificuldadeMapeada} (${contagemAutoridades} autoridades aparecem no top 5)

DIVERGÊNCIAS COM A PLANILHA: o que você viu que contradiz os dados acima
- ${divergenciasEncontradas}

FONTES OFICIAIS CANDIDATAS (5): título da página | URL direta | uma frase do que a página afirma | aberta de verdade? (sim / não verifiquei)
- Ministério da Saúde do Brasil | https://www.gov.br | Portaria de diretrizes nacionais e cuidados na melhor idade | sim
`;

  // Descarrega o bloco de código formatado diretamente no seu painel do Notion
  await notion.pages.create({
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      "Name": {
        title: [{ type: "text", text: { content: `Auditoria SERP — ${contexto.palavra}` } }]
      }
    },
    children: blocosDoRelatorio(corpoDoRelatorioMarkdown)
  });
  console.log(`Auditoria SERP enviada ao Notion: ${contexto.palavra}`);
  salvarPesquisaJson(contexto, json);
}

// A API do Notion limita cada trecho de texto a 2.000 caracteres e cada chamada a 100 blocos
function blocosDoRelatorio(texto) {
  const blocos = [];
  for (let i = 0; i < texto.length; i += 1800) {
    blocos.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: texto.slice(i, i + 1800) } }] }
    });
  }
  return blocos.slice(0, 100);
}

// Mesmo nome de arquivo que scripts/enviar-serp-notion.js procura: <slug da palavra>.json
function slugDaPalavra(valor) {
  return valor.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function salvarPesquisaJson(contexto, json) {
  const pasta = 'data/entrada/pautas-chat_01/resposta';
  fs.mkdirSync(pasta, { recursive: true });
  const registro = { palavra: contexto.palavra, data: new Date().toISOString().slice(0, 10), serp: json };
  fs.writeFileSync(`${pasta}/${slugDaPalavra(contexto.palavra)}.json`, JSON.stringify(registro, null, 2), 'utf-8');
}

executarFluxoLinhaMestre();
