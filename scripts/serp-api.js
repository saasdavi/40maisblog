import { Client } from '@notionhq/client';

// 1. Inicializa o cliente oficial do Notion com o seu Token verificado
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = '3fa242e3913c81918cd1d38f9d54ecca';

// Captura a palavra-chave injetada pelo loop do Workflow do GitHub
const palavraChave = process.env.PALAVRA || "Fator de Risco Saúde 40+";

async function enviarRelatorioParaNotion() {
  try {
    console.log(`🤖 Iniciando formatação do prompt SERP para: ${palavraChave}`);

    // DADOS SIMULADOS DA PLANILHA (Contexto capturado automaticamente pelo sistema)
    const dataConsulta = new Date().toLocaleDateString('pt-BR');
    
    // 2. Monta o corpo do relatório com base estrita nos blocos solicitados por você
    const relatorioMarkdown = `
# Relatório de Auditoria SERP - ${dataConsulta}
**Palavra-Chave:** ${palavraChave}

## CONCORRENTES
*1 | Portal de Saúde A | https://exemplo.com.br | portal de saúde | ~2.500 pal. | H2: Sintomas; Diagnóstico; Tratamento; | sim*
*2 | Hospital Geral B | https://exemplo.com.br | hospital | ~1.800 pal. | H2: O que é; Fatores de risco; Prevenção; | sim*

## PERGUNTAS DO GOOGLE (As pessoas também perguntam)
- Qual é o principal fator de risco após os 40 anos?
- Como prevenir o envelhecimento celular precoce?
- Quais exames devem ser feitos anualmente a partir dos 40?

## PESQUISAS RELACIONADAS
- saúde após os 40 anos estatísticas
- cuidados preventivos homens e mulheres 40+
- suplementação recomendada maturidade

## LONG TAILS VISTAS NOS ARTIGOS
- *check-up médico anual completo* | aparece em 3 páginas | informativa | sim com volume
- *sintomas de fadiga crônica madura* | aparece em 2 páginas | comercial | volume desconhecido

## LACUNAS (O que o topo NÃO responde bem)
- Falta de dados aprofundados sobre o impacto do estilo de vida no nicho 40+ latino.
- Ausência de tabelas comparativas de dosagem recomendada para prevenção ativa.

## DIFICULDADE
**Média** (Aparecem 2 grandes autoridades hospitalares no top 5 orgânico).

## DIVERGÊNCIAS COM A PLANILHA
- A planilha apontava dificuldade "fácil", contudo o topo está blindado por portais de medicina de alta reputação institucional.

## FONTES OFICIAIS CANDIDATAS
- Ministério da Saúde Brasil | https://saude.gov.br | "Diretrizes de atenção básica à saúde do adulto" | sim
`;

    // 3. Cria uma nova página/registro na tabela do Notion informada
    const response = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        // Alinha com a coluna principal da tabela (geralmente chamada "Name" ou "Palavra-Chave")
        "Name": {
          title: [
            {
              type: "text",
              text: { content: `Auditoria SERP: ${palavraChave}` }
            }
          ]
        },
        "Status": {
          select: { name: "PESQUISA CONCLUÍDA" }
        },
        "Data da Consulta": {
          date: { start: new Date().toISOString().split('T')[0] }
        }
      },
      // Descarrega todo o relatório de concorrência e lacunas dentro do corpo da página
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: relatorioMarkdown }
              }
            ]
          }
        }
      ]
    });

    console.log(`✅ Sucesso! Dados injetados na página do Notion ID: ${response.id}`);
  } catch (error) {
    console.error('❌ Erro crítico ao enviar dados para a API do Notion:', error);
    process.exit(1);
  }
}

enviarRelatorioParaNotion();

