# Changelog

## 0.2.0 — 14/11/2026 (produto v2)

### Adicionado
- Game Engine v2 (`MatchGame`): lobby com entrada por palavra no chat, bots de treino, limites de participantes, partida com tempo, tela de resultado com pódio, reinício; personagens humanoides e 8 animais desenhados em código.
- Battle Arena v2 (jogo de referência) e seis jogos novos: Corrida Animal, Arena do Tapa, Melancia Elástica, Cabo de Guerra, Guerra de Torres e Show de Perguntas.
- Biblioteca de jogos com categorias, busca, filtros, ordenação, favoritos e capas.
- Overlay único do criador (`/overlay/<token>`) que acompanha a LIVE ativa e a troca de jogo, com fundo transparente, alertas e sons.
- Soundboard (upload validado pelo conteúdo) e sons por momento do jogo; Alertas com modelos, variáveis e teste.
- Event Engine: gatilho por palavra sem `!`, faixa de diamantes, evento personalizado, meta de espectadores.
- Páginas: Configuração de eventos, Histórico, Assinatura (uso x limites, sem pagamento falso), Soundboard, Alertas; dashboard com atalhos, partidas recentes e avisos; navegação reorganizada.
- E2E nas larguras 360, 390, 430, 768, 1024, 1366, 1920 (+320).

### Corrigido
- Guerra de Torres: presente grande registrava várias vitórias seguidas.
- Configuração de eventos escondia os alertas quando não havia configuração de jogo.
- Diálogo “Nova LIVE” aberto antes de carregar as configurações deixava “Criar LIVE” desabilitado.

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
