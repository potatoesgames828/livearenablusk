# Segurança

## Controles implementados

| Tema | Implementação |
|---|---|
| Senhas | Argon2id (m=19 MiB, t=2, p=1 — OWASP), política mínima, tempo constante para e-mails inexistentes |
| Sessões | Access token JWT de 15 min **só em memória** no navegador; refresh token opaco (48 bytes) em cookie `httpOnly; SameSite=Strict; Secure`, armazenado como hash, **rotação por família com detecção de reuso** |
| CSRF | Rotas com cookie exigem o cabeçalho `X-Requested-With: live-arena`; demais rotas usam Bearer |
| Força bruta | Bloqueio por e-mail+IP (8 falhas/15 min) e por e-mail; rate limit distribuído (Redis) por rota |
| MFA | TOTP (RFC 6238); obrigatório para `/api/admin/*` com `ADMIN_MFA_REQUIRED=true`; segredo cifrado |
| Autorização | RBAC em dois níveis (tenant: OWNER/ADMIN/MEMBER; plataforma: USER/OPERATOR/ADMIN) aplicado no backend |
| Multi-tenant | Toda consulta filtra por `tenantId` (`tenantScope`); IDs de outro tenant retornam 404; WebSocket valida a posse da sessão; filas carregam e conferem o tenant; arquivos de gravação em pasta por tenant. Testado (integração + E2E) |
| WebSocket | Ticket JWT de 60 s separado do access token; overlays com ticket restrito a uma sessão; limite de mensagens, de inscrições e de conexões por tenant; revogação derruba sockets |
| Overlays | Token aleatório exibido uma vez, salvo como hash, escopo de uma sessão, somente leitura, revogável, expirável |
| Validação | Zod em toda entrada; sanitização de texto (caracteres de controle e bidi); limites de tamanho de corpo (256 KB) |
| XSS / cabeçalhos | React escapa por padrão; CSP, `X-Frame-Options: DENY` no painel, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; Helmet na API |
| SQL injection | Prisma (consultas parametrizadas); a única consulta bruta usa template parametrizado |
| CORS | Lista explícita de origens |
| Segredos | Somente via ambiente; `.env` fora do git; Gitleaks no CI |
| Dados sensíveis | Chaves RTMP, API keys e segredos MFA cifrados com AES-256-GCM, com rotação de chaves (`ENCRYPTION_KEYS`) |
| Logs | Pino com redação de senhas, tokens, cookies e chaves; URLs RTMP mascaradas |
| Auditoria | `AuditLog` para login, mudanças de configuração, controle de sessões, ações administrativas |
| Infraestrutura | PostgreSQL/Redis só na rede interna do Compose; contêineres sem privilégios (`cap_drop: ALL`, `no-new-privileges`, `read_only`, usuário `node`) |
| Cadeia de suprimentos | `pnpm audit` (0 vulnerabilidades em 14/11/2026), verificação de licenças, Trivy (fs e imagem) e Gitleaks no CI |

## Falsificação de IP (corrigida)

Durante os testes encontramos que, com o Next encaminhando `/api`, um cliente podia enviar `X-Forwarded-For` falso e burlar o rate limit. Correção: o middleware do Next remove cabeçalhos de IP enviados pelo cliente, a menos que `EDGE_PROXY=true`, situação em que o proxy de borda (Caddy/nginx fornecidos) **sobrescreve** o cabeçalho com o IP real. **Em produção, use sempre o proxy de borda** — sem ele, todos os clientes aparecem com o IP do web e os limites passam a ser compartilhados.

## Limitações conhecidas

- CSP do painel usa `'unsafe-inline'` em scripts (hidratação do Next sem nonce). Próximo passo: CSP com nonce via middleware.
- Não há verificação de e-mail no cadastro (campo `emailVerified` existe; falta o fluxo).
- Bloqueio de conta por tentativas fica no Redis: reiniciar o Redis zera contadores.
- Sem WAF/anti-DDoS próprio: use o provedor de nuvem/CDN.
- O pentest externo e a revisão de segurança independente ainda não foram feitos.

## Relatar vulnerabilidades

Envie para o e-mail de segurança configurado em `NEXT_PUBLIC_SUPPORT_EMAIL` com passos para reproduzir. Não publique antes da correção.
