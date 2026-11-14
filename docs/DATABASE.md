# Banco de dados

PostgreSQL 16 + Prisma 6. Schema: `packages/database/prisma/schema.prisma`. Migrações: `packages/database/prisma/migrations`.

## Entidades

| Grupo | Modelos |
|---|---|
| Contas e acesso | `User` (papel de plataforma, MFA cifrada, status), `Tenant` (plano, retenção), `Membership` (papel no tenant), `RefreshToken` (hash, família), `PasswordResetToken` |
| Planos | `SubscriptionPlan` (limites em JSON editáveis no admin) |
| Jogos | `Game` (catálogo), `GameConfiguration` (regras/configurações por tenant, presets, versão) |
| LIVE | `LiveConnection` (fonte de eventos, credencial cifrada), `LiveSession` (estados independentes: sessão, conector, jogo, vídeo), `SessionTransition` (histórico), `SessionCheckpoint` (recuperação), `GameSession` (rodadas e vencedores) |
| Eventos | `LiveEvent` (persistência seletiva, único por `tenantId+eventId`), `EventProcessing` (falhas definitivas/DLQ) |
| Automação | `Automation`, `AutomationRule` |
| Saída | `Overlay` (token em hash, revogação, expiração), `StreamConfiguration` (chave RTMP cifrada + impressão digital), `StreamProcess` |
| Público | `Viewer` (ID estável da fonte, único por tenant+fonte), `ViewerScore` (escopos `session:<id>`, `game:<id>`, `all`), `Leaderboard` (privacidade) |
| Operação | `AuditLog`, `SystemAlert` (deduplicado), `Worker` (heartbeats) |

Papéis e permissões (RBAC) ficam versionados em código (`packages/security/src/rbac.ts`), não em tabelas, para revisão em PR.

## Isolamento multi-tenant

Todo modelo de negócio tem `tenantId` + índice. A aplicação sempre consulta com `tenantScope(tenantId, where)`; acesso a ID de outro tenant retorna 404. Exclusão de tenant remove dados em cascata.

## O que é persistido

- **Sempre:** presentes (com unidades novas), seguidores, compartilhamentos, assinaturas, início/fim de LIVE, batalhas, alertas e lotes agregados de curtidas.
- **Somente se acionar regra:** comandos de chat.
- **Nunca (só contadores em Redis):** curtidas individuais, entradas de espectadores e contagem de espectadores.

## Retenção (worker, a cada hora, em lotes)

`LiveEvent` conforme `Tenant.eventRetentionDays` (limitado pelo plano) · refresh tokens expirados/revogados há 7 dias · tokens de redefinição · `EventProcessing` 30 dias · `SessionTransition` 90 dias · heartbeats de workers 7 dias · alertas resolvidos 30 dias.

## Pool de conexões

Cada serviço tem seu pool (`connection_limit` na `DATABASE_URL`, padrão 10). Com 7 serviços e réplicas, ajuste `max_connections` do PostgreSQL ou use PgBouncer.

## Backup

Ver [DEPLOYMENT.md](DEPLOYMENT.md#backup-e-recuperação).
