import type { Redis } from 'ioredis';

/**
 * Estado necessário pelo processamento de eventos. A implementação Redis é
 * usada em produção; a implementação em memória serve para testes unitários.
 */
export interface EventStore {
  /** Marca a chave se ausente. Retorna true se foi marcada agora (primeira vez). */
  setIfAbsent(key: string, ttlMs: number): Promise<boolean>;
  /** Define o valor numérico e retorna o anterior (ou null). */
  getSetNumber(key: string, value: number, ttlMs: number): Promise<number | null>;
  /** Tenta adquirir um cooldown. Retorna true se liberado (e inicia o cooldown). */
  acquireCooldown(key: string, ttlMs: number): Promise<boolean>;
  /** Incrementa um contador com expiração e retorna o novo valor. */
  incrWithTtl(key: string, ttlMs: number): Promise<number>;
  /** Incrementa campos de um hash e retorna os novos valores. */
  hincrby(key: string, fields: Record<string, number>): Promise<Record<string, number>>;
  hset(key: string, fields: Record<string, number | string>): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
}

export class RedisEventStore implements EventStore {
  constructor(private readonly redis: Redis) {}

  async setIfAbsent(key: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(key, '1', 'PX', ttlMs, 'NX')) === 'OK';
  }

  async getSetNumber(key: string, value: number, ttlMs: number): Promise<number | null> {
    const res = await this.redis.multi().getset(key, String(value)).pexpire(key, ttlMs).exec();
    const prev = res?.[0]?.[1] as string | null | undefined;
    return prev == null ? null : Number(prev);
  }

  async acquireCooldown(key: string, ttlMs: number): Promise<boolean> {
    if (ttlMs <= 0) return true;
    return (await this.redis.set(key, '1', 'PX', ttlMs, 'NX')) === 'OK';
  }

  async incrWithTtl(key: string, ttlMs: number): Promise<number> {
    const res = await this.redis.multi().incr(key).pexpire(key, ttlMs).exec();
    return Number(res?.[0]?.[1] ?? 0);
  }

  async hincrby(key: string, fields: Record<string, number>): Promise<Record<string, number>> {
    const entries = Object.entries(fields);
    if (entries.length === 0) return {};
    const multi = this.redis.multi();
    for (const [f, v] of entries) multi.hincrby(key, f, v);
    multi.pexpire(key, 7 * 24 * 3600 * 1000);
    const res = await multi.exec();
    const out: Record<string, number> = {};
    entries.forEach(([f], i) => {
      out[f] = Number(res?.[i]?.[1] ?? 0);
    });
    return out;
  }

  async hset(key: string, fields: Record<string, number | string>): Promise<void> {
    if (Object.keys(fields).length) await this.redis.hset(key, fields);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(key);
  }
}

/** Implementação em memória (testes e modo offline). Respeita TTLs com relógio injetável. */
export class MemoryEventStore implements EventStore {
  private data = new Map<string, { v: string; exp: number }>();
  private hashes = new Map<string, Map<string, string>>();
  constructor(private readonly now: () => number = Date.now) {}

  private get(key: string): string | null {
    const e = this.data.get(key);
    if (!e) return null;
    if (e.exp && e.exp <= this.now()) {
      this.data.delete(key);
      return null;
    }
    return e.v;
  }

  async setIfAbsent(key: string, ttlMs: number): Promise<boolean> {
    if (this.get(key) !== null) return false;
    this.data.set(key, { v: '1', exp: this.now() + ttlMs });
    return true;
  }

  async getSetNumber(key: string, value: number, ttlMs: number): Promise<number | null> {
    const prev = this.get(key);
    this.data.set(key, { v: String(value), exp: this.now() + ttlMs });
    return prev === null ? null : Number(prev);
  }

  async acquireCooldown(key: string, ttlMs: number): Promise<boolean> {
    if (ttlMs <= 0) return true;
    return this.setIfAbsent(key, ttlMs);
  }

  async incrWithTtl(key: string, ttlMs: number): Promise<number> {
    const prev = Number(this.get(key) ?? 0);
    const exp = this.data.get(key)?.exp ?? this.now() + ttlMs;
    this.data.set(key, { v: String(prev + 1), exp });
    return prev + 1;
  }

  async hincrby(key: string, fields: Record<string, number>): Promise<Record<string, number>> {
    const h = this.hashes.get(key) ?? new Map<string, string>();
    this.hashes.set(key, h);
    const out: Record<string, number> = {};
    for (const [f, v] of Object.entries(fields)) {
      const n = Number(h.get(f) ?? 0) + v;
      h.set(f, String(n));
      out[f] = n;
    }
    return out;
  }

  async hset(key: string, fields: Record<string, number | string>): Promise<void> {
    const h = this.hashes.get(key) ?? new Map<string, string>();
    this.hashes.set(key, h);
    for (const [f, v] of Object.entries(fields)) h.set(f, String(v));
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }
}
