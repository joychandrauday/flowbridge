import { describe, it, expect } from 'vitest'
import { redactSecrets, redactToJson } from './redact'

describe('redactSecrets', () => {
  it('masks values under sensitive keys', () => {
    const input = {
      url: 'https://api.resend.com',
      Authorization: 'Bearer abc-123-secret',
      headers: { 'X-Api-Key': 'supersecret', 'Content-Type': 'application/json' },
      body: { apiKey: 'k_123', name: 'jane' },
    }
    const out = redactSecrets(input)
    expect(out.Authorization).toBe('[REDACTED]')
    expect(out['headers']['X-Api-Key']).toBe('[REDACTED]')
    expect(out['body']['apiKey']).toBe('[REDACTED]')
    expect(out['body']['name']).toBe('jane')
    expect(out['headers']['Content-Type']).toBe('application/json')
  })

  it('does not mutate the input object', () => {
    const input = { apiKey: 'secret' }
    const out = redactSecrets(input)
    expect(out.apiKey).toBe('[REDACTED]')
    expect(input.apiKey).toBe('secret')
  })

  it('handles nested arrays and undefined safely', () => {
    const out = redactSecrets({ items: [{ token: 't-1' }, { name: 'ok' }], nope: undefined })
    expect(out.items[0].token).toBe('[REDACTED]')
    expect(out.items[1].name).toBe('ok')
  })

  it('masks configEnc regardless of nesting depth', () => {
    const out = redactSecrets({ run: { step: { input: { configEnc: 'v1:xx:yy:zz' } } } })
    expect(out.run.step.input.configEnc).toBe('[REDACTED]')
  })

  it('redactToJson returns a JSON-safe value', () => {
    const out = redactToJson({ token: 'abc', when: new Date('2024-01-01T00:00:00Z') }) as Record<string, string>
    expect(out.token).toBe('[REDACTED]')
    expect(typeof out.when).toBe('string')
  })

  it('leaves empty objects alone', () => {
    expect(redactSecrets({})).toEqual({})
    expect(redactSecrets([])).toEqual([])
    expect(redactSecrets('plain')).toBe('plain')
  })
})