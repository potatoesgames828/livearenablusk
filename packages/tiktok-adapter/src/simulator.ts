import { LikeAggregator, type RawSourceEvent } from '@live-arena/event-engine';
import type { AdapterHandlers, ConnectTarget, TikTokConnectorAdapter } from './adapter';

export const DEMO_VIEWERS = [
  'ana_gamer', 'bruno.live', 'carla_play', 'davi_123', 'eduarda', 'felipe.tt', 'gabi_star', 'hugo_dev',
  'isa.moon', 'joao_pro', 'kaua_br', 'lara.fx', 'mateus_x', 'nina_cat', 'otavio', 'paula.art',
];
export const DEMO_GIFTS = [
  { giftId: '5655', giftName: 'Rose', diamondValue: 1 },
  { giftId: '5269', giftName: 'TikTok', diamondValue: 1 },
  { giftId: '6064', giftName: 'GG', diamondValue: 1 },
  { giftId: '5879', giftName: 'Donut', diamondValue: 30 },
  { giftId: '6267', giftName: 'Corgi', diamondValue: 299 },
  { giftId: '5585', giftName: 'Universe', diamondValue: 34999 },
];
export const DEMO_COMMANDS = ['!join', '!correr', '!vermelho', '!azul', '!esquerda', '!direita', '!meio', '!cima', '!baixo', '!congelar', '!curar', 'que jogo legal!', 'boa!!', 'vamos!'];

export interface DemoLoad {
  /** eventos de chat por segundo */
  chatPerSec: number;
  likesPerSec: number;
  giftsPerMin: number;
  followsPerMin: number;
}

/**
 * Adaptador de simulação. Não se conecta a nada externo: quando o "modo
 * demonstração automático" está ligado, gera eventos fictícios — sempre
 * marcados como simulados — para manter o jogo vivo em testes e vitrines.
 */
export class SimulatorAdapter implements TikTokConnectorAdapter {
  readonly provider = 'SIMULATOR' as const;
  private timer: NodeJS.Timeout | null = null;
  private likes: LikeAggregator | null = null;
  private seq = 0;

  constructor(private readonly load: DemoLoad | null = null) {}

  async connect(_target: ConnectTarget, handlers: AdapterHandlers): Promise<void> {
    handlers.onState('CONNECTED', 'Simulador');
    if (!this.load) return;
    const load = this.load;
    this.likes = new LikeAggregator((e) => handlers.onEvent(e), 1000, 'simulator', true);
    const tickMs = 250;
    this.timer = setInterval(() => {
      const f = tickMs / 1000;
      const rnd = () => DEMO_VIEWERS[Math.floor(Math.random() * DEMO_VIEWERS.length)]!;
      const ev = (e: Omit<RawSourceEvent, 'source' | 'simulated' | 'sourceEventId'>) =>
        handlers.onEvent({ ...e, source: 'simulator', simulated: true, sourceEventId: `demo-${Date.now()}-${this.seq++}` });
      if (Math.random() < load.chatPerSec * f) {
        const u = rnd();
        ev({ type: 'CHAT', user: { id: `demo-${u}`, username: u }, payload: { comment: DEMO_COMMANDS[Math.floor(Math.random() * DEMO_COMMANDS.length)]! } });
      }
      const likeCount = Math.round(load.likesPerSec * f * (0.5 + Math.random()));
      if (likeCount > 0) {
        const u = rnd();
        this.likes?.add(likeCount, { id: `demo-${u}`, username: u });
      }
      if (Math.random() < (load.giftsPerMin / 60) * f) {
        const u = rnd();
        const g = DEMO_GIFTS[Math.random() < 0.85 ? Math.floor(Math.random() * 4) : 4 + Math.floor(Math.random() * 2)]!;
        ev({ type: 'GIFT', user: { id: `demo-${u}`, username: u }, payload: { ...g, repeatCount: 1, repeatEnd: true, streakable: false } });
      }
      if (Math.random() < (load.followsPerMin / 60) * f) {
        const u = rnd();
        ev({ type: 'FOLLOW', user: { id: `demo-${u}`, username: u }, payload: {} });
      }
    }, tickMs);
    this.timer.unref?.();
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.likes?.stop();
    this.likes = null;
  }
}
