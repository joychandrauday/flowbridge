import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@flowbridge/db'
import { JobQueue } from '@/lib/queue'
import { runTick } from '@/lib/engine'

const CRON_SECRET = process.env.CRON_SECRET
const WORKER_ID = `worker-${process.env.VERCEL_DEPLOYMENT_ID || 'local'}`

// Verify cron authorization. The tick drives every outbound action, so a
// missing CRON_SECRET must fail closed in production — an open endpoint lets
// anyone run workflows and send email/Telegram on the deployment's behalf.
// Local dev / preview without a secret stays usable; production does not.
function verifyCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRON_SECRET is not set — refusing to run the tick endpoint in production')
      return false
    }
    console.warn('CRON_SECRET not set (non-production), skipping auth check')
    return true
  }
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${CRON_SECRET}`
}

// Job queue instance
const jobQueue = new JobQueue(prisma, WORKER_ID)

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { processed, elapsedMs, stats } = await runTick(prisma, jobQueue, {
      timeBudgetMs: 25000,
      maxJobs: 10,
      lockTimeoutMs: 30000,
    })

    return NextResponse.json({ success: true, processed, elapsedMs, stats })
  } catch (error) {
    console.error('Tick error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}