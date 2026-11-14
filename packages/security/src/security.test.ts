import { describe, expect, it, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, passwordPolicyError } from './password';
import { encryptSecret, decryptSecret, maskSecret } from './crypto';
import { signAccessToken, verifyAccessToken, signRealtimeTicket, verifyRealtimeTicket, generateOpaqueToken, sha256 } from './tokens';
import { can } from './rbac';
import { generateTotpSecret, verifyTotp, currentTotp } from './totp';
import { scrub } from './redact';

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
  process.env.JWT_REALTIME_SECRET = 'b'.repeat(48);
  process.env.ENCRYPTION_KEYS = `k2:${randomBytes(32).toString('base64')},k1:${randomBytes(32).toString('base64')}`;
});

describe('senhas', () => {
  it('argon2id hash e verificação', async () => {
    const h = await hashPassword('SenhaForte123');
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, 'SenhaForte123')).toBe(true);
    expect(await verifyPassword(h, 'errada')).toBe(false);
    expect(await verifyPassword('lixo', 'x')).toBe(false);
  });
  it('política de senha', () => {
    expect(passwordPolicyError('curta1')).not.toBeNull();
    expect(passwordPolicyError('semnumerosaqui')).not.toBeNull();
    expect(passwordPolicyError('boaSenha2026')).toBeNull();
  });
});

describe('criptografia', () => {
  it('cifra e decifra com AES-GCM e detecta adulteração', () => {
    const c = encryptSecret('live_123_chave');
    expect(c.startsWith('v1:k2:')).toBe(true);
    expect(decryptSecret(c)).toBe('live_123_chave');
    const parts = c.split(':');
    parts[4] = Buffer.from('outra coisa').toString('base64url');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });
  it('decifra com chave antiga após rotação', () => {
    const keys = process.env.ENCRYPTION_KEYS!;
    const [k2, k1] = keys.split(',');
    process.env.ENCRYPTION_KEYS = `${k1}`;
    const old = encryptSecret('antigo');
    process.env.ENCRYPTION_KEYS = `${k2},${k1}`;
    expect(decryptSecret(old)).toBe('antigo');
  });
  it('mascara segredos', () => {
    expect(maskSecret('abcdef1234')).toBe('••••1234');
  });
});

describe('tokens', () => {
  it('access token com claims e tipo', () => {
    const t = signAccessToken({ sub: 'u', tid: 't', trole: 'OWNER', prole: 'USER', mfa: false });
    const c = verifyAccessToken(t);
    expect(c.sub).toBe('u');
    expect(() => verifyRealtimeTicket(t)).toThrow();
  });
  it('ticket realtime separado', () => {
    const t = signRealtimeTicket({ sub: 'u', tid: 't' });
    expect(verifyRealtimeTicket(t).tid).toBe('t');
    expect(() => verifyAccessToken(t)).toThrow();
  });
  it('token opaco armazena apenas hash', () => {
    const o = generateOpaqueToken('ovl');
    expect(o.token.startsWith('ovl_')).toBe(true);
    expect(o.hash).toBe(sha256(o.token));
    expect(o.hash).not.toContain(o.token);
  });
});

describe('RBAC, MFA e redação', () => {
  it('permissões por papel', () => {
    expect(can('MEMBER', 'USER', 'session:control')).toBe(true);
    expect(can('MEMBER', 'USER', 'stream:manage')).toBe(false);
    expect(can('OWNER', 'USER', 'admin:read')).toBe(false);
    expect(can('MEMBER', 'ADMIN', 'admin:users')).toBe(true);
    expect(can('MEMBER', 'OPERATOR', 'admin:users')).toBe(false);
  });
  it('TOTP', () => {
    const s = generateTotpSecret();
    expect(verifyTotp(s, currentTotp(s))).toBe(true);
    expect(verifyTotp(s, '000000x')).toBe(false);
  });
  it('scrub remove segredos', () => {
    expect(scrub({ a: 1, streamKey: 'x', nested: { password: 'p', ok: true } })).toEqual({ a: 1, streamKey: '[REDACTED]', nested: { password: '[REDACTED]', ok: true } });
  });
});
