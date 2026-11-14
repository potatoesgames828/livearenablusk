import WebSocket from 'ws';
import { LikeAggregator } from '@live-arena/event-engine';
import { ConnectorUnavailableError, UserOfflineError, type AdapterHandlers, type ConnectTarget, type TikTokConnectorAdapter } from './adapter';
import { mapBattle, mapChat, mapGift, mapLike, mapMember, mapRoomUser, mapSocial, mapSubscription } from './webcast-mapping';

/**
 * Adaptador para um serviço gerenciado de eventos TikTok LIVE via WebSocket
 * (ex.: Euler Stream — parte expressamente excetuada na licença do
 * TikTok-Live-Connector e que oferece API comercial com contrato).
 *
 * ⚠️ PREPARADO, NÃO VALIDADO EM PRODUÇÃO: a URL e o formato das mensagens são
 * configuráveis porque a documentação oficial do provedor não pôde ser
 * consultada a partir deste ambiente. Antes de usar:
 *   1. contrate o serviço e obtenha a API key;
 *   2. confirme na documentação oficial a URL (EULER_WS_URL) e o formato;
 *   3. rode os testes de mapeamento com amostras reais.
 *
 * Formato esperado por padrão: mensagens JSON `{ messages: [{ type, data }] }`
 * com `type` no padrão "WebcastGiftMessage", "WebcastChatMessage"…
 */
export class EulerStreamAdapter implements TikTokConnectorAdapter {
  readonly provider = 'EULER_STREAM' as const;
  private ws: WebSocket | null = null;
  private likes: LikeAggregator | null = null;
  private closedByUs = false;

  async connect(target: ConnectTarget, handlers: AdapterHandlers): Promise<void> {
    const apiKey = target.credentials?.apiKey ?? process.env.EULER_API_KEY;
    const base = process.env.EULER_WS_URL;
    if (!apiKey || !base) {
      throw new ConnectorUnavailableError('Serviço gerenciado não configurado: informe a API key e EULER_WS_URL.');
    }
    const url = new URL(base);
    url.searchParams.set('uniqueId', target.uniqueId);
    this.closedByUs = false;
    this.likes = new LikeAggregator((e) => handlers.onEvent(e), 1000, 'tiktok', false);
    handlers.onState('CONNECTING');
    await new Promise<void>((resolve, reject) => {
      // A chave vai no cabeçalho (não na URL), para não aparecer em logs de proxy.
      const ws = new WebSocket(url, { headers: { 'x-api-key': apiKey }, handshakeTimeout: 15_000 });
      this.ws = ws;
      let opened = false;
      ws.on('open', () => {
        opened = true;
        handlers.onState('CONNECTED');
        handlers.onEvent({ source: 'tiktok', type: 'STREAM_START', payload: {} });
        resolve();
      });
      ws.on('message', (buf) => this.handle(buf.toString(), handlers));
      ws.on('close', (code, reason) => {
        if (!opened) {
          const r = reason.toString();
          reject(/offline|not live/i.test(r) ? new UserOfflineError() : new Error(`Falha ao conectar (${code}) ${r}`));
          return;
        }
        if (!this.closedByUs) handlers.onDisconnected(`Conexão encerrada (${code})`, code !== 4404 && code !== 4401);
      });
      ws.on('error', (err) => {
        if (!opened) reject(err);
      });
    });
  }

  private handle(raw: string, h: AdapterHandlers): void {
    let parsed: { messages?: Array<{ type?: string; data?: Record<string, unknown> }> };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return;
    }
    for (const m of parsed.messages ?? []) {
      const d = m.data ?? {};
      try {
        switch (m.type) {
          case 'WebcastChatMessage':
            h.onEvent(mapChat(d));
            break;
          case 'WebcastGiftMessage':
            h.onEvent(mapGift(d));
            break;
          case 'WebcastLikeMessage': {
            const l = mapLike(d);
            this.likes?.add(l.likes, l.user, l.total);
            break;
          }
          case 'WebcastMemberMessage':
            h.onEvent(mapMember(d));
            break;
          case 'WebcastRoomUserSeqMessage': {
            const e = mapRoomUser(d);
            if (e) h.onEvent(e);
            break;
          }
          case 'WebcastSocialMessage': {
            const display = String((d.common as Record<string, unknown> | undefined)?.displayText ?? d.displayType ?? '');
            if (/follow/i.test(display)) h.onEvent(mapSocial('FOLLOW', d));
            else if (/share/i.test(display)) h.onEvent(mapSocial('SHARE', d));
            break;
          }
          case 'WebcastSubNotifyMessage':
            h.onEvent(mapSubscription(d));
            break;
          case 'WebcastLinkMicBattle':
            h.onEvent(mapBattle(d));
            break;
          case 'WebcastControlMessage':
            h.onEvent({ source: 'tiktok', type: 'STREAM_END', payload: {} });
            h.onDisconnected('A LIVE terminou', false);
            break;
        }
      } catch {
        /* mensagem inesperada é ignorada */
      }
    }
  }

  async disconnect(): Promise<void> {
    this.closedByUs = true;
    this.likes?.stop();
    this.likes = null;
    this.ws?.close(1000);
    this.ws = null;
  }
}
