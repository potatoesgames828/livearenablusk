# Changelog

## 0.1.0 — 14/11/2026 (primeira versão funcional)

### Adicionado
- Monorepo pnpm/TypeScript com 7 serviços (api, web, realtime, worker, game-runner, connector, stream-manager) e 12 pacotes.
- Contas, multi-tenant, RBAC em dois níveis, MFA TOTP, rotação de refresh token com detecção de reuso, recuperação de senha, auditoria.
- Event Engine: normalização, deduplicação idempotente, sequência de presentes por delta, agregação de curtidas, regras configuráveis, cooldowns, limites por minuto, prioridade e backpressure, DLQ.
- 5 jogos originais (Snake Live, Battle Arena, Avatar Race, Plinko Live, Survival Arena) + template, 9:16 e 16:9, simulação determinística no servidor e renderer Canvas 2D.
- Live Automation Engine: máquina de estados, automações (intervalo, metas, início/fim da LIVE, fim de rodada, queda do conector), rotação de jogos.
- Simulador de eventos e cenários (básico, tempestade, sequência, queda de conexão, crash do jogo).
- Overlays com token revogável, integração com OBS via WebSocket, stream-manager (Chromium + FFmpeg → RTMP/arquivo).
- Painel responsivo (PC, tablet, celular), PWA, administração da plataforma.
- Observabilidade: logs estruturados, métricas Prometheus, OpenTelemetry opcional, health checks, alertas, painel Grafana.
- Docker multi-alvo, Compose com redes privadas, Caddy/nginx, CI (lint, tipos, testes, E2E, Gitleaks, audit, licenças, Trivy), backup/restauração.

### Corrigido durante a validação
- Realtime usava conexão Redis em modo de assinatura para comandos (inscrição nunca respondia).
- Perda de dados do Redis fazia o runner encerrar sessões; agendamentos do BullMQ não voltavam.
- Falsificação de `X-Forwarded-For` através do Next burlava o rate limit.
- Canvas alargava o layout em telas de 320 px; diálogo deslocado no iPhone SE.
- Renovação de sessão deslogava o usuário em respostas 429.
- MP4 corrompido ao encerrar a gravação (áudio silencioso infinito).
- Comando de chat podia levar a cobra a uma colisão imediata; sobreposições de HUD nos jogos.
- Dependências vulneráveis atualizadas (0 vulnerabilidades); conector AGPL deixou de ser instalado automaticamente.
