# Estimativa de infraestrutura

**Não há preços verificados neste documento.** Os valores em dinheiro dependem do provedor, região e câmbio — **estimativa pendente de cotação**. Abaixo estão os **recursos necessários**, baseados nas medições de [TESTING.md](TESTING.md) (20 sessões ≈ 0,8 núcleo para todo o pipeline de eventos/jogos) com margem de segurança de ~2×.

## Sem vídeo pelo servidor (criadores usam OBS com o link de overlay)

| Cenário | vCPU | RAM | Disco (banco) | Tráfego de saída aprox. |
|---|---|---|---|---|
| 1 sessão | 2 | 4 GB | 20 GB | ~15 snapshots/s × ~5–20 KB × nº de espectadores do painel/overlay ≈ 0,1–1 Mbps por cliente |
| 5 sessões | 2 | 4 GB | 20 GB | idem × clientes |
| 10 sessões | 4 | 8 GB | 40 GB | idem |
| 20 sessões | 4 | 8 GB | 60 GB | idem |

Um único servidor de 4 vCPU / 8 GB atende os quatro cenários com folga, mais PostgreSQL e Redis gerenciados (recomendado em produção) ou locais. O tráfego principal são os snapshots do jogo para cada overlay/painel aberto (normalmente 1 overlay no OBS + 1 painel por sessão).

## Com vídeo pelo servidor (RTMP ou gravação)

Somar por transmissão simultânea (estimativa, não medida em 1080p): **1–2 vCPU e ~700 MB RAM por pipeline 1080p30** (Chromium + x264 `veryfast`); upload de **4,5–5 Mbps** por transmissão 1080p30 (2,5–3 Mbps em 720p).

| Cenário | vCPU adicionais | RAM adicional | Upload |
|---|---|---|---|
| 1 transmissão | 2 | 1 GB | ~5 Mbps |
| 5 transmissões | 8–10 | 4 GB | ~25 Mbps |
| 10 transmissões | 16–20 | 8 GB | ~50 Mbps |
| 20 transmissões | 32–40 | 16 GB | ~100 Mbps |

Para vídeo, prefira servidores dedicados ao stream-manager (CPU otimizada) ou aceleração por hardware (NVENC/QSV — não implementado; exigiria ajuste dos argumentos do FFmpeg).

## Outros itens a cotar

Armazenamento S3 compatível para backups e gravações · e-mail transacional (SMTP) · domínio e TLS (Caddy emite gratuitamente via ACME) · **serviço gerenciado de eventos TikTok (contrato)** · monitoramento (Grafana/Prometheus auto-hospedados ou gerenciados).
