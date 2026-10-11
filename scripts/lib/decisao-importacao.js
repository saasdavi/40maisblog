// Decisão do importador para um artigo escrito fora do robô (regras em DECISOES-DO-DONO.md).
// Duas notas SEPARADAS: notaChat (0–10, a avaliação que o chat declarou em NOTA_CHAT) e a pontuação técnica
// do importador (pont.total, 0–100, calculada em código por scripts/pontuacao.js). Uma não substitui a outra.
//   recusar  → falha técnica (formato, fonte sem link, cabeçalho) ou tema duplicado; sem NOTA_CHAT ≥ 9, também auditoria < 85 ou pontuação < 70 (regra antiga)
//   segurar  → NOTA_CHAT ≥ 9, mas a pontuação técnica ficou abaixo de 90: entra no estoque com segurar: true e não publica até o dono liberar
//   aceitar  → entra no estoque; com NOTA_CHAT ≥ 9 e pontuação ≥ 90, vai direto para a fila de publicação
// Tema sensível e promessa NÃO recusam nem seguram (promessa vira aviso).
export const NOTA_CHAT_MIN = 9;
export const PONTUACAO_MIN = 90;
export const AUDITORIA_MIN_SEM_CHAT = 85;

export const ehPromessa = (b) => /^SEG: promessa/.test(b);

export function decidirImportacao({ notaChat = null, aud, pont = null, duplicado = false }) {
  const confiavel = notaChat !== null && notaChat >= NOTA_CHAT_MIN;
  const duros = (aud?.bloqueios || []).filter((b) => !ehPromessa(b));
  const avisos = (aud?.bloqueios || []).filter(ehPromessa).map((b) => `aviso: ${b}`);
  if (duros.length) return { acao: 'recusar', confiavel, motivos: duros, avisos };
  if (!confiavel && aud.nota < AUDITORIA_MIN_SEM_CHAT) return { acao: 'recusar', confiavel, motivos: [`auditoria ${aud.nota}/100 (mínimo ${AUDITORIA_MIN_SEM_CHAT} sem NOTA_CHAT ≥ ${NOTA_CHAT_MIN})`], avisos };
  if (!pont) return { acao: 'pendente', confiavel, motivos: [], avisos }; // antes da pontuação: só as recusas acima
  if (duplicado) return { acao: 'recusar', confiavel, motivos: ['tema duplicado (≥ 80% parecido com outro artigo)', ...pont.motivos], avisos };
  if (!confiavel) return pont.total < 70 ? { acao: 'recusar', confiavel, motivos: [`pontuação ${pont.total}/100 (mínimo 70 sem NOTA_CHAT ≥ ${NOTA_CHAT_MIN})`, ...pont.motivos], avisos } : { acao: 'aceitar', confiavel, motivos: [], avisos };
  if (pont.total < PONTUACAO_MIN) return { acao: 'segurar', confiavel, motivos: [`divergência: NOTA_CHAT ${String(notaChat).replace('.', ',')}/10 (≥ ${NOTA_CHAT_MIN}) e pontuação técnica do importador ${pont.total}/100 (< ${PONTUACAO_MIN})`, ...pont.motivos.filter((m) => !/^BLOQUEIO: SEG: promessa/.test(m))], avisos };
  return { acao: 'aceitar', confiavel, motivos: [], avisos };
}
