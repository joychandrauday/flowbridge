'use server'

import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@flowbridge/db'
import { LeadStatus, Prisma } from '@prisma/client'
import { JobQueue } from '@/lib/queue'
import { createRunsForLeadStatusChange, drainNow } from '@/lib/engine'
import { deriveFirstContactedAt } from '@/lib/lead-lifecycle'
import { recordIntake, normalizeEmail } from '@/lib/intake'

const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST']

/**
 * Create a lead by hand (mini-CRM, SPEC §4.1/§9). Runs through the same intake
 * pipeline as forms/webhooks, so a manual lead still records an IntakeEvent,
 * still fires `lead.created` workflows, and still dedupes against an existing
 * lead with the same email. Agents get the lead assigned to themselves so it is
 * visible to them (SPEC §3).
 */
export async function createLead(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return
  const workspaceId = session.user.workspaceId

  const name = String(formData.get('name') ?? '').trim()
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  const phone = String(formData.get('phone') ?? '').trim()
  const source = String(formData.get('source') ?? '').trim() || 'manual'
  const company = String(formData.get('company') ?? '').trim()
  if (!name) return

  const actor = await prisma.member.findFirst({
    where: { userId: session.user.id, workspaceId },
    select: { id: true },
  })
  const assignToSelf = session.user.role === 'AGENT' ? (actor?.id ?? null) : null

  const queue = new JobQueue(prisma, `worker-manual-${Date.now()}`)
  const result = await prisma.$transaction((tx) =>
    recordIntake(tx, queue, {
      workspaceId,
      source,
      name,
      email,
      phone: phone || null,
      data: company ? { company } : {},
      payload: { name, email, phone, source, company, createdVia: 'manual' },
    })
  )

  if (assignToSelf && result.created) {
    await prisma.lead.update({ where: { id: result.leadId }, data: { assigneeId: assignToSelf } })
  }

  drainNow(prisma, new JobQueue(prisma, `worker-drain-${Date.now()}`))
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  redirect(`/leads/${result.leadId}`)
}

/**
 * Edit a lead's core fields (name/email/phone/source/company). Scoped to the
 * workspace and, for agents, to their own leads. Every edit is recorded on the
 * timeline so the change is auditable and resets the inactivity clock.
 */
export async function updateLeadDetails(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return
  const workspaceId = session.user.workspaceId

  const leadId = String(formData.get('leadId') ?? '')
  if (!leadId) return

  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } })
  if (!lead) return

  const actor = await prisma.member.findFirst({
    where: { userId: session.user.id, workspaceId },
    select: { id: true },
  })
  if (session.user.role === 'AGENT' && (!actor || lead.assigneeId !== actor.id)) return

  const name = String(formData.get('name') ?? '').trim() || lead.name
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  const phone = String(formData.get('phone') ?? '').trim() || null
  const source = String(formData.get('source') ?? '').trim() || lead.source
  const company = String(formData.get('company') ?? '').trim()

  const currentData = (lead.data as Record<string, unknown>) || {}
  const nextData = { ...currentData }
  if (company) nextData.company = company
  else delete nextData.company

  const changed: string[] = []
  if (name !== lead.name) changed.push('name')
  if (email !== lead.email) changed.push('email')
  if (phone !== lead.phone) changed.push('phone')
  if (source !== lead.source) changed.push('source')

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        name,
        email,
        phone,
        source,
        data: nextData as Prisma.InputJsonValue,
        lastActivityAt: new Date(),
      },
    }),
    prisma.activity.create({
      data: {
        workspaceId,
        leadId: lead.id,
        type: 'field_update',
        body: changed.length ? `Details updated: ${changed.join(', ')}` : 'Lead details saved',
        actorId: actor?.id ?? null,
      },
    }),
  ])

  revalidatePath(`/leads/${lead.id}`)
  revalidatePath('/leads')
}

/** Permanently remove a lead (Owner/Admin only). */
export async function deleteLead(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return
  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') return

  const leadId = String(formData.get('leadId') ?? '')
  if (!leadId) return

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId: session.user.workspaceId },
    select: { id: true },
  })
  if (!lead) return

  await prisma.lead.delete({ where: { id: lead.id } })

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  redirect('/leads')
}

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
        firstContactedAt: deriveFirstContactedAt(lead.firstContactedAt, status),
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
        data.firstContactedAt = deriveFirstContactedAt(lead.firstContactedAt, nextStatus)
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