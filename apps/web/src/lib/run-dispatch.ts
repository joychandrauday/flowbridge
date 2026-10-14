import { Prisma } from '@prisma/client'
import { WorkflowDefinitionSchema, type WorkflowDefinition } from '@flowbridge/core/schema'
import type { JobQueue } from './queue'

/**
 * Run dispatch (SPEC §2.1/§2.5): turn a domain event into `WorkflowRun` +
 * queued job rows **inside the caller's transaction**, so an event can never be
 * persisted without the runs it should trigger.
 *
 * Split out of `engine.ts` so executors (e.g. `update_field` changing a lead's
 * status) can dispatch further runs without importing the engine and creating a
 * cycle.
 */

function parseDefinition(definition: unknown): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse(definition)
}

/**
 * Inserts the run + job; returns the run id, or `null` when the same
 * `(workflowId, eventId)` already produced a run (idempotency guard, SPEC §4.2).
 */
async function createRun(
  tx: Prisma.TransactionClient,
  queue: JobQueue,
  data: {
    workspaceId: string
    workflowId: string
    workflowVersion: number
    eventId: string
    leadId: string
  }
): Promise<string | null> {
  try {
    const run = await tx.workflowRun.create({ data: { ...data, status: 'QUEUED' } })
    await queue.enqueueTx(tx, { workflowRunId: run.id, stepType: 'workflow_run', attempt: 1 })
    return run.id
  } catch (error) {
    // Idempotency guard: @@unique([workflowId, eventId]) means the same domain
    // event must never produce two runs (SPEC §4.2).
    if ((error as { code?: string }).code === 'P2002') return null
    throw error
  }
}

/**
 * Creates a WorkflowRun + job for every enabled `lead.created` workflow.
 * Must be called inside the intake transaction (tx) so nothing is lost.
 */
export async function createRunsForLeadEvent(
  tx: Prisma.TransactionClient,
  queue: JobQueue,
  input: { workspaceId: string; leadId: string; eventId: string }
): Promise<string[]> {
  const workflows = await tx.workflow.findMany({
    where: { workspaceId: input.workspaceId, enabled: true },
    select: { id: true, version: true, definition: true },
  })

  const runIds: string[] = []
  for (const workflow of workflows) {
    let parsed: WorkflowDefinition
    try {
      parsed = parseDefinition(workflow.definition)
    } catch {
      continue // invalid definition; skip rather than crash intake
    }
    if (parsed.trigger.type !== 'lead.created') continue

    const runId = await createRun(tx, queue, {
      workspaceId: input.workspaceId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      eventId: input.eventId,
      leadId: input.leadId,
    })
    if (runId) runIds.push(runId)
  }
  return runIds
}

/**
 * Creates runs for enabled `lead.status_changed` workflows whose trigger config
 * matches the transition. Called inside the status-update transaction so the
 * run cannot be lost (SPEC §2.1).
 */
export async function createRunsForLeadStatusChange(
  tx: Prisma.TransactionClient,
  queue: JobQueue,
  input: { workspaceId: string; leadId: string; eventId: string; from: string; to: string }
): Promise<string[]> {
  const workflows = await tx.workflow.findMany({
    where: { workspaceId: input.workspaceId, enabled: true },
    select: { id: true, version: true, definition: true },
  })

  const runIds: string[] = []
  for (const workflow of workflows) {
    let parsed: WorkflowDefinition
    try {
      parsed = parseDefinition(workflow.definition)
    } catch {
      continue
    }
    if (parsed.trigger.type !== 'lead.status_changed') continue

    const { from, to } = parsed.trigger.config
    if (from && from !== input.from) continue
    if (to && to !== input.to) continue

    const runId = await createRun(tx, queue, {
      workspaceId: input.workspaceId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      eventId: input.eventId,
      leadId: input.leadId,
    })
    if (runId) runIds.push(runId)
  }
  return runIds
}
