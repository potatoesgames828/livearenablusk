import { LikeAggregator } from '@live-arena/event-engine';
import {
  ConnectorUnavailableError, UserOfflineError,
  type AdapterHandlers, type ConnectTarget, type TikTokConnectorAdapter,
} from './adapter';
import { mapBattle, mapChat, mapGift, mapLike, mapMember, mapRoomUser, mapSocial, mapSubscription } from './webcast-mapping';

/**
 * Adaptador para a biblioteca open source "tiktok-live-connector".
 *
 * ⚠️ LICENÇA: a versão 2.x é distribuída sob AGPL-3.0 com exceções. A Seção 19
 * da licença REVOGA a exceção de integração quando a biblioteca é usada para
 * alimentar uma plataforma SaaS comercial, fechada ou hospedada para terceiros.
 * Por isso este adaptador:
 *   - NÃO é instalado por padrão (dependência opcional);
 *   - só é carregado com TTLC_ENABLED=true e TTLC_LICENSE_ACK=AGPL-3.0;
 *   - deve ser usado apenas em instalações próprias/não comerciais ou se o
 *     código-fonte completo do servidor for publicado sob AGPL-3.0.
 * Ver docs/LICENSE_AUDIT.md e docs/TIKTOK_INTEGRATION.md.
 *
 * Também não é uma API oficial do TikTok: o protocolo pode mudar sem aviso.
 */
export class TtlcAdapter implements TikTokConnectorAdapter {
  readonly provider = 'TIKTOK_TTLC' as const;
  private connection: { disconnect: () => unknown; on: (ev: string, cb: (d: unknown) => void) => unknown } | null = null;
  private likes: LikeAggregator | null = null;

  static isEnabled(): boolean {
    return process.env.TTLC_ENABLED === 'true' && process.env.TTLC_LICENSE_ACK === 'AGPL-3.0';
  }

  async connect(target: ConnectTarget, handlers: AdapterHandlers): Promise<void> {
    if (!TtlcAdapter.isEnabled()) {
      throw new ConnectorUnavailableError(
        'Conector tiktok-live-connector desabilitado. Defina TTLC_ENABLED=true e TTLC_LICENSE_ACK=AGPL-3.0 somente se o seu uso estiver em conformidade com a licença.',
      );
    }
    let mod: Record<string, unknown>;
    try {
      // import dinâmico: a biblioteca é ESM e opcional.
      const name = 'tiktok-live-connector';
      mod = (await import(name)) as Record<string, unknown>;
    } catch {
      throw new ConnectorUnavailableError('Pacote tiktok-live-connector não instalado neste servidor.');
    }
    const Ctor = mod.TikTokLiveConnection as new (u: string, o?: Record<string, unknown>) => {
      connect: () => Promise<unknown>;
      disconnect: () => unknown;
      on: (ev: string, cb: (d: unknown) => void) => unknown;
    };
    if (!Ctor) throw new ConnectorUnavailableError('Versão incompatível do tiktok-live-connector.');
    const opts: Record<string, unknown> = { enableExtendedGiftInfo: true, processInitialData: false };
    // Chave do serviço de assinatura (Euler Stream), quando fornecida legitimamente pelo cliente.
    if (target.credentials?.signApiKey) opts.signApiKey = target.credentials.signApiKey;
    const conn = new Ctor(target.uniqueId, opts);
    this.connection = conn;
    this.likes = new LikeAggregator((e) => handlers.onEvent(e), 1000, 'tiktok', false);

    const on = (ev: string, fn: (d: Record<string, unknown>) => void) =>
      conn.on(ev, (d) => {
        try {
          fn((d ?? {}) as Record<string, unknown>);
        } catch {
          /* um payload inesperado não pode derrubar o conector */
        }
      });
    on('chat', (d) => handlers.onEvent(mapChat(d)));
    on('gift', (d) => handlers.onEvent(mapGift(d)));
    on('like', (d) => {
      const l = mapLike(d);
      this.likes?.add(l.likes, l.user, l.total);
    });
    on('follow', (d) => handlers.onEvent(mapSocial('FOLLOW', d)));
    on('share', (d) => handlers.onEvent(mapSocial('SHARE', d)));
    on('member', (d) => handlers.onEvent(mapMember(d)));
    on('roomUser', (d) => {
      const e = mapRoomUser(d);
      if (e) handlers.onEvent(e);
    });
    on('subscribe', (d) => handlers.onEvent(mapSubscription(d)));
    on('linkMicBattle', (d) => handlers.onEvent(mapBattle(d)));
    on('streamEnd', () => {
      handlers.onEvent({ source: 'tiktok', type: 'STREAM_END', payload: {} });
      handlers.onDisconnected('A LIVE terminou', false);
    });
    on('disconnected', () => handlers.onDisconnected('Conexão encerrada pela fonte', true));
    on('error', (d) => handlers.onState('ERROR', String((d as { message?: string }).message ?? 'erro')));

    handlers.onState('CONNECTING');
    try {
      await conn.connect();
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      const message = (err as Error)?.message ?? String(err);
      if (/offline/i.test(name) || /offline|not live|isn't online/i.test(message)) throw new UserOfflineError();
      throw err;
    }
    handlers.onState('CONNECTED');
    handlers.onEvent({ source: 'tiktok', type: 'STREAM_START', payload: {} });
  }

  async disconnect(): Promise<void> {
    this.likes?.stop();
    this.likes = null;
    try {
      this.connection?.disconnect();
    } catch {
      /* já desconectado */
    }
    this.connection = null;
  }
}
