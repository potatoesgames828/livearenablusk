import jwt from 'jsonwebtoken';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type PlatformRoleName = 'USER' | 'OPERATOR' | 'ADMIN';
export type TenantRoleName = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface AccessClaims {
  sub: string; // userId
  tid: string; // tenantId ativo
  trole: TenantRoleName;
  prole: PlatformRoleName;
  mfa: boolean; // MFA verificado nesta sessão
  typ: 'access';
}

export interface RealtimeClaims {
  sub: string;
  tid: string;
  typ: 'realtime';
}

const ISSUER = 'live-arena';

function secret(name: 'JWT_ACCESS_SECRET' | 'JWT_REALTIME_SECRET'): string {
  const v = process.env[name];
  if (!v || v.length < 32) {
    throw new Error(`${name} ausente ou curto demais (mínimo 32 caracteres).`);
  }
  return v;
}

export function signAccessToken(claims: Omit<AccessClaims, 'typ'>, ttlSeconds = 900): string {
  return jwt.sign({ ...claims, typ: 'access' }, secret('JWT_ACCESS_SECRET'), {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
    issuer: ISSUER,
    audience: 'api',
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  const decoded = jwt.verify(token, secret('JWT_ACCESS_SECRET'), {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: 'api',
  }) as AccessClaims;
  if (decoded.typ !== 'access') throw new Error('tipo de token inválido');
  return decoded;
}

/** Ticket curto para autenticar o WebSocket (não reutiliza o access token). */
export function signRealtimeTicket(claims: Omit<RealtimeClaims, 'typ'>, ttlSeconds = 60): string {
  return jwt.sign({ ...claims, typ: 'realtime' }, secret('JWT_REALTIME_SECRET'), {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
    issuer: ISSUER,
    audience: 'realtime',
  });
}

export function verifyRealtimeTicket(token: string): RealtimeClaims {
  const decoded = jwt.verify(token, secret('JWT_REALTIME_SECRET'), {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: 'realtime',
  }) as RealtimeClaims;
  if (decoded.typ !== 'realtime') throw new Error('tipo de token inválido');
  return decoded;
}

/** Token opaco aleatório (refresh, overlay, reset). Retorna o valor e o hash a armazenar. */
export function generateOpaqueToken(prefix: string, bytes = 32): { token: string; hash: string; prefix: string } {
  const raw = randomBytes(bytes).toString('base64url');
  const token = `${prefix}_${raw}`;
  return { token, hash: sha256(token), prefix: token.slice(0, prefix.length + 7) };
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
