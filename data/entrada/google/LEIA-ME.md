# Contrato de entrega dos artigos (ChatGPT / Gemini / Claude) — fonte única

Quem escreve fora do robô entrega aqui. As regras abaixo saem do código (`scripts/lib/entrada-google.js`, `scripts/article-robot.js` `auditar`, `scripts/lib/decisao-importacao.js`) e de `DECISOES-DO-DONO.md`. Se o código mudar, este arquivo muda junto.

## 1. Arquivo
- Um `.txt` por artigo nesta pasta (`data/entrada/google/`), nome `palavra-chave-sem-acento.txt` (ex.: `colesterol-ldl.txt`).

## 2. Cabeçalho (uma linha por campo)
| Campo | Regra | Se errar |
|---|---|---|
| `PALAVRA_CHAVE:` | a frase buscada | falta = recusa |
| `TITLE:` | **até 49 caracteres**, com a palavra-chave (o site soma " \| Saúde 40+" e fecha em 60) | falta = recusa; longo = o importador encurta se houver ":" e itens; senão desconta nota |
| `DESCRIPTION:` | **120 a 160 caracteres**, com a palavra-chave | falta = recusa; fora do tamanho = aviso e desconto |
| `CAPA_ALT:` | descrição da foto de capa | falta = usa o título |
| `CAPA_ID:` | número da foto no Pexels (ex.: `7298749`) | sem número = busca a foto pelo alt |
| `FOTO1_ALT:` / `FOTO1_ID:` | segunda foto (alt obrigatório para ela entrar) | idem |
| `FOTO2_ALT:` / `FOTO2_ID:` | terceira foto | idem |
| `FOTO1_SECAO:` / `FOTO2_SECAO:` | opcional: número do `<h2>` em que a foto entra | padrão 2 e 4 |
| `FONTE: Título \\| https://link-completo-da-página` | **3 linhas recomendadas**, links específicos que você abriu de verdade; 2 oficiais é o ideal | informativo: ausência, link incompleto ou página inicial não bloqueia a publicação; nunca invente links |
| `NOTA_CHAT: X,X` | avaliação editorial recomendada de 0 a 10; objetivo mínimo **9,0** | a publicação direta não depende do importador |

Campos ignorados (sem erro): `CAPA_URL`, `CAPA_CREDITO`, `CAPA_DOWNLOAD` e os equivalentes de `FOTO*` (o crédito vem do Pexels).

## 3. Separador
Uma linha só com `---` depois do cabeçalho.

## 4. Corpo (HTML simples, padrão de SEO do blog)
- Tags: `<p> <h2> <h3> <ul> <li> <strong> <em> <a>`. **Sem** Markdown, `<h1>`, `<hr>` ou componentes de código (recusa).
- **1º parágrafo**: até 50 palavras, já responde a pergunta e contém a palavra-chave.
- **1.300 a 1.800 palavras** (menos de 1.000 = recusa; menos de 1.200 desconta).
- **Pelo menos 4 seções `<h2>`** (ideal 6 a 9), palavra-chave em pelo menos 2 delas de forma natural.
- Parágrafos de **até 50 palavras**; frases com média de **até 22 palavras**.
- Palavra-chave com densidade **até 3%** (acima de 5% = recusa): varie com sinônimos e pronomes.
- **2 links internos** ou mais, só para artigos já publicados (`<a href="/slug/">`); link para página que não existe = recusa.
- Termine com `<h2>Quando procurar um médico</h2>` e `<h2>Resumindo</h2>`.
- **Não** escreva a seção "Fontes" no fim (o site monta a lista a partir das linhas `FONTE:`). O aviso de saúde também é colocado pelo site.
- Texto original: trechos de 7+ palavras iguais às fontes acima do limite = recusa.

## 5. Publicação direta da pasta Google
- Os arquivos `.txt` desta pasta são a fonte direta das novas páginas do site; não precisam passar pelo `data/articles.json` nem pelo importador legado.
- Ao adicionar ou editar um `.txt` nesta pasta e enviar o commit para `main`, o workflow `Publicar diretamente da pasta Google` solicita o deploy.
- Fontes ausentes, inválidas ou apontando para página inicial não bloqueiam a publicação. Nunca invente URLs; use fontes apenas quando realmente verificadas.
- Para a página ser gerada, o arquivo precisa ter a linha `---` e corpo em HTML com ao menos um elemento de conteúdo (`<p>`, `<h2>`, `<h3>`, `<ul>` etc.). O importador legado continua disponível manualmente, mas não processa a pasta automaticamente.
- A nota editorial recomendada continua sendo `NOTA_CHAT` ≥ 9,0. A publicação direta não aguarda fila, pontuação técnica do importador ou liberação manual.

## 6. Modelo
```
PALAVRA_CHAVE: colesterol ldl
TITLE: Colesterol LDL: Valores e Como Reduzir
DESCRIPTION: (120 a 160 caracteres com a palavra-chave)
CAPA_ALT: ...
CAPA_ID: 7524949
FOTO1_ALT: ...
FOTO1_ID: 1640777
FOTO2_ALT: ...
FOTO2_ID: 3764396
FONTE: Título da página | https://...
FONTE: Título da página | https://...
FONTE: Título da página | https://...
NOTA_CHAT: 9,2
---
<p>O colesterol LDL ...</p>
<h2>...</h2>
<p>...</p>
<h2>Quando procurar um médico</h2>
<p>...</p>
<h2>Resumindo</h2>
<p>...</p>
```
