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
  /** Runs that failed in the last 24 hours — the number that must never hide. */
  failed24h: number
  /** Most recent run activity, used for the "last activity" readout. */
  lastActivityAt: Date | null
}

export const EMPTY_HEARTBEAT: EngineHeartbeat = {
  running: 0,
  queued: 0,
  failed24h: 0,
  lastActivityAt: null,
}

export async function getEngineHeartbeat(workspaceId: string): Promise<EngineHeartbeat> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  try {
    const [running, queued, failed24h, last] = await Promise.all([
      prisma.workflowRun.count({ where: { workspaceId, status: 'RUNNING' } }),
      prisma.workflowRun.count({ where: { workspaceId, status: { in: ['QUEUED', 'WAITING'] } } }),
      prisma.workflowRun.count({
        where: { workspaceId, status: 'FAILED', finishedAt: { gte: since } },
      }),
      prisma.workflowRun.findFirst({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ])
    return { running, queued, failed24h, lastActivityAt: last?.updatedAt ?? null }
  } catch {
    return EMPTY_HEARTBEAT
  }
}
