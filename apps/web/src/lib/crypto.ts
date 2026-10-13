import {
  deriveEncryptionKey,
  encryptSecretWithKey,
  decryptSecretWithKey,
  encryptJsonWithKey,
  decryptJsonWithKey,
  isEncryptedPayload as isEncryptedPayloadCore,
} from '@flowbridge/core'

/**
 * Env-backed AES-256-GCM secret box for the web app.
 * Reads ENCRYPTION_KEY (32-byte base64, 64-char hex, or any passphrase).
 * Pure primitives live in packages/core.
 */

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) {
    throw new Error('ENCRYPTION_KEY is not set — refusing to handle secrets in plaintext')
  }
  cachedKey = deriveEncryptionKey(secret)
  return cachedKey
}

/** Test seam: reset the memoized key after mutating env. */
export function resetEncryptionKeyCache(): void {
  cachedKey = null
}

export function encryptSecret(plaintext: string): string {
  return encryptSecretWithKey(plaintext, getKey())
}

export function decryptSecret(payload: string): string {
  return decryptSecretWithKey(payload, getKey())
}

export function isEncryptedPayload(value: unknown): value is string {
  return isEncryptedPayloadCore(value)
}

export function encryptJson(value: unknown): string {
  return encryptJsonWithKey(value, getKey())
}

export function decryptJson<T = Record<string, unknown>>(payload: string): T {
  return decryptJsonWithKey<T>(payload, getKey())
}