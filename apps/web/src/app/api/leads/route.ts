import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { LeadStatus, Prisma } from '@prisma/client'
import { authenticateApiKey, hasScope } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 100
const STATUSES: readonly string[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST']

/**
 * List leads for the caller's workspace.
 *
 * Auth: either an authenticated session (dashboard) or an API key with the
 * `read:leads` scope — `Authorization: Bearer fb_…` (see Settings → API keys).
 * API-key callers are scoped to the key's workspace and never see others'.
 */
export async function GET(request: NextRequest) {
  const apiAuth = await authenticateApiKey(request)

  let workspaceId: string
  if (apiAuth) {
    if (!hasScope(apiAuth, 'read:leads')) {
      return NextResponse.json({ error: 'Missing scope: read:leads' }, { status: 403 })
    }
    workspaceId = apiAuth.workspaceId
  } else {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
      )
    }
    workspaceId = session.user.workspaceId
  }

  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10) || 25)
  )
  const statusParam = searchParams.get('status')
  const status =
    statusParam && STATUSES.includes(statusParam) ? (statusParam as LeadStatus) : undefined
  const q = searchParams.get('q')?.trim() ?? ''

  const where: Prisma.LeadWhereInput = { workspaceId }
  if (status) where.status = status
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ]
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      source: true,
      status: true,
      assigneeId: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ data: leads, limit })
}
