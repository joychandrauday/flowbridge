import { describe, it, expect } from 'vitest'
import { buildEmailIntegrationConfig } from './email-integration'

describe('buildEmailIntegrationConfig', () => {
  it('falls back to log-only when no SMTP host is configured', () => {
    expect(buildEmailIntegrationConfig({})).toEqual({ provider: 'log' })
  })

  it('builds an smtp config from SMTP_* env (465 → SSL)', () => {
    expect(
      buildEmailIntegrationConfig({
        SMTP_HOST: 'spark.balancedserver.com',
        SMTP_PORT: '465',
        SMTP_USER: 'hello@g2gdigital.com',
        SMTP_PASSWORD: 'secret',
        SMTP_FROM: 'FlowBridge <hello@g2gdigital.com>',
      })
    ).toEqual({
      provider: 'smtp',
      host: 'spark.balancedserver.com',
      port: 465,
      secure: true,
      user: 'hello@g2gdigital.com',
      password: 'secret',
      from: 'FlowBridge <hello@g2gdigital.com>',
    })
  })

  it('derives secure=false for non-465 ports', () => {
    const config = buildEmailIntegrationConfig({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587' })
    expect(config.provider).toBe('smtp')
    expect(config.port).toBe(587)
    expect(config.secure).toBe(false)
  })

  it('honours an explicit SMTP_SECURE override', () => {
    expect(
      buildEmailIntegrationConfig({ SMTP_HOST: 'h', SMTP_PORT: '587', SMTP_SECURE: 'true' }).secure
    ).toBe(true)
    expect(
      buildEmailIntegrationConfig({ SMTP_HOST: 'h', SMTP_PORT: '465', SMTP_SECURE: 'false' }).secure
    ).toBe(false)
  })

  it('supports an explicit resend provider override', () => {
    expect(
      buildEmailIntegrationConfig({ SMTP_PROVIDER: 'resend', RESEND_API_KEY: 'rk', SMTP_FROM: 'a@b.c' })
    ).toEqual({ provider: 'resend', apiKey: 'rk', from: 'a@b.c' })
  })

  it('ignores a non-numeric or blank port and trims values', () => {
    expect(buildEmailIntegrationConfig({ SMTP_HOST: ' h ', SMTP_PORT: 'nope' })).toMatchObject({
      provider: 'smtp',
      host: 'h',
      port: undefined,
    })
    expect(buildEmailIntegrationConfig({ SMTP_HOST: 'h', SMTP_PORT: '  ' }).port).toBeUndefined()
  })
})
