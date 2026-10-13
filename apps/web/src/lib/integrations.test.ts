import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { resolveIntegrations, toPublicIntegration } from './integrations'
import { encryptJson, resetEncryptionKeyCache } from './crypto'

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY

interface IntegrationRow {
  id: string
  type: string
  name: string
  configEnc: string
}

/** Minimal Prisma stand-in: `resolveIntegrations` only calls `integration.findMany`. */
function fakePrisma(rows: IntegrationRow[]): PrismaClient {
  return { integration: { findMany: async () => rows } } as unknown as PrismaClient
}

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64')
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

describe('resolveIntegrations', () => {
  it('decrypts stored config for the engine', async () => {
    const config = { provider: 'resend', apiKey: 'sk_live_123', from: 'a@b.co' }
    const rows: IntegrationRow[] = [
      { id: 'i1', type: 'email', name: 'Primary', configEnc: encryptJson(config) },
    ]

    const resolved = await resolveIntegrations(fakePrisma(rows), 'ws_1')

    expect(resolved).toEqual([{ id: 'i1', type: 'email', name: 'Primary', config }])
  })

  it('still resolves legacy plaintext-JSON config (seed/demo)', async () => {
    const config = { provider: 'log' }
    const rows: IntegrationRow[] = [
      { id: 'i2', type: 'email', name: 'Legacy', configEnc: JSON.stringify(config) },
    ]

    const resolved = await resolveIntegrations(fakePrisma(rows), 'ws_1')
    expect(resolved[0].config).toEqual(config)
  })

  it('degrades to an empty config for malformed ciphertext instead of throwing', async () => {
    const rows: IntegrationRow[] = [
      { id: 'i3', type: 'email', name: 'Broken', configEnc: 'not-encrypted' },
    ]

    const resolved = await resolveIntegrations(fakePrisma(rows), 'ws_1')
    expect(resolved[0].config).toEqual({})
  })

  it('returns an empty list when the workspace has no integrations', async () => {
    expect(await resolveIntegrations(fakePrisma([]), 'ws_1')).toEqual([])
  })
})

describe('toPublicIntegration', () => {
  it('exposes only the configured flag — never the secret config', () => {
    const pub = toPublicIntegration({ id: 'i1', type: 'email', name: 'Primary' })

    expect(pub).toEqual({ id: 'i1', type: 'email', name: 'Primary', configured: true })
    expect(Object.keys(pub)).not.toContain('config')
    expect(Object.keys(pub)).not.toContain('configEnc')
    expect(JSON.stringify(pub)).not.toContain('apiKey')
  })
})
