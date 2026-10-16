# Artigos escritos fora do robô (ChatGPT etc.), sem gastar API

1. Salve o artigo em `data/entrada/<qualquer-nome>.txt` neste formato (cabeçalho, linha `---`, corpo em HTML):

```
PALAVRA_CHAVE: magnésio para que serve
TITLE: até 46 caracteres, com a palavra-chave
DESCRIPTION: 125 a 155 caracteres, com a palavra-chave
CAPA_BUSCA: busca em inglês para a foto de capa (Pexels)
CAPA_ALT: descrição da foto de capa
FOTO1_BUSCA: busca da foto 1
FOTO1_ALT: descrição da foto 1
FOTO1_LEGENDA: legenda curta
FOTO1_SECAO: 2
FOTO2_BUSCA: ...
FONTE: Título da fonte 1 | https://...
FONTE: Título da fonte 2 | https://...
REVISADO: sim   (só para tema sensível já revisado por pessoa)
---
<p>1º parágrafo com a palavra-chave (até 50 palavras)...</p>
<h2>...</h2> (mín. 4 H2, "Resumindo" no fim e "Quando procurar um médico")
```

2. Para arquivos em `data/entrada/google/`, basta enviar o `.txt` para `main`: o workflow de publicação direta aciona o deploy. O importador legado permanece manual para a fila antiga.
3. Regras automáticas: ≥1000 palavras, ≥2 fontes, aviso de saúde no fim, sem frases de cura/garantia, densidade da palavra-chave ≤5%, ≥2 links internos válidos, nota mínima 80.

## Pastas de `data/entrada/`
- **(raiz)** só os `.txt` que ainda vão ser importados (a fila do importador) e os guias (`LEIA-ME.md`, `MODELO-PARA-A-IA.md`, `PROMPT-*.md`, `TESTE-DA-IA.md`). O importador lê apenas os `.txt` desta pasta.
- **`processados/`** `.txt` que já foram importados para o estoque.
- **`pendentes-revisao/`** artigos deixados de fora de propósito (marca, dose de suplemento ou palavra-chave que repete outro artigo), cada um com o seu `.relatorio.md`. Precisam de ajuste antes de voltar para a raiz. Os 31 artigos com bloqueio de segurança (promessa de cura etc.) foram retirados do repositório para edição à parte.
- **`originais/`** os arquivos `.html` e `.md` originais, como foram enviados, antes da conversão para `.txt`. Guardados só como referência; nada os lê.

## Saída da IA do Google (prompt unificado)

Cole a resposta inteira (Fase 1, Fase 2 e Fase 3) num arquivo `data/entrada/google/<qualquer-nome>.txt`, um por artigo. O importador recorta a Fase 2, converte `CAPA_ID`/`FOTOn_ID` em `*_PEXELS_ID`, descarta `CAPA_URL`/`CREDITO`/`DOWNLOAD`, reduz o `TITLE` para até 49 caracteres, transforma o texto puro em HTML, acrescenta 2 links internos e herda `REVISADO: sim` quando o artigo já está em revisão por ser tema sensível. No fluxo direto da pasta `data/entrada/google/`, `FONTE` sem link direto (`nih.gov`) ou apontando para página inicial não bloqueia a publicação; gera apenas informação editorial. O prompt está em `PROMPT-UNIFICADO.md`. Teste: `node scripts/test-entrada-google.mjs`.
