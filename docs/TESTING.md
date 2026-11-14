# Testes e resultados

Executados em 14/11/2026 num servidor de desenvolvimento com **4 vCPU / 15 GB RAM**, PostgreSQL 16 e Redis 7 locais. Relatórios brutos em `reports/`.

## Rodada v0.2 (produto v2)

| Suíte | Resultado |
|---|---|
| Unitários + integração (Vitest) | **142/142** ✅ — inclui 11 jogos × 2 proporções (roda sozinho, todas as ações, determinismo, checkpoint, pausa), jogabilidade dos jogos novos (lobby→partida→pódio, bots que saem, entrada tardia, estouro da melancia, elástico grátis único, cabo de guerra, torres, duelo do tapa, escolha de animal, quiz/palavra), Event Engine v2 (palavra-chave, faixa de diamantes, evento personalizado, meta de espectadores, alertas) e integração v2 (biblioteca/favoritos, soundboard com validação de conteúdo e isolamento, overlay único com estado/alerta em tempo real/isolamento/revogação, uso do plano e histórico) |
| E2E Playwright | **88/88** ✅ (última rodada completa: 87/88; a falha intermitente revelou uma condição de corrida real no diálogo “Nova LIVE”, corrigida e revalidada nos 8 perfis) · 8 larguras: 1920, 1366, 1024, 768, 430, 390, 360 e 320 — páginas novas sem rolagem horizontal, biblioteca (busca, categoria, favorito persistente), overlay único (cria link, página transparente), alertas (modelo → configuração de eventos), assinatura sem pagamento falso |

Bugs encontrados pelos testes e corrigidos nesta rodada: Guerra de Torres registrava várias vitórias com um presente grande; Configuração de eventos escondia os alertas quando não havia configuração de jogo; o diálogo “Nova LIVE” aberto antes de a lista de configurações carregar deixava o botão “Criar LIVE” desabilitado.

Os números da v0.1 abaixo (caos, carga, k6, vídeo) não foram refeitos nesta rodada; as mudanças da v2 não alteram o pipeline medido além de uma consulta de alertas em cache de 5 s no worker.

## Resumo (v0.1)

| Suíte | Resultado |
|---|---|
| Unitários (Vitest) | **72/72** ✅ — event engine (dedupe, streak, curtidas, regras, cooldown, limite/min), segurança (Argon2, AES-GCM + rotação, JWT, RBAC, TOTP, redação), automação (máquina de estados), 5 jogos × 2 proporções (roda sozinho, todas as ações, determinismo, checkpoint, pausa), adaptadores TikTok (mapeamento, licença, simulador, circuit breaker), stream-engine |
| Integração (API + realtime + worker + runner reais) | **13/13** ✅ — auth (rotação/reuso de refresh, CSRF, senha fraca, e-mail duplicado, recuperação de senha), fluxo jogo→simulador→tempo real→ranking, streak sem duplicar, agregação de curtidas, ciclo de vida/troca de jogo, limite de plano, **isolamento multi-tenant (API e WebSocket)**, overlay somente leitura e revogação, validação de configuração |
| E2E Playwright (8 perfis de dispositivo) | **56/56** ✅ — ver [MULTIPLATFORM.md](MULTIPLATFORM.md) |
| Caos / estabilidade | **8/8** ✅ (tabela abaixo) |
| Carga progressiva | 1, 10 e 20 sessões sem perda de eventos (tabela abaixo) |
| k6 (API HTTP) | 6.521 requisições, p95 5,6 ms, 0% de falha nas leituras (429 esperados na simulação por limite por usuário) |
| Vídeo | Gravação MP4 válida (ffprobe), ~30 fps, 0 quadros perdidos |
| Segurança | `pnpm audit --prod`: 0 vulnerabilidades · Gitleaks: 0 vazamentos (fixtures de teste em allowlist restrita) · licenças: OK · ESLint: 0 erros |
| Backup/restauração | ✅ restaurado em banco separado, contagens idênticas |

## Caos (tests/chaos/run-chaos.mjs)

| # | Falha injetada | Resultado |
|---|---|---|
| 1 | Crash simulado do runner (sem salvar) | Recuperado do checkpoint, continuidade do tempo de jogo ✅ |
| 2 | `SIGKILL` no processo game-runner | Failover em ~6,5 s (expiração do lease de 6 s); estado restaurado do checkpoint (perda máx. ≈ 2 s de simulação) ✅ |
| 3 | Queda da fonte de eventos | RECONNECTING → CONNECTED em ~8 s; jogo não parou ✅ |
| 4 | `SIGKILL` no worker durante rajada de 200 presentes | **200/200 processados** (jobs “stalled” retomados) ✅ |
| 5 | Sequência de presentes (atualizações repetidas) | 10/10 creditados, sem duplicar ✅ |
| 6 | Reinício do Redis **sem persistência** (perda total de dados voláteis) | Jogo seguiu em memória, lease readquirido, índices reconstruídos do PostgreSQL em ~2 s ✅ |
| 7 | PostgreSQL parado por 8 s | Jogo continuou publicando; readiness 503 durante a queda; API recuperada ✅ |
| 8 | Estado final | Sessão RUNNING, runner RUNNING, fonte CONNECTED ✅ |

Defeitos reais encontrados e corrigidos por esses testes: runner encerrava sessões após perda do Redis (lease e índice) e agendamentos do BullMQ desapareciam.

## Carga (tests/load/run-load.mjs)

Cada sessão: 5 presentes a cada 1,5 s (com usuário único para medir latência) + 300 curtidas a cada 3 s; 3 clientes WebSocket por sessão; 30 s por estágio. CPU = média instantânea (delta de `/proc`), em % de **um** núcleo.

| Sessões | Presentes | Curtidas | Erros | Latência p50 / p95 / p99 | Snapshots/s por cliente |
|---|---|---|---|---|---|
| 1 | 100/100 | 3.000/3.000 | 0 | 9 / 13 / 13 ms | 15 |
| 10 | 1.000/1.000 | 30.000/30.000 | 0 | 12 / 40 / 57 ms | 15 |
| 20 | 2.000/2.000 | 60.000/60.000 | 0 | 21 / 67 / 132 ms | 15 |

CPU com 20 sessões: worker 29%, game-runner 17%, realtime 8%, PostgreSQL 8%, Redis 7%, API 7%. Memória: API ~230 MB, worker/runner ~140 MB cada, realtime ~110 MB, PostgreSQL ~930 MB (com caches).

**Limites e gargalos:** um game-runner aceita 20 sessões por configuração (`RUNNER_MAX_SESSIONS`); o primeiro gargalo previsto é o worker de ingestão (escala horizontalmente). Extrapolação linear (não testada além de 20): ~80–100 sessões por servidor de 4 vCPU *sem* vídeo. Vídeo pelo servidor é o recurso mais caro (≈1–2 núcleos por pipeline 1080p30, estimativa). **Não testamos milhares de sessões**; recomenda-se repetir o teste em ambiente de staging com a topologia de produção.

## Como reproduzir

```bash
node scripts/start-all.mjs                         # pilha
pnpm test:unit && pnpm test:integration && pnpm test:e2e
pnpm test:chaos                                    # ATENÇÃO: derruba processos locais
node tests/load/run-load.mjs 1,10,20 30 3
k6 run -e TOKEN=... -e SESSION=... tests/load/k6-api.js
```
