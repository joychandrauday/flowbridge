import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const TEST_DB = process.env.TEST_DATABASE_URL

/**
 * Follow-up escalation integration test (SPEC §2.6, DoD): the
 * `lead.no_activity_for` trigger sweeps leads whose last activity predates the
 * threshold and runs the escalation — create a task for an Admin and move the
 * lead forward. The 1-minute threshold stands in for the demo's 24h.
 *
 * The run is keyed by an event id that includes the lead's activity timestamp,
 * so the same idle window can never escalate twice.
 *
 * Opt-in via `TEST_DATABASE_URL` (see `queue.integration.test.ts`).
 */
describe.skipIf(!TEST_DB)('follow-up escalation (integration)', () => {
  let prisma: PrismaClient
  let engine: typeof import('../../src/lib/engine')
  let queueModule: typeof import('../../src/lib/queue')
  let workspaceId: string
  let adminMemberId: string
  let leadId: string
  let workflowId: string
  const slug = `escalation-${Date.now()}`

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB
    process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64')

    const db = await import('@flowbridge/db')
    engine = await import('../../src/lib/engine')
    queueModule = await import('../../src/lib/queue')
    prisma = db.prisma as PrismaClient

    const workspace = await prisma.workspace.create({ data: { name: 'Escalation Test', slug } })
    workspaceId = workspace.id

    const admin = await prisma.user.create({
      data: { email: `admin-${Date.now()}@escalation.test`, name: 'Workspace Admin' },
    })
    const member = await prisma.member.create({
      data: { workspaceId, userId: admin.id, role: 'ADMIN' },
    })
    adminMemberId = member.id

    const workflow = await prisma.workflow.create({
      data: {
        workspaceId,
        name: 'Follow-up Escalation',
        definition: {
          trigger: { type: 'lead.no_activity_for', config: { minutes: 1 } },
          conditions: [],
          steps: [
            {
              id: 'escalate',
              type: 'create_task',
              config: { title: 'Escalate {{lead.name}}', assigneeStrategy: 'role', role: 'ADMIN' },
              onFailure: 'stop',
            },
            {
              id: 'mark',
              type: 'update_field',
              config: { field: 'status', value: 'CONTACTED' },
              onFailure: 'stop',
            },
          ],
        },
      },
    })
    workflowId = workflow.id

    const lead = await prisma.lead.create({
      data: {
        workspaceId,
        name: 'Stale Sam',
        email: `sam-${Date.now()}@escalation.test`,
        source: 'test',
        status: 'NEW',
        lastActivityAt: new Date(Date.now() - 5 * 60_000),
      },
    })
    leadId = lead.id

    // Only this file's jobs matter to the delta we assert.
    await prisma.job.deleteMany({})
  })

  afterAll(async () => {
    if (prisma && workspaceId) {
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined)
      await prisma.job.deleteMany({}).catch(() => undefined)
    }
  })

  it('escalates an inactive lead exactly once and applies the steps', async () => {
    const queue = new queueModule.JobQueue(prisma, `escalation-${Date.now()}`)

    const first = await engine.runTick(prisma, queue)
    expect(first.stats.triggered).toBeGreaterThanOrEqual(1)

    const run = await prisma.workflowRun.findFirstOrThrow({ where: { workflowId, leadId } })
    expect(run.status).toBe('SUCCEEDED')

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect(lead.status).toBe('CONTACTED')

    const task = await prisma.task.findFirstOrThrow({ where: { leadId, createdByRunId: run.id } })
    expect(task.title).toBe('Escalate Stale Sam')
    expect(task.assigneeId).toBe(adminMemberId)

    // Same idle window → the unique event id prevents a second escalation.
    await engine.runTick(prisma, queue)
    expect(await prisma.workflowRun.count({ where: { workflowId, leadId } })).toBe(1)
  })
})
