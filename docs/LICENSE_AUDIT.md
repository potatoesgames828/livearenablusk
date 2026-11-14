# Auditoria de licenças

Data: 14/11/2026. Ferramenta: `node scripts/license-check.mjs` (dependências de produção; roda no CI).

## Resultado

| Licença | Pacotes |
|---|---|
| MIT | 227 |
| Apache-2.0 | 54 |
| ISC | 18 |
| BSD-3-Clause | 15 |
| LGPL-3.0-or-later | 2 (revisado: `@img/sharp-libvips-*`) |
| BSD-2-Clause, MIT-0, 0BSD, (MIT OR CC0-1.0) | 1 cada |
| CC-BY-4.0 | 1 (dados, `caniuse-lite`) |
| “Unknown” | 1 (revisado: `thirty-two`, texto MIT) |

**Nenhuma licença copyleft forte (GPL/AGPL/SSPL/BUSL) nas dependências de produção.**

## Itens revisados

| Pacote | Licença | Decisão |
|---|---|---|
| `tiktok-live-connector` / `tiktok-live-proto` | AGPL-3.0-only c/ exceções (§18–21) | **Não utilizado** em produção. Ver [TIKTOK_INTEGRATION.md](TIKTOK_INTEGRATION.md). O pnpm chegou a instalá-lo automaticamente por ter sido declarado como peer opcional; a declaração foi removida e o verificador agora impede a regressão. |
| `@img/sharp-libvips-*` | LGPL-3.0+ | Biblioteca dinâmica, não modificada, opcional do Next para otimização de imagens (desativada com `images.unoptimized`). Uso compatível com LGPL. |
| `thirty-two` | sem campo no package.json | Texto de licença MIT no pacote. |

## Projetos avaliados (não incorporados)

| Projeto | Licença | Uso |
|---|---|---|
| Phaser | MIT | Avaliado; não usado (ver ADR 2 em ARCHITECTURE.md) |
| PixiJS | MIT | Avaliado; interface de renderer permite adotar no futuro |
| Colyseus | MIT | Avaliado; não necessário (ADR 3) |
| OBS Studio | GPL-2.0 | **Não incorporado.** Integração apenas via protocolo obs-websocket (cliente `obs-websocket-js`, MIT) com o OBS instalado pelo usuário |
| FFmpeg | LGPL/GPL (conforme build) | Executado como processo externo (não linkado). Use builds LGPL se distribuir binários; o build do Debian inclui libx264 (GPL) — aceitável para uso no próprio servidor (SaaS), revisar se for redistribuir |
| Chromium | BSD + diversas | Executado como processo externo (imagem do stream-manager) |
| Prometheus, Grafana | Apache-2.0 / AGPL-3.0 | Executados como serviços separados e **não modificados** (Grafana AGPL não “contamina” o produto por ser processo independente; se modificar o Grafana, publique as modificações) |
| Trivy / Gitleaks / k6 | Apache-2.0 / MIT / AGPL-3.0 | Ferramentas de desenvolvimento/CI, não distribuídas |

## Recursos visuais e sonoros

Todos os gráficos dos jogos são desenhados em código (Canvas 2D) e os sons são sintetizados (WebAudio). Nenhum asset de terceiros. Ícones da interface: `lucide-react` (ISC).
