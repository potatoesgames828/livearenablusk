import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

// 1 = renovado; 2 = chave tinha sumido (ex.: Redis reiniciado) e foi readquirida; 0 = outro dono.
const RENEW_LUA = `
local v = redis.call("get", KEYS[1])
if v == ARGV[1] then
  redis.call("pexpire", KEYS[1], ARGV[2])
  return 1
elseif not v then
  redis.call("set", KEYS[1], ARGV[1], "PX", ARGV[2])
  return 2
else
  return 0
end`;

const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/**
 * Lease distribuído (lock com expiração e renovação). Garante que apenas um
 * processo controla uma sessão/conector/chave de transmissão por vez. Se o
 * dono morrer, o lease expira e outro processo pode assumir (failover).
 */
export class Lease {
  readonly token: string;
  private timer: NodeJS.Timeout | undefined;
  private lost = false;

  constructor(
    private readonly redis: Redis,
    readonly key: string,
    private readonly ttlMs = 10_000,
    ownerId: string = randomUUID(),
  ) {
    this.token = ownerId;
  }

  async acquire(): Promise<boolean> {
    const ok = await this.redis.set(this.key, this.token, 'PX', this.ttlMs, 'NX');
    return ok === 'OK';
  }

  /**
   * Renova a posse. Se a chave desapareceu (perda de dados do Redis), readquire
   * em vez de assumir que outro processo tomou posse — evita derrubar sessões
   * saudáveis por causa de uma falha de infraestrutura.
   */
  async renew(): Promise<boolean> {
    const r = (await this.redis.eval(RENEW_LUA, 1, this.key, this.token, String(this.ttlMs))) as number;
    return r === 1 || r === 2;
  }

  /** Renova automaticamente; chama onLost se a posse for perdida. */
  keepAlive(onLost: () => void): void {
    this.stopKeepAlive();
    this.timer = setInterval(() => {
      this.renew()
        .then((ok) => {
          if (!ok && !this.lost) {
            this.lost = true;
            this.stopKeepAlive();
            onLost();
          }
        })
        .catch(() => {
          /* Redis indisponível: tentaremos no próximo ciclo; o TTL protege contra split-brain */
        });
    }, Math.floor(this.ttlMs / 3));
    this.timer.unref();
  }

  stopKeepAlive(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async release(): Promise<void> {
    this.stopKeepAlive();
    try {
      await this.redis.eval(RELEASE_LUA, 1, this.key, this.token);
    } catch {
      /* expira sozinho */
    }
  }
}
