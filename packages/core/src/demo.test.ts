import { describe, expect, it } from 'vitest'
import { DEMO_DEFAULTS, isDemoLoginEnabled, resolveDemoAccount } from './demo'

describe('resolveDemoAccount', () => {
  it('falls back to the documented demo defaults', () => {
    expect(resolveDemoAccount()).toEqual({
      email: DEMO_DEFAULTS.email,
      password: DEMO_DEFAULTS.password,
      name: DEMO_DEFAULTS.name,
    })
  })

  it('reads overrides from the environment', () => {
    expect(
      resolveDemoAccount({ DEMO_EMAIL: 'demo@example.com', DEMO_PASSWORD: 'sup3r-secret', DEMO_NAME: 'Acme Demo' })
    ).toEqual({ email: 'demo@example.com', password: 'sup3r-secret', name: 'Acme Demo' })
  })

  it('treats blank overrides as absent so a half-filled env cannot create a login nobody can use', () => {
    const account = resolveDemoAccount({ DEMO_EMAIL: '   ', DEMO_NAME: '' })
    expect(account.email).toBe(DEMO_DEFAULTS.email)
    expect(account.name).toBe(DEMO_DEFAULTS.name)
  })
})

describe('isDemoLoginEnabled', () => {
  it('is on by default', () => {
    expect(isDemoLoginEnabled()).toBe(true)
    expect(isDemoLoginEnabled({})).toBe(true)
  })

  it('is off only for the literal string "false"', () => {
    expect(isDemoLoginEnabled({ DEMO_LOGIN: 'false' })).toBe(false)
    expect(isDemoLoginEnabled({ DEMO_LOGIN: 'FALSE' })).toBe(true)
    expect(isDemoLoginEnabled({ DEMO_LOGIN: 'true' })).toBe(true)
  })
})
