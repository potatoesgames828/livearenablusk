/**
 * Circuit breaker: após `threshold` falhas consecutivas, o circuito abre e
 * bloqueia novas tentativas por `cooldownMs`, protegendo o serviço externo
 * (e nossa reputação/limites junto a ele) de tempestades de reconexão.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 120_000,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): 'closed' | 'open' | 'half-open' {
    if (this.openedAt === null) return 'closed';
    return this.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open';
  }

  canAttempt(): boolean {
    return this.state !== 'open';
  }

  success(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  failure(): void {
    this.failures++;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }

  /** ms até poder tentar de novo (0 se liberado). */
  retryInMs(): number {
    if (this.openedAt === null) return 0;
    return Math.max(0, this.cooldownMs - (this.now() - this.openedAt));
  }
}
