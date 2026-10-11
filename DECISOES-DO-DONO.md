# Decisões do dono do blog (valem para qualquer sessão, pessoa ou robô)

O dono do blog, do domínio e responsável pelo conteúdo decide o que bloquear. Registrado em 2026-10-11.

1. **A única trava é nota baixa**: pontuação final abaixo de 90 (artigo do chat com `NOTA_CHAT` ≥ 9 conta como aprovado). Auditoria de 85 ou menos também é nota baixa.
2. **Tema sensível não trava.** Não precisa de `REVISADO: sim`.
3. **Promessa (cura, resultado garantido, "milagre") não trava.** O importador só registra um aviso no log e em `scores.atencao`.
4. **Artigo escrito e avaliado no chat** (`NOTA_CHAT` ≥ 9) entra direto no estoque e no calendário.
5. `segurar: true`, posto à mão pelo dono num artigo, segura esse artigo.
6. Recusas técnicas do importador continuam (não são decisão editorial): formato que quebra a página (`<h1>`, componentes), fonte sem link completo, cabeçalho incompleto e tema duplicado (≥ 80%).

Guarda: `node scripts/test-entrada-google.mjs` falha se alguém mudar essas regras sem mudar este arquivo.
