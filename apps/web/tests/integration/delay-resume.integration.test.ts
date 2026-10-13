import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const TEST_DB = process.env.TEST_DATABASE_URL

/**
 * Delay / resume integration test (AGENTS §4, SPEC §6 / DoD): a `delay` step
 * parks the run as `WAITING` and schedules a resume job ~1 minute out. We then
 * fast-forward that job and run one tick, proving the follow-up executes. The
 * 1-minute delay stands in for the 24h escalation used in the demo workflow.
 *
 * Opt-in via `TEST_DATABASE_URL` (see `queue.integration.test.ts`).
 */
describe.skipIf(!TEST_DB)('delay / resume (integration)', () => {
  let prisma: PrismaClient
  let engine: typeof import('../../src/lib/engine')
  let queueModule: typeof import('../../src/lib/queue')
  let workspaceId: string
  const slug = `delay-${Date.now()}`

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB
    process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64')

    const db = await import('@flowbridge/db')
    engine = await import('../../src/lib/engine')
    queueModule = await import('../../src/lib/queue')
    prisma = db.prisma as PrismaClient

    const workspace = await prisma.workspace.create({ data: { name: 'Delay Test', slug } })
    workspaceId = workspace.id
  })

  afterAll(async () => {
    if (prisma && workspaceId) {
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined)
      // Jobs have no tenant FK, so clear this file's rows explicitly.
      await prisma.job.deleteMany({}).catch(() => undefined)
    }
  })

  it('parks the run on the delay step, then resumes and finishes when the tick fires', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        workspaceId,
        name: 'Delayed follow-up',
        definition: {
          trigger: { type: 'lead.created', config: {} },
          conditions: [],
          steps: [
            { id: 'wait', type: 'delay', config: { minutes: 1 }, onFailure: 'stop' },
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

    const queue = new queueModule.JobQueue(prisma, `delay-test-${Date.now()}`)

    // Create the lead + run in one transaction, exactly as intake does.
    const { runId, leadId } = await prisma.$transaction(async (tx) => {
      const intakeEvent = await tx.intakeEvent.create({
        data: { workspaceId, source: 'test', payload: { name: 'Delayed Dana' } },
      })
      const lead = await tx.lead.create({
        data: {
          workspaceId,
          name: 'Delayed Dana',
          email: `dana-${Date.now()}@example.com`,
          source: 'test',
          status: 'NEW',
        },
      })
      await tx.intakeEvent.update({ where: { id: intakeEvent.id }, data: { leadId: lead.id } })
      const runIds = await engine.createRunsForLeadEvent(tx, queue, {
        workspaceId,
        leadId: lead.id,
        eventId: intakeEvent.id,
      })
      return { runId: runIds[0], leadId: lead.id }
    })
    expect(runId).toBeTruthy()

    // Drop the initial enqueue job so the only job we observe is the delay's
    // resume job (keeps the assertion deterministic).
    await prisma.job.deleteMany({})

    // First pass: the delay step succeeds and parks the run.
    await engine.executeRun(prisma, queue, runId)

    const parked = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } })
    expect(parked.status).toBe('WAITING')

    const resumeJob = await prisma.job.findFirstOrThrow({ where: { status: 'PENDING' } })
    expect(resumeJob.runAfter).not.toBeNull()
    // ~1 minute out, i.e. the delay was honoured (not run immediately).
    expect(resumeJob.runAfter!.getTime()).toBeGreaterThan(Date.now() + 30_000)

    // Fast-forward: pretend the per-minute cron tick fires after the delay.
    await prisma.job.update({
      where: { id: resumeJob.id },
      data: { runAfter: new Date(Date.now() - 1000) },
    })
    await engine.runTick(prisma, queue)

    const finished = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } })
    expect(finished.status).toBe('SUCCEEDED')

    // The post-delay step actually ran.
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect(lead.status).toBe('CONTACTED')

    const steps = await prisma.runStep.findMany({ where: { runId } })
    const byKey = new Map(steps.map((step) => [step.stepKey, step.status]))
    expect(byKey.get('wait')).toBe('SUCCEEDED')
    expect(byKey.get('mark')).toBe('SUCCEEDED')
  })
})
