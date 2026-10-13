import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  encryptSecret,
  decryptSecret,
  encryptJson,
  decryptJson,
  isEncryptedPayload,
  resetEncryptionKeyCache,
} from './crypto'

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  resetEncryptionKeyCache()
})

afterAll(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ENCRYPTION_KEY
  } else {
    process.env.ENCRYPTION_KEY = ORIGINAL_KEY
  }
  resetEncryptionKeyCache()
})

describe('crypto secret box', () => {
  it('round-trips a plaintext secret', () => {
    const secret = 'resend-api-key-1234567890'
    const encrypted = encryptSecret(secret)
    expect(encrypted).not.toContain(secret)
    expect(isEncryptedPayload(encrypted)).toBe(true)
    expect(decryptSecret(encrypted)).toBe(secret)
  })

  it('produces a unique iv per encryption', () => {
    const a = encryptSecret('same-value')
    const b = encryptSecret('same-value')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('same-value')
    expect(decryptSecret(b)).toBe('same-value')
  })

  it('round-trips JSON config', () => {
    const config = { provider: 'resend', apiKey: 'abc', from: 'a@b.co' }
    const encrypted = encryptJson(config)
    expect(decryptJson(encrypted)).toEqual(config)
  })

  it('rejects tampered ciphertext (auth tag failure)', () => {
    const encrypted = encryptSecret('sensitive')
    const [v, iv, tag, data] = encrypted.split(':')
    const tamperedData = Buffer.from(data, 'base64')
    tamperedData[0] ^= 0xff
    const tampered = [v, iv, tag, tamperedData.toString('base64')].join(':')
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it('rejects a payload signed with a different key', () => {
    const encrypted = encryptSecret('sensitive')
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
    resetEncryptionKeyCache()
    expect(() => decryptSecret(encrypted)).toThrow()
    // restore for other tests
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
    resetEncryptionKeyCache()
  })

  it('rejects malformed payloads', () => {
    expect(() => decryptSecret('not-encrypted')).toThrow('Invalid encrypted payload format')
  })
})
