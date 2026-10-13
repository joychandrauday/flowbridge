import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const TEST_DB = process.env.TEST_DATABASE_URL

/**
 * Queue integration tests against a real Postgres database (AGENTS §4).
 *
 * Opt-in and never part of `pnpm test` / CI's default run. Point
 * `TEST_DATABASE_URL` at a dedicated **empty** scratch database and apply the
 * schema first:
 *
 *   pnpm --filter @flowbridge/db exec prisma db push   # with TEST_DATABASE_URL set
 *   pnpm --filter @flowbridge/web test:integration
 *
 * The suite refuses to run against a database that already has workflows, so it
 * can never mutate seeded demo data.
 */
describe.skipIf(!TEST_DB)('JobQueue against a real database', () => {
  let prisma: PrismaClient
  let queue: InstanceType<typeof import('../../src/lib/queue').JobQueue>
  let runTick: typeof import('../../src/lib/engine').runTick
  const created: string[] = []

  beforeAll(async () => {
    // Redirect the shared Prisma client at the scratch DB before importing it.
    process.env.DATABASE_URL = TEST_DB
    process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64')

    const db = await import('@flowbridge/db')
    const queueModule = await import('../../src/lib/queue')
    const engine = await import('../../src/lib/engine')

    prisma = db.prisma as PrismaClient
    queue = new queueModule.JobQueue(prisma, `integration-${Date.now()}`)
    runTick = engine.runTick

    const workflows = await prisma.workflow.count()
    if (workflows !== 0) {
      throw new Error(
        'TEST_DATABASE_URL points at a non-empty database. Integration tests need a scratch DB.'
      )
    }
  })

  afterAll(async () => {
    if (prisma && created.length) {
      await prisma.job.deleteMany({ where: { id: { in: created } } })
    }
    await prisma?.$disconnect()
  })

  /** Insert a job directly so the test does not depend on the engine fixtures. */
  async function enqueueJob(runAfter: Date = new Date()) {
    const job = await prisma.job.create({
      data: {
        payload: { workflowRunId: 'run_test', stepType: 'workflow_run', attempt: 1 },
        status: 'PENDING',
        runAfter,
      },
    })
    created.push(job.id)
    return job
  }

  it('claims a due job exactly once', async () => {
    const job = await enqueueJob()

    const first = await queue.claim(10)
    expect(first.map((j) => j.id)).toContain(job.id)

    // A second claim must not hand the same job out again.
    const second = await queue.claim(10)
    expect(second.map((j) => j.id)).not.toContain(job.id)

    await queue.complete(job.id, { ok: true })
    const done = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(done.status).toBe('COMPLETED')
    expect(done.completedAt).not.toBeNull()
  })

  it('does not claim a job scheduled in the future', async () => {
    const job = await enqueueJob(new Date(Date.now() + 60_000))
    const claimed = await queue.claim(10)
    expect(claimed.map((j) => j.id)).not.toContain(job.id)
  })

  it('reclaims a job whose lock expired (crash recovery)', async () => {
    const job = await enqueueJob()

    const claimed = await queue.claim(10)
    expect(claimed.map((j) => j.id)).toContain(job.id)

    // A negative lock timeout makes the fresh lock look expired. maxJobs: 0 keeps
    // the tick from processing anything — we only assert the reclaim.
    await runTick(prisma, queue, { maxJobs: 0, lockTimeoutMs: -1000, timeBudgetMs: 1000 })

    const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(row.status).toBe('PENDING')
    expect(row.lockedBy).toBeNull()
    expect(row.lockedAt).toBeNull()
  })

  it('reschedules a failed job with backoff instead of dropping it', async () => {
    const job = await enqueueJob()

    await queue.fail(job.id, 'provider returned 500')
    const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })

    expect(row.status).toBe('PENDING')
    expect(row.attempts).toBe(1)
    expect(row.error).toBe('provider returned 500')
    expect(row.runAfter).not.toBeNull()
    expect(row.runAfter!.getTime()).toBeGreaterThan(Date.now())
  })
})
