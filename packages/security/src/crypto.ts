import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * Criptografia de dados sensíveis em repouso (chaves RTMP, API keys, segredos MFA)
 * com AES-256-GCM. Formato: v1:<keyId>:<iv>:<tag>:<ciphertext> (base64url).
 *
 * Rotação: defina ENCRYPTION_KEYS="id1:base64key,id2:base64key" — a primeira
 * chave cifra; todas podem decifrar. Re-cifre registros com scripts/rotate-keys.
 */
interface KeyEntry {
  id: string;
  key: Buffer;
}

function loadKeys(): KeyEntry[] {
  const raw = process.env.ENCRYPTION_KEYS ?? (process.env.ENCRYPTION_KEY ? `k1:${process.env.ENCRYPTION_KEY}` : '');
  const entries = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(':');
      const id = pair.slice(0, idx);
      const b64 = pair.slice(idx + 1);
      const key = Buffer.from(b64, 'base64');
      if (!id || key.length !== 32) throw new Error('ENCRYPTION_KEYS inválida: cada chave deve ter 32 bytes em base64.');
      return { id, key };
    });
  if (entries.length === 0) throw new Error('ENCRYPTION_KEYS não configurada.');
  return entries;
}

export function encryptSecret(plain: string): string {
  const [active] = loadKeys();
  if (!active) throw new Error('sem chave ativa');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', active.key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', active.id, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join(':');
}

export function decryptSecret(payload: string): string {
  const [v, keyId, ivB64, tagB64, ctB64] = payload.split(':');
  if (v !== 'v1' || !keyId || !ivB64 || !tagB64 || ctB64 === undefined) throw new Error('formato cifrado inválido');
  const entry = loadKeys().find((k) => k.id === keyId);
  if (!entry) throw new Error(`chave ${keyId} indisponível`);
  const decipher = createDecipheriv('aes-256-gcm', entry.key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
}

/** Hash estável (com pepper) para detectar reutilização de chave RTMP sem guardá-la em claro. */
export function fingerprintSecret(plain: string): string {
  const pepper = process.env.SECRET_PEPPER ?? 'live-arena';
  return createHash('sha256').update(`${pepper}:${plain}`).digest('hex');
}

/** Mostra apenas o final do segredo (ex.: "••••a1b2"). */
export function maskSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  return `••••${plain.slice(-4)}`;
}
