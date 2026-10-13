import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const TEST_DB = process.env.TEST_DATABASE_URL

/**
 * Engine integration test for the failure path (AGENTS §4): a step that fails
 * permanently marks the run FAILED and leaves a `run_failed` activity on the lead
 * so the failure is never swallowed. Runs against a scratch database — see
 * `queue.integration.test.ts` for setup.
 */
describe.skipIf(!TEST_DB)('run failure handling (integration)', () => {
  let prisma: PrismaClient
  let engine: typeof import('../../src/lib/engine')
  let queue: InstanceType<typeof import('../../src/lib/queue').JobQueue>
  let workspaceId: string
  let leadId: string

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB
    process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64')

    const db = await import('@flowbridge/db')
    const queueModule = await import('../../src/lib/queue')
    engine = await import('../../src/lib/engine')

    prisma = db.prisma as PrismaClient
    queue = new queueModule.JobQueue(prisma, `integration-fail-${Date.now()}`)

    if ((await prisma.workflow.count()) !== 0) {
      throw new Error(
        'TEST_DATABASE_URL points at a non-empty database. Integration tests need a scratch DB.'
      )
    }

    const stamp = Date.now()
    const workspace = await prisma.workspace.create({
      data: { name: 'Failure Test', slug: `failure-${stamp}` },
    })
    workspaceId = workspace.id

    const user = await prisma.user.create({
      data: { email: `owner-${stamp}@example.com`, name: 'Owner' },
    })
    await prisma.member.create({ data: { workspaceId, userId: user.id, role: 'OWNER' } })

    const lead = await prisma.lead.create({
      data: { workspaceId, name: 'Ada Lovelace', email: `lead-${stamp}@example.com`, source: 'test' },
    })
    leadId = lead.id

    // `send_email` with no `email` integration configured always fails; a single
    // attempt with `onFailure: stop` marks the run FAILED immediately.
    await prisma.workflow.create({
      data: {
        workspaceId,
        name: 'Failing workflow',
        definition: {
          trigger: { type: 'lead.created', config: {} },
          conditions: [],
          steps: [
            {
              id: 'step_email',
              type: 'send_email',
              config: { subject: 'Hello' },
              retry: { maxAttempts: 1, backoff: 'fixed' },
              onFailure: 'stop',
            },
          ],
        },
      },
    })
  })

  afterAll(async () => {
    if (prisma && workspaceId) {
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined)
    }
  })

  it('marks the run FAILED and records a run_failed activity on the lead', async () => {
    let runIds: string[] = []
    await prisma.$transaction(async (tx) => {
      runIds = await engine.createRunsForLeadEvent(tx, queue, {
        workspaceId,
        leadId,
        eventId: 'evt_failure_test',
      })
    })
    expect(runIds).toHaveLength(1)

    await engine.executeRun(prisma, queue, runIds[0])

    const run = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runIds[0] } })
    expect(run.status).toBe('FAILED')
    expect(run.error).toContain('email integration')

    const activity = await prisma.activity.findFirst({
      where: { leadId, type: 'run_failed' },
      orderBy: { createdAt: 'desc' },
    })
    expect(activity).not.toBeNull()
    expect(activity!.body).toContain('Failing workflow')
  })
})
