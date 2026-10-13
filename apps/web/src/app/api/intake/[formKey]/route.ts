import { NextRequest, NextResponse } from 'next/server'
import { createIntakeSchema, validateIntakeSubmission, type Form } from '@flowbridge/core'
import { z } from 'zod'
import { prisma } from '@flowbridge/db'
import { Prisma } from '@prisma/client'
import { JobQueue } from '@/lib/queue'
import { createRunsForLeadEvent, drainNow } from '@/lib/engine'

// Rate limiting store (in-memory for now, replace with Vercel KV in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') || 'unknown'
}

function checkRateLimit(
  key: string,
  maxSubmissions: number,
  windowMinutes: number
): { allowed: boolean; resetAt: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMinutes * 60 * 1000 })
    return { allowed: true, resetAt: now + windowMinutes * 60 * 1000 }
  }

  if (entry.count >= maxSubmissions) {
    return { allowed: false, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, resetAt: entry.resetAt }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ formKey: string }> }
) {
  const { formKey } = await params

  try {
    // Get client IP for rate limiting
    const ip = getClientIp(request)
    const userAgent = request.headers.get('user-agent') || undefined

    // Parse form data
    const contentType = request.headers.get('content-type') || ''
    let payload: Record<string, unknown>

    if (contentType.includes('application/json')) {
      payload = await request.json()
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      payload = {}
      for (const [key, value] of formData.entries()) {
        if (payload[key]) {
          if (Array.isArray(payload[key])) {
            ;(payload[key] as string[]).push(value.toString())
          } else {
            payload[key] = [payload[key] as string, value.toString()]
          }
        } else {
          payload[key] = value.toString()
        }
      }
    } else {
      return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 })
    }

    // Get form from database (using global prisma; workspaceId is server-derived, never client-supplied)
    const form = await prisma.form.findUnique({
      where: { key: formKey },
      select: {
        id: true,
        workspaceId: true,
        key: true,
        name: true,
        fields: true,
        settings: true,
        active: true,
      },
    })

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    if (!form.active) {
      return NextResponse.json({ error: 'Form is inactive' }, { status: 403 })
    }

    // Type assertion for form fields and settings
    const typedForm = form as unknown as Form

    // Rate limiting
    if (typedForm.settings.rateLimit.enabled) {
      const rateLimitKey = `intake:${formKey}:${ip}`
      const { allowed, resetAt } = checkRateLimit(
        rateLimitKey,
        typedForm.settings.rateLimit.maxSubmissions,
        typedForm.settings.rateLimit.windowMinutes
      )

      if (!allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
              'X-RateLimit-Reset': String(resetAt),
            },
          }
        )
      }
    }

    // Honeypot check
    const honeypotValue = payload[typedForm.settings.honeypotField] as string | undefined
    if (honeypotValue && honeypotValue.length > 0) {
      // Silently accept but don't process (bot detection)
      return NextResponse.json({ success: true })
    }

    // Validate payload against form schema
    const validation = validateIntakeSubmission(typedForm, payload)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Create IntakeEvent, Lead, WorkflowRuns and Jobs atomically (SPEC §2.1),
    // so no event is ever lost between the write and the queue.
    const queue = new JobQueue(prisma, `worker-intake-${Date.now()}`)

    // Extract lead data from validated payload
    const validatedData = validation.data as Record<string, unknown>
    const leadData = {
      name: (validatedData.name as string) || 'Unknown',
      email: validatedData.email as string | null,
      phone: validatedData.phone as string | null,
      source: 'form',
      status: 'NEW' as const,
      data: validatedData,
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create IntakeEvent
      const intakeEvent = await tx.intakeEvent.create({
        data: {
          workspaceId: form.workspaceId,
          formId: form.id,
          source: 'form',
          payload: validatedData as Prisma.InputJsonValue,
          ip,
          userAgent,
        },
      })

      // Create Lead
      const lead = await tx.lead.create({
        data: {
          workspaceId: form.workspaceId,
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          source: leadData.source,
          status: leadData.status,
          data: leadData.data as Prisma.InputJsonValue,
        },
      })

      // Link intake event to lead
      await tx.intakeEvent.update({
        where: { id: intakeEvent.id },
        data: { leadId: lead.id },
      })

      // Enqueue matching `lead.created` workflows in the same transaction
      const runIds = await createRunsForLeadEvent(tx, queue, {
        workspaceId: form.workspaceId,
        leadId: lead.id,
        eventId: intakeEvent.id,
      })

      return { intakeEvent, lead, runIds }
    })

    // Best-effort immediate drain; the cron tick is the durable fallback.
    drainNow(prisma, new JobQueue(prisma, `worker-drain-${Date.now()}`))

    // Return 202 Accepted - intake accepted, processing async
    return NextResponse.json(
      {
        success: true,
        message: typedForm.settings.successMessage,
        leadId: result.lead.id,
      },
      { status: 202 }
    )
  } catch (error) {
    console.error('Intake error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', issues: error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}