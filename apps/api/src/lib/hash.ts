import crypto from 'node:crypto';

/**
 * SHA-256 for long random secrets such as refresh tokens and API keys.
 *
 * A fast hash is safe here, unlike for passwords, because these values have 256 bits of
 * randomness: there is nothing to guess. A fast, deterministic hash also lets us look the value
 * up directly by an indexed column.
 */
export function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** A URL-safe random secret, 32 bytes (256 bits) by default. */
export function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}
