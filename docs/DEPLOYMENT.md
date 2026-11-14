# Implantação

## Onde hospedar

A plataforma tem processos que **precisam ficar ligados durante toda a LIVE** (conectores, jogos, WebSocket, encoder). Por isso:

- ✅ VPS / máquina virtual / contêineres sempre ativos (ex.: um servidor com Docker Compose; depois, múltiplos servidores).
- ⚠️ O web (Next.js) pode ir para uma hospedagem de Next.js, mas a API, realtime, worker, game-runner, connector e stream-manager **não** devem rodar em funções serverless.
- Kubernetes só quando houver vários servidores e equipe para operar — não é necessário no início.

## Implantação com Docker Compose (1 servidor)

1. Servidor Linux com Docker 24+ e Compose v2; domínio apontando para o IP.
2. `git clone` do repositório e `cp .env.example .env`.
3. Preencha: `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REALTIME_SECRET`, `ENCRYPTION_KEYS`, `SECRET_PEPPER`, `DOMAIN`, `PUBLIC_WEB_URL`, `PUBLIC_REALTIME_URL`, `NEXT_PUBLIC_REALTIME_URL`, `CORS_ORIGINS` (todas com `https://seu-dominio`), `SMTP_URL`, `GRAFANA_ADMIN_PASSWORD`. Mantenha `EDGE_PROXY=true` e `ADMIN_MFA_REQUIRED=true`.
4. `docker compose up -d --build` — o serviço `migrate` aplica migrações e o seed antes dos demais subirem.
5. Abra `https://seu-dominio`, cadastre-se e promova sua conta: `docker compose run --rm migrate node scripts/create-admin.mjs voce@email.com ADMIN`.
6. Opcional: `docker compose --profile monitoring up -d` (Grafana em `127.0.0.1:3001`, acesse por túnel SSH).

O proxy (Caddy) emite TLS automaticamente para `DOMAIN` e sobrescreve `X-Forwarded-For` (proteção contra falsificação de IP). Portas publicadas: 8080/8443 (ajuste `HTTP_PORT`/`HTTPS_PORT` ou coloque 80/443).

> **Build atrás de proxy TLS corporativo:** `docker build --secret id=extra_ca,src=/caminho/ca.pem ...` (o CA é montado só durante o build).

### Validação feita neste ambiente

O estágio `build` do Dockerfile (instalação, compilação dos pacotes, serviços e Next) foi construído e a API iniciou dentro do contêiner conectando ao banco e ao Redis. Os estágios de runtime que usam `apt-get` **não puderam ser construídos aqui** (o espelho Debian é bloqueado pela política de rede deste ambiente). O CI do GitHub constrói a imagem completa da API e a escaneia com Trivy.

## Escalabilidade

| Componente | Como escalar |
|---|---|
| game-runner | `GAME_RUNNER_REPLICAS` — sessões são distribuídas por lease; `RUNNER_MAX_SESSIONS` por instância (padrão 20) |
| worker | mais réplicas (BullMQ distribui); `INGEST_CONCURRENCY` |
| realtime | mais réplicas atrás do proxy com sticky sessions (ou só transporte WebSocket); adaptador Redis incluso |
| api / web | réplicas sem estado |
| stream-manager | servidores com CPU dedicada; `STREAM_MAX_PIPELINES` por instância |
| PostgreSQL | gerenciado com backups automáticos e réplica de leitura quando necessário |
| Redis | gerenciado com persistência AOF (filas) e alta disponibilidade (Sentinel/serviço gerenciado) |

## Ambientes

`NODE_ENV=development` (local), `test` (CI, segredos gerados por execução) e `production`. Use bancos e Redis separados por ambiente.

## Backup e recuperação

- Backup: `DATABASE_URL=... BACKUP_DIR=/backups RETENTION_DAYS=14 scripts/backup.sh` (pg_dump custom + verificação). Agende diariamente e copie para armazenamento S3 compatível com criptografia.
- Restauração: `DATABASE_URL=... scripts/restore.sh arquivo.dump` (pede confirmação). Testado em 14/11/2026: backup e restauração em banco separado com contagem de registros idêntica.
- Redis: AOF ligado no Compose. Se perder dados, os serviços reconstroem índices a partir do PostgreSQL automaticamente (validado no teste de caos nº 6). Sessões que estavam rodando continuam.
- Chaves de criptografia: guarde `ENCRYPTION_KEYS` em cofre separado do backup. Sem elas, chaves RTMP/API keys/MFA cifradas não podem ser lidas.

## Plano de recuperação de desastre (resumo)

1. Provisionar novo servidor e restaurar `.env` do cofre.
2. `docker compose up -d postgres redis` → `scripts/restore.sh último.dump`.
3. `docker compose up -d` (migrações rodam automaticamente).
4. Sessões ativas no banco são retomadas pelo watchdog; criadores reabrem o OBS (overlay reconecta sozinho).
RPO alvo: 24 h (backup diário) — reduza com backup contínuo/PITR do provedor. RTO alvo: < 1 h.

## Checklist de produção

- [ ] Contrato com fonte de eventos licenciada (ver TIKTOK_INTEGRATION.md)
- [ ] SMTP configurado (recuperação de senha)
- [ ] `ADMIN_MFA_REQUIRED=true`, MFA ativa nas contas administrativas
- [ ] `FAULT_INJECTION_ENABLED=false`
- [ ] Backups agendados e testados; alertas do Prometheus roteados (Alertmanager/e-mail/Slack)
- [ ] Revisão jurídica: termos de uso, política de privacidade (LGPD), regras do TikTok
- [ ] Pentest externo
