import { authenticator } from 'otplib';

authenticator.options = { window: 1, step: 30, digits: 6 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function totpUri(secret: string, account: string, issuer: string): string {
  return authenticator.keyuri(account, issuer, secret);
}

export function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}

/** Uso exclusivo em testes. */
export function currentTotp(secret: string): string {
  return authenticator.generate(secret);
}
