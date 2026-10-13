import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

/**
 * AES-256-GCM secret box (SPEC.md §3).
 *
 * Pure module: the key is always passed in explicitly so this stays free of
 * environment/IO concerns and is trivially unit-testable.
 *
 * Payload format: `v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>`
 */

const ALGORITHM = 'aes-256-gcm'
export const SECRET_BOX_VERSION = 'v1'
const IV_BYTES = 12 // 96-bit nonce, recommended for GCM
const KEY_BYTES = 32

/**
 * Accepts a 32-byte key as base64, a 64-char hex string, or any other
 * sufficiently random passphrase (hashed with SHA-256 as a fallback).
 */
export function deriveEncryptionKey(secret: string): Buffer {
  if (!secret) throw new Error('Encryption key material is empty')

  const asBase64 = Buffer.from(secret, 'base64')
  if (asBase64.length === KEY_BYTES) return asBase64

  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, 'hex')
  }

  return createHash('sha256').update(secret, 'utf8').digest()
}

export function encryptSecretWithKey(plaintext: string, key: Buffer): string {
  if (typeof plaintext !== 'string') throw new TypeError('encryptSecret expects a string')
  if (key.length !== KEY_BYTES) throw new Error('Encryption key must be 32 bytes')

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [SECRET_BOX_VERSION, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decryptSecretWithKey(payload: string, key: Buffer): string {
  if (typeof payload !== 'string') throw new TypeError('decryptSecret expects a string')
  if (key.length !== KEY_BYTES) throw new Error('Encryption key must be 32 bytes')

  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== SECRET_BOX_VERSION) {
    throw new Error('Invalid encrypted payload format')
  }
  const [, ivB64, tagB64, dataB64] = parts

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}

export function isEncryptedPayload(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(`${SECRET_BOX_VERSION}:`)
}

export function encryptJsonWithKey(value: unknown, key: Buffer): string {
  return encryptSecretWithKey(JSON.stringify(value ?? {}), key)
}

export function decryptJsonWithKey<T = Record<string, unknown>>(payload: string, key: Buffer): T {
  return JSON.parse(decryptSecretWithKey(payload, key)) as T
}
