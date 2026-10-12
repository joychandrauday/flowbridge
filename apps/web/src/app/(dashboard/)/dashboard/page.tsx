import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KPICard } from '@/components/ui/kpi-card'
import { LeadsBySourceChart } from '@/components/charts/leads-by-source'
import { ResponseTimeChart } from '@/components/charts/response-time'
import { RecentRuns } from '@/components/dashboard/recent-runs'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/onboarding')

  const workspaceId = session.user.workspaceId

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
    failedRuns,
    leadsWithResponse,
  ] = await Promise.all([
    prisma.lead.count({ where: { workspaceId } }),
    prisma.lead.count({ where: { workspaceId, status: 'NEW' } }),
    prisma.lead.count({ where: { workspaceId, status: 'CONTACTED' } }),
    prisma.lead.count({ where: { workspaceId, status: 'QUALIFIED' } }),
    prisma.lead.count({ where: { workspaceId, status: 'WON' } }),
    prisma.task.count({ where: { workspaceId, status: 'OPEN', dueAt: { lt: new Date() } } }),
    prisma.workflowRun.count({ where: { workflow: { workspaceId } } }),
    prisma.workflowRun.count({ where: { workflow: { workspaceId }, status: 'SUCCEEDED' } }),
    prisma.workflowRun.count({ where: { workflow: { workspaceId }, status: 'FAILED' } }),
    prisma.lead.findMany({
      where: { workspaceId, firstContactedAt: { not: null } },
      select: { createdAt: true, firstContactedAt: true },
    }),
  ])

  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0

  // Calculate avg response time in minutes
  const avgResponseMinutes = leadsWithResponse.length > 0
    ? Math.round(
        leadsWithResponse.reduce((sum, lead) => 
          sum + (lead.firstContactedAt!.getTime() - lead.createdAt.getTime()), 0
        ) / leadsWithResponse.length / (1000 * 60)
      )
    : 0

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
          trend={{ value: 12, label: 'vs last week' }}
        />
        <KPICard
          title="New Leads"
          value={newLeads}
          icon="Mail"
          variant="primary"
        />
        <KPICard
          title="Conversion Rate"
          value={`${successRate}%`}
          icon="TrendingUp"
          trend={{ value: 5, label: 'vs last week' }}
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
            <LeadsBySourceChart workspaceId={workspaceId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg First Response Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponseTimeChart workspaceId={workspaceId} />
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
              <RecentRuns workspaceId={workspaceId} limit={10} />
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