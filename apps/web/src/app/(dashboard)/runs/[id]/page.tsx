import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import Link from 'next/link'
import { Badge, BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, Clock, RefreshCw, Zap } from 'lucide-react'
import { retryFailedStep } from '../actions'

export const metadata: Metadata = {
  title: 'Run | FlowBridge',
}

const RUN_STATUS_VARIANT: Record<string, BadgeProps['variant'] | undefined> = {
  QUEUED: 'outline',
  RUNNING: 'secondary',
  WAITING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'destructive',
  CANCELED: 'outline',
}

const STEP_STATUS_VARIANT: Record<string, BadgeProps['variant'] | undefined> = {
  PENDING: 'outline',
  RUNNING: 'secondary',
  SUCCEEDED: 'success',
  FAILED: 'destructive',
  SKIPPED: 'outline',
}

function formatDate(date: Date | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(startedAt: Date | null, finishedAt: Date | null): string {
  if (!startedAt) return '—'
  const ms = (finishedAt ?? new Date()).getTime() - startedAt.getTime()
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function StepTypeIcon({ type }: { type: string }) {
  if (type === 'send_email') return <span className="text-sm">✉️</span>
  if (type === 'send_telegram') return <span className="text-sm">📨</span>
  if (type === 'send_slack') return <span className="text-sm">💬</span>
  if (type === 'send_discord') return <span className="text-sm">🟪</span>
  if (type === 'http_request') return <span className="text-sm">🌐</span>
  if (type === 'delay') return <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
  if (type === 'assign') return <span className="text-sm">👤</span>
  if (type === 'create_task') return <span className="text-sm">✅</span>
  if (type === 'update_field') return <span className="text-sm">🔧</span>
  return <Zap className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
}

export default async function RunDetailPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/login')
  const workspaceId = session.user.workspaceId

  const run = await prisma.workflowRun.findFirst({
    where: { id: params.id, workspaceId },
    include: {
      workflow: { select: { name: true, description: true } },
      lead: { select: { id: true, name: true, email: true } },
      steps: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!run) notFound()

  const failedSteps = run.steps.filter((step) => step.status === 'FAILED')

  return (
    <div className="space-y-6">
      <Link href="/runs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-3.5 w-3.5 rotate-180" aria-hidden="true" /> Back to runs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{run.workflow.name}</h1>
            <Badge variant={RUN_STATUS_VARIANT[run.status]}>{run.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.workflow.description ?? 'Workflow run'}
            {run.lead && (
              <>
                {' '}·{' '}
                <Link href={`/leads/${run.lead.id}`} className="hover:underline">
                  {run.lead.name || run.lead.email || 'Unnamed lead'}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      {run.error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3">
          <p className="text-sm font-medium text-destructive">Run failed</p>
          <p className="mt-1 text-sm text-destructive/90">{run.error}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Version</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">v{run.workflowVersion}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Started</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatDate(run.startedAt)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatDuration(run.startedAt, run.finishedAt)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{run.steps.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step timeline</CardTitle>
          <CardDescription>
            Inputs and outputs are snapshotted at execution time. Secrets are redacted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {run.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps recorded for this run yet.</p>
          ) : (
            <ol className="relative space-y-6 border-l pl-6">
              {run.steps.map((step, index) => (
                <li key={step.id} className="relative">
                  <span
                    className={`absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-background ${
                      step.status === 'SUCCEEDED' ? 'bg-success' : step.status === 'FAILED' ? 'bg-destructive' : 'bg-muted'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-background" />
                  </span>
                  <div className="space-y-2 rounded-md border px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 font-medium">
                        <StepTypeIcon type={step.type} />
                        <span>{step.type.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-muted-foreground">· step {index + 1}</span>
                      </p>
                      <div className="flex items-center gap-2">
                        {step.attempts > 1 && (
                          <span className="text-xs text-muted-foreground">
                            {step.attempts} {step.attempts === 1 ? 'attempt' : 'attempts'}
                          </span>
                        )}
                        <Badge variant={STEP_STATUS_VARIANT[step.status]}>{step.status}</Badge>
                        {step.status === 'FAILED' && run.status === 'FAILED' && (
                          <form action={retryFailedStep}>
                            <input type="hidden" name="runId" value={run.id} />
                            <input type="hidden" name="stepKey" value={step.stepKey} />
                            <Button type="submit" size="sm" variant="outline">
                              <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                              Retry from here
                            </Button>
                          </form>
                        )}
                      </div>
                    </div>

                    {step.error && (
                      <p className="text-sm text-destructive">{step.error}</p>
                    )}

                    <div className="grid gap-2 text-xs md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-muted-foreground">Input snapshot</p>
                        <pre className="max-h-48 overflow-auto rounded bg-muted p-2 leading-relaxed">
                          {JSON.stringify(step.input ?? {}, null, 2) || '{}'}
                        </pre>
                      </div>
                      {(step.status === 'SUCCEEDED' || step.status === 'PENDING') && (
                        <div>
                          <p className="mb-1 text-muted-foreground">Output</p>
                          <pre className="max-h-48 overflow-auto rounded bg-muted p-2 leading-relaxed">
                            {JSON.stringify(step.output ?? {}, null, 2) || '{}'}
                          </pre>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {formatDate(step.startedAt)} → {formatDate(step.finishedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {run.status === 'FAILED' && failedSteps.length > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Fix the root cause, then use <span className="font-medium">Retry from here</span> on the failed
              step — the run resumes from that point (scheduled within ~1 minute on the next tick).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}