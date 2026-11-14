# Jogos

Cinco jogos originais, criados para esta plataforma (gráficos em código e sons sintetizados, sem assets de terceiros). Todos:

- rodam no servidor (game-runner) a 30 Hz, de forma **determinística** a partir de uma semente, e continuam funcionando sem eventos;
- suportam **9:16 (1080×1920)** e **16:9 (1920×1080)**;
- têm rodadas, ranking por espectador, avisos, efeitos (partículas, tremor, flash), sons configuráveis e modo automático;
- são configuráveis sem programar (Central de jogos) e testáveis no navegador (aba Testar e `/demo/<jogo>`);
- serializam o estado para checkpoint e recuperação.

| Jogo | Público interage com | Ações configuráveis |
|---|---|---|
| 🐍 **Snake Live** | Presentes criam comida com o nome de quem enviou (ao ser comida, pontua); curtidas aceleram; seguidores criam obstáculos; `!cima/!baixo/!esquerda/!direita` guiam (nunca levam a colisão imediata) | velocidade, comida especial, comida dourada, embaralhar/adicionar/limpar obstáculos, guiar |
| ⚔️ **Battle Arena** | `!vermelho/!azul` escolhe time; presentes = ataques do campeão do time; curtidas carregam energia (super ataque a 100%); seguidores convocam soldados para o time que perde | ataque, especial em área, cura, escudo, energia, soldado, entrar em time |
| 🏁 **Avatar Race** | `!correr`/`!join` entra na corrida (substitui um bot); presentes dão turbo; curtidas dão energia coletiva; compartilhamentos colocam obstáculos no líder | entrar, turbo, energia coletiva, escudo, obstáculos, turbo geral |
| 🔮 **Plinko Live** | Presentes soltam bolas nomeadas; `!esquerda/!meio/!direita` escolhe a posição; seguidores dobram multiplicadores. **Somente pontos virtuais — sem apostas, depósitos, saques ou prêmios** | soltar bola, bola dourada, bolas da comunidade, escolher posição, multiplicador em dobro |
| 🛡️ **Survival Arena** | Presentes lançam nova/bombardeio (quem derrota pontua); curtidas reforçam o escudo; seguidores convocam drones; `!congelar` desacelera inimigos. Chefe a cada N ondas | ataque especial, bombardeio, escudo, reparo, torre turbinada, drone, congelar |

## Arquitetura de plugin

Cada jogo é um pacote em `games/<id>` com:

- `manifest.ts` — nome, instruções, **ações** (com parâmetros), **configurações** (com limites) e **regras padrão**. O painel gera os formulários a partir disso.
- `sim.ts` — classe que estende `BaseGame` (rodadas, pausa, ranking, avisos, efeitos, serialização) e implementa `update`, `onAction`, `resetRound`, `snapshot`.
- `render.ts` — `GameRenderer` (Canvas 2D) que desenha snapshots e reage a marcadores de efeito.

A interface exigida `LiveGamePlugin` (`initialize/start/pause/resume/stop/handleEvent/getState/reset`) é implementada por `GameHost` sobre qualquer simulação (`packages/game-engine/src/host.ts`).

## Criar um jogo

1. Copie `games/game-template` para `games/meu-jogo` e ajuste `package.json` e o manifesto.
2. Adicione `{ id, name, description }` em `packages/shared/src/catalog.ts`.
3. Registre em `packages/games-catalog/src/index.ts` (simulação) e `render.ts` (renderer); adicione a referência no `tsconfig.json` do catálogo e no `tsconfig.build.json`.
4. `pnpm install && pnpm build:packages && pnpm db:seed`.
5. Os testes em `packages/games-catalog/src/games.test.ts` cobrem automaticamente o novo jogo (roda sozinho nas duas proporções, todas as ações, determinismo, checkpoint, pausa).

## Desempenho

Medido com 20 sessões simultâneas (5 jogos alternados) em 1 game-runner: ~17% de um núcleo, tick médio < 1 ms, snapshots de 15 Hz com até ~60 KB por quadro no pior caso (Plinko com muitas bolas). O renderer limita FPS (30 em celulares/baixa potência), ajusta a resolução automaticamente, pausa fora da tela e reduz partículas com “reduzir movimento”.
