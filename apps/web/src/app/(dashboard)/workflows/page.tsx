import { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { prisma } from '@flowbridge/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GitBranch, Play, Square } from 'lucide-react'
import { toggleWorkflow } from './actions'
import { TemplateGallery } from './template-gallery'

export const metadata: Metadata = {
  title: 'Workflows | FlowBridge',
}

interface WorkflowDefinitionMeta {
  trigger?: { type?: string }
  steps?: { id: string; type: string }[]
  conditions?: unknown[]
}

function describeTrigger(def: unknown): string {
  const parsed = (def ?? {}) as WorkflowDefinitionMeta
  switch (parsed.trigger?.type) {
    case 'lead.created':
      return 'When a lead is captured'
    case 'lead.status_changed':
      return 'When a lead status changes'
    case 'lead.no_activity':
      return 'When a lead goes quiet'
    case 'schedule':
      return 'On a schedule'
    default:
      return parsed.trigger?.type ?? 'Manual'
  }
}

export default async function WorkflowsPage() {
  const session = await auth()
  if (!session?.user?.workspaceId) redirect('/login')
  const workspaceId = session.user.workspaceId

  const workflows = await prisma.workflow.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { runs: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
          <p className="text-muted-foreground">Automations that act on your leads as they arrive</p>
        </div>
        <Button asChild>
          <Link href="/workflows/new">
            <Play className="mr-2 h-4 w-4" />
            New workflow
          </Link>
        </Button>
      </div>

      {workflows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <GitBranch className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-medium">No workflows yet</p>
            <p className="text-sm text-muted-foreground">Start with: Instant lead assignment — or pick a template below.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {workflows.map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {workflow.name}
                      <Badge variant={workflow.enabled ? 'success' : 'outline'}>
                        {workflow.enabled ? 'Enabled' : 'Paused'}
                      </Badge>
                    </CardTitle>
                    {workflow.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{workflow.description}</p>
                    )}
                  </div>
                  <Badge variant="secondary">v{workflow.version}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-1">{describeTrigger(workflow.definition)}</span>
                  <span className="rounded-full bg-muted px-2 py-1">
                    {(workflow.definition as WorkflowDefinitionMeta)?.steps?.length ?? 0} step
                    {(workflow.definition as WorkflowDefinitionMeta)?.steps?.length === 1 ? '' : 's'}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-1">{workflow._count.runs} run{workflow._count.runs === 1 ? '' : 's'}</span>
                </div>
                <form action={toggleWorkflow} className="flex items-center gap-4">
                  <input type="hidden" name="workflowId" value={workflow.id} />
                  <Button type="submit" size="sm" variant={workflow.enabled ? 'outline' : 'secondary'}>
                    {workflow.enabled ? (
                      <>
                        <Square className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Resume
                      </>
                    )}
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/runs?workflowId=${workflow.id}`}>View runs</Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/workflows/${workflow.id}/edit`}>Edit</Link>
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateGallery />
    </div>
  )
}