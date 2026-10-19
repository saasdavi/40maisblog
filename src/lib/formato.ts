// Formatação de data para o leitor, no horário de Brasília.
// Fica em um lugar só porque a home, a lista, o layout do artigo e a página do artigo
// mostravam a mesma data com quatro cópias da mesma lógica.

const FUSO = 'America/Sao_Paulo';

/** Data e hora de publicação: dd/mm/aa hh:min (ex.: 18/10/26 21:35). */
export const formatarDataHora = (iso?: string | null) => {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: FUSO,
  }).replace(',', '');
};
