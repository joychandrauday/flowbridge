import type { PrismaClient } from '@prisma/client'

/**
 * Lead lifecycle helpers (SPEC §2.3/§2.6).
 *
 * `lastActivityAt` drives the `lead.no_activity_for` trigger, so **any** touch —
 * a human status change, a note, or an automated assignment/task/email — must
 * move it forward. Keeping the rule in one place stops the trigger from
 * degrading into "no *manual* activity", which would fire on leads the
 * automation just worked.
 */

/**
 * First-response timestamp: set once, the first time a lead leaves `NEW`.
 * Returns the existing value unchanged, or `null` while the lead is still new.
 */
export function deriveFirstContactedAt(
  current: Date | null | undefined,
  nextStatus: string,
  now: Date = new Date()
): Date | null {
  if (current) return current
  if (nextStatus === 'NEW') return null
  return now
}

/**
 * Bump a lead's activity clock. Best-effort: a deleted lead (or a test double
 * without a `lead` delegate) must never fail the step that just succeeded.
 */
export async function touchLeadActivity(
  prisma: PrismaClient,
  leadId: string,
  now: Date = new Date()
): Promise<void> {
  try {
    await prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: now } })
  } catch {
    /* lead may have been removed, or the client is a test double */
  }
}

/**
 * True when `nextStatus` is a valid status the pipeline understands. Used by
 * the `update_field` executor so an arbitrary value cannot corrupt the lead.
 */
export const LEAD_STATUS_VALUES = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'] as const
export type LeadStatusValue = (typeof LEAD_STATUS_VALUES)[number]

export function isLeadStatus(value: unknown): value is LeadStatusValue {
  return typeof value === 'string' && (LEAD_STATUS_VALUES as readonly string[]).includes(value)
}
