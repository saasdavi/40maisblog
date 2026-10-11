# Horários de publicação pelo cron externo (cron-job.org)

O GitHub atrasa ou descarta agendamentos, por isso o workflow **Daily Article Production** não tem mais `schedule`. Quem dispara é o cron-job.org (https://console.cron-job.org/dashboard), 3 vezes por dia, chamando a API do GitHub.

## Como funciona o dia
Os 3 disparos são **iguais** (`modo = novo`):
- Cada um tenta o artigo novo escrito por IA (Gemini, reserva Claude, com 1 busca da SerpAPI antes) **se ainda não saiu um hoje**.
- Se o novo de hoje já saiu, publica 1 do estoque pronto, sem chamar IA.
- Se o primeiro falhar, o segundo tenta de novo; o estoque completa os 3 do dia. O teto é 3 por dia (dia de Brasília), mesmo que um job rode duas vezes.
- Quando o estoque pronto acaba, os 3 disparos escrevem artigo novo pela API.

## 1. Criar o token do GitHub (uma vez)
Só você faz isso, e o token **não vai para o chat nem para o repositório**: fica só dentro do cron-job.org.
1. GitHub > Settings > Developer settings > Personal access tokens > **Fine-grained tokens** > Generate new token.
2. Repository access: **Only select repositories** > `saasdavi/40maisblog`.
3. Permissions > Repository permissions > **Actions: Read and write** (o resto pode ficar sem acesso).
4. Validade: 1 ano. Anote a data para renovar.

## 2. Criar os 3 cron jobs no cron-job.org
Em cada job (Create cronjob), com os mesmos dados e só o horário mudando:

| Campo | Valor |
|---|---|
| URL | `https://api.github.com/repos/saasdavi/40maisblog/actions/workflows/daily-production.yml/dispatches` |
| Método (Advanced) | `POST` |
| Cabeçalhos (Advanced) | `Authorization: Bearer SEU_TOKEN` |
| | `Accept: application/vnd.github+json` |
| | `X-GitHub-Api-Version: 2022-11-28` |
| | `Content-Type: application/json` |
| | `User-Agent: cron-job-org` |
| Corpo (Advanced) | `{"ref":"main","inputs":{"modo":"novo"}}` |
| Fuso | America/Sao_Paulo |
| Horários sugeridos (editáveis) | 08:00, 12:30 e 18:00 |

Ligue "Save responses in job history" e o aviso por e-mail em caso de falha.

## 3. Conferir
- No cron-job.org, use **Test run**: a resposta certa é **HTTP 204** (sem corpo).
- No GitHub, aba **Actions** > Daily Article Production: deve aparecer uma execução "workflow_dispatch" com `modo = novo`.
- Erros comuns: **401** token errado ou vencido; **403/404** o token não tem acesso ao repositório ou falta a permissão Actions; **422** o corpo JSON está inválido (confira as aspas).

## Manutenção
- Para trocar os horários, edite os jobs no cron-job.org; nada muda no repositório.
- Para só publicar do estoque num disparo específico, use `{"ref":"main","inputs":{"modo":"estoque"}}`.
- Segredos do repositório que o workflow usa: `GEMINI_API_KEY`, `SERP_API_KEY`, `ANTHROPIC_API_KEY`, `PEXEL_API_KEY`, `UNSPLASH_ACCESS_KEY`, `GH_TOKEN`.
