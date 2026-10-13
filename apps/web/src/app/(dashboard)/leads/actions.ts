'use server'

import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { prisma } from '@flowbridge/db'
import { LeadStatus } from '@prisma/client'
import { JobQueue } from '@/lib/queue'
import { createRunsForLeadStatusChange, drainNow } from '@/lib/engine'

const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST']

/**
 * Update a lead's status (form-action server action; runs on the server only,
 * never trusts a client-supplied workspaceId). Bumps `lastActivityAt` and
 * triggers matching `lead.status_changed` workflows in the same transaction.
 */
export async function updateLeadStatus(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return
  const workspaceId = session.user.workspaceId

  const leadId = formData.get('leadId')
  const status = formData.get('status')
  if (typeof leadId !== 'string' || typeof status !== 'string') return
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) return

  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } })
  if (!lead) return
  if (lead.status === status) return // no-op change

  const actor = await prisma.member.findFirst({ where: { userId: session.user.id, workspaceId } })
  const queue = new JobQueue(prisma, `worker-status-${Date.now()}`)

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: status as LeadStatus,
        // First contact is implicit once someone works the lead
        firstContactedAt: lead.firstContactedAt ?? (status === 'NEW' ? null : new Date()),
        lastActivityAt: new Date(),
      },
    })
    const activity = await tx.activity.create({
      data: {
        workspaceId,
        leadId: lead.id,
        type: 'status_change',
        body: `Status changed to ${status}`,
        actorId: actor?.id ?? null,
      },
    })
    // Use the activity id as the event id: unique per change, so runs are
    // idempotent while still firing once for each transition.
    await createRunsForLeadStatusChange(tx, queue, {
      workspaceId,
      leadId: lead.id,
      eventId: `statuschange:${activity.id}`,
      from: lead.status,
      to: status,
    })
  })

  drainNow(prisma, new JobQueue(prisma, `worker-drain-${Date.now()}`))

  revalidatePath(`/leads/${lead.id}`)
  revalidatePath('/leads')
  revalidatePath('/runs')
  revalidatePath('/dashboard')
}

/** Append a free-form note to the lead timeline. */
export async function addLeadNote(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return
  const workspaceId = session.user.workspaceId

  const leadId = formData.get('leadId')
  const body = formData.get('body')
  if (typeof leadId !== 'string' || typeof body !== 'string' || !body.trim()) return

  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } })
  if (!lead) return

  const actor = await prisma.member.findFirst({ where: { userId: session.user.id, workspaceId } })

  await prisma.$transaction([
    prisma.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } }),
    prisma.activity.create({
      data: {
        workspaceId,
        leadId: lead.id,
        type: 'note',
        body: body.trim(),
        actorId: actor?.id ?? null,
      },
    }),
  ])

  revalidatePath(`/leads/${lead.id}`)
  revalidatePath('/leads')
}

/** Assign (or unassign) a lead to a workspace member. */
export async function updateLeadAssignee(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return
  const workspaceId = session.user.workspaceId

  const leadId = formData.get('leadId')
  const assigneeIdRaw = formData.get('assigneeId')
  if (typeof leadId !== 'string' || typeof assigneeIdRaw !== 'string') return
  const assigneeId = assigneeIdRaw || null

  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } })
  if (!lead) return

  // The assignee must belong to this workspace — never trust client input.
  if (assigneeId) {
    const member = await prisma.member.findFirst({ where: { id: assigneeId, workspaceId } })
    if (!member) return
  }

  const actor = await prisma.member.findFirst({ where: { userId: session.user.id, workspaceId } })
  const target = assigneeId
    ? await prisma.member.findUnique({ where: { id: assigneeId }, include: { user: true } })
    : null

  await prisma.$transaction([
    prisma.lead.update({ where: { id: lead.id }, data: { assigneeId, lastActivityAt: new Date() } }),
    prisma.activity.create({
      data: {
        workspaceId,
        leadId: lead.id,
        type: 'assignment',
        body: target
          ? `Assigned to ${target.user.name ?? target.user.email}`
          : 'Lead unassigned',
        actorId: actor?.id ?? null,
      },
    }),
  ])

  revalidatePath(`/leads/${lead.id}`)
  revalidatePath('/leads')
}