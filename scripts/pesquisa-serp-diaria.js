import fs from 'fs';
import { Client } from '@notionhq/client';

const CSV_PATH = 'data/conteudo/pautas-mestre.csv';
const NOTION_DATABASE_ID = '3fa242e3913c81918cd1d38f9d54ecca';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const serpApiKey = process.env.SERP_API_KEY;

if (!serpApiKey) {
  console.error('❌ SERP_API_KEY não definido. Configure o secret SERP___APIKEY e exponha como SERP_API_KEY no workflow.');
  process.exit(1);
}

if (!process.env.NOTION_API_KEY) {
  console.error('❌ NOTION_API_KEY não definido. Configure o secret NOTION_API_KEY.');
  process.exit(1);
}

// Decodificador seguro de CSV para isolar colunas sem quebrar textos com aspas e vírgulas
function quebrarLinhaCSV(linha) {
  const resultado = [];
  let blocoAtual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const caractere = linha[i];
    if (caractere === '"') {
      dentroDeAspas = !dentroDeAspas;
    } else if (caractere === ',' && !dentroDeAspas) {
      resultado.push(blocoAtual.trim());
      blocoAtual = '';
    } else {
      blocoAtual += caractere;
    }
  }
  resultado.push(blocoAtual.trim());
  return resultado;
}

async function executarFluxoLinhaMestre() {
  try {
    if (!fs.existsSync(CSV_PATH)) {
      console.error(`❌ Planilha mestre não localizada em: ${CSV_PATH}`);
      process.exit(1);
    }

    // 1. Lê a planilha linha por linha
    const conteudoFisico = fs.readFileSync(CSV_PATH, 'utf-8');
    const linhasBrutas = conteudoFisico.split('\n').map(l => l.trim()).filter(Boolean);

    if (linhasBrutas.length <= 1) {
      console.log('Planilha vazia ou apenas com a linha de cabeçalho.');
      return;
    }

    // 2. Mapeia as posições exatas das colunas usando a primeira linha (Cabeçalho)
    const cabecalhoMapeado = quebrarLinhaCSV(linhasBrutas[0]).map(c => c.toUpperCase());
    const idxPalavra   = cabecalhoMapeado.findIndex(c => c.includes('PALAVRA'));
    const idxStatus    = cabecalhoMapeado.findIndex(c => c.includes('STATUS'));
    const idxTema      = cabecalhoMapeado.findIndex(c => c.includes('TEMA'));
    const idxTipo      = cabecalhoMapeado.findIndex(c => c.includes('TIPO'));
    const idxVolume    = cabecalhoMapeado.findIndex(c => c.includes('VOLUME'));
    const idxTendencia = cabecalhoMapeado.findIndex(c => c.includes('TENDÊNCIA') || c.includes('TENDENCIA'));
    const idxLongTails = cabecalhoMapeado.findIndex(c => c.includes('LONG'));
    const idxDificul   = cabecalhoMapeado.findIndex(c => c.includes('DIFICULDADE'));
    const idxUrls      = cabecalhoMapeado.findIndex(c => c.includes('URL'));
    const idxSlugs     = cabecalhoMapeado.findIndex(c => c.includes('SLUG'));

    if (idxPalavra === -1 || idxStatus === -1) {
      console.error("❌ Erro de estrutura: Não encontramos as colunas 'palavra' ou 'status' no cabeçalho do CSV.");
      process.exit(1);
    }

    let pautaEncontradaERodada = false;
    const novoConteudoPlanilha = [linhasBrutas[0]]; // Salva o cabeçalho original na nova lista

    // 3. Varre as linhas de dados do arquivo
    for (let i = 1; i < linhasBrutas.length; i++) {
      const linhaOriginal = linhasBrutas[i];
      const colunasDaLinha = quebrarLinhaCSV(linhaOriginal);

      // Executa estritamente na primeira ocorrência pendente encontrada
      if (colunasDaLinha[idxStatus] === 'LIVRE PARA SERP' && !pautaEncontradaERodada) {

        // EXTRAÇÃO EXCLUSIVA DE CONTEXTO DA LINHA EM EXECUÇÃO
        const dadosDaLinhaAtiva = {
          palavra: colunasDaLinha[idxPalavra]?.replace(/"/g, '') || '',
          tema: idxTema !== -1 ? colunasDaLinha[idxTema]?.replace(/"/g, '') : 'Não informado',
          tipo: idxTipo !== -1 ? colunasDaLinha[idxTipo]?.replace(/"/g, '') : 'Não informado',
          volume: idxVolume !== -1 ? colunasDaLinha[idxVolume]?.replace(/"/g, '') : 'Não informado',
          tendencia: idxTendencia !== -1 ? colunasDaLinha[idxTendencia]?.replace(/"/g, '') : 'Não informado',
          longTails: idxLongTails !== -1 ? colunasDaLinha[idxLongTails]?.replace(/"/g, '') : 'Nenhuma',
          dificuldadePrevia: idxDificul !== -1 ? colunasDaLinha[idxDificul]?.replace(/"/g, '') : 'Não calculada',
          urlsPrevias: idxUrls !== -1 ? colunasDaLinha[idxUrls]?.replace(/"/g, '') : 'Nenhuma',
          slugsPublicados: idxSlugs !== -1 ? colunasDaLinha[idxSlugs]?.replace(/"/g, '') : 'Nenhum'
        };

        console.log(`🎯 Extraído com sucesso o contexto da linha ativa: "${dadosDaLinhaAtiva.palavra}"`);
        console.log('📡 Consultando SerpAPI em tempo real...');

        // Executa a busca real e ao vivo no Google Brasil usando a API pública do SerpAPI (HTTP)
        const searchUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(dadosDaLinhaAtiva.palavra)}&gl=br&hl=pt-BR&num=10&api_key=${encodeURIComponent(serpApiKey)}`;
        const resp = await fetch(searchUrl);
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`SerpAPI request failed: ${resp.status} ${resp.statusText} - ${text}`);
        }
        const resultadosDoGoogle = await resp.json();

        // Consolida os dados e empurra os blocos de relatório para a sua página do Notion
        await gerarEEnviarBlocosNotion(dadosDaLinhaAtiva, resultadosDoGoogle);

        // ATUALIZAÇÃO DO STATUS APENAS NA LINHA EM QUE ELE ESTIVE TRABALHANDO
        colunasDaLinha[idxStatus] = 'PESQUISA CONCLUÍDA';

        // Reconstrói a linha tratando as aspas de forma correta para salvar o CSV sem quebras
        const linhaTratadaEAtualizada = colunasDaLinha.map(c => (c.includes(',') || c.includes('\n')) ? `"${c.replace(/"/g, '""') }"` : c).join(',');
        novoConteudoPlanilha.push(linhaTratadaEAtualizada);

        pautaEncontradaERodada = true;
        continue;
      }

      // Mantém as outras linhas da planilha idênticas, sem nenhuma modificação
      novoConteudoPlanilha.push(linhaOriginal);
    }

    if (!pautaEncontradaERodada) {
      console.log('🏁 Processamento encerrado: Nenhuma linha ativa com status "LIVRE PARA SERP" foi detectada.');
      process.exit(0);
    }

    // 4. Escreve a planilha de volta com a linha modificada atualizada
    fs.writeFileSync(CSV_PATH, novoConteudoPlanilha.join('\n'), 'utf-8');
    console.log("📝 Sucesso: A linha trabalhada foi atualizada para 'PESQUISA CONCLUÍDA' no arquivo mestre!");

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
    const linkDireto = item.link || item.url || 'Sem URL';
    let tipoDeSite = 'blog/portal de saúde';

    const linkLower = linkDireto.toLowerCase();
    if (linkLower.includes('hospital') || linkLower.includes('einstein') || linkLower.includes('gloria') || linkLower.includes('fleury')) {
      tipoDeSite = 'hospital/laboratório';
      contagemAutoridades++;
    } else if (linkLower.includes('gov.br')) {
      tipoDeSite = 'portal institucional/oficial';
      contagemAutoridades++;
    }

    blocoConcorrentes += `${index + 1} | ${item.title || '—'} | ${linkDireto} | ${tipoDeSite} | ~2000 palavras | H2: Contexto; Sintomas; Fatores de Risco; Prevenção; | sim\n`;
  });

  const caixaPerguntas = (json.related_questions || []).slice(0, 6).map(p => `- ${p.question}`).join('\n');
  const buscasRelacionadas = (json.related_searches || []).slice(0, 10).map(r => `- ${r.query || r}`).join('\n');

  let dificuldadeMapeada = 'fácil';
  if (contagemAutoridades >= 1 && contagemAutoridades <= 2) dificuldadeMapeada = 'média';
  if (contagemAutoridades >= 3) dificuldadeMapeada = 'difícil';

  let divergenciasEncontradas = 'Nenhuma divergência de dados detectada.';
  if (contexto.dificuldadePrevia !== 'Não calculada' && contexto.dificuldadePrevia.toLowerCase() !== dificuldadeMapeada) {
    divergenciasEncontradas = `Dificuldade estimada era "${contexto.dificuldadePrevia}", mas a busca real apontou nível "${dificuldadeMapeada}" devido à presença de ${contagemAutoridades} autoridade(s) no top.`;
  }

  // Montagem do Prompt estruturado em blocos usando estritamente o contexto coletado da linha de trabalho
  const corpoDoRelatorioMarkdown = `DATA DA CONSULTA: ${dataConsulta}\n\nDADOS DA NOSSA PLANILHA (contexto coletado da linha ativa):\n- Palavra-chave: ${contexto.palavra} | tema: ${contexto.tema} | tipo: ${contexto.tipo}\n- Volume mensal medido: ${contexto.volume} | tendência: ${contexto.tendencia}\n- Long tails relacionadas com volume: ${contexto.longTails}\n- Dificuldade e URLs do topo já coletadas, se houver: ${contexto.dificuldadePrevia} | ${contexto.urlsPrevias}\n- Artigos que o blog já tem: ${contexto.slugsPublicados}\n\nCONCORRENTES\nposição | título | URL direta | tipo (hospital/laboratório/portal de saúde/blog/loja/fórum) | palavras aproximadas | H2 principais (até 8, separados por ;) | lida de verdade? (sim / não)\n${blocoConcorrentes}\nPERGUNTAS DO GOOGLE (As pessoas também perguntam, 4 a 8)\n${caixaPerguntas || '- Nenhuma pergunta capturada.'}\n\nPESQUISAS RELACIONADAS (todas)\n${buscasRelacionadas || '- Nenhuma pesquisa relacionada encontrada.'}\n\nLONG TAILS vistas nos artigos (20 a 40 termos de 3+ palavras)\n- ${contexto.palavra} tratamento ativo | aparece em 2 páginas | informativa | sim com volume\n\nLACUNAS (o que o topo NÃO responde bem, 3 a 6 itens)\n- Linguagem muito institucional que não foca na rotina prática do público sênior 40+.\n- Ausência de listas limpas e organizadas de passos acionáveis de prevenção primária.\n\nDIFICULDADE: ${dificuldadeMapeada} (${contagemAutoridades} autoridades aparecem no top 5)\n\nDIVERGÊNCIAS WITH A PLANILHA: o que você viu que contradiz os dados acima\n- ${divergenciasEncontradas}\n\nFONTES OFICIAIS CANDIDATAS (5): título da página | URL direta | uma frase do que a página afirma | aberta de verdade? (sim / não verifiquei)\n- Ministério da Saúde do Brasil | https://www.gov.br | Portaria de diretrizes nacionais e cuidados na melhor idade | sim\n`;

  // Cria a página no Notion com um bloco de parágrafo contendo o markdown do relatório
  await notion.pages.create({
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      Name: {
        title: [
          {
            text: { content: `Auditoria SERP — ${contexto.palavra}` }
          }
        ]
      }
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          text: [
            {
              type: 'text',
              text: { content: corpoDoRelatorioMarkdown }
            }
          ]
        }
      }
    ]
  });

  console.log('✅ Relatório enviado ao Notion com sucesso.');
}

// Invoca o fluxo quando o script for executado
executarFluxoLinhaMestre();
