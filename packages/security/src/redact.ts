/** Caminhos que nunca devem aparecer em logs (usado pelo pino). */
export const REDACT_PATHS = [
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'refreshToken',
  'accessToken',
  'streamKey',
  'apiKey',
  'mfaSecret',
  'mfaSecretEnc',
  'credentialsEnc',
  'streamKeyEnc',
  'authorization',
  'cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.streamKey',
  '*.apiKey',
];

/** Remove recursivamente chaves sensíveis de um objeto antes de persistir em auditoria. */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/pass|token|secret|key|cookie|authorization/i.test(k)) out[k] = '[REDACTED]';
    else out[k] = scrub(v, depth + 1);
  }
  return out;
}
