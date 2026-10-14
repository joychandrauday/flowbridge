import { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { Prisma, LeadStatus } from '@prisma/client'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LeadsTable } from './leads-table'
import { Plus, Users } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Leads | FlowBridge',
}

const PAGE_SIZE = 25
const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST']

interface SearchParams {
  page?: string
  q?: string
  status?: string
  assigneeId?: string
  sort?: string
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    redirect('/login')
  }
  const workspaceId = session.user.workspaceId

  const page = Math.min(Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1), 100000)
  const q = searchParams.q?.trim() ?? ''
  const status = STATUSES.includes(searchParams.status as LeadStatus)
    ? (searchParams.status as LeadStatus)
    : undefined
  const assigneeId = searchParams.assigneeId || undefined
  const sort = searchParams.sort ?? 'newest'

  // SPEC §3: agents only see leads assigned to them. Owners/admins see all.
  const isAgent = session.user.role === 'AGENT'
  const viewer = isAgent
    ? await prisma.member.findFirst({
        where: { workspaceId, userId: session.user.id },
        select: { id: true },
      })
    : null
  const agentScope = isAgent ? { assigneeId: viewer?.id ?? '__no_member__' } : {}

  const where: Prisma.LeadWhereInput = { workspaceId, ...agentScope }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (status) where.status = status
  if (assigneeId && !isAgent) where.assigneeId = assigneeId

  let orderBy: Prisma.LeadOrderByWithRelationInput
  switch (sort) {
    case 'oldest':
      orderBy = { createdAt: 'asc' }
      break
    case 'name':
      orderBy = { name: 'asc' }
      break
    default:
      orderBy = { createdAt: 'desc' }
  }

  const [total, newLeads, openTasks, leads, assignees] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.count({ where: { workspaceId, status: 'NEW', ...agentScope } }),
    prisma.task.count({ where: { workspaceId, status: 'OPEN', ...agentScope } }),
    prisma.lead.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        assignee: { include: { user: { select: { id: true, name: true, email: true } } } },
        tasks: { where: { status: 'OPEN' }, select: { id: true } },
      },
    }),
    prisma.member.findMany({
      where: { workspaceId },
      select: { id: true, user: { select: { name: true } } },
    }),
  ])

  const params: Record<string, string | undefined> = {
    q: q || undefined,
    status: status ?? undefined,
    assigneeId: assigneeId ?? undefined,
    sort,
  }

  // Reassignment is an Owner/Admin action (SPEC §3).
  const canReassign = session.user.role !== 'AGENT'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">Everyone captured by your forms, webhooks, and imports</p>
        </div>
        <Link href="/leads/import">
          <Button variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New (uncontacted)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{newLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openTasks}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All leads</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadsTable
            leads={leads}
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            params={params}
            assignees={assignees}
            canReassign={canReassign}
          />
        </CardContent>
      </Card>
    </div>
  )
}