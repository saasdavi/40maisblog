# Prompt mestre: pesquisa + artigo + autopontuação (Gemini pesquisa; GPT, DeepSeek ou Qwen escrevem)

Fluxo por artigo (1 palavra-chave por vez). Escolha a palavra em `data/conteudo/pautas-mestre.csv` (grupo 2, de preferência `produzir_amanha_sugerido = SIM`). Rode `node scripts/montar-prompt.js "palavra"` para gerar o prompt já preenchido (demanda, long tails, concorrentes, perguntas, lacunas).

- **Passo 1 (Gemini ou Perplexity, com busca ao vivo):** levantamento do Google e das fontes.
- **Você** abre os links das fontes e confere que carregam e batem com o assunto.
- **Passo 2 (GPT, DeepSeek, Qwen):** escreve o artigo no formato do sistema, usando SÓ as fontes conferidas.
- Salve a resposta em `data/entrada/<nome>.txt`. O importador audita (nota 0 a 10; mínimo 8,5). Tema sensível só sobe com "REVISADO: sim" dado por você.

---

## PROMPT 1: pesquisa (cole no Gemini; troque [PALAVRA-CHAVE])

```
Pesquise no Google Brasil (busca ao vivo) a palavra-chave [PALAVRA-CHAVE]. Abra os 5 primeiros resultados orgânicos (ignore anúncios, vídeos e redes sociais) e leia. Responda SÓ com estes blocos, sem comentário:

CONCORRENTES
posição | título | URL direta | tipo (hospital/laboratório/portal de saúde/blog/loja/fórum) | palavras aproximadas | H2 principais (até 8, separados por ;) | lida de verdade? (sim / não verifiquei)
PERGUNTAS DO GOOGLE (As pessoas também perguntam, 4 a 8)
PESQUISAS RELACIONADAS (todas)
LONG TAILS vistas nos artigos (20 a 40 termos de 3+ palavras): termo | em quantas das páginas aparece | intenção
LACUNAS (o que o topo NÃO responde bem, 3 a 6 itens)
DIFICULDADE: fácil | média | difícil (quantas autoridades como Ministério da Saúde, Einstein, Sírio-Libanês, Drauzio, Tua Saúde aparecem no top 5)
FONTES OFICIAIS CANDIDATAS (5): título da página | URL direta | uma frase do que a página afirma | aberta de verdade? (sim / não verifiquei)

Regras: só liste páginas que você realmente abriu. Nunca invente URL nem número de estudo. Nunca use links embrulhados em google.com/search. Informe a data da consulta. Se não puder abrir páginas, diga isso logo no início.
```

---

## PROMPT 2: escrever o artigo (cole no GPT, DeepSeek ou Qwen)

```
Você é redator do blog Saúde 40+ (público de 40+ anos, português do Brasil). Escreva UM artigo sobre [PALAVRA-CHAVE]. Seu trabalho é concluir os dados abaixo em um artigo que seja MELHOR que o topo do Google: mais completo, mais claro e mais seguro.

ENTRADAS (use cada uma para o que ela serve; nada além disso)

1) DADOS DA PLANILHA (demanda e prioridade; use para escolher foco e vocabulário)
- Palavra-chave: [PALAVRA-CHAVE] | tema: [TEMA] | tipo: [cabeça/média/long tail]
- Volume mensal: [VOLUME] | tendência: [TENDÊNCIA] | dificuldade no Google: [DIFICULDADE]
- LONG TAILS COM DEMANDA (volume medido): [LISTA: frase (volume)]. As de até 999 buscas entram como subtópicos naturais (H2 ou H3), sem repetir a frase exata. As de 1.000 ou mais merecem artigo próprio: apenas cite o tema e linke se existir.
- Vocabulário usado pelo topo: [TERMOS_USADOS_PELO_TOPO]. Use naturalmente, sem forçar.

2) PESQUISA DO GOOGLE (estrutura e lacunas; use para organizar)
- Concorrentes e H2 do topo: [COLE]
- Perguntas do Google: [COLE]. Responda todas, uma resposta direta em 1 a 3 frases.
- Lacunas do topo: [COLE]. Cubra cada uma: é o seu diferencial.
- H2 que 2 ou mais concorrentes têm: [COLE]. Cubra todos, com sua própria abordagem.

3) TEXTO DOS CONCORRENTES, se fornecido (só para entender cobertura, ordem e profundidade): [COLE OU "não fornecido"]. Escreva um artigo ORIGINAL, com suas palavras e estrutura própria. Não copie frases nem a sequência de parágrafos. NÃO retire fatos desse texto.

4) FONTES (já conferidas por humano): [COLE: título | URL | o que a página diz]. É a ÚNICA origem permitida para fatos, números e dados de saúde. Use SOMENTE estas; não acrescente nenhuma outra URL. Se uma afirmação não tem fonte nesta lista, não a escreva.

ORDEM DE PRIORIDADE quando as entradas divergirem: FONTES (fatos) > segurança > pesquisa e lacunas (estrutura) > planilha (foco e vocabulário) > texto dos concorrentes (apenas referência de estrutura).

O QUE ESPERAMOS COMO RESULTADO
- Responde a pergunta da palavra-chave logo no começo e cobre tudo o que o topo cobre.
- Preenche as lacunas que o topo deixa abertas.
- Usa as long tails como subtópicos, de forma natural.
- Todos os fatos vêm das FONTES, com tom prudente.
- Passa do mínimo de 8,5 de 10 no nosso auditor.

ENTREGA: responda com o artigo COMPLETO, do cabeçalho até o último parágrafo do HTML, em uma única resposta, sem cortar. Nada de comentário antes ou depois, exceto a linha final "NÃO VERIFIQUEI:".

FORMATO DE SAÍDA (texto simples, exato; PROIBIDO Markdown: sem "#", sem [texto](url), sem asteriscos, sem cercas de código; sem "(Foto ilustrativa...)" no texto):
PALAVRA_CHAVE: [PALAVRA-CHAVE]
TITLE: até 46 caracteres, com a palavra-chave (conte)
DESCRIPTION: entre 125 e 155 caracteres, com a palavra-chave (conte)
CAPA_BUSCA: busca de foto em inglês (cena concreta, sem marca)
CAPA_ALT: alt em português descrevendo a foto (25+ caracteres)
FOTO1_BUSCA: ...
FOTO1_ALT: ...
FOTO1_LEGENDA: até 120 caracteres
FOTO1_SECAO: número do h2
FOTO2_BUSCA: ...
FOTO2_ALT: ...
FOTO2_LEGENDA: ...
FOTO2_SECAO: número do h2 diferente do da foto 1
FONTE: Título | https://url-direta-que-abre
FONTE: Título | https://url-direta-que-abre
FONTE: Título | https://url-direta-que-abre
CONCORRENTE: título | URL | dificuldade (1 linha por concorrente)
LACUNA: cada lacuna que o artigo cobre (1 por linha)
---
<corpo em HTML simples>

REGRAS DAS FOTOS (o nosso sistema procura e coloca as fotos sozinho, no Pexels ou Pixabay, e grava o crédito)
- Você informa SÓ a busca em inglês (cena concreta, sem marca), o alt, a legenda e a seção. NÃO invente ID de foto, URL de foto, nome de fotógrafo nem escreva "Pexels" ou "Pixabay" no texto.
- ALT: em português, descreve a cena real da foto, 25+ caracteres. Use a palavra-chave em no máximo uma foto, de forma natural.
- LEGENDA: até 120 caracteres, ligada ao assunto da seção. Foto 1 e foto 2 em seções diferentes.
- Não escreva "(Foto ilustrativa...)" nem [IMAGEM...] dentro do corpo do artigo.

CORPO (HTML simples: p, h2, h3, ul, li, strong, a; sem h1, sem hr, sem componentes, sem data):
1. Primeiro parágrafo (até 45 palavras): responde a pergunta direto e contém a palavra-chave exata.
2. De 6 a 9 <h2>, a maioria em forma de pergunta, usando as long tails de apoio. Parágrafos de até 45 palavras, frases de até 20 palavras em média, listas onde ajudar.
3. Uma seção com as perguntas do Google, cada resposta direta em 1 a 3 frases.
4. <h2>Quando procurar um médico</h2>
5. <h2>Resumindo</h2> com 2 parágrafos curtos.
6. Pelo menos 2 links internos <a href="/slug/">texto natural</a>, só desta lista: [LINKS-INTERNOS-PERMITIDOS]. Sem lista, não coloque links internos. Nunca use exemplo.com.
7. No mínimo 1.300 palavras (conte). Palavra-chave exata no máximo 3% do texto; varie com sinônimos e as long tails.

REGRAS DE SEGURANÇA
- Número, porcentagem, valor ou dose só se estiver nas FONTES. Sem fonte, não escreva o número.
- Tema de fitoterapia, suplementos, hormônios, exames ou remédios: inclua contraindicações por grupo (gestantes, lactantes, crianças, hipertensos, problemas renais e hepáticos, quem usa remédio contínuo, diabetes), interação com medicamentos e aviso para procurar médico. Sem nome de remédio, marca, dose, link de compra ou preço.
- Proibido PROMETER: cura garantida/definitiva, resultado garantido, produto "milagroso", "sem efeitos colaterais", perda de peso com prazo, "queima gordura", "elimina barriga", imbatível, mágico/mágica; diagnóstico ("você tem"). As palavras cura, garantido e milagre podem aparecer quando negam ou explicam ("não tem cura", "tem cura?", "não existe milagre").
- Proibido: "neste artigo", "vamos explorar", "mergulhar", "jornada", "vale ressaltar", "é importante destacar", "em suma", "concluindo", "no cenário atual".
- Sem "forte", "intensa", "altíssimo poder", "potente" para efeito de erva ou alimento; use "pode auxiliar" ou "suporte moderado".
- Sem linguagem opinativa ou ofensiva ("pífios", "fantasiosos", "irrelevante", "irrefreável").
- Efeito descrito como modesto e dependente de alimentação e exercício, nunca garantido.
- Não atribua a NIH, Anvisa ou OMS algo mais forte do que a fonte diz. Sem "segundo diretrizes", "estudos demonstram" ou "especialistas reforçam" sem a fonte exata.
- Não cite ingrediente em contraindicação se ele não tem seção no artigo.
- Não escreva "REVISADO: sim": quem confirma é o responsável humano. Não diga que verificou links que você não abriu.
- Não escreva a seção de Fontes nem o aviso de saúde no corpo (o sistema acrescenta).

REGRAS DE FONTES
1. Mínimo 3 FONTES reais, pelo menos 2 oficiais (Ministério da Saúde, Anvisa, SciELO, NIH/MedlinePlus/NCCIH/ODS, OMS, sociedade médica, universidade, hospital de referência). Loja, fabricante e portal comercial não contam.
2. URL direta da página. Nunca embrulhada em google.com/search, bit.ly ou redirecionador. Nunca página inicial.
3. Número de estudo (PMID/PMC) só se tiver certeza de que existe e trata do assunto.
4. Não afirme "possui monografia oficial" ou semelhante sem a página que prove. Não invente nada de memória.

AUTOCONFERÊNCIA (corrija antes de responder; não mostre): título ≤ 46 e descrição 125 a 155 caracteres; palavra-chave no 1º parágrafo (≤ 45 palavras); ≥ 1.300 palavras; ≥ 6 h2; "Quando procurar um médico" e "Resumindo"; nenhum parágrafo acima de 45 palavras; nenhuma palavra proibida; ≥ 3 FONTE com URL direta; perguntas do Google respondidas e lacunas cobertas; nenhum número sem fonte.

ÚLTIMA LINHA: "NÃO VERIFIQUEI:" listando os links que você não abriu e as afirmações sem fonte.
```

---

## Como o sistema pontua (para você saber o que pesa)
Nota final = qualidade técnica 35% + demanda 20% + fontes 15% + originalidade 15% + formato 10% + segurança 5%.
- PUBLICAR: 85 ou mais, sem bloqueio. SEGURAR: 70 a 84 (volta com a lista do que corrigir). DEVOLVER: abaixo de 70, bloqueio ou parecido demais com outro artigo (80%+).
- Demanda: pesa mais quando a palavra-chave está em `data/pesquisa/DEMANDA-VALIDADA.md` com 10 mil ou mais buscas.
- Fontes: pesa mais com 3+ fontes e 2+ institucionais. Fonte só de clínica ou laboratório comercial pesa pouco.
- Formato: 1.500+ palavras, 3 imagens (eu coloco pelos seus links do Pexels) e 2+ links internos.
