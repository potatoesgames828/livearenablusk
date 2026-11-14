import type { RawSourceEvent } from './normalize';

interface Bucket {
  count: number;
  total?: number;
  contributors: Map<string, { id: string; username?: string; count: number }>;
}

/**
 * Agrega curtidas em janelas (padrão 1s) antes de enviá-las à fila, evitando
 * transformar cada curtida em uma tarefa. Usado pelos conectores e simulador.
 */
export class LikeAggregator {
  private bucket: Bucket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private seq = 0;

  constructor(
    private readonly flush: (event: RawSourceEvent) => void,
    private readonly windowMs = 1000,
    private readonly source: RawSourceEvent['source'] = 'tiktok',
    private readonly simulated = false,
    private readonly maxContributors = 20,
  ) {}

  add(likes: number, user?: { id?: string; username?: string }, total?: number): void {
    if (!Number.isFinite(likes) || likes <= 0) return;
    const b: Bucket = (this.bucket ??= { count: 0, contributors: new Map() });
    b.count += Math.floor(likes);
    if (typeof total === 'number') b.total = Math.max(b.total ?? 0, total);
    if (user?.id) {
      const c = b.contributors.get(user.id) ?? { id: user.id, username: user.username, count: 0 };
      c.count += Math.floor(likes);
      b.contributors.set(user.id, c);
    }
    if (!this.timer) {
      this.timer = setTimeout(() => this.flushNow(), this.windowMs);
      this.timer.unref?.();
    }
  }

  flushNow(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const b = this.bucket;
    this.bucket = null;
    if (!b || b.count <= 0) return;
    const contributors = [...b.contributors.values()].sort((a, z) => z.count - a.count).slice(0, this.maxContributors);
    const top = contributors[0];
    this.flush({
      sourceEventId: `likes-${Date.now()}-${this.seq++}`,
      source: this.source,
      type: 'LIKE',
      // O "autor" do lote é quem mais curtiu (para ranking); os demais seguem em contributors.
      user: top ? { id: top.id, username: top.username } : undefined,
      payload: { count: b.count, total: b.total, aggregated: true, contributors },
      simulated: this.simulated,
    });
  }

  stop(): void {
    this.flushNow();
  }
}

/** Quantos limiares "a cada N curtidas" foram cruzados entre dois totais. */
export function thresholdsCrossed(previousTotal: number, newTotal: number, every: number): number {
  if (every <= 0 || newTotal <= previousTotal) return 0;
  return Math.floor(newTotal / every) - Math.floor(previousTotal / every);
}
