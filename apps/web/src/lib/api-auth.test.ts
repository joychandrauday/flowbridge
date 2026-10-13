import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'

const { findFirst, update } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@flowbridge/db', () => ({
  prisma: { apiKey: { findFirst, update } },
}))

import { authenticateApiKey, hasScope } from './api-auth'

function req(auth?: string): Request {
  return new Request('http://localhost/api/leads', {
    headers: auth ? { authorization: auth } : {},
  })
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

describe('authenticateApiKey', () => {
  beforeEach(() => {
    findFirst.mockReset()
    update.mockReset()
    update.mockResolvedValue({})
  })

  it('ignores requests without a Bearer fb_ token', async () => {
    expect(await authenticateApiKey(req())).toBeNull()
    expect(await authenticateApiKey(req('Basic abc'))).toBeNull()
    expect(await authenticateApiKey(req('Bearer nope'))).toBeNull()
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('returns null for an unknown key', async () => {
    findFirst.mockResolvedValue(null)
    expect(await authenticateApiKey(req('Bearer fb_unknown'))).toBeNull()
  })

  it('returns the scoped identity and bumps lastUsedAt for a valid key', async () => {
    const token = 'fb_validtoken'
    findFirst.mockResolvedValue({
      id: 'key_1',
      keyHash: hash(token),
      workspaceId: 'ws_1',
      userId: 'u_1',
      scopes: ['read:leads'],
      expiresAt: null,
    })

    const auth = await authenticateApiKey(req(`Bearer ${token}`))

    expect(auth).toEqual({
      apiKeyId: 'key_1',
      workspaceId: 'ws_1',
      userId: 'u_1',
      scopes: ['read:leads'],
    })
    expect(update).toHaveBeenCalledOnce()
  })

  it('rejects an expired key without touching lastUsedAt', async () => {
    const token = 'fb_expired'
    findFirst.mockResolvedValue({
      id: 'key_2',
      keyHash: hash(token),
      workspaceId: 'ws_1',
      userId: 'u_1',
      scopes: ['read:leads'],
      expiresAt: new Date(Date.now() - 1000),
    })

    expect(await authenticateApiKey(req(`Bearer ${token}`))).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('hasScope', () => {
  it('checks scope membership', () => {
    const auth = { apiKeyId: 'k', workspaceId: 'w', userId: 'u', scopes: ['read:leads'] }
    expect(hasScope(auth, 'read:leads')).toBe(true)
    expect(hasScope(auth, 'write:workflows')).toBe(false)
  })
})
