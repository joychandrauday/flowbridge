import { prisma } from '@/lib/prisma'

/**
 * The engine's pulse, scoped to one workspace.
 *
 * FlowBridge runs everything on a ~1-minute tick (SPEC §10, docs/decisions.md).
 * That granularity is documented behaviour, not a fault — but it is invisible in
 * a normal UI, which makes the product feel asleep. This turns it into something
 * you can watch: what is in flight right now, when the engine last did work, and
 * — most importantly — whether anything has failed recently.
 *
 * Deliberately derived from `WorkflowRun` rather than the `Job` table: runs carry
 * a `workspaceId`, so this can never report another tenant's activity, and it
 * keeps all queue-table access inside the queue module (AGENTS invariant #2).
 *
 * Read-only, and it fails closed: if the query errors the indicator simply hides
 * rather than taking the shell down with it.
 */
export interface EngineHeartbeat {
  /** Runs currently executing a step. */
  running: number
  /** Runs queued or waiting for a delay to elapse. */
  queued: number
  /** Runs strictly in `QUEUED` — the ones a tick should claim immediately. */
  queuedNow: number
  /** Runs that failed in the last 24 hours — the number that must never hide. */
  failed24h: number
  /**
   * A queued run has been waiting far longer than one tick should ever take.
   * The queue is not just busy — the consumer has stopped draining it.
   */
  stalled: boolean
  /** Age of the oldest `QUEUED` run, for the tooltip. Null when nothing is queued. */
  oldestQueuedAgeMs: number | null
  /** When the engine last touched any run in this workspace. */
  lastActivityAt: Date | null
}

/**
 * A `QUEUED` run is claimed within one ~1-minute tick (the job is enqueued with
 * no delay — only delay/retry steps park as `WAITING`). Five missed ticks is
 * therefore not "busy", it is a stopped scheduler, and it must be loud.
 */
export const STALL_THRESHOLD_MS = 5 * 60 * 1000

/**
 * Pure so the rule is testable without a database. `null` (nothing queued) is
 * never stalled, and `now` is injected so the caller's clock wins.
 */
export function isEngineStalled(
  oldestQueuedAt: Date | null,
  now: number,
  thresholdMs: number = STALL_THRESHOLD_MS
): boolean {
  if (!oldestQueuedAt) return false
  return now - oldestQueuedAt.getTime() > thresholdMs
}

export const EMPTY_HEARTBEAT: EngineHeartbeat = {
  running: 0,
  queued: 0,
  queuedNow: 0,
  failed24h: 0,
  stalled: false,
  oldestQueuedAgeMs: null,
  lastActivityAt: null,
}

export async function getEngineHeartbeat(workspaceId: string): Promise<EngineHeartbeat> {
  const now = Date.now()
  try {
    const since = new Date(now - 24 * 60 * 60 * 1000)
    const [running, queued, queuedNow, failed24h, oldestQueued, last] = await Promise.all([
      prisma.workflowRun.count({ where: { workspaceId, status: 'RUNNING' } }),
      prisma.workflowRun.count({ where: { workspaceId, status: { in: ['QUEUED', 'WAITING'] } } }),
      prisma.workflowRun.count({ where: { workspaceId, status: 'QUEUED' } }),
      prisma.workflowRun.count({
        where: { workspaceId, status: 'FAILED', finishedAt: { gte: since } },
      }),
      prisma.workflowRun.findFirst({
        where: { workspaceId, status: 'QUEUED' },
        orderBy: { updatedAt: 'asc' },
        select: { updatedAt: true },
      }),
      prisma.workflowRun.findFirst({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ])

    const oldestQueuedAt = oldestQueued?.updatedAt ?? null
    return {
      running,
      queued,
      queuedNow,
      failed24h,
      stalled: isEngineStalled(oldestQueuedAt, now),
      oldestQueuedAgeMs: oldestQueuedAt ? now - oldestQueuedAt.getTime() : null,
      lastActivityAt: last?.updatedAt ?? null,
    }
  } catch {
    return EMPTY_HEARTBEAT
  }
}
