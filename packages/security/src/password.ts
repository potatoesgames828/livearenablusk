import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id com parâmetros recomendados pela OWASP Password Storage Cheat Sheet
 * (m=19 MiB, t=2, p=1 como mínimo). Usamos m=19456 KiB, t=2, p=1.
 */
const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 /* Argon2id */ } as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    // Hash malformado: tratamos como senha inválida, sem vazar detalhes.
    return false;
  }
}

/** Política mínima: 10+ caracteres, ao menos uma letra e um número. */
export function passwordPolicyError(plain: string): string | null {
  if (plain.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (plain.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  if (!/[a-zA-Z]/.test(plain) || !/[0-9]/.test(plain)) return 'Use letras e números na senha.';
  return null;
}

/** Hash "fantasma" para equalizar o tempo de resposta quando o e-mail não existe. */
let dummyHash: string | undefined;
export async function burnPasswordTime(plain: string): Promise<void> {
  dummyHash ??= await hashPassword('dummy-password-0000');
  await verifyPassword(dummyHash, plain);
}
