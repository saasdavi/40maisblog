# Decisões do dono do blog (valem para qualquer sessão, pessoa ou robô)

O dono do blog, do domínio e responsável pelo conteúdo decide o que bloquear. Registrado em 2026-10-11.

1. **Sem trava automática de revisão.** Nota baixa, tema sensível e falta de `REVISADO: sim` não seguram artigo. Só `segurar: true` (posto pelo dono ou pela regra 2) segura.
2. **Promessa de cura ou resultado garantido** não recusa o artigo: ele entra no estoque com `segurar: true` e o trecho em `segurarMotivo`, e o dono lê e decide (troca `segurar` para `false` para liberar). Quem alerta contra o "milagroso" não é promessa.
3. **Artigo escrito e avaliado no chat** (`NOTA_CHAT` ≥ 9) entra direto no estoque e no calendário, sem ser reprovado de novo por nota.
4. Tema duplicado (≥ 80%) e fonte sem link direto continuam como checagem do importador; formato que derruba o site (`<h1>`, componentes) é recusado porque quebra a página.

Guarda: `node scripts/test-entrada-google.mjs` falha se alguém reintroduzir trava automática de revisão.
