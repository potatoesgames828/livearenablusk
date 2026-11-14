# Uso em PC, celular e tablet

Abordagem mobile-first e responsiva. A **tela de controle** se adapta ao aparelho; a **saída do jogo** é sempre desenhada na proporção do vídeo configurada (9:16 ou 16:9), com letterbox — exatamente o que vai para a transmissão.

## Layouts

| Largura | Navegação | Layout |
|---|---|---|
| até 480 px (celular pequeno) / 481–767 px (celular) | barra inferior (Início, LIVES, Jogos, Eventos, **Mais**) + topo compacto | uma coluna, cartões de estado em 2 colunas, modais como folha inferior |
| 768–1023 px (tablet) | trilho lateral de ícones | duas colunas quando cabe |
| 1024–1439 px (notebook) / 1440+ (desktop) | menu lateral expansível (recolhível) | multi-colunas, painel de controle completo |

Sem dependência de *hover*; alvos de toque ≥ 44 px na navegação e ≥ 40 px nos botões; campos com 16 px no celular (evita zoom no iOS); áreas seguras de aparelhos com notch; sem rolagem horizontal (verificado automaticamente em todas as páginas).

## O que dá para fazer em cada aparelho

| Recurso | PC | Tablet | Celular |
|---|---|---|---|
| Conta, login, MFA, recuperação de senha | ✅ | ✅ | ✅ |
| Configurar jogos (regras, aparência) e testar no navegador | ✅ | ✅ | ✅ |
| Criar/iniciar/pausar/encerrar LIVE, trocar jogo, anúncios | ✅ | ✅ | ✅ |
| Simulador de eventos e cenários | ✅ | ✅ | ✅ |
| Eventos em tempo real, estatísticas, ranking | ✅ | ✅ | ✅ |
| Gerar link de overlay (com QR code para abrir em outro aparelho) | ✅ | ✅ | ✅ |
| Controlar o OBS (WebSocket local) | ✅ (onde o OBS roda) | ⚠️ só se o OBS estiver na mesma rede e acessível | ❌ |
| Administração da plataforma | ✅ | ✅ | ✅ (tabelas com rolagem própria) |
| Transmitir o vídeo | Pelo OBS/LIVE Studio ou servidor | idem | Pelo app do TikTok/servidor; o painel só controla |

O processamento do jogo e dos eventos acontece no servidor: bloquear a tela do celular não para o jogo.

## PWA

Instalável (manifesto, ícones 192/512/maskable, tela cheia). O service worker cacheia **somente** arquivos estáticos imutáveis (`/_next/static`, ícones) e uma página offline genérica; **nunca** cacheia `/api`, overlays ou páginas com dados. Atualização controlada por versão do cache.

- Android/Chrome: menu → “Instalar app”/“Adicionar à tela inicial”.
- iPhone/iPad (Safari): Compartilhar → “Adicionar à Tela de Início”.

## Desempenho em aparelhos móveis

Code splitting por rota (painel inicial ~140 KB JS), canvas com DPR limitado e qualidade adaptativa (alta → média → baixa conforme o tempo de quadro), 30 FPS em celulares, pausa quando a aba/elemento não está visível, partículas reduzidas com “reduzir movimento”, snapshots voláteis no WebSocket (o aparelho lento perde quadros, não acumula atraso).

## Testes automatizados

Playwright em 8 perfis: Desktop 1440, Notebook 1280, iPad retrato, iPad paisagem, Galaxy Tab S4, iPhone 13, iPhone SE (320 px), Pixel 7 — **56/56 aprovados**: páginas públicas, demonstração com verificação de pixels do canvas, overlay inválido, navegação adequada a cada aparelho, rolagem horizontal em 10 páginas, tamanho dos alvos de toque, fluxo completo (configurar → criar → iniciar → simular → pausar → retomar → encerrar com confirmação) e isolamento entre contas.

### Limitação

Neste ambiente só o Chromium está instalado: os perfis de iPhone/iPad são **emulados no Chromium** (viewport, toque, DPR, user agent). Para validar no Safari/WebKit e Firefox reais: `npx playwright install webkit firefox` e `PW_ALL_BROWSERS=1 pnpm test:e2e`. Recomenda-se ainda um teste manual em aparelhos físicos antes do lançamento. Recursos usados: Canvas 2D, WebSocket, WebAudio (com fallback silencioso), ResizeObserver/IntersectionObserver (com fallback), `<dialog>` nativo (Safari 15.4+).
