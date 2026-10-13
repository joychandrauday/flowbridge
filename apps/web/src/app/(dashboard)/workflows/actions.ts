'use server'

import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { prisma } from '@flowbridge/db'
import { Prisma } from '@prisma/client'
import { JobQueue } from '@/lib/queue'
import { drainNow } from '@/lib/engine'
import { WorkflowDefinitionSchema } from '@flowbridge/core/schema'

/** Toggle a workflow's enabled flag — form-action, server-only. */
export async function toggleWorkflow(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return

  const workflowId = formData.get('workflowId')
  if (typeof workflowId !== 'string') return

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId: session.user.workspaceId },
  })
  if (!workflow) return

  await prisma.workflow.update({
    where: { id: workflow.id },
    data: { enabled: !workflow.enabled },
  })

  revalidatePath('/workflows')
}

interface SaveWorkflowInput {
  id?: string | null
  name: string
  description?: string
  definition: unknown
}

/**
 * Create or update a workflow. Editing always bumps the version so historical
 * runs keep the definition they executed (SPEC §2.6).
 */
export async function saveWorkflow(input: SaveWorkflowInput) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) {
    return { ok: false, error: 'Unauthorized' }
  }

  const name = input.name?.trim()
  if (!name || name.length > 80) return { ok: false, error: 'Name is required (max 80 chars)' }

  let definition
  try {
    definition = WorkflowDefinitionSchema.parse(input.definition)
  } catch (error) {
    const issues = error instanceof Error ? error.message : 'Invalid workflow definition'
    return { ok: false, error: issues }
  }

  if (input.id) {
    const existing = await prisma.workflow.findFirst({
      where: { id: input.id, workspaceId: session.user.workspaceId },
    })
    if (!existing) return { ok: false, error: 'Workflow not found' }

    const updated = await prisma.workflow.update({
      where: { id: existing.id },
      data: {
        name,
        description: input.description?.trim() || null,
        // Version bump: applies to new runs only.
        version: { increment: 1 },
        definition: definition as never,
      },
    })
    revalidatePath('/workflows')
    revalidatePath(`/workflows/${updated.id}/edit`)
    return { ok: true, id: updated.id, version: updated.version }
  }

  const created = await prisma.workflow.create({
    data: {
      workspaceId: session.user.workspaceId,
      name,
      description: input.description?.trim() || null,
      enabled: false, // start paused; user flips it on
      version: 1,
      definition: definition as never,
    },
  })
  revalidatePath('/workflows')
  return { ok: true, id: created.id, version: created.version }
}

/** Run an existing workflow against a lead right now (manual trigger). */
export async function runWorkflowManually(workflowId: string, leadId: string) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) {
    return { ok: false, error: 'Unauthorized' }
  }

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId: session.user.workspaceId },
  })
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId: session.user.workspaceId },
  })
  if (!workflow || !lead) return { ok: false, error: 'Workflow or lead not found' }

  const queue = new JobQueue(prisma, `worker-manual-${Date.now()}`)

  const workspaceId = session.user.workspaceId

  await prisma.$transaction(async (tx) => {
    // A manual run is still an event: creates an IntakeEvent row (source 'manual')
    // so run history and the lead timeline stay honest, and WorkflowRun's
    // required eventId is satisfied.
    const intakeEvent = await tx.intakeEvent.create({
      data: { workspaceId, source: 'manual', leadId: lead.id, payload: {} as Prisma.InputJsonValue },
    })
    const run = await tx.workflowRun.create({
      data: {
        workspaceId,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        eventId: intakeEvent.id,
        leadId: lead.id,
        status: 'QUEUED',
      },
    })
    await queue.enqueueTx(tx, { workflowRunId: run.id, stepType: 'workflow_run', attempt: 1 })
  })

  drainNow(prisma, new JobQueue(prisma, `worker-drain-${Date.now()}`))
  revalidatePath('/runs')
  return { ok: true }
}