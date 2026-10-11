# Onde estamos e o que falta (1 página)

> Leia isto primeiro numa sessão nova. Detalhes: `ESTRATEGIA-E-FLUXO-AUTOMATICO.md` (seções 16 e 17 = painel de estoque e inventário de dados). Atualize a data e os números abaixo a cada rodada.

**Atualizado:** 2026-10-04

## Painel de produção e estoque (conferido em 2026-10-04 06:33 UTC)

| Produção | Quantidade |
|---|---|
| Artigos publicados e aprovados | **8** (7 em 03/10 + 1 em 04/10) |
| Rascunhos | 0 |
| Publicados em 04/10 (até 15:54 UTC) | 1: hemoglobina glicada (11:51 UTC, aprovado). Total publicado: **8**. As agendas de 06:00 e 14:00 UTC NÃO geraram commit; horários trocados para 06:17, 13:43 e 17:23 UTC em 04/10 |

Publicados: como baixar colesterol, quanto de proteína por dia, como meditar, triglicerídeos altos sintomas, o que é gordura visceral, o que é perimenopausa, o que é resistência à insulina.

| Pautas | Quantidade | Dias (3/dia) |
|---|---|---|
| Fila total (`keywords-validated.json`) | 89 | |
| **Validadas e livres (prontas para o robô)** | **64** | **≈ 21** |
| Já usadas ou fora da regra de "livre" (7 publicadas + 18 a conferir) | 25 | |
| Candidatas com volume aguardando o Google | 97 | até ≈ 32 se todas passarem |
| Palavras medidas no banco | 3.474 (888 grupos) | não são pautas |

| Meta de 12 meses | |
|---|---|
| Meta | 1.095 pautas |
| Livres hoje | 64 (6%) |
| Faltam | ≈ 1.031 |

Livres por categoria: nutrição 6, exames 6, pele e cabelo 5, menopausa 4, colesterol 3, hormônios 3, emagrecimento 3, digestão 3, músculo e força 3; 1 ou 2 em cada uma das outras categorias. Nenhuma categoria vazia, nenhuma forte.

## Objetivo
Blog de saúde, 3 artigos/dia por 365 dias (1.095 pautas), cada pauta validada com demanda real. O repositório é o banco de dados: nada de pesquisa fica só no chat.

## Números de hoje (conferir com `node scripts/prateleira.js`)
- Fila do robô: 89 pautas, **64 livres (≈ 21 dias)**, 7 artigos publicados.
- Candidatas com volume aguardando o Google: 97.
- Banco: **3.474** palavras com volume medido (888 grupos na ordem de validação). "Medido" não é "validado": validado = passou no Google (≤ 2 autoridades no top 5, sem lojas, ≥ 2 fontes).
- Faltam ~1.030 pautas validadas para 12 meses.

## Fluxo (método do usuário)
1. Planejador (grátis): "Ver volume" com muitas frases, ficar só com as que têm volume → "Descobrir novas palavras-chave" com as melhores como sementes (≈ 10 por busca) → baixar CSV.
2. `node scripts/ingerir-hypd.js arquivo --fonte nome` junta ao banco (aceita CSV do Planejador, TSV e JSON do HYPD; faixas do Planejador ficam em `data/pesquisa/planejador-faixas.json`).
3. `node scripts/ordem-validacao.js` agrupa por intenção e ordena: validar de cima para baixo.
4. HYPD `serp_results` (1 frase por vez) checa o Google; passou → entra em `data/keywords-validated.json` com fontes, `absorve`, `notas` e `revisar: true`.
5. `node scripts/distribuir-secundarias.js --aplicar` (palavras de 10+ buscas viram apoio) e `node scripts/pontes.js` (links entre artigos).
6. `node scripts/validar-pautas.js` sem erros → commit → push em `main`.

## Regras decididas pelo usuário
- Sem preconceito de conteúdo: remédio, suplemento, urgência, pornografia (científica) e termos amplos são temas válidos, marcados `sensível`/`amplo`, com `notas` de cuidado e `revisar`. Seguem fora: intenção de compra (comprar, preço, farmácia) e consumo/fora do assunto (vídeo, grátis, assistir). Ver `data/pesquisa/filtros.json`.
- O que está fora do filtro fica fora; competição alta não exclui sozinha (vale 30% na ordem).
- Palavras de 10 a 99 buscas valem como apoio e âncora de link, não como pauta.
- Não baixar a régua para encher a fila.

## Pendências (em ordem)
1. **Ligar `data/pontes.json` ao robô** (`scripts/article-robot.js`, junto de `linksTorre`); testar com a API.
2. Validar no Google as próximas da ordem: paralisia do sono, bruxismo, PSA, glicemia de jejum, como dormir rápido, exercícios para ombro; e os pilares de disfunção erétil (ereção fraca, ansiedade de desempenho, ejaculação retardada, kegel para homens).
3. Pornografia (científica): checar o Google do grupo "vício e como parar" (~8.470), masturbação (~2.820) e NoFap (~4.400).
4. Medir em lote a lista de 421 frases de disfunção erétil (`data/pesquisa/lotes/disfuncao-eretil-lista-chatgpt-2026-10-04.txt`) e as 44 ideias do Google (`data/pesquisa/ideias-do-google.json`).
5. Teste do HYPD acaba por volta de **17/10/2026**: gastar a janela com a checagem do Google das melhores.
6. Revisão humana das pautas `revisar: true` (4 livres, todas sensíveis ou de saúde masculina).
7. Calendário de 12 meses (`data/plano-editorial.json`, ainda não existe).
8. Domínio + Search Console (`scripts/trocar-dominio.js`); decidir fonte de volume depois do HYPD e a API oficial do Google (seção 15 do documento).
9. Secrets `SERPER_API_KEY` e `KEYWORDS_EVERYWHERE_API_KEY` ainda não criados (workflows automáticos dependem deles).

## Validação automática no GitHub (sem permissões, sem HYPD)
O HYPD é um conector que pede aprovação a cada chamada (só o usuário muda isso, em https://claude.ai/customize/connectors > permissões da ferramenta). Para trabalhar sem ninguém no computador: **Serper dentro do GitHub**.
1. Criar a chave grátis em serper.dev (≈ 2.500 consultas) e salvar como secret do repositório `SERPER_API_KEY` (Settings > Secrets and variables > Actions).
2. Aba Actions > "Validar Google (SERP) das candidatas" > Run workflow (limite 60, promover = true). Ele checa o Google das candidatas por volume (hoje 177, +80 vindas da ordem de validação), promove as aprovadas à fila com `revisar: true` (e `sensivel: true` se o tema for sensível), roda `validar-pautas.js` e grava no `main`.
3. Tema sensível, comp. alta e termos amplos ficam FORA dessa rodada automática (validar à mão quando houver alguém no computador).

## Comparação com o topo do Google (como chegar ao top 10)
`node scripts/comparar-topo.js` (e o workflow **Comparar nossos artigos com o topo do Google**, manual + toda segunda 09:17 UTC) lê as páginas do topo de cada pauta (`topoUrls` em `data/pesquisa/serp-resultados.json` + `fontes` da pauta), mede palavras, H2, imagens/alt, FAQ, título e descrição, e grava em `data/pesquisa/comparacao-topo.md/.json` a mediana do topo, as **lacunas** do nosso artigo (o que melhorar) e as vantagens; para pauta ainda não publicada, a **meta** para publicar. Precisa rodar no GitHub (o contêiner da sessão bloqueia sites de saúde). Teste local sem rede: `--mock scripts/fixtures/comparar-topo-mock.json` (não commitar a saída do mock). Falta: ligar as lacunas ao robô (reescrita automática) e, depois do Search Console, comparar com a posição real.

## Plano editorial de 12 meses (mapa)
`node scripts/plano-editorial.js` gera `data/plano-editorial.json` e `.md`: 365 dias x 3 = 1.095 espaços a partir de 05/10/2026, sem repetir o mesmo cluster em espaços seguidos. Camadas (04/10): **63 validadas (6%)**, 175 a checar no Google (16%), 711 a validar (65%, grupos da ordem de validação), 146 vagas (13%, falta levantar palavras). Só 'validada' publica sozinha; o plano é um MAPA. Rodar de novo a cada rodada de validação: as camadas migram de 'a validar' para 'validada'. As vagas indicam onde levantar mais temas (últimos meses).

## Teto de 3 artigos por dia
Cada execução agendada faz 1 artigo (`BATCH_SIZE` padrão 1, 3 execuções por dia). Além disso o robô tem um **teto diário**: `DAILY_LIMIT` (padrão 3, dia de Brasília). Se já foram publicados 3 no dia, a execução termina sem erro ("Teto do dia atingido"), mesmo que alguém dispare manualmente com lote maior. Mudar o ritmo no futuro = mudar `DAILY_LIMIT` e o número de execuções do workflow.

## Regras de trabalho (decididas pelo usuário em 04/10/2026)
1. **Top 3 orgânico, anúncio não conta.** Olhamos os 3 primeiros resultados ORGÂNICOS do Google; anúncios patrocinados, resposta da IA, vídeos, 'as pessoas também perguntam' e carrossel de imagens não entram. Regra de entrada: no máximo **1 autoridade** nos 3 primeiros orgânicos (padrão adotado; o usuário pode endurecer para 0) e no máximo 2 no top 5, sem lojas dominando, >= 4 fontes, >= 1.000 buscas somadas. Implementada em `scripts/validar-serp.js` e `scripts/promover-pauta.js` (campos `autoridadesTop3` e `top3Urls`).
2. **Lemos só a página do tema.** Do concorrente lemos apenas a URL que ranqueia para a frase da pauta (nunca o site inteiro). Serve de roteiro (subtítulos, tamanho, imagens, FAQ); os fatos vêm só das nossas fontes. O domínio só entra na decisão 'vale escrever?' (autoridade).
3. **Pesquisa pronta antes de escrever.** Cada pauta tem um briefing em `data/briefings/<slug>.json` (gerado por `node scripts/briefing.js`, também rodado no workflow diário antes do robô): perguntas do Google, buscas relacionadas, top 3 orgânico, meta de escrita (da comparação com o topo, quando existe), pontes de link e cuidados. O robô lê o briefing e o acrescenta ao prompt (`briefing(p)` em `scripts/article-robot.js`).
4. **Modelo:** Haiku 4.5 como redator e validador (decisão do usuário). Trocar = `ROBOT_MODEL` / `VALIDATOR_MODEL` no workflow, só se a qualidade decepcionar.
5. Revisão humana por amostragem (~10% por semana) e liberação de temas sensíveis.

## Estoque de artigos escritos (guardados no GitHub, publicados conforme a agenda)
- **Workflow "Escrever estoque de artigos (rascunhos prontos)"** (`.github/workflows/escrever-estoque.yml`): Run workflow com `quantidade` (quantos escrever agora) e `alvo` (quantos manter guardados; padrão 21 = 7 dias). Também roda sozinho toda noite às 02:37 UTC escrevendo 3 até chegar ao alvo. Antes de escrever, compara com o topo as pautas que faltam (`comparar-topo.js --pendentes 10`) e monta os briefings.
- **Como fica guardado:** em `data/articles.json` com `status: "draft"` e `estoque: true`. O site só mostra o que não é `draft`, então o estoque NÃO aparece. As imagens ficam em `public/images/`.
- **Como publica:** as execuções do "Daily Article Production" (3 por dia) **publicam do estoque primeiro** (no máximo 3 por dia, `DAILY_LIMIT`), sem gastar API; só escrevem na hora se o estoque acabar. Cada publicação grava `publishedAt` e `publicadoDoEstoqueEm`.
- **Limites:** o estoque só cresce até o número de pautas validadas livres (hoje 63): para chegar a 1 ano de artigos escritos, é preciso validar ~1.000 pautas. Escrever muito à frente envelhece o texto: o prudente é manter 21 a 60 dias guardados e reescrever o que ficar antigo. Pauta sensível não entra no estoque (continua travada até revisão). Custo estimado com Haiku: cerca de US$ 0,10 por artigo.
- **Não testado com a API:** a lógica de estoque e publicação foi testada com dados simulados (publicou 2 de 3 pedidos por causa do teto do dia). A primeira execução real mostra se falta algum ajuste.

## Um só concorrente: o principal (decisão do usuário, 04/10/2026)
Estudamos, melhoramos e modelamos o nosso conteúdo olhando **só o concorrente em 1º lugar no Google** (1º resultado orgânico, sem anúncio). `concorrentePrincipal(p, fontesLidas)` em `scripts/article-robot.js` o escolhe (briefing `google.top3Organicos[0]`; sem briefing, a 1ª fonte lida que não seja rede social/wiki/Q&A): só ele alimenta a REFERÊNCIA DE SEO (tamanho, imagens, FAQ) e o roteiro de assuntos do prompt. `comparar-topo.js` agora compara só com ele por padrão (`--max 3` mostra os 3 primeiros). As FONTES DE FATOS continuam sendo várias fontes confiáveis; a trava de originalidade compara com todas elas.

## Primeira rodada do estoque (04/10/2026) e correções
Rodada #1 (9 pedidos): só 2 artigos foram escritos porque o modo estoque respeitava o teto diário de PUBLICAÇÃO (bug, corrigido: o teto só vale ao publicar). Resultado: **labirintite** (1.435 palavras, auditoria 100, densidade 1,9%: aprovado e guardado) e **gordura no fígado** (densidade 6,6%, frase absoluta "totalmente reversível": removido do estoque para reescrita). Nova trava `B08`: densidade da palavra-chave acima de 5% devolve o artigo; 3 a 5% desconta 8 pontos. Custo medido: US$ 0,17 por 2 artigos aprovados (4 tentativas).

## Originalidade: conteúdo autêntico e exclusivo (exigência do usuário, 04/10/2026)
O artigo NÃO é modelado nem reescrito a partir do concorrente. O topo do Google mostra só o que o leitor espera encontrar; o texto, a ordem e o ângulo são nossos. No robô: (1) o prompt tem a seção ORIGINALIDADE (ângulo próprio, ferramentas práticas montadas por nós sem fatos novos: passo a passo, checklist "o que observar em você", erros comuns, perguntas para levar ao médico; voz do blog); (2) trava automática `B07` em `auditar`: se mais de `MAX_SEMELHANCA` (padrão 6%) das sequências de 7 palavras do artigo forem iguais às de uma fonte ou concorrente lida, o artigo é devolvido para reescrita com os trechos copiados. Testado com texto simulado (cópia 43,5% = barrada; texto próprio 0%). Ainda não rodou com a API real: conferir o primeiro lote do estoque e, se preciso, ajustar o limite.

## Trava de segurança do robô (04/10/2026)
O robô publica sozinho qualquer pauta com SERP fácil e fontes; **`revisar: true` sozinho não o impede**. Por isso pautas de tema sensível levam `sensivel: true` além de `revisar: true`, e o `escolherPauta` do `scripts/article-robot.js` **pula** as que têm os dois. Para liberar: revisar a pauta/artigo e apagar `sensivel` e `revisar` em `data/keywords-validated.json`. Hoje bloqueada: ereção matinal. Toda pauta nova de remédio, urgência, sexualidade ou pornografia deve entrar com `sensivel: true`.

- Medir no Planejador as listas sem volume: `data/pesquisa/sem-dado.json` (63), `data/pesquisa/lotes/pressao-alta-sintomas-lista-*.txt` (37) e a lista de 421 de disfunção erétil.

## Cuidados
- Nunca colocar chaves no chat nem em arquivo versionado: só como secret do repositório.
- Resultados do HYPD expiram em 24 h: ingerir no mesmo dia.
- Cada checagem do Google gasta bastante contexto: lotes pequenos, uma frase por chamada.

## Programação diária (2026-10-11)
1 artigo novo com Gemini (reserva Claude, pesquisa SerpAPI antes) + 2 do estoque pronto, sem IA. Detalhes e secrets na seção 18 de `ESTRATEGIA-E-FLUXO-AUTOMATICO.md`. Falta o usuário criar `GEMINI_API_KEY` e `SERP_API_KEY` em Settings > Secrets > Actions.
