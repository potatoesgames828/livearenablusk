# LIVE ARENA

Plataforma SaaS que transforma presentes, curtidas, comentários, seguidores e compartilhamentos de uma TikTok LIVE em **jogos interativos em tempo real**. Multiusuário (multi-tenant), com simulador, automações, overlays para OBS, saída de vídeo pelo servidor, ranking, administração e monitoramento.

> O nome é provisório e fica centralizado em `packages/shared/src/brand.ts` (ou na variável `APP_NAME`).

## O que já funciona

| Área | Situação |
|---|---|
| Contas, login, recuperação de senha, MFA (TOTP), RBAC, multi-tenant | ✅ testado (integração + E2E) |
| 5 jogos originais (Snake Live, Battle Arena, Avatar Race, Plinko Live, Survival Arena) em 9:16 e 16:9 | ✅ testado (unitário, determinismo, checkpoint) |
| Event Engine (validação, deduplicação, sequência de presentes, agregação de curtidas, regras, cooldowns, filas) | ✅ testado |
| Simulador de eventos e cenários de falha | ✅ testado |
| Automação do ciclo de vida da sessão e regras de automação | ✅ testado |
| Overlays com token revogável e integração com OBS (WebSocket) | ✅ overlay testado; OBS sem teste real (requer OBS) |
| Saída de vídeo pelo servidor (Chromium headless → FFmpeg → RTMP/arquivo) | ✅ gravação validada com `ffprobe`; RTMP real não testado (requer chave) |
| Recuperação de falhas (runner, worker, conector, Redis, PostgreSQL) | ✅ 8/8 cenários de caos |
| Painel responsivo para PC, notebook, tablet e celular + PWA | ✅ 56 testes E2E em 8 perfis de dispositivo |
| Conexão real com TikTok LIVE | ⚠️ preparada, **depende de licença/contrato** — ver [docs/TIKTOK_INTEGRATION.md](docs/TIKTOK_INTEGRATION.md) |

Detalhes, pendências e próximos passos: **[PROJECT_STATUS.md](PROJECT_STATUS.md)**.

## Como rodar (desenvolvimento, sem Docker)

Requisitos: Node.js 22.12+, pnpm 10, PostgreSQL 16, Redis 7, FFmpeg (opcional, para vídeo) e Chromium (opcional, para vídeo).

```bash
pnpm install
cp .env.example .env          # preencha DATABASE_URL, REDIS_URL e os segredos (veja docs/DEVELOPMENT.md)
pnpm db:generate && pnpm build:packages
pnpm db:migrate && pnpm db:seed
for a in api worker game-runner realtime connector stream-manager; do (cd apps/$a && npx tsc -p tsconfig.json); done
(cd apps/web && NODE_ENV=production npx next build)
node scripts/start-all.mjs    # sobe os 7 serviços e reinicia quem cair
```

Abra **http://localhost:3000**, crie uma conta e siga “Primeiros passos” no painel. Para experimentar um jogo sem conta: http://localhost:3000/demo/snake-live

## Como rodar com Docker

```bash
cp .env.example .env   # preencha POSTGRES_PASSWORD, REDIS_PASSWORD, segredos, DOMAIN…
docker compose up -d --build
docker compose --profile monitoring up -d   # Prometheus + Grafana (opcional)
```

Guia completo: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Testes

```bash
pnpm test:unit            # 72 testes (motor de eventos, jogos, segurança, automação, vídeo)
pnpm test:integration     # 13 testes contra a pilha rodando (inclui isolamento multi-tenant)
pnpm test:e2e             # 56 testes Playwright em 8 dispositivos
pnpm test:chaos           # 8 cenários de falha (derruba processos locais!)
node tests/load/run-load.mjs 1,10,20 30 3   # carga progressiva
node scripts/license-check.mjs && pnpm audit --prod
```

## Estrutura

```
apps/      api (NestJS) · web (Next.js: painel, overlay, admin, PWA) · realtime (Socket.IO)
           worker (BullMQ) · game-runner (jogos) · connector (fontes TikTok) · stream-manager (vídeo)
packages/  shared · database (Prisma) · security · observability · runtime · event-engine
           automation · game-engine · games-catalog · tiktok-adapter · stream-engine
games/     snake-live · battle-arena · avatar-race · plinko-live · survival-arena · game-template
infrastructure/  docker · reverse-proxy · monitoring
tests/     integration · e2e · chaos · load
docs/      documentação completa (português)
```

## Documentação

[Arquitetura](docs/ARCHITECTURE.md) · [Segurança](SECURITY.md) · [Implantação](docs/DEPLOYMENT.md) · [Desenvolvimento](docs/DEVELOPMENT.md) · [API](docs/API_DOCUMENTATION.md) · [Banco de dados](docs/DATABASE.md) · [Jogos](docs/GAMES.md) · [Integração TikTok](docs/TIKTOK_INTEGRATION.md) · [Transmissão](docs/STREAMING.md) · [Multiplataforma](docs/MULTIPLATFORM.md) · [Solução de problemas](docs/TROUBLESHOOTING.md) · [Auditoria de licenças](docs/LICENSE_AUDIT.md) · [Testes e resultados](docs/TESTING.md) · [Custos](docs/COSTS.md) · [Changelog](CHANGELOG.md)

LIVE ARENA não é afiliada ao TikTok/ByteDance. Todos os jogos usam apenas pontuação virtual (sem apostas ou prêmios em dinheiro).
