import { Body, Controller, Get, HttpCode, Module, Post, Req, Res, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  burnPasswordTime, decryptSecret, encryptSecret, generateOpaqueToken, generateTotpSecret, hashPassword,
  passwordPolicyError, permissionsFor, sha256, signAccessToken, signRealtimeTicket, totpUri, verifyPassword, verifyTotp,
} from '@live-arena/security';
import { BRAND, slugify, shortId } from '@live-arena/shared';
import { audit, keys } from '@live-arena/runtime';
import { isUniqueViolation, type User } from '@live-arena/database';
import { Auth, Public, ClientIp, type AuthContext } from '../common/auth';
import { ZodPipe } from '../common/http';
import { Errors } from '../common/errors';
import { Infra } from '../common/infra';
import { env, cookieSecure } from '../common/env';
import { RateLimit } from '../common/rate-limit';
import { Mailer } from '../common/mailer';
import { PlanService } from '../common/plans';

const REFRESH_COOKIE = 'la_rt';
const MAX_ATTEMPTS = 8;
const LOCK_WINDOW_SEC = 15 * 60;

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: z.string().min(1).max(128),
  workspaceName: z.string().trim().min(2).max(80).optional(),
});
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128), mfaCode: z.string().max(10).optional() });
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(128) });
const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const switchTenantSchema = z.object({ tenantId: z.string().min(1).max(64) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(1).max(128) });

@Injectable()
export class AuthService {
  constructor(
    private readonly infra: Infra,
    private readonly mailer: Mailer,
  ) {}

  private attemptsKey(email: string, ip: string): string {
    return keys.loginAttempts(sha256(`${email}|${ip}`).slice(0, 32));
  }

  async assertNotLocked(email: string, ip: string): Promise<void> {
    const [byPair, byEmail] = await Promise.all([
      this.infra.redis.get(this.attemptsKey(email, ip)),
      this.infra.redis.get(keys.loginAttempts(`e:${sha256(email).slice(0, 32)}`)),
    ]).catch(() => [null, null] as const);
    if (Number(byPair ?? 0) >= MAX_ATTEMPTS || Number(byEmail ?? 0) >= MAX_ATTEMPTS * 3) {
      throw Errors.rateLimited('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
    }
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    const k1 = this.attemptsKey(email, ip);
    const k2 = keys.loginAttempts(`e:${sha256(email).slice(0, 32)}`);
    await this.infra.redis.multi().incr(k1).expire(k1, LOCK_WINDOW_SEC).incr(k2).expire(k2, LOCK_WINDOW_SEC).exec().catch(() => undefined);
  }

  async clearFailures(email: string, ip: string): Promise<void> {
    await this.infra.redis.del(this.attemptsKey(email, ip)).catch(() => undefined);
  }

  /** Emite access token + refresh token (rotação por família). */
  async issueTokens(user: User, tenantId: string, mfa: boolean, meta: { ip?: string; ua?: string }, familyId?: string) {
    const membership = await this.infra.prisma.membership.findUnique({ where: { userId_tenantId: { userId: user.id, tenantId } } });
    if (!membership) throw Errors.forbidden();
    const accessToken = signAccessToken(
      { sub: user.id, tid: tenantId, trole: membership.role, prole: user.platformRole, mfa },
      env().ACCESS_TOKEN_TTL,
    );
    const refresh = generateOpaqueToken('rt', 48);
    await this.infra.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tenantId,
        tokenHash: refresh.hash,
        familyId: familyId ?? randomUUID(),
        expiresAt: new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86400_000),
        ip: meta.ip,
        userAgent: meta.ua?.slice(0, 300),
      },
    });
    return { accessToken, refreshToken: refresh.token, expiresIn: env().ACCESS_TOKEN_TTL, mfaVerified: mfa };
  }

  async profile(userId: string, tenantId: string) {
    const user = await this.infra.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: { include: { tenant: { select: { id: true, name: true, slug: true, planCode: true } } } } },
    });
    const current = user.memberships.find((m) => m.tenantId === tenantId);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      mfaEnabled: user.mfaEnabled,
      tenant: current ? { ...current.tenant, role: current.role } : null,
      tenants: user.memberships.map((m) => ({ ...m.tenant, role: m.role })),
      permissions: current ? [...permissionsFor(current.role, user.platformRole)] : [],
    };
  }
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: env().REFRESH_TOKEN_TTL_DAYS * 86400_000,
  });
}
function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth', httpOnly: true, secure: cookieSecure(), sameSite: 'strict' });
}

/** Proteção CSRF para rotas que usam cookie: exige cabeçalho customizado (não enviado por formulários de terceiros). */
function assertCsrfHeader(req: Request): void {
  if (req.headers['x-requested-with'] !== 'live-arena') throw Errors.forbidden('Requisição inválida.');
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly infra: Infra,
    private readonly svc: AuthService,
    private readonly mailer: Mailer,
    private readonly plans: PlanService,
  ) {}

  @Public()
  @Post('register')
  @RateLimit({ limit: 5, windowSec: 600 })
  async register(@Body(new ZodPipe(registerSchema)) body: z.infer<typeof registerSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response, @ClientIp() ip: string) {
    if (env().SIGNUP_ENABLED !== 'true') throw Errors.forbidden('Cadastro desativado.');
    const policy = passwordPolicyError(body.password);
    if (policy) throw Errors.validation([{ path: 'password', message: policy }], policy);
    const passwordHash = await hashPassword(body.password);
    const workspace = body.workspaceName ?? `Espaço de ${body.name.split(' ')[0]}`;
    try {
      const { user, tenant } = await this.infra.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email: body.email, name: body.name, passwordHash } });
        const tenant = await tx.tenant.create({
          data: { name: workspace, slug: `${slugify(workspace) || 'espaco'}-${shortId(6)}`, planCode: 'free' },
        });
        await tx.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: 'OWNER' } });
        await tx.leaderboard.create({ data: { tenantId: tenant.id } });
        return { user, tenant };
      });
      await audit({ tenantId: tenant.id, actorId: user.id, action: 'auth.register', ip });
      const tokens = await this.svc.issueTokens(user, tenant.id, false, { ip, ua: req.headers['user-agent'] });
      setRefreshCookie(res, tokens.refreshToken);
      return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: await this.svc.profile(user.id, tenant.id) };
    } catch (err) {
      if (isUniqueViolation(err)) throw Errors.conflict('AUTH_EMAIL_TAKEN');
      throw err;
    }
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowSec: 60 })
  async login(@Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response, @ClientIp() ip: string) {
    await this.svc.assertNotLocked(body.email, ip);
    const user = await this.infra.prisma.user.findUnique({ where: { email: body.email }, include: { memberships: { orderBy: { createdAt: 'asc' } } } });
    if (!user) {
      await burnPasswordTime(body.password);
      await this.svc.recordFailure(body.email, ip);
      throw Errors.unauthorized('AUTH_INVALID_CREDENTIALS');
    }
    const ok = await verifyPassword(user.passwordHash, body.password);
    if (!ok) {
      await this.svc.recordFailure(body.email, ip);
      await audit({ actorId: user.id, action: 'auth.login_failed', ip });
      throw Errors.unauthorized('AUTH_INVALID_CREDENTIALS');
    }
    if (user.status !== 'ACTIVE') throw Errors.unauthorized('AUTH_SUSPENDED');
    let mfa = false;
    if (user.mfaEnabled && user.mfaSecretEnc) {
      if (!body.mfaCode) return { mfaRequired: true };
      if (!verifyTotp(decryptSecret(user.mfaSecretEnc), body.mfaCode)) {
        await this.svc.recordFailure(body.email, ip);
        throw Errors.unauthorized('AUTH_MFA_INVALID');
      }
      mfa = true;
    }
    const tenantId = user.memberships[0]?.tenantId;
    if (!tenantId) throw Errors.forbidden('Conta sem espaço de trabalho.');
    await this.svc.clearFailures(body.email, ip);
    await this.infra.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ tenantId, actorId: user.id, action: 'auth.login', ip });
    const tokens = await this.svc.issueTokens(user, tenantId, mfa, { ip, ua: req.headers['user-agent'] });
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: await this.svc.profile(user.id, tenantId) };
  }

  /** Rotação de refresh token. Reuso de token já rotacionado revoga toda a família (detecção de roubo). */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowSec: 60 })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response, @ClientIp() ip: string) {
    assertCsrfHeader(req);
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!token) throw Errors.unauthorized();
    const record = await this.infra.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!record) {
      clearRefreshCookie(res);
      throw Errors.unauthorized();
    }
    if (record.revokedAt) {
      await this.infra.prisma.refreshToken.updateMany({ where: { familyId: record.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit({ tenantId: record.tenantId, actorId: record.userId, action: 'auth.refresh_reuse_detected', ip });
      clearRefreshCookie(res);
      throw Errors.unauthorized();
    }
    if (record.expiresAt < new Date() || record.user.status !== 'ACTIVE') {
      clearRefreshCookie(res);
      throw Errors.unauthorized();
    }
    const membership = await this.infra.prisma.membership.findUnique({ where: { userId_tenantId: { userId: record.userId, tenantId: record.tenantId } } });
    if (!membership) throw Errors.unauthorized();
    // MFA permanece válido apenas para quem tem MFA ativo (o login exigiu o código).
    const tokens = await this.svc.issueTokens(record.user, record.tenantId, record.user.mfaEnabled, { ip, ua: req.headers['user-agent'] }, record.familyId);
    const newRecord = await this.infra.prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(tokens.refreshToken) } });
    await this.infra.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date(), replacedById: newRecord.id } });
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: await this.svc.profile(record.userId, record.tenantId) };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertCsrfHeader(req);
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (token) {
      const rec = await this.infra.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
      if (rec) await this.infra.prisma.refreshToken.updateMany({ where: { familyId: rec.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    clearRefreshCookie(res);
    return { ok: true };
  }

  @Get('me')
  async me(@Auth() auth: AuthContext) {
    const [profile, plan] = await Promise.all([this.svc.profile(auth.userId, auth.tenantId), this.plans.limits(auth.tenantId)]);
    return { ...profile, plan, mfaVerified: auth.mfa };
  }

  @Post('switch-tenant')
  @HttpCode(200)
  async switchTenant(@Auth() auth: AuthContext, @Body(new ZodPipe(switchTenantSchema)) body: z.infer<typeof switchTenantSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response, @ClientIp() ip: string) {
    const user = await this.infra.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    const tokens = await this.svc.issueTokens(user, body.tenantId, auth.mfa, { ip, ua: req.headers['user-agent'] });
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: await this.svc.profile(user.id, body.tenantId) };
  }

  /** Ticket de curta duração para autenticar o WebSocket do painel. */
  @Post('realtime-ticket')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowSec: 60, by: 'user' })
  ticket(@Auth() auth: AuthContext) {
    return { ticket: signRealtimeTicket({ sub: auth.userId, tid: auth.tenantId }), url: env().PUBLIC_REALTIME_URL };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @RateLimit({ limit: 5, windowSec: 900 })
  async forgot(@Body(new ZodPipe(forgotSchema)) body: z.infer<typeof forgotSchema>, @ClientIp() ip: string) {
    const user = await this.infra.prisma.user.findUnique({ where: { email: body.email } });
    if (user && user.status === 'ACTIVE') {
      const t = generateOpaqueToken('pr', 32);
      await this.infra.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: t.hash, expiresAt: new Date(Date.now() + 30 * 60_000) } });
      const link = `${env().PUBLIC_WEB_URL}/redefinir-senha?token=${encodeURIComponent(t.token)}`;
      await this.mailer.send(user.email, `${BRAND.name}: redefinição de senha`, `Olá, ${user.name}!\n\nPara criar uma nova senha, acesse (válido por 30 minutos):\n${link}\n\nSe não foi você, ignore este e-mail.`);
      await audit({ actorId: user.id, action: 'auth.password_reset_requested', ip });
    }
    // Resposta idêntica exista ou não a conta (evita enumeração de e-mails).
    return { ok: true, message: 'Se o e-mail estiver cadastrado, enviaremos as instruções.' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 900 })
  async reset(@Body(new ZodPipe(resetSchema)) body: z.infer<typeof resetSchema>, @ClientIp() ip: string) {
    const policy = passwordPolicyError(body.password);
    if (policy) throw Errors.validation([{ path: 'password', message: policy }], policy);
    const rec = await this.infra.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) throw Errors.validation(undefined, 'Link inválido ou expirado. Solicite um novo.');
    const passwordHash = await hashPassword(body.password);
    await this.infra.prisma.$transaction([
      this.infra.prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
      this.infra.prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
      this.infra.prisma.refreshToken.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await audit({ actorId: rec.userId, action: 'auth.password_reset', ip });
    return { ok: true };
  }

  @Post('change-password')
  @HttpCode(200)
  @RateLimit({ limit: 5, windowSec: 600, by: 'user' })
  async changePassword(@Auth() auth: AuthContext, @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>, @ClientIp() ip: string) {
    const user = await this.infra.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) throw Errors.unauthorized('AUTH_INVALID_CREDENTIALS', 'Senha atual incorreta.');
    const policy = passwordPolicyError(body.newPassword);
    if (policy) throw Errors.validation([{ path: 'newPassword', message: policy }], policy);
    await this.infra.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
    await audit({ tenantId: auth.tenantId, actorId: user.id, action: 'auth.password_changed', ip });
    return { ok: true };
  }

  // ----- MFA (TOTP) -----
  @Post('mfa/setup')
  @HttpCode(200)
  async mfaSetup(@Auth() auth: AuthContext) {
    const user = await this.infra.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (user.mfaEnabled) throw Errors.conflict('VALIDATION', 'A verificação em duas etapas já está ativa.');
    const secret = generateTotpSecret();
    await this.infra.redis.set(`la:mfa:pending:${user.id}`, encryptSecret(secret), 'EX', 600);
    return { secret, otpauthUrl: totpUri(secret, user.email, BRAND.name) };
  }

  @Post('mfa/enable')
  @HttpCode(200)
  async mfaEnable(@Auth() auth: AuthContext, @Body(new ZodPipe(mfaCodeSchema)) body: z.infer<typeof mfaCodeSchema>, @ClientIp() ip: string) {
    const pending = await this.infra.redis.get(`la:mfa:pending:${auth.userId}`);
    if (!pending) throw Errors.validation(undefined, 'Configuração expirada. Gere um novo código QR.');
    if (!verifyTotp(decryptSecret(pending), body.code)) throw Errors.unauthorized('AUTH_MFA_INVALID');
    await this.infra.prisma.user.update({ where: { id: auth.userId }, data: { mfaEnabled: true, mfaSecretEnc: pending } });
    await this.infra.redis.del(`la:mfa:pending:${auth.userId}`);
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'auth.mfa_enabled', ip });
    return { ok: true };
  }

  @Post('mfa/disable')
  @HttpCode(200)
  async mfaDisable(@Auth() auth: AuthContext, @Body(new ZodPipe(mfaCodeSchema)) body: z.infer<typeof mfaCodeSchema>, @ClientIp() ip: string) {
    const user = await this.infra.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.mfaEnabled || !user.mfaSecretEnc) return { ok: true };
    if (!verifyTotp(decryptSecret(user.mfaSecretEnc), body.code)) throw Errors.unauthorized('AUTH_MFA_INVALID');
    await this.infra.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecretEnc: null } });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'auth.mfa_disabled', ip });
    return { ok: true };
  }

  /** Caixa de saída de desenvolvimento (somente fora de produção). */
  @Public()
  @Get('dev-outbox')
  async outbox() {
    if (env().NODE_ENV === 'production') throw Errors.notFound();
    const items = await this.infra.redis.lrange('la:dev:outbox', 0, 9);
    return items.map((i) => JSON.parse(i) as unknown);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService, Mailer, PlanService], exports: [AuthService, PlanService] })
export class AuthModule {}
