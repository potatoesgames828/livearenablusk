import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REALTIME_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  ENCRYPTION_KEYS: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  /** Origens permitidas (CORS), separadas por vírgula. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  /** URL pública do app web (links de overlay e e-mails). */
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
  /** URL pública do serviço realtime (Socket.IO). */
  PUBLIC_REALTIME_URL: z.string().default('http://localhost:4001'),
  ADMIN_MFA_REQUIRED: z.enum(['true', 'false']).default('false'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  METRICS_TOKEN: z.string().optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('LIVE ARENA <no-reply@example.com>'),
  /** Permite cadastro aberto. */
  SIGNUP_ENABLED: z.enum(['true', 'false']).default('true'),
  /** Habilita a injeção de falhas do simulador (apenas sessões demo). */
  FAULT_INJECTION_ENABLED: z.enum(['true', 'false']).default('true'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida:\n${msg}`);
  }
  if (!parsed.data.ENCRYPTION_KEYS && !parsed.data.ENCRYPTION_KEY) {
    throw new Error('Configuração inválida: defina ENCRYPTION_KEYS (ver .env.example).');
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === 'production';
export const cookieSecure = () => (env().COOKIE_SECURE ? env().COOKIE_SECURE === 'true' : isProd());
