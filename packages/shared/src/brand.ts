/**
 * Identidade central do produto. Altere aqui (ou via variáveis de ambiente)
 * para renomear a plataforma inteira sem editar telas individualmente.
 */
const env: Record<string, string | undefined> =
  typeof process !== 'undefined' && process.env ? process.env : {};

export const BRAND = {
  name: env.NEXT_PUBLIC_APP_NAME ?? env.APP_NAME ?? 'LIVE ARENA',
  shortName: env.NEXT_PUBLIC_APP_SHORT_NAME ?? 'LiveArena',
  tagline: 'Transforme sua LIVE em um jogo interativo',
  supportEmail: env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'suporte@example.com',
  themeColor: '#0b1020',
  accentColor: '#3b82f6',
} as const;

export type Brand = typeof BRAND;
