# Decisões do dono do blog (valem para qualquer sessão, pessoa ou robô)

O dono do blog, do domínio e responsável pelo conteúdo decide o que bloquear. Registrado em 2026-10-11.

1. **A única trava é nota baixa.** Tema sensível não trava (não precisa de `REVISADO: sim`). Promessa (cura, resultado garantido, "milagre") não trava: vira aviso no log e em `scores.atencao`.
2. **Artigo escrito e avaliado no chat** traz `NOTA_CHAT: X,X` no cabeçalho. A nota precisa refletir a avaliação real do chat (o chat só entrega com 9,0 ou mais).
3. **Duas notas separadas, uma não substitui a outra** (`scripts/lib/decisao-importacao.js`):
   - `NOTA_CHAT` (0–10): avaliação editorial do chat, guardada em `scores.notaChat`.
   - Pontuação técnica do importador (0–100): calculada em código, guardada em `scores.total`.
4. **Como o artigo entra**
   - `NOTA_CHAT` ≥ 9 **e** pontuação técnica ≥ 90 → entra direto na fila de publicação.
   - `NOTA_CHAT` ≥ 9 **e** pontuação técnica < 90 (divergência) → entra no estoque com `segurar: true` e `segurarMotivo` (as duas notas e os motivos). **Não publica** até o dono liberar (`segurar: false`).
   - Sem `NOTA_CHAT` ou abaixo de 9 → regra antiga: auditoria ≥ 85 e pontuação ≥ 70 para entrar no estoque; fica fora da fila enquanto a pontuação for < 90.
5. **Recusas técnicas**: formato que quebra a página (`<h1>`, componentes), cabeçalho obrigatório incompleto e tema duplicado (≥ 80% parecido com outro artigo). **Fontes não bloqueiam importação nem aprovação editorial**: URL ausente, inválida ou página inicial gera aviso; fontes válidas continuam registradas e a pontuação de cobertura pode refletir a disponibilidade delas. Nunca inventar nem fabricar URLs.
6. `segurar: true`, posto à mão pelo dono, segura qualquer artigo. Só o robô publica do estoque (`publicarDoEstoque`), e ele pula todo artigo com `segurar: true`.

## Pontuação técnica do importador (`scripts/pontuacao.js`)

É uma medida automática de formato e cobertura. **Não é prova de qualidade editorial** nem de exatidão médica: não confere se o texto está certo, só se cumpre o padrão do blog.

| Parte | Peso | O que mede |
|---|---|---|
| Qualidade técnica | 35% | Nota da auditoria em código (`auditar` em `scripts/article-robot.js`): tamanho, parágrafos ≤ 50 palavras, palavra-chave no título/descrição/1º parágrafo/H2, densidade da palavra-chave, seções "Quando procurar um médico" e "Resumindo", alt das imagens, links internos. |
| Demanda | 20% | Buscas/mês da palavra-chave em `data/pesquisa/demanda-validada.json`: 10.000+ = 100; 1.000+ = 80; menos = 45; não medida = 25. |
| Fontes | 15% | 3+ fontes com 2+ oficiais = 100; 3 com 1 oficial = 80; 2 com 1 oficial = 65; 2 sem oficial = 45; menos = 15. |
| Originalidade | 15% | Semelhança de título/palavra-chave com outros artigos do blog: ≥ 80% = 0 (duplicata); ≥ 65% = 40; ≥ 50% = 70; menos = 100. |
| Formato | 10% | Palavras (1.500+ = 60; 1.200+ = 50; 1.000+ = 30), imagens (3 = 20; 2 = 10; foto buscada na publicação conta como 3) e links internos (2+ = 20; 1 = 10). |
| Segurança | 5% | No importador, tema sensível e promessa não descontam (regra 1). |

## Testes que guardam estas regras
- `node scripts/test-decisao-importacao.mjs`: aprovação automática, divergência de notas, `NOTA_CHAT` < 9, falha técnica, duplicata, promessa só como aviso e bloqueio de publicação de artigo segurado.
- `node scripts/test-entrada-google.mjs`: a única trava é nota baixa; `NOTA_CHAT` preservada na conversão; promessa só quando promete.
