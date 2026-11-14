/**
 * Token bucket em memória para proteger contra tempestades de eventos na
 * origem (conector/simulador) antes de chegarem à fila.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  take(n = 1): boolean {
    const t = this.now();
    const elapsed = (t - this.last) / 1000;
    this.last = t;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  get available(): number {
    return this.tokens;
  }
}
