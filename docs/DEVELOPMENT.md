# Desenvolvimento

## Pré-requisitos

Node.js 22.12+, pnpm 10.28, PostgreSQL 16, Redis 7. Para vídeo: FFmpeg e Chromium (Playwright já traz um).

## Primeira execução

```bash
pnpm install
cp .env.example .env
```

Preencha no `.env` (desenvolvimento):

```bash
NODE_ENV="development"
DATABASE_URL="postgresql://postgres:SENHA@127.0.0.1:5432/livearena?schema=public&connection_limit=10"
REDIS_URL="redis://127.0.0.1:6379"
JWT_ACCESS_SECRET="$(openssl rand -base64 48)"     # gere e cole o valor
JWT_REALTIME_SECRET="$(openssl rand -base64 48)"
ENCRYPTION_KEYS="k1:$(openssl rand -base64 32)"
PUBLIC_WEB_URL="http://localhost:3000"
PUBLIC_REALTIME_URL="http://localhost:4001"
NEXT_PUBLIC_REALTIME_URL="http://localhost:4001"
CORS_ORIGINS="http://localhost:3000"
API_INTERNAL_URL="http://127.0.0.1:4000"
INTERNAL_WEB_URL="http://127.0.0.1:3000"
EDGE_PROXY="false"
FAULT_INJECTION_ENABLED="true"
```

```bash
pnpm db:generate          # cliente Prisma
pnpm build:packages       # compila packages/ e games/ (tsc -b)
pnpm db:migrate           # aplica migrações
pnpm db:seed              # planos e catálogo de jogos
for a in api worker game-runner realtime connector stream-manager; do (cd apps/$a && npx tsc -p tsconfig.json); done
(cd apps/web && NODE_ENV=production npx next build)   # API_INTERNAL_URL é lido NO BUILD (rewrite)
node scripts/start-all.mjs
```

> ⚠️ Rode o `next build` com `NODE_ENV=production`, mesmo em desenvolvimento (o `.env` de dev define `development`, o que quebra o build).

Desenvolvimento do frontend com recarga automática: `cd apps/web && npx next dev` (com os demais serviços rodando via `node scripts/start-all.mjs --no-web`).

## Portas

| Serviço | Porta | Saúde/métricas |
|---|---|---|
| web | 3000 | `/` |
| api | 4000 | `/api/health/live`, `/api/health/ready`, `/api/metrics` |
| realtime | 4001 | `/health/ready`, `/metrics` |
| worker | 9101 | `/health/live`, `/health/ready`, `/metrics` (127.0.0.1) |
| game-runner | 9102 | idem |
| connector | 9103 | idem |
| stream-manager | 9104 | idem |

## Tornar-se administrador

Cadastre-se pelo site e rode: `node scripts/create-admin.mjs seu@email.com ADMIN`. Ative a MFA em Configurações.

## Migrações

```bash
pnpm db:migrate:dev --name descricao   # cria migração a partir do schema.prisma
pnpm db:migrate                        # aplica (produção)
```

## Criando um jogo novo

Copie `games/game-template`, registre o id em `packages/shared/src/catalog.ts` e o módulo em `packages/games-catalog/src/{index,render}.ts`. Detalhes em [GAMES.md](GAMES.md).

## Testes

| Comando | O que testa | Requer |
|---|---|---|
| `pnpm test:unit` | Pacotes e jogos (72) | nada |
| `pnpm test:integration` | API + realtime + worker + runner (13) | pilha rodando, `DATABASE_URL` |
| `pnpm test:e2e` | Playwright, 8 perfis de dispositivo (56) | pilha + web |
| `pnpm test:chaos` | 8 cenários de falha | pilha local; **derruba processos e o Redis/PostgreSQL locais** |
| `node tests/load/run-load.mjs` | carga progressiva | pilha local |
| `k6 run tests/load/k6-api.js` | carga HTTP | k6, token e sessão |

Qualidade: `pnpm lint`, `pnpm typecheck`, `node scripts/license-check.mjs`, `pnpm audit --prod`.

## Convenções

TypeScript strict (`noUncheckedIndexedAccess`), Zod nas fronteiras, erros com código estável e mensagem em português (`packages/shared/src/errors.ts`), sem `any`, sem `catch` vazio sem comentário, logs estruturados sem dados sensíveis.
