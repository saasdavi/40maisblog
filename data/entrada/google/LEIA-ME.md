# Pasta de entrega dos artigos do chat (ChatGPT / Gemini / IA do Google)

Coloque aqui **um arquivo `.txt` por artigo**, com o nome `palavra-chave-sem-acento.txt` (ex.: `colesterol-ldl.txt`).

Conteúdo do arquivo, nesta ordem:
1. Cabeçalho, uma linha por campo: `PALAVRA_CHAVE:`, `TITLE:`, `DESCRIPTION:`, `CAPA_*`, `FOTO1_*`, `FOTO2_*` e `FONTE: Título | https://link-completo-da-página`.
2. `NOTA_CHAT: 9,2` (nota final do chat; 9,0 ou mais entra direto na fila de prontos).
3. Uma linha só com `---`.
4. O corpo em HTML simples (`<p> <h2> <h3> <ul> <li> <strong> <em> <a>`), sem Markdown e sem `<h1>`.

A publicação diária importa tudo o que estiver aqui: o que entrar vai para `data/entrada/processados/`; o que for recusado fica aqui com um `.relatorio.md` explicando o motivo. Regras: `DECISOES-DO-DONO.md`.
