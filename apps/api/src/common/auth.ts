import {
  createParamDecorator,
  SetMetadata,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { can, verifyAccessToken, type AccessClaims, type Permission } from '@live-arena/security';
import { Errors } from './errors';
import { env } from './env';
import { Infra } from './infra';

export interface AuthContext {
  userId: string;
  tenantId: string;
  tenantRole: AccessClaims['trole'];
  platformRole: AccessClaims['prole'];
  mfa: boolean;
}

export type AuthedRequest = Request & { auth?: AuthContext; requestId?: string };

const PUBLIC_KEY = 'la:public';
const PERM_KEY = 'la:perm';

/** Marca a rota como pública (sem autenticação). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Exige uma permissão RBAC. */
export const RequirePerm = (perm: Permission) => SetMetadata(PERM_KEY, perm);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.auth) throw Errors.unauthorized();
  return req.auth;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
});

/**
 * Guarda global: valida o access token (Bearer), confere se o usuário ainda
 * está ativo e é membro do tenant, e aplica RBAC/MFA quando exigido.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private memberCache = new Map<string, { ok: boolean; at: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly infra: Infra,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw Errors.unauthorized();
    let claims: AccessClaims;
    try {
      claims = verifyAccessToken(header.slice(7));
    } catch {
      throw Errors.unauthorized();
    }
    // Revalidação curta (cache 15s): conta suspensa ou membro removido perde acesso rapidamente.
    const key = `${claims.sub}:${claims.tid}`;
    const cached = this.memberCache.get(key);
    if (!cached || Date.now() - cached.at > 15_000) {
      const m = await this.infra.prisma.membership.findUnique({
        where: { userId_tenantId: { userId: claims.sub, tenantId: claims.tid } },
        include: { user: { select: { status: true } }, tenant: { select: { status: true } } },
      });
      const ok = !!m && m.user.status === 'ACTIVE' && m.tenant.status === 'ACTIVE';
      this.memberCache.set(key, { ok, at: Date.now() });
      if (this.memberCache.size > 10_000) this.memberCache.clear();
      if (!ok) throw Errors.unauthorized('AUTH_SUSPENDED');
    } else if (!cached.ok) {
      throw Errors.unauthorized('AUTH_SUSPENDED');
    }
    req.auth = { userId: claims.sub, tenantId: claims.tid, tenantRole: claims.trole, platformRole: claims.prole, mfa: claims.mfa };

    const perm = this.reflector.getAllAndOverride<Permission | undefined>(PERM_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (perm) {
      if (!can(claims.trole, claims.prole, perm)) throw Errors.forbidden();
      if (perm.startsWith('admin:') && env().ADMIN_MFA_REQUIRED === 'true' && !claims.mfa) {
        throw Errors.forbidden('A área administrativa exige verificação em duas etapas (MFA).');
      }
    }
    return true;
  }
}
