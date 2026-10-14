import { Prisma } from '@prisma/client'
import type { JobQueue } from './queue'
import { createRunsForLeadEvent } from './run-dispatch'

/**
 * Lead intake pipeline (SPEC §4.1): "Every intake creates an immutable
 * `IntakeEvent` (raw payload) → creates/updates `Lead` → emits `lead.created`".
 *
 * A repeated submission for an existing lead (same email, or same phone when the
 * email is absent) **updates** that lead and records a new IntakeEvent, instead
 * of either 500-ing on a unique constraint or silently discarding a real
 * submission. Only the first submission for a lead dispatches `lead.created`
 * workflows, so re-submitting a form cannot re-run the pipeline.
 *
 * Must be called inside the caller's transaction so the event, lead and runs
 * commit atomically (SPEC §2.1 — no event loss).
 */

export interface IntakeInput {
  workspaceId: string
  source: string
  formId?: string | null
  name: string
  email?: string | null
  phone?: string | null
  data: Record<string, unknown>
  payload: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

export interface IntakeOutcome {
  intakeEventId: string
  leadId: string
  created: boolean
  runIds: string[]
}

/** Normalizes an email so `A@B.com` and `a@b.com` dedupe to the same lead. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const trimmed = email.trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

export async function recordIntake(
  tx: Prisma.TransactionClient,
  queue: JobQueue,
  input: IntakeInput,
  now: Date = new Date()
): Promise<IntakeOutcome> {
  const email = normalizeEmail(input.email)
  const phone = input.phone?.trim() || null
  const name = input.name.trim() || 'Unknown'

  const intakeEvent = await tx.intakeEvent.create({
    data: {
      workspaceId: input.workspaceId,
      formId: input.formId ?? null,
      source: input.source,
      payload: input.payload as Prisma.InputJsonValue,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  })

  const existing = await findExistingLead(tx, input.workspaceId, email, phone)

  if (!existing) {
    const lead = await tx.lead.create({
      data: {
        workspaceId: input.workspaceId,
        name,
        email,
        phone,
        source: input.source,
        status: 'NEW',
        data: input.data as Prisma.InputJsonValue,
        lastActivityAt: now,
      },
    })

    await tx.intakeEvent.update({ where: { id: intakeEvent.id }, data: { leadId: lead.id } })
    await tx.activity.create({
      data: {
        workspaceId: input.workspaceId,
        leadId: lead.id,
        type: 'lead_created',
        body: `Lead created from ${input.source}`,
        meta: { source: input.source, intakeEventId: intakeEvent.id },
      },
    })

    const runIds = await createRunsForLeadEvent(tx, queue, {
      workspaceId: input.workspaceId,
      leadId: lead.id,
      eventId: intakeEvent.id,
    })

    return { intakeEventId: intakeEvent.id, leadId: lead.id, created: true, runIds }
  }

  // Existing lead → merge, never overwrite good data with blanks.
  const mergedData = { ...((existing.data as Record<string, unknown>) || {}), ...input.data }
  const lead = await tx.lead.update({
    where: { id: existing.id },
    data: {
      name: existing.name === 'Unknown' || !existing.name ? name : existing.name,
      phone: existing.phone ?? phone,
      data: mergedData as Prisma.InputJsonValue,
      lastActivityAt: now,
    },
  })

  await tx.intakeEvent.update({ where: { id: intakeEvent.id }, data: { leadId: lead.id } })
  await tx.activity.create({
    data: {
      workspaceId: input.workspaceId,
      leadId: lead.id,
      type: 'lead_updated',
      body: `Lead re-submitted via ${input.source}`,
      meta: { source: input.source, intakeEventId: intakeEvent.id },
    },
  })

  return { intakeEventId: intakeEvent.id, leadId: lead.id, created: false, runIds: [] }
}

async function findExistingLead(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  email: string | null,
  phone: string | null
) {
  if (email) {
    const byEmail = await tx.lead.findFirst({ where: { workspaceId, email } })
    if (byEmail) return byEmail
  }
  if (phone) {
    const byPhone = await tx.lead.findFirst({ where: { workspaceId, phone } })
    if (byPhone) return byPhone
  }
  return null
}
