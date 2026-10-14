import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KPICard } from '@/components/ui/kpi-card'
import { LeadsBySourceChart } from '@/components/charts/leads-by-source'
import { ResponseTimeChart } from '@/components/charts/response-time'
import { RecentRuns } from '@/components/dashboard/recent-runs'

/** Percent change from `previous` to `current`; null when there is no baseline. */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/onboarding')

  const workspaceId = session.user.workspaceId

  const now = new Date()
  const weekAgo = new Date(now)
  weekAgo.setDate(now.getDate() - 7)
  const twoWeeksAgo = new Date(now)
  twoWeeksAgo.setDate(now.getDate() - 14)

  // Fetch dashboard stats
  const [
    totalLeads,
    newLeads,
    contactedLeads,
    qualifiedLeads,
    wonLeads,
    overdueTasks,
    totalRuns,
    successfulRuns,
    leadsThisWeek,
    leadsLastWeek,
    runsThisWeek,
    successfulRunsThisWeek,
    runsLastWeek,
    successfulRunsLastWeek,
  ] = await Promise.all([
    prisma.lead.count({ where: { workspaceId } }),
    prisma.lead.count({ where: { workspaceId, status: 'NEW' } }),
    prisma.lead.count({ where: { workspaceId, status: 'CONTACTED' } }),
    prisma.lead.count({ where: { workspaceId, status: 'QUALIFIED' } }),
    prisma.lead.count({ where: { workspaceId, status: 'WON' } }),
    prisma.task.count({ where: { workspaceId, status: 'OPEN', dueAt: { lt: now } } }),
    prisma.workflowRun.count({ where: { workflow: { workspaceId } } }),
    prisma.workflowRun.count({ where: { workflow: { workspaceId }, status: 'SUCCEEDED' } }),
    // Week-over-week inputs (real trends, never hardcoded)
    prisma.lead.count({ where: { workspaceId, createdAt: { gte: weekAgo } } }),
    prisma.lead.count({ where: { workspaceId, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    prisma.workflowRun.count({ where: { workflow: { workspaceId }, createdAt: { gte: weekAgo } } }),
    prisma.workflowRun.count({ where: { workflow: { workspaceId }, status: 'SUCCEEDED', createdAt: { gte: weekAgo } } }),
    prisma.workflowRun.count({ where: { workflow: { workspaceId }, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    prisma.workflowRun.count({ where: { workflow: { workspaceId }, status: 'SUCCEEDED', createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
  ])

  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0
  const successRateThisWeek = runsThisWeek > 0 ? Math.round((successfulRunsThisWeek / runsThisWeek) * 100) : 0
  const successRateLastWeek = runsLastWeek > 0 ? Math.round((successfulRunsLastWeek / runsLastWeek) * 100) : 0
  // Real week-over-week movement; `null` means "not enough history" (no trend shown).
  const leadsTrend = percentChange(leadsThisWeek, leadsLastWeek)
  const successTrend = percentChange(successRateThisWeek, successRateLastWeek)

  // Leads grouped by source for the pie chart
  const sourceGroups = await prisma.lead.groupBy({
    by: ['source'],
    where: { workspaceId },
    _count: { _all: true },
  })
  const leadsBySource = sourceGroups.map((group) => ({
    name: group.source || 'unknown',
    value: group._count._all,
  }))

  // Avg first-response time per day for the last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)
  const recentResponded = await prisma.lead.findMany({
    where: { workspaceId, firstContactedAt: { gte: sevenDaysAgo } },
    select: { createdAt: true, firstContactedAt: true },
  })
  const responseBuckets = new Map<string, number[]>()
  for (let i = 0; i < 7; i++) {
    const day = new Date(sevenDaysAgo)
    day.setDate(day.getDate() + i)
    responseBuckets.set(day.toISOString().slice(0, 10), [])
  }
  for (const lead of recentResponded) {
    if (!lead.firstContactedAt) continue
    const key = lead.firstContactedAt.toISOString().slice(0, 10)
    const bucket = responseBuckets.get(key)
    if (bucket) {
      bucket.push((lead.firstContactedAt.getTime() - lead.createdAt.getTime()) / (1000 * 60))
    }
  }
  const responseTimeData = Array.from(responseBuckets.entries()).map(([date, values]) => ({
    date,
    avgMinutes: values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
  }))

  // Recent workflow runs for the table
  const recentRuns = await prisma.workflowRun.findMany({
    where: { workflow: { workspaceId } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      status: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      workflow: { select: { name: true } },
      lead: { select: { name: true, email: true } },
    },
  })
  const recentRunRows = recentRuns.map((run) => ({
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    workflowName: run.workflow.name,
    leadName: run.lead?.name ?? null,
    leadEmail: run.lead?.email ?? null,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your lead automation pipeline</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Leads"
          value={totalLeads}
          icon="Users"
          trend={leadsTrend !== null ? { value: leadsTrend, label: 'vs last week' } : undefined}
        />
        <KPICard
          title="New Leads"
          value={newLeads}
          icon="Mail"
          variant="primary"
        />
        <KPICard
          title="Workflow Success Rate"
          value={`${successRate}%`}
          icon="TrendingUp"
          trend={successTrend !== null ? { value: successTrend, label: 'vs last week' } : undefined}
        />
        <KPICard
          title="Overdue Tasks"
          value={overdueTasks}
          icon="AlertTriangle"
          variant="destructive"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadsBySourceChart data={leadsBySource} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg First Response Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponseTimeChart data={responseTimeData} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Workflow Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <RecentRuns runs={recentRunRows} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Lead Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PipelineStage name="New" count={newLeads} color="bg-blue-500" />
              <PipelineStage name="Contacted" count={contactedLeads} color="bg-yellow-500" />
              <PipelineStage name="Qualified" count={qualifiedLeads} color="bg-purple-500" />
              <PipelineStage name="Won" count={wonLeads} color="bg-green-500" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <a href="/forms/new" className="flex items-center gap-2 text-sm text-primary hover:underline">
                <span>+</span> Create New Form
              </a>
              <a href="/workflows/new" className="flex items-center gap-2 text-sm text-primary hover:underline">
                <span>+</span> Create Workflow
              </a>
              <a href="/leads/import" className="flex items-center gap-2 text-sm text-primary hover:underline">
                <span>↑</span> Import Leads (CSV)
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function PipelineStage({ name, count, color }: { name: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`h-2 w-2 rounded-full ${color}`} />
        <span className="text-sm font-medium">{name}</span>
      </div>
      <span className="text-sm text-muted-foreground">{count}</span>
    </div>
  )
}