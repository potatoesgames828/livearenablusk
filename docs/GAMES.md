# Jogos

Onze jogos originais, criados para esta plataforma (personagens, animais, cenários e sons gerados em código, sem assets de terceiros). Todos:

- rodam no servidor (game-runner) a 30 Hz, de forma **determinística** a partir de uma semente, e continuam funcionando sem eventos (bots de treino/demonstração quando faz sentido);
- suportam **9:16 (1080×1920)** e **16:9 (1920×1080)**;
- têm ranking por espectador, avisos, efeitos (partículas, tremor, flash), sons, pausa, reinício e modo automático;
- são configuráveis sem programar (Biblioteca → Usar este jogo) e testáveis no navegador (`/demo/<jogo>`);
- serializam o estado para checkpoint e recuperação.

## Ciclo de partida (Game Engine v2)

Os jogos de participantes estendem `MatchGame` (`packages/game-engine/src/match.ts`):

**lobby** (entrada por palavra no chat, sem `!`; contagem regressiva; bots de treino que saem quando o público entra; início antecipado quando lota; início manual com `autoMode=false`) → **partida** (tempo máximo, entrada tardia opcional) → **resultado** com **pódio** (1º/2º/3º com personagem e foto de perfil quando disponível) → novo lobby. Ajustes comuns em todo jogo de partida: tempo de lobby, máximo/mínimo de participantes, duração, palavras de entrada, entrar com qualquer interação, entrada tardia, bots de treino, tempo da tela de resultado.

Personagens: `drawAvatar` (humanoide com aparência derivada do ID do espectador: pele, cabelo, roupa, acessório; ações parado/correndo/atacando/atingido/derrotado/comemorando; armas) e `drawAnimal` (8 animais com animação própria) em `packages/game-engine/src/render/characters.ts`.

## Catálogo

| Jogo | Categoria | Como o público participa | Destaques |
|---|---|---|---|
| ⚔️ **Battle Arena** (jogo de referência) | Batalhas, Arena | "vermelho"/"azul" (ou 1/2) cria um lutador com o nome e visual da pessoa | lutadores andam e atiram sozinhos; presentes disparam **rajadas** (espingarda, foguete, bala de canhão, chance de bomba nuclear), **crescer** (vida/tamanho), **golem** com o nome de quem enviou, cura/escudo do time; curtidas: fúria (dano em dobro) e **chuva de meteoros** a cada 1.000; modos primeiro a N abates, eliminação e por tempo; morte súbita no empate; coroa para quem mais abate |
| 🦊 **Corrida Animal** | Corridas, Animais | "correr" ou o nome do animal (raposa, coelho, tartaruga, galinha, porco, sapo, cavalo, pinguim) | cada animal tem velocidade, arranque, fôlego e talento (coelho pula obstáculos, tartaruga não tropeça nem escorrega, porco atravessa lama, galinha bate as asas no turbo, pinguim desliza na reta final…); turbo, cenoura, banana no líder, raio nos 3 primeiros, torcida |
| 👋 **Arena do Tapa** | Arena, Habilidade | "tapa" entra na fila; 2 por vez no píer | duelo por turnos, golpe crítico, escada de armas (mão → peixe → frigideira → taco → marreta → antena parabólica), vida comprada com presentes (vale na fila), campeão permanece, **golpe final** a cada N vitórias, duelos de demonstração |
| 🍉 **Melancia Elástica** | Coletivos, Festa | "elástico" coloca um elástico grátis (1 por pessoa por fruta) | resistência secreta, pressão visual (cintura, rachaduras, tremor), elásticos de presente furam a fila, elástico grosso, chuva de elásticos, chef tira elásticos, tesoura, martelo; o último elástico vence |
| 🪢 **Cabo de Guerra** | Coletivos, Batalhas | nome do time (padrão "meninos"/"meninas", editável) | cada comentário/curtida do time puxa; presentes puxam forte; ponto direto; congelar o rival; melhor de N; bandeira volta ao centro quando o chat para |
| 🏗️ **Guerra de Torres** | Estratégia, Coletivos | "torre1"/"torre2"; "sobe" = bloco grátis com intervalo | empilhar, derrubar, roubar e demolir; ao bater a meta a torre pontua e recomeça sem pausa |
| 🎤 **Show de Perguntas** | Quiz, Palavras, Festa | responde no chat | quiz (A–D) com bônus de velocidade, enquete, adivinhe o número, palavra embaralhada; modo times; perguntas próprias; dica, pontos em dobro, mais tempo e pular por presente |
| 🏁 Avatar Race | Corridas | `!join` | corrida com fila e turbos (versão 1) |
| 🛡️ Survival Arena | Sobrevivência | qualquer interação | defesa do núcleo contra ondas e chefes (versão 1) |
| 🐍 Snake Live | Habilidade | comandos de direção | cobrinha coletiva (clássico) |
| 🔮 Plinko Live | Sorte (sem apostas) | presentes e comandos | **somente pontos virtuais — sem apostas, depósitos, saques ou prêmios** |

Mecânicas inspiradas no gênero de jogos interativos para LIVE (ver [REFERENCE_RESEARCH.md](REFERENCE_RESEARCH.md)); nomes, regras detalhadas, arte e código são próprios.

## Arquitetura de plugin

Cada jogo é um pacote em `games/<id>` com:

- `manifest.ts` — nome, instruções, **ações** (com parâmetros), **configurações** (com limites) e **regras padrão**. O painel gera os formulários a partir disso.
- `sim.ts` — classe que estende `MatchGame` (jogos de participantes com lobby/pódio: implementa `onMatchStart`, `matchTick`, `onTimeUp`, `onGameAction`, `snapshot`) ou `BaseGame` (jogos contínuos/coletivos: `update`, `onAction`, `resetRound`, `snapshot`).
- `render.ts` — `GameRenderer` (Canvas 2D) que desenha snapshots e reage a marcadores de efeito.

A interface exigida `LiveGamePlugin` (`initialize/start/pause/resume/stop/handleEvent/getState/reset`) é implementada por `GameHost` sobre qualquer simulação (`packages/game-engine/src/host.ts`).

## Criar um jogo

1. Copie `games/game-template` para `games/meu-jogo` e ajuste `package.json` e o manifesto.
2. Adicione a entrada em `packages/shared/src/catalog.ts` (nome, descrição, categorias, participantes, como entrar, duração).
3. Registre em `packages/games-catalog/src/index.ts` (simulação) e `render.ts` (renderer); adicione a referência no `tsconfig.json` do catálogo e no `tsconfig.build.json`.
4. `pnpm install && pnpm build:packages && pnpm db:seed`. Para a capa da biblioteca, gere `apps/web/public/covers/<id>.webp` (640×480) a partir de uma captura do jogo.
5. Os testes em `packages/games-catalog/src/games.test.ts` cobrem automaticamente o novo jogo (roda sozinho nas duas proporções, todas as ações, determinismo, checkpoint, pausa).

## Desempenho

Medido com 20 sessões simultâneas (5 jogos alternados) em 1 game-runner: ~17% de um núcleo, tick médio < 1 ms, snapshots de 15 Hz com até ~60 KB por quadro no pior caso (Plinko com muitas bolas). O renderer limita FPS (30 em celulares/baixa potência), ajusta a resolução automaticamente, pausa fora da tela e reduz partículas com “reduzir movimento”.
