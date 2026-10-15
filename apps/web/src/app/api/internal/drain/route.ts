import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { JobQueue } from '@/lib/queue'
import { runTick } from '@/lib/engine'

/**
 * Opportunistic engine drain.
 *
 * The durable path is still the external cron hitting `/api/internal/tick`
 * every minute (SPEC §2, AGENTS invariant #2) — this route is a safety net for
 * the free-tier reality that a misconfigured, paused, or rate-limited external
 * cron silently stalls delayed steps and retries. "Never silently swallow a
 * failed automation" applies to the scheduler too: rather than leave every
 * queued job waiting on a scheduler nobody is watching, an Owner/Admin who is
 * *using* the app nudges the same tick.
 *
 * It does not add a worker: it runs the identical `runTick` the cron runs, in
 * the same request-scoped, time-budgeted, `SKIP LOCKED` way. It is a second
 * trigger, not a second consumer. The shell calls it fire-and-forget, at most
 * once a minute, and only while a dashboard tab is open.
 *
 * Restricted to OWNER/ADMIN so an ordinary agent session cannot drive the
 * global queue.
 */
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const queue = new JobQueue(prisma, `worker-drain-${session.user.id}-${Date.now()}`)

  try {
    const { processed, elapsedMs, stats } = await runTick(prisma, queue, {
      timeBudgetMs: 8000,
      maxJobs: 10,
      lockTimeoutMs: 30000,
    })
    return NextResponse.json({ ok: true, processed, elapsedMs, stats })
  } catch (error) {
    // Never let the safety net take the shell down with it.
    console.error('Opportunistic drain failed:', error)
    return NextResponse.json({ ok: false, processed: 0 })
  }
}
