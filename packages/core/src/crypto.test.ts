import { describe, it, expect } from 'vitest'
import {
  deriveEncryptionKey,
  encryptSecretWithKey,
  decryptSecretWithKey,
  encryptJsonWithKey,
  decryptJsonWithKey,
  isEncryptedPayload,
} from './crypto'

const KEY = Buffer.alloc(32, 7)

describe('crypto secret box (pure)', () => {
  it('round-trips a plaintext secret', () => {
    const secret = 'resend-api-key-1234567890'
    const encrypted = encryptSecretWithKey(secret, KEY)
    expect(encrypted).not.toContain(secret)
    expect(isEncryptedPayload(encrypted)).toBe(true)
    expect(decryptSecretWithKey(encrypted, KEY)).toBe(secret)
  })

  it('produces a unique iv per encryption', () => {
    const a = encryptSecretWithKey('same', KEY)
    const b = encryptSecretWithKey('same', KEY)
    expect(a).not.toBe(b)
    expect(decryptSecretWithKey(a, KEY)).toBe('same')
    expect(decryptSecretWithKey(b, KEY)).toBe('same')
  })

  it('round-trips JSON config', () => {
    const config = { provider: 'resend', apiKey: 'abc', from: 'a@b.co' }
    const encrypted = encryptJsonWithKey(config, KEY)
    expect(decryptJsonWithKey(encrypted, KEY)).toEqual(config)
  })

  it('rejects tampered ciphertext (auth tag failure)', () => {
    const encrypted = encryptSecretWithKey('sensitive', KEY)
    const [v, iv, tag, data] = encrypted.split(':')
    const tamperedData = Buffer.from(data, 'base64')
    tamperedData[0] ^= 0xff
    const tampered = [v, iv, tag, tamperedData.toString('base64')].join(':')
    expect(() => decryptSecretWithKey(tampered, KEY)).toThrow()
  })

  it('rejects a payload encrypted with a different key', () => {
    const encrypted = encryptSecretWithKey('sensitive', KEY)
    const otherKey = Buffer.alloc(32, 9)
    expect(() => decryptSecretWithKey(encrypted, otherKey)).toThrow()
  })

  it('rejects malformed payloads', () => {
    expect(() => decryptSecretWithKey('not-encrypted', KEY)).toThrow('Invalid encrypted payload format')
    expect(() => decryptSecretWithKey('v1:aa:bb:cc:dd', KEY)).toThrow('Invalid encrypted payload format')
  })

  it('derives a 32-byte key from hex and passphrase forms', () => {
    const b64 = Buffer.alloc(32, 1).toString('base64')
    expect(deriveEncryptionKey(b64).length).toBe(32)
    const hex = Buffer.alloc(32, 2).toString('hex')
    expect(deriveEncryptionKey(hex).length).toBe(32)
    const pass = deriveEncryptionKey('a-random-passphrase')
    expect(pass.length).toBe(32)
    // Same passphrase => same key; different => different
    expect(deriveEncryptionKey('a-random-passphrase').equals(pass)).toBe(true)
    expect(deriveEncryptionKey('other-passphrase').equals(pass)).toBe(false)
  })

  it('rejects invalid keys', () => {
    expect(() => encryptSecretWithKey('x', Buffer.alloc(16))).toThrow()
    expect(() => deriveEncryptionKey('')).toThrow()
  })
})