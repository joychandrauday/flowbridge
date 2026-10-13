import { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { Prisma, RunStatus } from '@prisma/client'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge, BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronLeft, ChevronRight, GitBranch } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Runs | FlowBridge',
}

const PAGE_SIZE = 25
const STATUSES: RunStatus[] = ['QUEUED', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELED']

const STATUS_VARIANT: Record<RunStatus, BadgeProps['variant'] | undefined> = {
  QUEUED: 'outline',
  RUNNING: 'secondary',
  WAITING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'destructive',
  CANCELED: 'outline',
}

interface SearchParams {
  page?: string
  status?: string
  workflowId?: string
}

function formatDuration(startedAt: Date | null, finishedAt: Date | null): string {
  if (!startedAt) return '—'
  const ms = (finishedAt ?? new Date()).getTime() - startedAt.getTime()
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function RunsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/login')
  const workspaceId = session.user.workspaceId

  const page = Math.min(Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1), 100000)
  const status = STATUSES.includes(searchParams.status as RunStatus)
    ? (searchParams.status as RunStatus)
    : undefined
  const workflowId = searchParams.workflowId || undefined

  const where: Prisma.WorkflowRunWhereInput = { workspaceId }
  if (status) where.status = status
  if (workflowId) where.workflowId = workflowId

  const [total, runs, workflows] = await Promise.all([
    prisma.workflowRun.count({ where }),
    prisma.workflowRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        workflow: { select: { name: true } },
        lead: { select: { id: true, name: true, email: true } },
        _count: { select: { steps: true } },
      },
    }),
    prisma.workflow.findMany({
      where: { workspaceId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const qs = (overrides: Record<string, string>) => {
    const url = new URLSearchParams()
    if (status) url.set('status', status)
    if (workflowId) url.set('workflowId', workflowId)
    for (const [key, value] of Object.entries(overrides)) {
      if (value) url.set(key, value)
      else url.delete(key)
    }
    const str = url.toString()
    return str ? `/runs?${str}` : '/runs'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Runs</h1>
        <p className="text-muted-foreground">Every workflow execution, from queue to completion</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Run history
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
            <select
              name="status"
              defaultValue={status ?? ''}
              aria-label="Filter by status"
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              name="workflowId"
              defaultValue={workflowId ?? ''}
              aria-label="Filter by workflow"
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">All workflows</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <input type="hidden" name="page" value="1" />
            <Button type="submit" size="sm" variant="secondary">Apply</Button>
          </form>

          {runs.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-medium">{status || workflowId ? 'No runs match your filters' : 'No runs yet'}</p>
              <p className="text-sm text-muted-foreground">
                {status || workflowId
                  ? 'Try adjusting your filters.'
                  : 'Runs appear here when leads trigger your workflows.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id} className="hover:bg-muted/50">
                    <TableCell>
                      <Link href={`/runs/${run.id}`} className="font-medium hover:underline">
                        {run.workflow.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {run.lead ? (
                        <Link href={`/leads/${run.lead.id}`} className="hover:underline">
                          {run.lead.name || 'Unnamed lead'}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run._count.steps}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(run.createdAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDuration(run.startedAt, run.finishedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>Page {page} of {totalPages} · {total} run{total === 1 ? '' : 's'}</span>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline" disabled={page <= 1}>
                  <Link href={qs({ page: String(Math.max(1, page - 1)) })}>
                    <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Prev
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" disabled={page >= totalPages}>
                  <Link href={qs({ page: String(Math.min(totalPages, page + 1)) })}>
                    Next <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}