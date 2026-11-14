# Solução de problemas

O painel mostra **4 estados independentes**. Comece por eles:

| Cartão | Se estiver com problema | O que fazer |
|---|---|---|
| **Sessão** em Erro | O jogo não iniciou ou falhou repetidamente | Leia a mensagem em vermelho; encerre e inicie de novo. Se repetir, veja *Admin → Alertas* |
| **Fonte de eventos**: “Criador não está ao vivo” | Você ainda não entrou ao vivo no TikTok | Normal: o sistema verifica a cada minuto |
| **Fonte de eventos**: Reconectando / Erro | Queda da conexão com a fonte ou fonte indisponível | Reconecta sozinho com espera crescente. “Indisponível” = fonte não habilitada no servidor (ver TIKTOK_INTEGRATION.md) |
| **Jogo**: Recuperando | O processo do jogo caiu e outro assumiu | Volta sozinho em poucos segundos, do último ponto salvo |
| **Transmissão**: Com problemas / Reiniciando | Encoder abaixo do FPS (CPU ou rede) | Reduza a qualidade (720p) ou aumente a CPU do servidor |

## Para operadores

| Sintoma | Verificação |
|---|---|
| Nada carrega | `curl /api/health/ready` (banco/Redis) · logs do `api` |
| Painel abre mas o jogo não aparece | Serviço `realtime` no ar? `NEXT_PUBLIC_REALTIME_URL` correto **no build do web**? CORS inclui a origem? |
| Sessão presa em “Iniciando” | Há `game-runner` vivo? (*Admin → Serviços*). O watchdog marca ERRO após 90 s |
| Eventos não chegam ao jogo | Fila `events-ingest` (*Admin → Serviços → Filas*) e logs do `worker`; regras do jogo habilitadas? cooldown? |
| Muitos 429 | Usuários atrás do mesmo IP sem proxy de borda: configure Caddy/nginx com `EDGE_PROXY=true` |
| `/api/*` retorna 404 no web | `API_INTERNAL_URL` é fixado no **build** do Next — reconstrua o web |
| `next build` falha com “<Html> should not be imported” | Rode com `NODE_ENV=production` |
| Overlay mostra “Link inválido” | Link revogado/expirado — gere outro |
| OBS não conecta | OBS 28+, WebSocket ativado, porta 4455, mesma máquina do navegador, senha correta |
| Vídeo do servidor sem quadros | `CHROMIUM_PATH`, `INTERNAL_WEB_URL` acessível pelo stream-manager, `shm_size` ≥ 1 GB |
| MP4 corrompido | Corrigido (MP4 fragmentado + `-shortest`). Arquivos antigos podem não abrir |
| Após reinício do Redis | Esperado: sessões continuam; índices são reconstruídos em segundos a partir do banco |

Logs são JSON (pino). Exemplo: `docker compose logs -f game-runner | grep -v '"level":"info"'`. Cada resposta de erro da API traz `requestId` para cruzar com os logs.

Métricas: Grafana “LIVE ARENA — Operação” (filas, latência, sessões, ticks, encoder, CPU/memória, reconexões). Alertas em `infrastructure/monitoring/alerts.yml`.
