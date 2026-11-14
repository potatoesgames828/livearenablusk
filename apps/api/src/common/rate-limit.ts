import { Injectable, type CanActivate, type ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Infra } from './infra';
import { Errors } from './errors';
import type { AuthedRequest } from './auth';

interface RateRule {
  /** requisições permitidas */
  limit: number;
  /** janela em segundos */
  windowSec: number;
  /** escopo: por IP ou por usuário autenticado */
  by?: 'ip' | 'user';
}

const RATE_KEY = 'la:rate';
export const RateLimit = (rule: RateRule) => SetMetadata(RATE_KEY, rule);

const DEFAULT_RULE: RateRule = { limit: 300, windowSec: 60, by: 'ip' };

/**
 * Rate limiting distribuído (Redis, janela fixa). Funciona com múltiplas
 * instâncias da API. Falha "aberta" se o Redis estiver indisponível para não
 * derrubar a plataforma — o login possui proteção adicional própria.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly infra: Infra,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateRule>(RATE_KEY, [ctx.getHandler(), ctx.getClass()]) ?? DEFAULT_RULE;
    const req = ctx.switchToHttp().getRequest<AuthedRequest & Request>();
    const res = ctx.switchToHttp().getResponse<{ setHeader: (k: string, v: string) => void }>();
    const who = rule.by === 'user' && req.auth ? `u:${req.auth.userId}` : `ip:${req.ip ?? 'unknown'}`;
    const route = `${req.method}:${(req.route as { path?: string } | undefined)?.path ?? req.path}`;
    const bucket = Math.floor(Date.now() / 1000 / rule.windowSec);
    const key = `la:rl:${route}:${who}:${bucket}`;
    try {
      const res2 = await this.infra.redis.multi().incr(key).expire(key, rule.windowSec + 1).exec();
      const n = Number(res2?.[0]?.[1] ?? 0);
      res.setHeader('x-ratelimit-limit', String(rule.limit));
      res.setHeader('x-ratelimit-remaining', String(Math.max(0, rule.limit - n)));
      if (n > rule.limit) throw Errors.rateLimited();
    } catch (err) {
      if ((err as { code?: string }).code === 'RATE_LIMITED' || (err as { getStatus?: () => number }).getStatus?.() === 429) throw err;
    }
    return true;
  }
}
