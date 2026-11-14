# Integração com o TikTok LIVE

## Resumo honesto

- **Não existe uma API oficial pública** do TikTok para receber em tempo real os eventos (presentes, curtidas, comentários) de uma LIVE.
- A plataforma está pronta para receber eventos de três tipos de fonte, todas atrás da interface **`TikTokConnectorAdapter`** (`packages/tiktok-adapter`):

| Fonte | Estado | Observação |
|---|---|---|
| **Simulador** | ✅ funcionando | Eventos fictícios automáticos (leve/movimentado) ou manuais. Sempre marcados como simulados. |
| **Serviço gerenciado** (ex.: Euler Stream) | 🟡 preparado, não validado | Requer contrato e API key. URL e formato precisam ser confirmados na documentação oficial do provedor (o site não pôde ser acessado deste ambiente). |
| **Biblioteca `tiktok-live-connector`** | 🔴 desabilitada por padrão | Licença AGPL-3.0 com exceções que **não se aplicam a SaaS comercial** (ver abaixo). |

Até que uma fonte licenciada esteja contratada, **a plataforma não deve ser vendida como “conectada ao TikTok”**. Ela funciona integralmente com o simulador.

## Por que a biblioteca está desabilitada

A versão 2.5.0 (npm, setembro/2026) é distribuída sob **AGPL-3.0-only com permissões adicionais** (o arquivo `LICENSE` do branch principal no GitHub ainda mostra MIT, mas o pacote publicado mostra AGPL — prevalece o que é distribuído). Seções relevantes:

- **§18** permite integrar sem adotar a AGPL, inclusive para fins comerciais, *desde que não acione a §19* (cita como exemplos overlays, jogos e bots de LIVE).
- **§19** revoga essa exceção se a biblioteca for usada para alimentar uma plataforma **SaaS comercial, fechada ou hospedada** para terceiros — exatamente o modelo deste produto.
- **§20**: ao violar a §19, a permissão é revogada e passa a valer a AGPL pura (incluindo a cláusula de uso em rede, §13: disponibilizar todo o código-fonte do servidor).
- **§21** excetua TikFinity/STV GmbH e Euler Stream Inc.

Conclusão: usar a biblioteca neste SaaS exigiria **publicar todo o código do servidor sob AGPL-3.0** ou obter outra licença. Por isso:

1. o pacote **não é dependência** do projeto (o verificador de licenças falha se ele aparecer — e de fato detectou uma instalação automática indevida, já corrigida);
2. o adaptador só carrega com `TTLC_ENABLED=true` **e** `TTLC_LICENSE_ACK=AGPL-3.0`, por import dinâmico, se alguém instalar o pacote manualmente (uso próprio/não comercial ou com código aberto);
3. a biblioteca também **não é API oficial** e depende de engenharia reversa e de um servidor de assinatura de terceiros — pode quebrar sem aviso.

Isto não é aconselhamento jurídico; valide com um advogado antes de lançar comercialmente.

## Caminho recomendado para produção

1. Contratar um **serviço gerenciado com licença comercial** (ex.: Euler Stream, excetuado na licença).
2. Configurar `EULER_WS_URL` e a API key (por conexão, cifrada, ou global em `EULER_API_KEY`).
3. Validar o mapeamento de mensagens com amostras reais (`packages/tiktok-adapter/src/webcast-mapping.ts` + testes).
4. Ativar a opção no painel (Configurações → Conexões).

## Como o adaptador funciona

```ts
interface TikTokConnectorAdapter {
  provider: 'SIMULATOR' | 'TIKTOK_TTLC' | 'EULER_STREAM';
  connect(target: { uniqueId; credentials? }, handlers: { onEvent; onState; onDisconnected }): Promise<void>;
  disconnect(): Promise<void>;
}
```

O processo `connector` gerencia cada conexão: lease por sessão, reconexão com backoff exponencial + jitter, **circuit breaker** (5 falhas → pausa de 2 min), estado OFFLINE quando o criador não está ao vivo (nova tentativa a cada 60 s), token bucket (2000 eventos de rajada / 1000 por segundo) e buffer limitado em memória. Na falha da fila, presentes/seguidores são priorizados.

Mapeamento: chat → CHAT; gift → GIFT (com `repeatCount`, `repeatEnd`, `groupId`, `giftType=1 ⇒ streakable`, diamantes quando informados); like → curtidas agregadas; follow/share; member; roomUser → ROOM_USER; subscribe → SUBSCRIPTION; linkMicBattle → BATTLE; streamEnd → STREAM_END. **Campos não fornecidos pela fonte nunca são inventados.**

## O que nunca fazemos

- Pedir a senha do TikTok, extrair cookies ou contornar autenticação.
- Extrair chaves RTMP privadas.
- Testes de carga contra serviços externos.
