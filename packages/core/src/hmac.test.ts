import { describe, expect, it } from 'vitest'
import { normalizeSignature, safeCompare, signPayload, verifySignature } from './hmac'

const SECRET = 'whsec_test_do_not_use'
const BODY = JSON.stringify({ name: 'Jane', email: 'jane@acme.com' })

describe('signPayload', () => {
  it('produces a stable hex digest', () => {
    const digest = signPayload(BODY, SECRET)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(signPayload(BODY, SECRET)).toBe(digest)
  })

  it('changes when the body changes', () => {
    expect(signPayload(BODY, SECRET)).not.toBe(signPayload(`${BODY} `, SECRET))
  })

  it('changes when the secret changes', () => {
    expect(signPayload(BODY, SECRET)).not.toBe(signPayload(BODY, `${SECRET}x`))
  })
})

describe('normalizeSignature', () => {
  it('strips the sha256= prefix and lowercases', () => {
    expect(normalizeSignature('sha256=ABCDEF')).toBe('abcdef')
    expect(normalizeSignature('  ABCDEF  ')).toBe('abcdef')
  })
})

describe('safeCompare', () => {
  it('is true for equal strings and false otherwise', () => {
    expect(safeCompare('abc', 'abc')).toBe(true)
    expect(safeCompare('abc', 'abd')).toBe(false)
  })

  it('returns false (without throwing) on length mismatch', () => {
    expect(safeCompare('abc', 'abcd')).toBe(false)
  })
})

describe('verifySignature', () => {
  it('accepts a correct bare hex signature', () => {
    expect(verifySignature(BODY, signPayload(BODY, SECRET), SECRET)).toBe(true)
  })

  it('accepts a correct sha256= prefixed signature', () => {
    expect(verifySignature(BODY, `sha256=${signPayload(BODY, SECRET)}`, SECRET)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const signature = signPayload(BODY, SECRET)
    expect(verifySignature(`${BODY} `, signature, SECRET)).toBe(false)
  })

  it('rejects a wrong secret', () => {
    expect(verifySignature(BODY, signPayload(BODY, 'other'), SECRET)).toBe(false)
  })

  it('rejects missing signature or secret', () => {
    expect(verifySignature(BODY, null, SECRET)).toBe(false)
    expect(verifySignature(BODY, '', SECRET)).toBe(false)
    expect(verifySignature(BODY, signPayload(BODY, SECRET), '')).toBe(false)
  })
})
