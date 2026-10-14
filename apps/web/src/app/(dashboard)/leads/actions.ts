'use server'

import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { prisma } from '@flowbridge/db'
import { LeadStatus, Prisma } from '@prisma/client'
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

  const actor = await prisma.member.findFirst({ where: { userId: session.user.id, workspaceId } })
  // Agents may only touch leads assigned to them (SPEC §3).
  if (session.user.role === 'AGENT' && (!actor || lead.assigneeId !== actor.id)) return
  if (lead.status === status) return // no-op change

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
  // Agents may only annotate leads assigned to them (SPEC §3).
  if (session.user.role === 'AGENT' && (!actor || lead.assigneeId !== actor.id)) return

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

  // Reassignment is an Owner/Admin action (SPEC §3): agents cannot move leads.
  if (session.user.role === 'AGENT') return

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

const MAX_BULK_LEADS = 100

/**
 * Apply a status and/or assignee change to a set of leads (SPEC §10.2 bulk
 * actions). Scoped to the session workspace; agents may only change the status
 * of their own leads and may never reassign. Status changes fire
 * `lead.status_changed` workflows exactly like the single-lead action.
 */
export async function bulkUpdateLeads(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return
  const workspaceId = session.user.workspaceId

  const ids = formData
    .getAll('leadIds')
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .slice(0, MAX_BULK_LEADS)
  if (ids.length === 0) return

  const statusRaw = formData.get('status')
  const status =
    typeof statusRaw === 'string' && (LEAD_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as LeadStatus)
      : undefined

  const assigneeRaw = formData.get('assigneeId')
  const assigneeProvided = typeof assigneeRaw === 'string' && assigneeRaw !== ''
  const assigneeId = assigneeProvided ? (assigneeRaw === '__none__' ? null : assigneeRaw) : undefined

  if (!status && !assigneeProvided) return

  const isAgent = session.user.role === 'AGENT'
  // Agents cannot reassign leads (SPEC §3).
  if (isAgent && assigneeProvided) return

  const actor = await prisma.member.findFirst({ where: { userId: session.user.id, workspaceId } })

  // Resolve the target assignee within this workspace — never trust client input.
  const target = assigneeId
    ? await prisma.member.findFirst({
        where: { id: assigneeId, workspaceId },
        include: { user: true },
      })
    : null
  if (assigneeId && !target) return

  const where: Prisma.LeadWhereInput = { workspaceId, id: { in: ids } }
  if (isAgent) where.assigneeId = actor?.id ?? '__no_member__'

  const leads = await prisma.lead.findMany({
    where,
    select: { id: true, status: true, assigneeId: true, firstContactedAt: true },
  })

  const queue = new JobQueue(prisma, `worker-bulk-${Date.now()}`)

  for (const lead of leads) {
    const statusChanged = status !== undefined && lead.status !== status
    const assigneeChanged = assigneeProvided && lead.assigneeId !== assigneeId
    if (!statusChanged && !assigneeChanged) continue

    const nextStatus = status as LeadStatus

    await prisma.$transaction(async (tx) => {
      const data: Prisma.LeadUncheckedUpdateInput = { lastActivityAt: new Date() }
      if (statusChanged) {
        data.status = nextStatus
        data.firstContactedAt = lead.firstContactedAt ?? (nextStatus === 'NEW' ? null : new Date())
      }
      if (assigneeChanged) data.assigneeId = assigneeId

      await tx.lead.update({ where: { id: lead.id }, data })

      const activity = await tx.activity.create({
        data: {
          workspaceId,
          leadId: lead.id,
          type: statusChanged ? 'status_change' : 'assignment',
          body: statusChanged
            ? `Status changed to ${nextStatus}`
            : target
              ? `Assigned to ${target.user.name ?? target.user.email}`
              : 'Lead unassigned',
          actorId: actor?.id ?? null,
        },
      })

      if (statusChanged) {
        await createRunsForLeadStatusChange(tx, queue, {
          workspaceId,
          leadId: lead.id,
          eventId: `statuschange:${activity.id}`,
          from: lead.status,
          to: nextStatus,
        })
      }
    })
  }

  drainNow(prisma, new JobQueue(prisma, `worker-drain-${Date.now()}`))

  revalidatePath('/leads')
  revalidatePath('/runs')
  revalidatePath('/dashboard')
}