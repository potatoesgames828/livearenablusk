# Transmissão e renderização

Receber eventos **não** é transmitir vídeo. São etapas separadas, em processos separados:

1. Recepção de eventos (connector) → 2. Processamento do jogo (game-runner) → 3. Renderização visual (navegador/overlay) → 4. Codificação (FFmpeg) → 5. Saída (OBS do usuário ou RTMP autorizado).

## Opção A — OBS (recomendada)

1. Na sala de controle: **Saída de vídeo → Overlay → Gerar novo link**.
2. No OBS: Fontes → + → **Navegador** → cole o link → 1080×1920 (vertical) ou 1920×1080 → marque “Controlar áudio pelo OBS”.
3. Transmita pelo OBS / TikTok LIVE Studio com a chave que a plataforma fornece a você.

**Automação pelo painel (PC):** aba **OBS** — conecta ao obs-websocket v5 local (`ws://localhost:4455`, OBS 28+), lista cenas, cria/atualiza a fonte “LIVE ARENA” com o link, troca de cena, inicia/para a transmissão e mostra FPS, CPU, congestionamento e quadros perdidos. A conexão sai do navegador direto para o OBS; a senha não passa pelos nossos servidores. *Não testado contra um OBS real neste ambiente.*

O link de overlay: token exibido uma vez, só leitura, de uma única sessão, revogável (sockets conectados caem na hora). A página reconecta sozinha se a rede oscilar.

## Opção B — vídeo gerado pelo servidor (planos com saída de vídeo)

O **stream-manager** abre o overlay num Chromium headless, captura quadros JPEG via CDP (screencast), envia ao FFmpeg (H.264 `veryfast`/`zerolatency`, keyframe a cada 2 s, AAC com faixa silenciosa) e publica em:

- **RTMP/RTMPS** — somente com URL e chave fornecidas legitimamente pela plataforma ao criador. Não automatizamos login nem extraímos chaves; nem toda conta tem acesso a chave RTMP.
- **Gravação (MP4 fragmentado)** — para testes; arquivos em `recordings/<tenant>/`.

Monitoramento: FPS, bitrate, quadros perdidos/duplicados, velocidade do encoder → estado LIVE / DEGRADED / RESTARTING / ERROR, métricas Prometheus e alertas. Renderer sem quadros por 10 s ou encoder que cai são reiniciados com backoff (máx. 5 tentativas → ERROR + alerta crítico). Um **lease por chave de transmissão** impede dois processos usando a mesma chave.

### Validação

Gravação de ~14 s em 720×1280 a 30 fps: arquivo MP4 válido (H.264 + AAC) verificado com `ffprobe`, quadro extraído conferido visualmente, 0 quadros perdidos, ~2 Mbps, CPU do servidor de teste (4 vCPU) suficiente. RTMP real não testado (requer chave de uma plataforma).

## Perfis de qualidade

| Perfil | Resolução | FPS | Vídeo | Áudio |
|---|---|---|---|---|
| Vertical 720p | 720×1280 | 30 | 2,5 Mbps | 128 kbps |
| Vertical 1080p | 1080×1920 | 30 | 4,5 Mbps | 128 kbps |
| Vertical 1080p60 | 1080×1920 | 60 | 6,5 Mbps | 160 kbps |
| Horizontal 720p / 1080p | 1280×720 / 1920×1080 | 30 | 2,5 / 4,5 Mbps | 128 kbps |

Faixas usuais para H.264 em LIVE. Confirme os limites vigentes da plataforma de destino e a banda de upload do servidor. Cada pipeline 1080p30 consome aproximadamente 1–2 núcleos (Chromium + x264) — dimensione `STREAM_MAX_PIPELINES` de acordo.
