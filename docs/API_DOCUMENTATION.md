# API

Base: `/api` (o web encaminha `/api/*` para o serviço da API). Autenticação: `Authorization: Bearer <accessToken>`. Erros sempre no formato:

```json
{ "error": { "code": "SESSION_INVALID_TRANSITION", "message": "Esta ação não é possível no estado atual da sessão.", "details": {}, "requestId": "…" } }
```

Códigos: `AUTH_*`, `FORBIDDEN`, `NOT_FOUND` (inclusive recurso de outro tenant), `VALIDATION`, `RATE_LIMITED`, `PLAN_LIMIT` (402), `SESSION_ALREADY_ACTIVE`, `SESSION_INVALID_TRANSITION` (409), `STREAM_KEY_IN_USE`, `CONNECTOR_UNAVAILABLE`, `INTERNAL`.

## Autenticação — `/auth`

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` | `{name,email,password,workspaceName?}` → `{accessToken,user}` + cookie de refresh |
| POST | `/auth/login` | `{email,password,mfaCode?}` → `{accessToken,user}` ou `{mfaRequired:true}` |
| POST | `/auth/refresh` | cookie + `X-Requested-With: live-arena` → novo access token (rotação) |
| POST | `/auth/logout` | revoga a família de refresh |
| GET | `/auth/me` | perfil, tenant atual, permissões e plano |
| POST | `/auth/switch-tenant` | `{tenantId}` |
| POST | `/auth/realtime-ticket` | ticket de 60s para o WebSocket |
| POST | `/auth/forgot-password` · `/auth/reset-password` | recuperação de senha |
| POST | `/auth/change-password` | troca de senha |
| POST | `/auth/mfa/setup` · `/auth/mfa/enable` · `/auth/mfa/disable` | MFA TOTP |

## Jogos — `/games`

`GET /games` (catálogo com manifesto: ações, configurações, regras padrão, `allowed` pelo plano) · `GET/POST /games/configs` · `GET/PUT/DELETE /games/configs/:id` · `POST /games/configs/:id/duplicate` · `POST /games/configs/:id/restore-defaults` · `GET /games/state/:sessionId` (último snapshot).

Corpo de configuração (`GameConfigBody`): `{ settings, rules: EventRule[], autoMode, aspect: 'vertical'|'horizontal', soundEnabled, theme }`. Regra: `{ id, enabled, label?, trigger: {kind:'GIFT', giftId?, giftName?, minDiamonds?} | {kind:'LIKE_THRESHOLD', every} | {kind:'CHAT_COMMAND', command} | {kind:'FOLLOW'|'SHARE'|'MEMBER'|'SUBSCRIPTION'}, action, params, cooldownMs, perUserCooldownMs, maxPerMinute, scaleWithQuantity, maxQuantity }`. Ações inexistentes no manifesto ou valores fora dos limites → 400.

## Sessões (LIVES) — `/sessions`

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/sessions` | listar / criar `{name,gameConfigId,connectionId?,streamConfigId?,autoMode?}` |
| GET/PUT/DELETE | `/sessions/:id` | detalhe (com contadores e ações disponíveis) / editar / excluir |
| POST | `/sessions/:id/start` · `pause` · `resume` · `stop` | ciclo de vida (valida plano, conflito de fonte e transições) |
| POST | `/sessions/:id/control` | `{command:'RESET_ROUND'|'RESET_SCORES'|'ANNOUNCE'|'SWITCH_GAME', args}` |
| GET | `/sessions/:id/transitions` · `rounds` · `events?type&cursor&limit` | histórico |
| POST | `/sessions/:id/simulate` | `{type,count,username?,giftId?,diamondValue?,streak?,comment?,spreadMs?}` (eventos marcados como simulados) |
| POST | `/sessions/:id/scenario` | `{scenario:'basic'|'storm'|'gift-streak'|'connector-drop'|'runner-crash'}` |

## Conexões, overlays, vídeo, automações

- `GET /connections/providers`, `GET/POST /connections`, `PUT/DELETE /connections/:id` (API key cifrada; nunca retornada).
- `GET/POST /overlays`, `DELETE /overlays/:id`; público: `POST /public/overlay/:sessionId/bootstrap {token}` → ticket restrito + último estado.
- **Overlay único do criador:** `GET /overlays/user` · `POST /overlays/user` (cria ou gera novo link, revogando o anterior; token mostrado uma vez) · `PUT /overlays/user/settings {showGame,showAlerts,playSounds,volume,alertPosition,idleCard}`. Público: `POST /public/overlay-user/bootstrap {token}` → `{ticket, sessionId|null, lastState, settings, soundBindings}` (chamado a cada 15 s); `GET /public/overlay-user/sound/:id?token=` (áudio do mesmo tenant).

## Biblioteca, soundboard, alertas, conta

- `GET /games` inclui `meta` (categorias, participantes, como entrar, duração, selo) e `favorite`; `POST|DELETE /games/:gameId/favorite`.
- `GET /sounds` (sons, associações, limite do plano) · `POST /sounds?name=` com **corpo binário** (`application/octet-stream` ou `audio/*`, ≤ 1 MB; formato validado pelos bytes: MP3/OGG/WAV) · `GET /sounds/:id/file` · `DELETE /sounds/:id` · `PUT /sound-bindings {slot:'game.join'|'game.roundStart'|'game.victory', soundId|null, volume}`.
- `GET/POST /alerts`, `PUT/DELETE /alerts/:id` (`{name,enabled,trigger,message,emoji,color,soundId,volume,durationMs,cooldownMs}`; `trigger` = mesmo formato das regras), `POST /alerts/:id/test` (envia às LIVES ativas, marcado como simulação).
- `GET /account/usage` (plano, uso x limites, recursos, planos, `billing.available=false`) · `GET /account/history?gameId&page&pageSize` (partidas/rodadas).
- `GET /streams/profiles`, `GET/POST /streams`, `PUT/DELETE /streams/:id` (chave mascarada), `POST /streams/sessions/:id/start|stop`, `GET /streams/sessions/:id/status`.
- `GET /automations/catalog`, `GET/POST /automations`, `PUT/DELETE /automations/:id`.

## Estatísticas, ranking, tenant

`GET /stats/overview` · `GET /leaderboard?scope=all|game:<id>|session:<id>` · `PUT /leaderboard/settings` · `GET/PUT /tenant` · `GET /audit` · `GET /alerts`.

## Administração — `/admin` (OPERATOR/ADMIN, MFA se exigida)

`GET overview|users|tenants|sessions|services|alerts|audit|plans` · `PUT users/:id/status` · `PUT tenants/:id/status` · `PUT tenants/:id/plan` · `PUT plans/:code` · `POST alerts/:id/resolve`.

## Saúde

`GET /health/live`, `GET /health/ready` (banco + Redis), `GET /metrics` (Prometheus; Bearer `METRICS_TOKEN` se definido).

## WebSocket (Socket.IO, serviço realtime)

Handshake: `auth: { ticket }`. Eventos do cliente: `session:subscribe` (ack `{ok}`), `session:unsubscribe`. Do servidor: `session:state` (snapshot do jogo, 15 Hz, volátil), `session:events` (feed — só painel), `session:status` (estados e contadores), `session:fx`, `tenant:notice`, `error:notice`.

## Limites de requisição (por janela)

Padrão 1200/min por IP; upload de som 30/min; bootstrap do overlay 30/min; cadastro 5/10 min; login 60/min por IP + bloqueio por e-mail; esqueci senha 5/15 min; simulação 120/min por usuário; controle 60/min por usuário; início de sessão 20/min por usuário.
