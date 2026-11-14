# Auditoria do projeto — LIVE ARENA

Data: 14/11/2026. Base auditada: commit `2339215` (branch `ccr-8c9692c5-1sdtbd`). Backup antes das mudanças: branch local `backup/v0.1-antes-v2` e tag `v0.1.0` (o histórico completo também está no branch remoto).

## Stack identificada

| Camada | Tecnologia |
|---|---|
| Linguagem | TypeScript strict (100% do código de aplicação) |
| Monorepo | pnpm workspaces, `tsc -b` com project references |
| Frontend | Next.js 15 (App Router), React 19, Tailwind 4, TanStack Query, Zustand, Socket.IO client, obs-websocket-js |
| Backend | NestJS 11 (API REST), Socket.IO (serviço `realtime`), BullMQ (worker), processos dedicados: `game-runner`, `connector`, `stream-manager` |
| Banco | PostgreSQL 16 + Prisma 6 (27 modelos, 1 migração) |
| Filas/cache | Redis 7, BullMQ, Redis Streams |
| Jogos | Simulação TypeScript no servidor + renderer Canvas 2D próprio (sem Phaser/Pixi) |
| Vídeo | Chromium headless + FFmpeg |
| Infra | Docker multi-alvo, Compose, Caddy/nginx, Prometheus/Grafana, GitHub Actions |
| Testes | Vitest (72 unit + 13 integração), Playwright (56 E2E), caos (8), carga (Node + k6) |

## Classificação

Legenda: **1** funcional e aproveitável · **2** parcialmente funcional · **3** apenas visual · **4** quebrado · **5** inexistente.

| Área | Classe | Observação |
|---|---|---|
| Autenticação (cadastro, login, refresh rotativo, MFA, reset de senha) | 1 | testado |
| Multi-tenant e RBAC | 1 | isolamento testado em API e WebSocket |
| Event Engine (dedupe, streak, curtidas, regras, cooldown) | 1 | faltam gatilhos por palavra-chave sem `!`, entrada e evento customizado |
| Simulador | 1 | mesmo pipeline do conector real |
| Game Engine | 2 | rodadas e ranking ok; **falta ciclo de partida completo** (lobby/entrada, instruções, espera, resultado com pódio) e limite de participantes |
| Snake Live, Plinko Live | 1 | mantidos como jogos extras |
| Battle Arena | 2 | dois “campeões” por time; **não há personagem por espectador, eliminação nem modo individual**; visual com formas simples |
| Avatar Race | 2 | corrida e fila ok; **faltam pódio, power-ups de pista, cenário e personagens animados** |
| Survival Arena | 2 | defesa de núcleo; **participantes não têm personagem nem eliminação** |
| Animal Race | 5 | inexistente |
| Party Games (quiz, votação, adivinhação, palavras, times) | 5 | inexistente |
| Biblioteca de jogos (categorias, busca, filtros, ordenação, favoritos, capas) | 3/5 | só cards de catálogo; sem categorias, busca, favoritos ou capas |
| Configurações por jogo | 1 | editor manifest-driven persistente; faltam ajustes comuns de partida |
| Overlay | 2 | link por **sessão**; o pedido é um overlay **por usuário** que acompanha a transmissão ativa, com fundo transparente e controle de visibilidade |
| Soundboard e alertas | 5 | só sons sintetizados internos dos jogos |
| Histórico de partidas | 2 | dados existem (`GameSession`); falta página |
| Assinatura/planos | 2 | limites no backend e admin; falta página do usuário com uso x limites |
| Navegação | 2 | falta reorganizar conforme a nova lista de áreas |
| Integração TikTok | 2 | adaptador pronto; fonte real depende de licença/contrato (ver TIKTOK_INTEGRATION.md) |
| Saída de vídeo / OBS | 2 | gravação validada; OBS e RTMP reais não testados |
| Infra, observabilidade, CI | 1 | Dockerfile validado no estágio de build |

## Problemas e riscos encontrados

- Ambiente de desenvolvimento reiniciado: PostgreSQL e Redis precisavam ser religados (dados preservados).
- Os sites de referência (livecade.com, taktixlive.com, torcidagg.tech) **não puderam ser acessados** a partir deste ambiente (bloqueio da política de rede). A evolução segue o padrão do gênero (jogos de LIVE com entrada por comentário, presentes como poderes, pódio, partidas curtas), com identidade e assets próprios, sem copiar marcas ou interfaces.
- Jogos usam formas geométricas simples para personagens — a nova fase cria personagens desenhados proceduralmente (humanoides e animais com animação), sem assets de terceiros.

## Plano de execução

Ordem definida a partir da auditoria: Game Engine v2 (ciclo de partida) → Battle Arena v2 (jogo de referência) → demais jogos → Event Engine (novos gatilhos e alertas) → overlay por usuário, soundboard, biblioteca, histórico, assinatura e navegação → testes e documentação. O andamento fica em [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).
