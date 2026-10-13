import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import Link from 'next/link'
import { Badge, BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Activity as ActivityIcon,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  GitBranch,
  Mail,
  Phone,
  StickyNote,
  UserRound,
} from 'lucide-react'
import { updateLeadStatus, addLeadNote, updateLeadAssignee } from '../actions'

export const metadata: Metadata = {
  title: 'Lead | FlowBridge',
}

const STATUS_VARIANT: Record<string, BadgeProps['variant'] | undefined> = {
  NEW: 'outline',
  CONTACTED: 'default',
  QUALIFIED: 'warning',
  WON: 'success',
  LOST: 'destructive',
}

const ACTIVITY_TITLE: Record<string, string> = {
  status_change: 'Status changed',
  assignment: 'Lead assigned',
  note: 'Note added',
  email_sent: 'Email sent',
  task_created: 'Task created',
  workflow_run: 'Workflow ran',
  lead_created: 'Lead captured',
}

function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/login')
  const workspaceId = session.user.workspaceId

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, workspaceId },
    include: {
      assignee: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      intakeEvents: true,
      activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      tasks: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { assignee: { include: { user: { select: { id: true, name: true } } } } },
      },
      workflowRuns: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { workflow: { select: { name: true } } },
      },
    },
  })
  if (!lead) notFound()

  const assignees = await prisma.member.findMany({
    where: { workspaceId },
    select: { id: true, user: { select: { name: true } } },
  })

  const timeline = [
    ...lead.intakeEvents.map((event) => ({
      key: `event-${event.id}`,
      createdAt: event.receivedAt,
      kind: 'capture' as const,
      title: `Captured via ${event.source}`,
      body: event.formId ? `Intake event received` : 'Intake event received',
      meta: event.ip ? `IP ${event.ip}` : undefined,
    })),
    ...lead.activities.map((activity) => ({
      key: `activity-${activity.id}`,
      createdAt: activity.createdAt,
      kind: 'activity' as const,
      title: ACTIVITY_TITLE[activity.type] ?? activity.type,
      body: activity.body ?? '',
      meta: undefined as string | undefined,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className="space-y-6">
      <Link href="/leads" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowRight className="h-3.5 w-3.5 rotate-180" aria-hidden="true" /> Back to leads
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{lead.name || 'Unnamed lead'}</h1>
            <Badge variant={STATUS_VARIANT[lead.status] ?? 'outline'}>{lead.status}</Badge>
            <Badge variant="secondary">{lead.source}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {lead.email && (
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{lead.email}</span>
            )}
            {lead.phone && (
              <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{lead.phone}</span>
            )}
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{formatDateTime(lead.createdAt)}</span>
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              {lead.assignee?.user.name ?? 'Unassigned'}
            </span>
          </div>
        </div>

        <form action={updateLeadStatus} className="flex items-center gap-2">
          <input type="hidden" name="leadId" value={lead.id} />
          <select
            name="status"
            defaultValue={lead.status}
            aria-label="Change status"
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            {Object.keys(STATUS_VARIANT).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Button type="submit" size="sm">Update status</Button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <ActivityIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet for this lead.</p>
              ) : (
                <ol className="relative space-y-6 border-l pl-6">
                  {timeline.map((item) => (
                    <li key={item.key} className="relative">
                      <span className="absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full bg-muted ring-4 ring-background">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      </span>
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.body && <p className="text-sm text-muted-foreground">{item.body}</p>}
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(item.createdAt)}
                        {item.meta ? ` · ${item.meta}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Workflow runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.workflowRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workflow runs for this lead yet.</p>
              ) : (
                <ul className="space-y-3">
                  {lead.workflowRuns.map((run) => (
                    <li key={run.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{run.workflow.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(run.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={run.status === 'SUCCEEDED' ? 'success' : run.status === 'FAILED' ? 'destructive' : 'warning'}>
                          {run.status}
                        </Badge>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/runs/${run.id}`}>View</Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Add a note
              </CardTitle>
              <CardDescription>Notes appear in the timeline for your whole team.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={addLeadNote} className="space-y-2">
                <input type="hidden" name="leadId" value={lead.id} />
                <Textarea name="body" rows={3} placeholder="Call scheduled for Thursday…" aria-label="Note text" />
                <Button type="submit" size="sm">Add note</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks yet.</p>
              ) : (
                <ul className="space-y-3">
                  {lead.tasks.map((task) => (
                    <li key={task.id} className="rounded-md border px-3 py-2">
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : 'No due date'}
                        {task.assignee ? ` · ${task.assignee.user.name}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lead data</CardTitle>
              <CardDescription>Custom fields captured at intake.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(lead.data ?? {}, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reassign</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateLeadAssignee} className="space-y-2">
                <input type="hidden" name="leadId" value={lead.id} />
                <select
                  name="assigneeId"
                  defaultValue={lead.assigneeId ?? ''}
                  aria-label="Assign to"
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {assignees.map((member) => (
                    <option key={member.id} value={member.id}>{member.user.name ?? 'Unnamed'}</option>
                  ))}
                </select>
                <Button type="submit" size="sm">Save assignee</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}