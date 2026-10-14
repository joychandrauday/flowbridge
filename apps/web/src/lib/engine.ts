import { PrismaClient, Prisma } from '@prisma/client'
import { WorkflowDefinitionSchema } from '@flowbridge/core/schema'
import { evaluateConditions, redactSecrets, matchesCron, buildRunFailureNotification } from '@flowbridge/core'
import { JobQueue, JobPayload } from './queue'
import { executors, StepResult } from './executors'
import { resolveIntegrations } from './integrations'
import { buildTemplateContext } from './template-context'
import { createRunsForLeadEvent, createRunsForLeadStatusChange } from './run-dispatch'

// Re-exported so intake/import/webhook/actions keep importing from '@/lib/engine'
// (the dispatch logic itself lives in ./run-dispatch to avoid an import cycle).
export { createRunsForLeadEvent, createRunsForLeadStatusChange }

/**
 * The automation engine (SPEC.md §13 step 6/7).
 *
 * - `createRunsForLeadEvent` runs inside the intake transaction (no event loss).
 * - `executeRun` processes a whole run, creates step snapshots, skips
 *   SUCCEEDED steps, applies per-step retry/backoff, and schedules delay
 *   resume jobs.
 * - `processRetryJob` executes one retried step then resumes the run.
 * - `runTick` is the cron entrypoint (reclaim locks → claim → process).
 *
 * ~1-minute granularity for delays/retries is expected behavior (tick cadence).
 */

export interface TickOptions {
  timeBudgetMs?: number
  maxJobs?: number
  lockTimeoutMs?: number
}

export function tickDefaults(): Required<TickOptions> {
  return { timeBudgetMs: 25000, maxJobs: 10, lockTimeoutMs: 30000 }
}

export function computeRetryAfter(
  backoff: 'fixed' | 'exponential' | 'linear',
  attempt: number,
  baseDelayMinutes = 1
): Date {
  const minutes =
    backoff === 'exponential'
      ? baseDelayMinutes * 2 ** (attempt - 1)
      : backoff === 'linear'
        ? baseDelayMinutes * attempt
        : baseDelayMinutes
  return new Date(Date.now() + minutes * 60 * 1000)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadRun(prisma: PrismaClient, workflowRunId: string) {
  return prisma.workflowRun.findUnique({
    where: { id: workflowRunId },
    include: {
      workflow: true,
      steps: true,
      lead: { include: { assignee: { include: { user: true } } } },
    },
  })
}

async function buildContext(prisma: PrismaClient, run: NonNullable<Awaited<ReturnType<typeof loadRun>>>) {
  const workspace = await prisma.workspace.findUnique({ where: { id: run.workspaceId } })
  if (!workspace) return null
  return {
    lead: run.lead,
    workflowRun: run,
    assignee: run.lead?.assignee,
    workspace,
    integrations: await resolveIntegrations(prisma, run.workspaceId),
    prisma,
  }
}

function getDefinition(run: NonNullable<Awaited<ReturnType<typeof loadRun>>>) {
  return run.workflow.definition as Record<string, unknown>
}

/**
 * When a run is marked FAILED, leave a durable trace on the lead and best-effort
 * notify the workspace Owners (SPEC §13.10). Never throws: a failed notification
 * must not change the run's outcome.
 */
async function notifyRunFailure(prisma: PrismaClient, runId: string, error: string): Promise<void> {
  try {
    const run = await loadRun(prisma, runId)
    if (!run) return

    // Durable trace — "never silently swallow a failed automation".
    if (run.leadId) {
      await prisma.activity.create({
        data: {
          workspaceId: run.workspaceId,
          leadId: run.leadId,
          type: 'run_failed',
          body: `Automation "${run.workflow.name}" failed: ${error}`,
          meta: { runId: run.id, workflowId: run.workflowId, error },
        },
      })
    }

    const owners = await prisma.member.findMany({
      where: { workspaceId: run.workspaceId, role: 'OWNER' },
      select: { user: { select: { email: true, telegramChatId: true } } },
    })
    if (owners.length === 0) return

    const context = await buildContext(prisma, run)
    if (!context) return

    const { subject, body } = buildRunFailureNotification({
      workflowName: run.workflow.name,
      error,
      runId: run.id,
      leadName: run.lead?.name,
      leadEmail: run.lead?.email,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL,
    })

    const hasEmail = context.integrations.some((integration) => integration.type === 'email')
    const hasTelegram = context.integrations.some((integration) => integration.type === 'telegram')

    for (const owner of owners) {
      if (hasEmail && owner.user.email) {
        await executors.send_email
          .execute({ to: owner.user.email, subject, text: body }, context)
          .catch(() => undefined)
      }
      if (hasTelegram && owner.user.telegramChatId) {
        await executors.send_telegram
          .execute({ chatId: owner.user.telegramChatId, message: body }, context)
          .catch(() => undefined)
      }
    }
  } catch (notificationError) {
    console.error('[engine] failure notification failed:', notificationError)
  }
}

async function markRunFailed(prisma: PrismaClient, runId: string, error: string): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: 'FAILED', error, finishedAt: new Date() },
  })
  await notifyRunFailure(prisma, runId, error)
}

/**
 * Statuses `executeRun` may pick up.
 *
 * `RUNNING` is included deliberately: if a worker dies mid-run (a serverless
 * timeout, a deploy, a killed container) the run is left `RUNNING` while its
 * job lock eventually expires and is reclaimed. Without this the reclaimed job
 * would no-op — `executeRun` would return early and the caller would mark the
 * job `COMPLETED` — stranding the run forever with no error and no retry, which
 * is exactly the silent failure FlowBridge exists to eliminate. Resuming is
 * safe because `executeRun` skips steps already marked `SUCCEEDED`; a step left
 * `RUNNING` is re-attempted (at-least-once, same as the retry path).
 *
 * A genuinely-in-flight run cannot be picked up here: its job is `CLAIMED`
 * under a live lock, so `claim()` never hands it out concurrently.
 */
const RESUMABLE_RUN_STATUSES = new Set(['QUEUED', 'WAITING', 'RUNNING'])

export function isRunResumable(status: string): boolean {
  return RESUMABLE_RUN_STATUSES.has(status)
}

/**
 * Processes one workflow run from the top, skipping SUCCEEDED steps.
 * Safe to call repeatedly: it is the resume path for delays and retries.
 */
export async function executeRun(prisma: PrismaClient, queue: JobQueue, workflowRunId: string): Promise<void> {
  const run = await loadRun(prisma, workflowRunId)
  if (!run) return
  if (!isRunResumable(run.status)) return // terminal — already succeeded/failed

  const definition = getDefinition(run)
  const parsed = WorkflowDefinitionSchema.safeParse(definition)
  if (!parsed.success) {
    await markRunFailed(prisma, run.id, `Invalid workflow definition: ${parsed.error.message}`)
    return
  }
  const def = parsed.data

  const context = await buildContext(prisma, run)
  if (!context) {
    await markRunFailed(prisma, run.id, 'Workspace not found')
    return
  }

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: { status: 'RUNNING', startedAt: run.startedAt ?? new Date() },
  })

  // Evaluate trigger conditions
  const conditionsMet = evaluateConditions(
    def.conditions,
    buildTemplateContext({
      lead: run.lead,
      assignee: run.lead?.assignee,
      workspace: context.workspace,
      trigger: def.trigger,
    })
  )

  if (!conditionsMet) {
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: 'SUCCEEDED', finishedAt: new Date() },
    })
    return
  }

  // Ensure every step has a snapshot row (created once, in definition order)
  const stepsByKey = new Map(run.steps.map((step) => [step.stepKey, step]))
  for (const stepDef of def.steps) {
    if (!stepsByKey.has(stepDef.id)) {
      const created = await prisma.runStep.create({
        data: {
          runId: run.id,
          stepKey: stepDef.id,
          type: stepDef.type,
          status: 'PENDING',
          input: redactSecrets(stepDef.config ?? {}) as Prisma.InputJsonValue,
        },
      })
      stepsByKey.set(stepDef.id, created)
    }
  }

  for (const stepDef of def.steps) {
    const snapshot = await prisma.runStep.findUnique({ where: { id: stepsByKey.get(stepDef.id)!.id } })
    if (!snapshot) continue
    if (snapshot.status === 'SUCCEEDED') continue

    const handler = executors[stepDef.type]
    if (!handler) {
      await prisma.runStep.update({
        where: { id: snapshot.id },
        data: { status: 'FAILED', error: `Unknown step type: ${stepDef.type}`, finishedAt: new Date() },
      })
      if (stepDef.onFailure === 'stop') {
        await markRunFailed(prisma, run.id, `Unknown step type: ${stepDef.type}`)
        return
      }
      continue
    }

    const attemptsTaken = snapshot.attempts + 1
    await prisma.runStep.update({
      where: { id: snapshot.id },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: attemptsTaken },
    })

    let result: StepResult
    try {
      result = await handler.execute(stepDef.config as Record<string, unknown>, context)
    } catch (error) {
      result = { success: false, error: errorMessage(error) }
    }

    if (result.success) {
      await prisma.runStep.update({
        where: { id: snapshot.id },
        data: {
          status: 'SUCCEEDED',
          output: redactSecrets(result.output ?? {}) as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      })

      // Delay step: park the run and resume after the delay period.
      if (stepDef.type === 'delay' && result.runAfter) {
        await prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'WAITING' } })
        await queue.enqueue({ workflowRunId: run.id, stepType: 'workflow_run', attempt: 1 }, result.runAfter)
        return
      }
      continue
    }

    // Failed step: retry with backoff, or fail the run per onFailure policy.
    const maxAttempts = stepDef.retry?.maxAttempts ?? 1
    if (attemptsTaken < maxAttempts) {
      await prisma.runStep.update({
        where: { id: snapshot.id },
        data: { status: 'FAILED', error: result.error, finishedAt: new Date() },
      })
      await prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'WAITING' } })
      const runAfter = computeRetryAfter(
        stepDef.retry?.backoff ?? 'exponential',
        attemptsTaken,
        stepDef.retry?.baseDelayMinutes
      )
      await queue.enqueue(
        {
          workflowRunId: run.id,
          stepKey: stepDef.id,
          stepType: stepDef.type,
          config: stepDef.config as Record<string, unknown>,
          attempt: attemptsTaken + 1,
        },
        runAfter
      )
      return
    }

    await prisma.runStep.update({
      where: { id: snapshot.id },
      data: { status: 'FAILED', error: result.error, finishedAt: new Date() },
    })
    if (stepDef.onFailure === 'stop') {
      await markRunFailed(prisma, run.id, result.error || 'Step failed')
      return
    }
  }

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: { status: 'SUCCEEDED', finishedAt: new Date() },
  })
}

/**
 * Executes a single retried step (from a queued retry job), then resumes the
 * run. Returns whether the job is permanently finished.
 */
export async function processRetryJob(prisma: PrismaClient, queue: JobQueue, payload: JobPayload): Promise<boolean> {
  const run = await loadRun(prisma, payload.workflowRunId)
  if (!run) return true
  // Terminal (SUCCEEDED/FAILED) or canceled → never resume a retried step.
  if (!isRunResumable(run.status)) return true

  const parsed = WorkflowDefinitionSchema.safeParse(getDefinition(run))
  if (!parsed.success) {
    await markRunFailed(prisma, run.id, `Invalid workflow definition: ${parsed.error.message}`)
    return true
  }
  const stepDef = parsed.data.steps.find((step) => step.id === payload.stepKey)
  if (!stepDef) return true

  const snapshot = await prisma.runStep.findFirst({
    where: { runId: run.id, stepKey: payload.stepKey! },
  })
  if (!snapshot) return true
  if (snapshot.status === 'SUCCEEDED') {
    await executeRun(prisma, queue, run.id)
    return true
  }

  const context = await buildContext(prisma, run)
  if (!context) return true

  await prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'RUNNING' } })
  await prisma.runStep.update({
    where: { id: snapshot.id },
    data: { status: 'RUNNING', startedAt: new Date(), attempts: payload.attempt },
  })

  const handler = executors[payload.stepType]
  let result: StepResult
  if (handler) {
    try {
      result = await handler.execute(payload.config ?? {}, context)
    } catch (error) {
      result = { success: false, error: errorMessage(error) }
    }
  } else {
    result = { success: false, error: `Unknown step type: ${payload.stepType}` }
  }

  if (result.success) {
    await prisma.runStep.update({
      where: { id: snapshot.id },
      data: {
        status: 'SUCCEEDED',
        output: redactSecrets(result.output ?? {}) as Prisma.InputJsonValue,
        attempts: payload.attempt,
        finishedAt: new Date(),
      },
    })
    await executeRun(prisma, queue, run.id)
    return true
  }

  const maxAttempts = stepDef.retry?.maxAttempts ?? 1
  if (payload.attempt < maxAttempts) {
    await prisma.runStep.update({
      where: { id: snapshot.id },
      data: { status: 'FAILED', error: result.error, finishedAt: new Date() },
    })
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'WAITING' } })
    const runAfter = computeRetryAfter(
      stepDef.retry?.backoff ?? 'exponential',
      payload.attempt,
      stepDef.retry?.baseDelayMinutes
    )
    await queue.enqueue(
      {
        workflowRunId: run.id,
        stepKey: payload.stepKey,
        stepType: payload.stepType,
        config: payload.config,
        attempt: payload.attempt + 1,
      },
      runAfter
    )
    return true
  }

  await prisma.runStep.update({
    where: { id: snapshot.id },
    data: { status: 'FAILED', error: result.error, attempts: payload.attempt, finishedAt: new Date() },
  })
  if (stepDef.onFailure === 'stop') {
    await markRunFailed(prisma, run.id, result.error || 'Step failed')
    return true
  }

  await executeRun(prisma, queue, run.id)
  return true
}

const MAX_LEADS_PER_SWEEP = 50

interface TriggerRunInput {
  workspaceId: string
  workflowId: string
  workflowVersion: number
  leadId: string | null
  eventId: string
  source: string
}

/** Create an IntakeEvent + run + job for a time trigger. Returns 1, or 0 if already triggered. */
async function createTriggerRun(
  prisma: PrismaClient,
  queue: JobQueue,
  input: TriggerRunInput
): Promise<number> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.intakeEvent.create({
        data: {
          workspaceId: input.workspaceId,
          source: input.source,
          leadId: input.leadId,
          payload: {} as Prisma.InputJsonValue,
        },
      })
      const run = await tx.workflowRun.create({
        data: {
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          workflowVersion: input.workflowVersion,
          eventId: input.eventId,
          leadId: input.leadId,
          status: 'QUEUED',
        },
      })
      await queue.enqueueTx(tx, { workflowRunId: run.id, stepType: 'workflow_run', attempt: 1 })
    })
    return 1
  } catch (error) {
    // @@unique([workflowId, eventId]) — already triggered for this window.
    if ((error as { code?: string }).code === 'P2002') return 0
    throw error
  }
}

/**
 * Sweeps time-based triggers and creates runs for matches (called each tick):
 *
 * - `lead.no_activity_for`: leads whose `lastActivityAt` predates the threshold.
 *   `eventId` includes the activity timestamp, so a lead re-triggers only after
 *   new activity resets the window.
 * - `schedule`: cron matches the current UTC minute; `eventId` is the ISO minute
 *   so each scheduled minute runs exactly once.
 *
 * Idempotent by construction. Returns how many runs were created.
 */
export async function runTimeTriggers(
  prisma: PrismaClient,
  queue: JobQueue,
  now: Date = new Date()
): Promise<number> {
  const workflows = await prisma.workflow.findMany({
    where: { enabled: true },
    select: { id: true, workspaceId: true, version: true, definition: true },
  })

  let created = 0
  const isoMinute = now.toISOString().slice(0, 16)

  for (const workflow of workflows) {
    let definition
    try {
      definition = WorkflowDefinitionSchema.parse(workflow.definition)
    } catch {
      continue // invalid definition — skip, never crash the sweep
    }

    if (definition.trigger.type === 'lead.no_activity_for') {
      const minutes = definition.trigger.config.minutes
      const cutoff = new Date(now.getTime() - minutes * 60_000)
      const leads = await prisma.lead.findMany({
        where: { workspaceId: workflow.workspaceId, lastActivityAt: { lt: cutoff } },
        select: { id: true, lastActivityAt: true },
        orderBy: { lastActivityAt: 'asc' },
        take: MAX_LEADS_PER_SWEEP,
      })
      for (const lead of leads) {
        created += await createTriggerRun(prisma, queue, {
          workspaceId: workflow.workspaceId,
          workflowId: workflow.id,
          workflowVersion: workflow.version,
          leadId: lead.id,
          eventId: `noactivity:${lead.id}:${workflow.id}:${lead.lastActivityAt.getTime()}`,
          source: 'no_activity',
        })
      }
    } else if (definition.trigger.type === 'schedule') {
      if (!matchesCron(definition.trigger.config.cron, now)) continue
      created += await createTriggerRun(prisma, queue, {
        workspaceId: workflow.workspaceId,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        leadId: null,
        eventId: `schedule:${workflow.id}:${isoMinute}`,
        source: 'schedule',
      })
    }
  }

  return created
}

/** Cron entrypoint: reclaim expired locks, claim up to maxJobs, process. */
export async function runTick(prisma: PrismaClient, queue: JobQueue, options?: TickOptions): Promise<{
  processed: number
  elapsedMs: number
  stats: Record<string, number>
}> {
  const { timeBudgetMs, maxJobs, lockTimeoutMs } = { ...tickDefaults(), ...options }
  const startTime = Date.now()

  // Time-based triggers first (idempotent; see runTimeTriggers). A failure here
  // must never block job processing.
  let triggered = 0
  try {
    triggered = await runTimeTriggers(prisma, queue)
  } catch (error) {
    console.error('[tick] time-trigger sweep failed:', error)
  }

  await prisma.$executeRaw`
    UPDATE "Job"
    SET status = 'PENDING', "lockedBy" = NULL, "lockedAt" = NULL
    WHERE status = 'CLAIMED'
    AND "lockedAt" < ${new Date(Date.now() - lockTimeoutMs)}
  `

  const jobs = await queue.claim(maxJobs)
  let processed = 0

  // The job-processing budget starts *after* the time-trigger sweep. The sweep
  // creates no-activity/schedule runs and on a slow database can consume the
  // whole budget; when that happened every claimed job was rescheduled and — on
  // a deployment with no cron running (local E2E) — never processed at all.
  // Jobs must always get their own slice of the budget.
  const jobBudgetStart = Date.now()

  for (const job of jobs) {
    if (Date.now() - jobBudgetStart > timeBudgetMs) {
      await queue.reschedule(job.id, new Date())
      continue
    }

    const payload = job.payload as JobPayload
    try {
      if (payload.stepType === 'workflow_run' && !payload.stepKey) {
        await executeRun(prisma, queue, payload.workflowRunId)
        await queue.complete(job.id, {})
        processed++
      } else if (payload.stepKey) {
        await processRetryJob(prisma, queue, payload)
        await queue.complete(job.id, {})
        processed++
      } else {
        await queue.fail(job.id, `Unknown job payload type: ${payload.stepType}`)
      }
    } catch (error) {
      await queue.fail(job.id, errorMessage(error))
    }
  }

  return { processed, elapsedMs: Date.now() - startTime, stats: { ...(await queue.getStats()), triggered } }
}

/** Best-effort immediate first drain after intake. Failures are logged and the cron tick is the safety net. */
export function drainNow(prisma: PrismaClient, queue: JobQueue): void {
  runTick(prisma, queue, { timeBudgetMs: 5000, maxJobs: 10 }).catch((error) => {
    console.error('[drain] first-drain failed — cron tick will retry:', error)
  })
}