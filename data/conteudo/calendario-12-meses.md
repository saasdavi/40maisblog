# Calendário editorial de 12 meses (3 por dia)

Gerado por `scripts/calendario-editorial.js` em 2026-10-15. Início 2026-10-16. Substitui o calendário antigo de 06/10.

**Programação do dia:** vaga 1 = artigo **novo** escrito por IA (Gemini, reserva Claude, com a pesquisa da SerpAPI antes); vagas 2 e 3 = **estoque pronto**, publicado direto, sem IA. Quando o estoque pronto acaba (165 artigos, ≈ 83 dias), as vagas 2 e 3 também passam a ser artigo novo escrito por IA pela API: 3 por dia. Se o novo falhar num dia, o estoque cobre a vaga (enquanto houver).

Temas: pautas validadas da fila do robô primeiro; depois famílias de `pautas-mestre.csv`, `demanda-validada.json` e `plano-editorial.json` por demanda somada, alternando tema e no máximo 1 tema sensível por dia (tema sensível só publica depois de `REVISADO: sim`). Tema novo = a IA pesquisa o Google (SerpAPI) antes de escrever. O que ficou de fora está em `calendario-excluidos.csv`, com o motivo.

| Mês | Novo (pauta validada) | Novo (tema a validar) | Estoque pronto | Vaga |
|---|---|---|---|---|
| 2026-10 | 0 | 0 | 48 | 0 |
| 2026-11 | 0 | 0 | 90 | 0 |
| 2026-12 | 0 | 0 | 27 | 66 |
| 2027-01 | 0 | 0 | 0 | 93 |
| 2027-02 | 0 | 0 | 0 | 84 |
| 2027-03 | 0 | 0 | 0 | 93 |
| 2027-04 | 0 | 0 | 0 | 90 |
| 2027-05 | 0 | 0 | 0 | 93 |
| 2027-06 | 0 | 0 | 0 | 90 |
| 2027-07 | 0 | 0 | 0 | 93 |
| 2027-08 | 0 | 0 | 0 | 93 |
| 2027-09 | 0 | 0 | 0 | 90 |
| 2027-10 | 0 | 0 | 0 | 45 |

**Total:** 0 novos de pauta validada + 0 novos de tema a validar + 165 do estoque pronto + 930 vagas = 1095.
