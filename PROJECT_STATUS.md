# Estado do projeto — LIVE ARENA

Atualizado em 14/11/2026. Branch: `ccr-8c9692c5-1sdtbd`.

**Resumo:** primeira versão funcional e testada de ponta a ponta com o simulador. **Ainda não está pronta para produção comercial**: a fonte real de eventos do TikTok depende de licença/contrato, e faltam itens operacionais e jurídicos listados abaixo.

## Fases

| Fase | Situação | Evidência |
|---|---|---|
| 1. Fundação (monorepo, TS, banco, Redis, auth, multi-tenant) | ✅ | integração 13/13 |
| 2. Dashboard e responsividade | ✅ | E2E 56/56 em 8 dispositivos |
| 3. Event Engine | ✅ | unitários + integração |
| 4. Simulador (eventos, cenários, falhas) | ✅ | integração + caos |
| 5. Game Engine (plugins, estados, tempo real) | ✅ | unitários (determinismo/checkpoint) |
| 6. Cinco jogos | ✅ | unitários + revisão visual 9:16/16:9 |
| 7. TikTok Connector | 🟡 adaptador pronto; **fonte real bloqueada por licença/contrato** | TIKTOK_INTEGRATION.md |
| 8. Automação | ✅ | integração (ciclo de vida) + unitários |
| 9. Renderização e streaming | ✅ gravação validada · 🟡 RTMP e OBS reais não testados | ffprobe |
| 10. Segurança e estabilidade | ✅ | caos 8/8, carga, audit 0, gitleaks 0 |
| 11. Multiplataforma | ✅ (Chromium com emulação) · 🟡 Safari/Firefox reais e aparelhos físicos pendentes | MULTIPLATFORM.md |
| 12. Preparação para produção | 🟡 Docker/CI/backup/docs prontos; pendências abaixo | DEPLOYMENT.md |

## Funciona hoje (testado)

Cadastro, login, MFA, recuperação de senha (caixa de saída de dev), RBAC, isolamento entre tenants (API e WebSocket) · Central de jogos com editor visual e teste local · LIVES com início/pausa/retomada/encerramento, troca de jogo, anúncios, reinício de rodada · simulador (presentes, sequências, picos de curtidas, comandos, seguidores) e cenários de falha · feed de eventos e jogo em tempo real · ranking (sessão/jogo/geral) com privacidade · estatísticas separando dados simulados · automações · overlays revogáveis com QR code · gravação de vídeo pelo servidor · administração (serviços, filas, alertas, usuários, tenants, planos, auditoria) · limites de plano no backend · PWA · recuperação automática de falhas de processos, Redis e PostgreSQL.

## Depende de credenciais/contratos externos

| Item | O que falta |
|---|---|
| Eventos reais do TikTok | Contratar serviço gerenciado licenciado (ex.: Euler Stream), confirmar URL/formato na documentação oficial e validar o mapeamento com amostras reais. A biblioteca open source exige publicar o código do servidor sob AGPL para uso SaaS. |
| Saída RTMP | Chave/URL RTMP fornecida pela plataforma ao criador (nem toda conta possui) |
| OBS | Testar com OBS 28+ real (código pronto, **sem teste automatizado nem com OBS real**) |
| E-mail | `SMTP_URL` de um provedor transacional |
| Cobrança | Planos e limites prontos; integração de pagamento não implementada (de propósito) |

## Limitações conhecidas

- CSP com `'unsafe-inline'` em scripts (próximo passo: nonce).
- Sem verificação de e-mail no cadastro e sem convite de membros para o tenant (a estrutura de `Membership` suporta; falta UI/fluxo).
- Realtime com várias réplicas requer sticky sessions ou apenas transporte WebSocket no proxy.
- Estágios de runtime do Docker não construídos neste ambiente (espelho Debian bloqueado); estágio de build validado; o CI constrói e escaneia a imagem da API.
- Capacidade testada até 20 sessões simultâneas num servidor de 4 vCPU; valores maiores são extrapolação.
- O áudio dos jogos sai no overlay do OBS; o vídeo gerado pelo servidor leva faixa de áudio silenciosa.
- Testes de navegador real (WebKit/Firefox) e em aparelhos físicos pendentes.
- Os testes de caos dependem de `pg_ctl`/`redis-cli` locais (não rodam no CI).
- Retenção do bloqueio por força bruta fica no Redis (zera se o Redis perder dados).

## Próximos passos recomendados (em ordem)

1. **Fonte de eventos licenciada**: contrato + validação do adaptador `EulerStreamAdapter` com dados reais.
2. **Revisão jurídica**: licenças, termos de uso, política de privacidade (LGPD), políticas do TikTok para LIVE com jogos.
3. **Staging na nuvem** com Docker Compose (ou 2–3 servidores), Postgres/Redis gerenciados, Alertmanager com notificações, backups automáticos externos.
4. Testes manuais com OBS real, RTMP real e aparelhos físicos (iPhone/Android/iPad); rodar a suíte E2E com WebKit e Firefox.
5. Teste de carga em staging (50–200 sessões, várias réplicas de runner/worker).
6. Segurança: CSP com nonce, verificação de e-mail, pentest externo.
7. Produto: convites de membros, cobrança, mais jogos usando o template, presets prontos por nicho.

## Como retomar o trabalho

```bash
pnpm install && pnpm db:generate && pnpm build:packages
for a in api worker game-runner realtime connector stream-manager; do (cd apps/$a && npx tsc -p tsconfig.json); done
(cd apps/web && NODE_ENV=production npx next build)
node scripts/start-all.mjs
pnpm test:unit && pnpm test:integration && pnpm test:e2e
```
