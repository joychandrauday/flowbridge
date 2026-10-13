import { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { Prisma } from '@prisma/client'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CheckCircle2, ListTodo } from 'lucide-react'
import { completeTask } from './actions'

export const metadata: Metadata = {
  title: 'Tasks | FlowBridge',
}

const PAGE_SIZE = 25

interface SearchParams {
  page?: string
  status?: string
  assigneeId?: string
}

function formatDate(date: Date | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/login')
  const workspaceId = session.user.workspaceId

  const page = Math.min(Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1), 100000)
  const status = searchParams.status === 'DONE' || searchParams.status === 'OPEN' ? searchParams.status : 'OPEN'
  const assigneeId = searchParams.assigneeId || undefined

  const where: Prisma.TaskWhereInput = { workspaceId, status }
  if (assigneeId) where.assigneeId = assigneeId

  const [total, tasks, assignees] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        lead: { select: { id: true, name: true, email: true } },
        assignee: { include: { user: { select: { id: true, name: true } } } },
      },
    }),
    prisma.member.findMany({
      where: { workspaceId },
      select: { id: true, user: { select: { name: true } } },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const qs = (overrides: Record<string, string>) => {
    const url = new URLSearchParams()
    url.set('status', status)
    if (assigneeId) url.set('assigneeId', assigneeId)
    for (const [key, value] of Object.entries(overrides)) {
      if (value) url.set(key, value)
      else url.delete(key)
    }
    const str = url.toString()
    return str ? `/tasks?${str}` : '/tasks'
  }

  const now = Date.now()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">Follow-ups created by your team and workflows</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
          {status === 'OPEN' ? 'Open' : 'Done'} · {total}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task list</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
            <select
              name="status"
              defaultValue={status}
              aria-label="Filter by status"
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="OPEN">Open</option>
              <option value="DONE">Done</option>
            </select>
            <select
              name="assigneeId"
              defaultValue={assigneeId ?? ''}
              aria-label="Filter by assignee"
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">All assignees</option>
              {assignees.map((member) => (
                <option key={member.id} value={member.id}>{member.user.name ?? 'Unnamed'}</option>
              ))}
            </select>
            <input type="hidden" name="page" value="1" />
            <Button type="submit" size="sm" variant="secondary">Apply</Button>
          </form>

          {tasks.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-medium">{status === 'OPEN' ? 'No open tasks' : 'Nothing completed yet'}</p>
              <p className="text-sm text-muted-foreground">
                {status === 'OPEN'
                  ? 'Tasks appear when workflows create follow-ups for your leads.'
                  : 'Completed tasks show up here.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => {
                  const isOverdue = !!task.dueAt && task.status === 'OPEN' && new Date(task.dueAt).getTime() < now
                  return (
                    <TableRow key={task.id} className="hover:bg-muted/50">
                      <TableCell>
                        <p className="font-medium">{task.title}</p>
                        {task.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {task.lead ? (
                          <Link href={`/leads/${task.lead.id}`} className="hover:underline">
                            {task.lead.name || task.lead.email || 'Unnamed lead'}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{task.assignee?.user.name ?? 'Unassigned'}</TableCell>
                      <TableCell className="text-sm">
                        {task.dueAt ? (
                          <span className={isOverdue ? 'font-medium text-destructive' : ''}>
                            {formatDate(task.dueAt)}
                            {isOverdue && ' · overdue'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {task.status === 'OPEN' ? (
                          <form action={completeTask}>
                            <input type="hidden" name="taskId" value={task.id} />
                            <Button type="submit" size="sm" variant="outline">
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                              Mark done
                            </Button>
                          </form>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {task.completedAt ? formatDate(task.completedAt) : 'Done'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>Page {page} of {totalPages} · {total} task{total === 1 ? '' : 's'}</span>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" disabled={page <= 1}>
                  <Link href={qs({ page: String(Math.max(1, page - 1)) })}>Prev</Link>
                </Button>
                <Button asChild size="sm" variant="outline" disabled={page >= totalPages}>
                  <Link href={qs({ page: String(Math.min(totalPages, page + 1)) })}>Next</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}