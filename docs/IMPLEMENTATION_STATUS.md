# Status da implementação — LIVE ARENA v0.2

Atualizado em 14/11/2026 · branch `ccr-8c9692c5-1sdtbd` · backup da versão anterior: tag local `v0.1.0` e branch local `backup/v0.1-antes-v2` (o histórico completo também está no branch remoto).

Legenda: ✅ concluído e testado · 🟡 parcial · ⏳ pendente · 🔒 depende de terceiros.

## Fases

| Fase | Situação | O que foi feito | Evidência |
|---|---|---|---|
| 1. Auditoria | ✅ | [PROJECT_AUDIT.md](PROJECT_AUDIT.md) com classificação 1–5 | documento |
| 2. Identidade visual e dashboard | ✅ | dashboard com saudação, LIVES ativas, status, contadores, atalhos, partidas recentes, avisos de limite do plano, primeiros passos; navegação reorganizada (12 áreas pedidas + Automações, Ranking, Feed) adaptada a PC/tablet/celular | E2E em 8 larguras |
| 3. Game Engine v2 | ✅ | `MatchGame`: lobby, entrada por palavra (sem `!`), bots de treino, limites de participantes, partida com tempo, resultado com pódio, reinício; personagens humanoides e 8 animais desenhados em código | testes unitários |
| 4. Jogo de referência | ✅ | **Battle Arena v2** (lutador por espectador, times, rajadas, golens, 3 modos, morte súbita, pódio) | unitários + revisão visual 9:16/16:9 |
| 5. Biblioteca | ✅ | 12 categorias, busca, filtros, ordenação, favoritos (no banco, por usuário), capas reais geradas dos jogos, informações de participantes/entrada/duração | integração + E2E |
| 6. Event Engine | ✅ | novos gatilhos: palavra no chat sem `!` (primeira palavra/contém/exato, sem acentos), faixa de diamantes (mín./máx.), evento personalizado (`CUSTOM`), meta de espectadores; alertas com o mesmo formato de gatilho | unitários (22) + integração |
| 7. Overlay | ✅ | **overlay único por usuário** `/overlay/<token>`: acompanha a LIVE ativa e a troca de jogo, fundo transparente, alertas e sons, controles de visibilidade, link revogável/regerável; links por sessão mantidos | integração (estado, alerta, isolamento, revogação) + E2E |
| 8. Simulador | ✅ | inalterado (mesmo pipeline); os novos jogos e alertas respondem ao simulador | integração |
| 9. Configurações | ✅ | ajustes comuns de partida em todos os jogos de participantes + específicos de cada jogo; editor de regras com os novos gatilhos; página **Configuração de eventos** (mapa evento → ação de todas as configurações + alertas) | E2E |
| 10. Soundboard e alertas | ✅ | upload MP3/OGG/WAV ≤ 1 MB validado pelo conteúdo (magic bytes), armazenado isolado por tenant; prévia; volume; sons de entrada/início/vitória; alertas com modelo, variáveis, cor, emoji, som, duração, intervalo e botão de teste | integração + E2E |
| 11. SaaS | 🟡 | página de **Assinatura** (uso x limites do backend, comparativo de planos, sem pagamento falso), **Histórico** de partidas, Conta (configurações existentes). Cobrança: ⏳ decisão comercial/contratação de gateway | integração + E2E |
| 12. Testes e documentação | ✅ | ver números abaixo; docs atualizadas | este arquivo |

## Jogos

| Jogo | Situação |
|---|---|
| Battle Arena v2 | ✅ referência |
| Corrida Animal (novo) | ✅ |
| Arena do Tapa (novo) | ✅ |
| Melancia Elástica (novo) | ✅ |
| Cabo de Guerra (novo) | ✅ |
| Guerra de Torres (novo) | ✅ |
| Show de Perguntas (novo: quiz, enquete, número, palavra, times) | ✅ |
| Avatar Race, Survival Arena | 🟡 funcionam (v1), ainda sem lobby/pódio nem personagens novos |
| Snake Live, Plinko Live | ✅ mantidos (v1) |
| Corrida de Bolinhas (pista 3D), Monstros Evolutivos, Batalha da Ponte | ⏳ próximos jogos (a arquitetura `MatchGame` + personagens já cobre a base) |

## Testes (14/11/2026)

| Suíte | Resultado |
|---|---|
| Unitários + integração (Vitest) | **135** testes passando (inclui 11 jogos × 5 testes automáticos, 9 testes de jogabilidade dos jogos novos, 6 do Event Engine v2, 4 de integração v2) |
| E2E (Playwright, Chromium) | **88/88** em 8 perfis: **1920, 1366, 1024 (tablet), 768 (tablet), 430, 390 (iPhone 13), 360 (Android), 320 (iPhone SE)** — ver [TESTING.md](TESTING.md) |
| Revisão visual | capturas de todos os jogos novos em 9:16 e 16:9 (lobby, partida, resultado) |

Bugs encontrados pelos testes e corrigidos: Guerra de Torres registrava várias vitórias com um presente grande; Configuração de eventos escondia os alertas sem configuração de jogo; diálogo “Nova LIVE” podia ficar sem jogo selecionado (condição de corrida).

## Pendências e limitações conhecidas

- 🔒 Eventos reais do TikTok: dependem de serviço licenciado/contrato (inalterado; ver TIKTOK_INTEGRATION.md).
- ⏳ Cobrança: não há gateway; a troca de plano é feita pelo administrador.
- ⏳ Sons de eliminação: o Event/Game Engine ainda não emite um evento genérico de eliminação; há sons para entrada, início e vitória.
- ⏳ Phaser/Pixi: avaliados e não adotados; o renderer Canvas 2D próprio atende 60 fps com dezenas de personagens e mantém o bundle pequeno. Reavaliar para a pista 3D da Corrida de Bolinhas (provável uso de WebGL).
- Os sites de referência não puderam ser abertos daqui; ver [REFERENCE_RESEARCH.md](REFERENCE_RESEARCH.md).
- Avatar Race/Survival Arena ainda na v1 visual.
