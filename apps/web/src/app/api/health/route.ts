import { NextResponse } from 'next/server'
import { prisma } from '@flowbridge/db'

export const dynamic = 'force-dynamic'

/**
 * Liveness/readiness probe (SPEC §13 Week 4). Public and secret-free: it only
 * reports whether the process is up and the database answers `SELECT 1`.
 */
export async function GET() {
  const startedAt = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: 'ok',
      db: 'up',
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        db: 'down',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
