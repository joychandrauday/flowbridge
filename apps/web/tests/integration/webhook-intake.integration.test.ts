import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'
import { signPayload } from '@flowbridge/core'

const TEST_DB = process.env.TEST_DATABASE_URL

/**
 * Webhook intake integration test (AGENTS §4): the signature is verified over
 * the RAW body before parsing, and a valid request becomes a lead in one
 * transaction. Runs against a scratch database — see `queue.integration.test.ts`.
 */
describe.skipIf(!TEST_DB)('webhook intake (integration)', () => {
  let prisma: PrismaClient
  let POST: typeof import('../../src/app/api/webhooks/[workspaceKey]/[source]/route').POST
  let workspaceId: string
  const slug = `webhook-${Date.now()}`
  const secret = 'test-webhook-secret'
  const sharedEmail = `grace-${Date.now()}@example.com`

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB
    process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64')

    const db = await import('@flowbridge/db')
    const route = await import('../../src/app/api/webhooks/[workspaceKey]/[source]/route')
    prisma = db.prisma as PrismaClient
    POST = route.POST

    const workspace = await prisma.workspace.create({
      data: { name: 'Webhook Test', slug, webhookSecret: secret },
    })
    workspaceId = workspace.id
  })

  afterAll(async () => {
    if (prisma && workspaceId) {
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined)
    }
  })

  function post(body: string, signature: string) {
    return POST(
      new NextRequest(`http://localhost/api/webhooks/${slug}/stripe`, {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json', 'x-flowbridge-signature': signature },
      }),
      { params: { workspaceKey: slug, source: 'stripe' } }
    )
  }

  it('rejects a payload with an invalid signature (401) and creates nothing', async () => {
    const raw = JSON.stringify({ name: 'Mallory', email: `mallory-${Date.now()}@example.com` })
    const response = await post(raw, 'deadbeef')
    expect(response.status).toBe(401)
  })

  it('accepts a correctly signed payload and creates a scoped lead', async () => {
    const raw = JSON.stringify({ name: 'Grace Hopper', email: sharedEmail })
    const signature = `sha256=${signPayload(raw, secret)}`

    const response = await post(raw, signature)
    expect(response.status).toBe(202)

    const json = (await response.json()) as { success: boolean; leadId: string }
    expect(json.success).toBe(true)

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: json.leadId } })
    expect(lead.workspaceId).toBe(workspaceId)
    expect(lead.name).toBe('Grace Hopper')
    expect(lead.email).toBe(sharedEmail)
    expect(lead.source).toBe('stripe')
  })

  it('deduplicates a repeated email instead of failing (200)', async () => {
    const raw = JSON.stringify({ name: 'Grace Hopper', email: sharedEmail })
    const signature = `sha256=${signPayload(raw, secret)}`

    const response = await post(raw, signature)
    expect(response.status).toBe(200)

    const json = (await response.json()) as { success: boolean; duplicate: boolean }
    expect(json).toEqual({ success: true, duplicate: true })

    expect(await prisma.lead.count({ where: { email: sharedEmail } })).toBe(1)
  })
})
