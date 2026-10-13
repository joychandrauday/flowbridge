import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@flowbridge/db'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { verifySignature } from '@flowbridge/core'
import { JobQueue } from '@/lib/queue'
import { createRunsForLeadEvent, drainNow } from '@/lib/engine'

/**
 * Generic webhook intake (SPEC.md §2, §9): POST /api/webhooks/:workspaceKey/:source
 *
 * - The workspace is resolved by slug; a missing workspace is a 404.
 * - If the workspace has a `webhookSecret`, `X-FlowBridge-Signature` is
 *   REQUIRED and verified over the raw body BEFORE it is parsed (SPEC §3).
 * - The event + lead + runs + jobs are committed in one transaction, then 202.
 */

const MAX_BODY_BYTES = 100_000
const RATE_LIMIT_MAX = 120
const RATE_LIMIT_WINDOW_MS = 60_000

const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  entry.count += 1
  return entry.count <= RATE_LIMIT_MAX
}

/** Permissive payload schema — unknown keys flow through into the lead's `data`. */
const WebhookPayloadSchema = z
  .object({
    name: z.string().max(200).optional(),
    first_name: z.string().max(100).optional(),
    last_name: z.string().max(100).optional(),
    email: z.string().email().max(320).optional(),
    phone: z.string().max(40).optional(),
    message: z.string().max(5000).optional(),
  })
  .passthrough()

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceKey: string; source: string } }
) {
  const { workspaceKey, source } = params
  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent') ?? null

  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceKey } })
  if (!workspace) {
    return NextResponse.json({ error: 'Unknown workspace' }, { status: 404 })
  }

  if (!checkRateLimit(`webhook:${workspace.id}:${ip}`)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // Read the raw body first — never parse before verifying the signature.
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Could not read body' }, { status: 400 })
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  if (workspace.webhookSecret) {
    const signature = request.headers.get('x-flowbridge-signature')
    if (!verifySignature(rawBody, signature, workspace.webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let json: unknown
  try {
    json = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })
  }

  const parsed = WebhookPayloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const payload = parsed.data as Record<string, unknown>
  const combinedName = [asString(payload.first_name), asString(payload.last_name)]
    .filter(Boolean)
    .join(' ')
  const name = asString(payload.name) || combinedName || 'Unknown'
  const email = asString(payload.email)
  const phone = asString(payload.phone)
  const leadSource = source || 'webhook'

  const queue = new JobQueue(prisma, `worker-webhook-${Date.now()}`)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const intakeEvent = await tx.intakeEvent.create({
        data: {
          workspaceId: workspace.id,
          source: leadSource,
          payload: payload as Prisma.InputJsonValue,
          ip,
          userAgent,
        },
      })

      const lead = await tx.lead.create({
        data: {
          workspaceId: workspace.id,
          name,
          email,
          phone,
          source: leadSource,
          status: 'NEW',
          data: payload as Prisma.InputJsonValue,
        },
      })

      await tx.intakeEvent.update({
        where: { id: intakeEvent.id },
        data: { leadId: lead.id },
      })

      const runIds = await createRunsForLeadEvent(tx, queue, {
        workspaceId: workspace.id,
        leadId: lead.id,
        eventId: intakeEvent.id,
      })

      return { lead, runIds }
    })

    drainNow(prisma, new JobQueue(prisma, `worker-drain-${Date.now()}`))

    return NextResponse.json({ success: true, leadId: result.lead.id }, { status: 202 })
  } catch (error) {
    // Unique email collision → treat as a deduplicated event, not a failure.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: true, duplicate: true }, { status: 200 })
    }
    console.error('Webhook intake error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
