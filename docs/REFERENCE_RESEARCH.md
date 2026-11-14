# Pesquisa de referências

Data: 14/11/2026. Objetivo: entender o padrão do gênero (jogos interativos para LIVE) sem copiar código, marcas, personagens ou interfaces.

## O que foi possível acessar

| Fonte | Acesso | O que foi usado |
|---|---|---|
| livecade.io (site, biblioteca, documentação) | **Não acessível** a partir deste ambiente (bloqueio da política de rede; conexão recusada pelo proxy) | nada |
| github.com/livecade (organização) | Página e API do GitHub **bloqueadas**; a **busca de repositórios** e os arquivos `README.md` via raw.githubusercontent.com **funcionaram** | descrições públicas das mecânicas |
| taktixlive.com.br | **Não acessível** | só os nomes de experiências citados pelo cliente |
| torcidagg.tech | **Não acessível** | nada |

### Repositórios Livecade analisados (somente README)

`battle-arena`, `marble-race`, `slap-arena`, `evo-monster`, `stick-fighters`, `dance-floor`, `tower-war`, `rubber-band-melon`, `boys-vs-girls` (sufixo `-tiktok-live-game`). A busca também listou outros 20+ repositórios do mesmo tipo.

**Licença e código:** nenhum desses repositórios declara licença (a API de busca retorna licença vazia e não há arquivo `LICENSE`), e o próprio README informa: *“The game runs on Livecade's platform, so there is no source to install here.”* Ou seja, **não há código-fonte público** e, sem licença, nenhum conteúdo seria reutilizável. **Nenhum código, texto, imagem ou nome desses repositórios foi copiado.** Apenas o conhecimento geral das mecânicas (o que o público faz e o que acontece) orientou o design.

## Mecânicas observadas (descrições públicas) → implementação original

| Referência (descrição pública) | Implementação no LIVE ARENA | Diferenças próprias |
|---|---|---|
| Battle Arena: dois times, cada espectador vira lutador, presentes dão vida e rajadas de armas, modos por abates/eliminação/tempo, bots de treino | **Battle Arena v2** | personagens humanoides gerados pelo ID, golem com o nome de quem enviou, fúria coletiva, chuva de meteoros por curtidas, coroa do maior abatedor, morte súbita, cura/escudo de time |
| Slap Arena: fila, duelo no píer, escada de armas, campeão permanece, finalização a cada N vitórias | **Arena do Tapa** | armas próprias (peixe, frigideira, taco, marreta, antena parabólica), golpe crítico, vida guardada na fila, “GOLPE FINAL” (sem marcas de terceiros) |
| Rubber Band Melon: elásticos até estourar, resistência secreta, tesoura/martelo | **Melancia Elástica** | três frutas, cintura que aperta, rachaduras, chef animado, fila com prioridade para presentes, elástico grosso, chuva de elásticos |
| Boys vs Girls: cabo de guerra entre dois times | **Cabo de Guerra** | nomes/cores/palavras editáveis, congelar o rival, ponto direto, top contribuidores por time, retorno ao centro |
| Tower War: empilhar, derrubar, roubar, meta de altura | **Guerra de Torres** | dois times do público (padrão “Chat x Criador”), demolição, bloco grátis com intervalo, partida opcional por número de vitórias |
| Marble Race / corridas com nomes | **Corrida Animal** (pedida pelo cliente) | 8 animais com atributos e talentos próprios, obstáculos (barreira/lama), cenoura, banana, raio |
| Party/quiz (Crowd Says, Five Letters, Guess the Number, Word Association) | **Show de Perguntas** | rotação quiz/enquete/número/palavra, modo times, perguntas próprias em PT-BR, dicas por presente |
| Plataforma: uma URL de overlay por conta, troca de jogo, gatilhos remapeáveis | **Overlay único do criador**, regras editáveis, alertas e soundboard | ver STREAMING.md e a página Configuração de eventos |

## Não verificado (registrado conforme pedido)

- Aparência real, fluxo de configuração e preços de Livecade, TakTix Live e Torcida.gg (sites inacessíveis; imagens dos READMEs não foram abertas).
- As experiências TakTix citadas (Noel Mania V2, Bob Esponja V2, Salsicha, Tung Tung Smash, Pipa Combate, Urna Interativa, Bridge Brawl): **não analisadas**; vários nomes remetem a personagens protegidos, que não foram usados.
- Ainda não implementados a partir desta lista: Marble Race (pista 3D), Evo Monster, Bridge Brawl. Ficam como próximos jogos (ver IMPLEMENTATION_STATUS.md).
