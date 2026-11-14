# Arquitetura

## Visão geral

```
                     ┌──────────── Navegador (PC / tablet / celular / OBS) ────────────┐
                     │  Painel Next.js · Overlay (Browser Source) · PWA · OBS WebSocket │
                     └───────┬──────────────────────────────┬──────────────────────────┘
                     HTTPS /api (rewrite)              WebSocket (Socket.IO)
                             │                                │
┌─────────┐   HTTP   ┌───────▼──────┐                 ┌───────▼───────┐
│  Caddy  ├─────────►│  web (Next)  │                 │   realtime    │◄── psubscribe rt:*
│ (borda) │          └───────┬──────┘                 └───────▲───────┘
└─────────┘                  │ HTTP                           │ publish (estado, eventos, status, fx)
                     ┌───────▼──────┐   enqueue    ┌──────────┴──────────┐
                     │  api (Nest)  ├─────────────►│ Redis (filas BullMQ, │
                     └───────┬──────┘              │ streams, leases,     │
                             │ Prisma              │ pub/sub, contadores) │
                     ┌───────▼──────┐              └──┬───────┬───────┬───┘
                     │ PostgreSQL   │◄────────────────┤       │       │
                     │ (fonte da    │   ┌─────────────▼┐ ┌────▼─────┐ ┌▼──────────────┐
                     │  verdade)    │   │   worker     │ │game-runner│ │ connector      │──► TikTok (adaptador)
                     └──────▲───────┘   │ ingestão,    │ │ jogos 30Hz│ │ fontes de      │
                            │           │ ranking,     │ │ checkpoint│ │ eventos        │
                            │           │ automação,   │ └───────────┘ └────────────────┘
                            │           │ watchdog     │       ┌───────────────────────┐
                            └───────────┴──────────────┘       │ stream-manager        │──► RTMP autorizado / arquivo
                                                               │ Chromium + FFmpeg     │
                                                               └───────────────────────┘
```

Cada caixa é um **processo separado**. Uma falha em um jogo não derruba a API; uma queda da conexão TikTok não destrói o estado do jogo; um worker que cai não interrompe outras sessões.

## Fluxo de um presente

1. **connector** recebe o evento da fonte (adaptador `TikTokConnectorAdapter`), normaliza (`normalizeEvent`), aplica token bucket e agrega curtidas em janelas de 1s (`LikeAggregator`).
2. Enfileira na fila `events-ingest` com prioridade por tipo e `jobId = tenant+eventId` (idempotência). Acima do limite suave, eventos de baixa prioridade são descartados de forma contabilizada (backpressure).
3. **worker** valida o schema, confere que o tenant do evento é o dono da sessão, e roda `processEvent`: deduplicação → delta da sequência de presentes → contadores → regras → cooldowns/limites.
4. As mensagens resultantes vão para o **Redis Stream** `la:session:<id>:actions`.
5. **game-runner** (dono da sessão via lease) lê o stream, aplica no jogo, avança a simulação a 30 Hz e publica snapshots a 15 Hz.
6. **realtime** entrega aos sockets da sala `s:<tenant>:<sessão>` (painel e overlay). Snapshots são “voláteis”: clientes lentos perdem quadros em vez de acumular fila.

Latência medida ponta a ponta (chamada → evento no WebSocket): p95 ≈ 40–70 ms com 10–20 sessões (ver [TESTING.md](TESTING.md)).

## Decisões de arquitetura (ADR resumidas)

| # | Decisão | Motivo |
|---|---|---|
| 1 | **Simulação dos jogos no servidor**, renderização no navegador | Um único estado verdadeiro para painel, overlay e encoder; checkpoint/recuperação; o celular pode bloquear a tela sem parar o jogo. |
| 2 | **Canvas 2D próprio** em vez de Phaser/PixiJS | A física/cenas do Phaser rodariam no cliente e não no servidor (decisão 1). O renderer só desenha snapshots; Canvas 2D é leve, funciona em qualquer navegador e no Chromium headless do encoder. A interface `GameRenderer` permite plugar PixiJS no futuro se um jogo exigir WebGL. |
| 3 | **Colyseus não utilizado** | A sincronização de estado já é resolvida por snapshots + Socket.IO; não há jogadores controlando entidades em tempo real com predição. Reavaliar se surgir multiplayer com input direto. |
| 4 | **BullMQ** para ingestão/automação/ranking e **Redis Streams** para mensagens ordenadas por sessão | Filas independentes com retentativa e DLQ; streams preservam a ordem e permitem idempotência por ID após recuperação. |
| 5 | **Lease (lock com expiração)** por sessão, conector e chave RTMP | Failover automático; impede dois processos usando a mesma sessão/chave. Readquire o lease se o Redis perder dados. |
| 6 | **PostgreSQL é a fonte da verdade**; Redis é índice/cache | Após perda do Redis, os serviços reconstroem índices consultando o banco antes de encerrar qualquer coisa (teste de caos nº 6). |
| 7 | **Monorepo pnpm + TypeScript strict** (pacotes compilados com `tsc -b`, CommonJS) | Compartilhamento de tipos entre serviços e web; NestJS exige `emitDecoratorMetadata` (por isso `tsc`, não esbuild). |
| 8 | **Admin dentro do app web** (`/admin`) com RBAC de plataforma no backend | Menos superfície de implantação; todo endpoint `/api/admin/*` exige papel OPERATOR/ADMIN (e MFA, se configurado). |
| 9 | **OBS controlado pelo navegador** (obs-websocket local) | O servidor não precisa alcançar o PC do usuário; a senha do OBS nunca sai do navegador. |
| 10 | **TikTok via adaptador** | A plataforma nunca depende diretamente de uma biblioteca (licença e protocolo instáveis). |

## Mapeamento da estrutura sugerida

| Sugerido | Implementado |
|---|---|
| `apps/renderer` | Página `/overlay/[sessionId]` (web) + captura no `stream-manager` |
| `apps/admin` | `/admin` no `apps/web` (RBAC no backend) |
| `apps/realtime`, `apps/worker`, `apps/api`, `apps/web` | idem |
| — | `apps/game-runner`, `apps/connector`, `apps/stream-manager` (processos separados) |
| `packages/ui` | Componentes em `apps/web/components/ui` (único consumidor) |
| `packages/*` | idem + `runtime` (Redis/filas/leases), `games-catalog` |

## Estados

- **Sessão** (`packages/automation/src/state-machine.ts`): IDLE → STARTING → RUNNING ⇄ PAUSED → STOPPING → STOPPED, com ERROR/RECOVERING. Transições com controle otimista no banco e histórico (`SessionTransition`).
- **Fonte de eventos**, **jogo** e **transmissão** têm estados próprios e independentes (exibidos separadamente no painel). Ex.: a fonte pode estar RECONNECTING enquanto o jogo segue RUNNING.

## Resiliência

Health/readiness/liveness em todos os serviços · heartbeats (Redis + banco) · watchdog (15s) · reconexão com backoff exponencial e jitter · circuit breaker no conector · timeouts · limite de sessões e de memória por runner · monitor de event loop · filas limitadas e backpressure · checkpoints (Redis 2s, PostgreSQL 15s) com recuperação idempotente · encerramento gracioso com handoff de sessões · supervisor reinicia processos (Docker `restart: unless-stopped` / `scripts/start-all.mjs`).
