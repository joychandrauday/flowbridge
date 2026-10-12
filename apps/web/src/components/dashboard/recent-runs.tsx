'use client'

import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDistanceToNow } from 'date-fns'

interface RecentRunsProps {
  workspaceId: string
  limit?: number
}

export async function RecentRuns({ workspaceId, limit = 10 }: RecentRunsProps) {
  const runs = await prisma.workflowRun.findMany({
    where: { workflow: { workspaceId } },
    include: {
      workflow: { select: { name: true } },
      lead: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  if (runs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">No workflow runs yet</p>
      </div>
    )
  }

  const statusStyles: Record<string, string> = {
    QUEUED: 'bg-gray-100 text-gray-800',
    RUNNING: 'bg-blue-100 text-blue-800',
    WAITING: 'bg-yellow-100 text-yellow-800',
    SUCCEEDED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    CANCELED: 'bg-gray-100 text-gray-800',
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow</TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead className="text-right">Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell className="font-medium">{run.workflow.name}</TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">{run.lead?.name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{run.lead?.email}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={run.status === 'SUCCEEDED' ? 'success' : run.status === 'FAILED' ? 'destructive' : 'default'}>
                  {run.status}
                </Badge>
              </TableCell>
              <TableCell>{formatDistanceToNow(run.createdAt, { addSuffix: true })}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {run.finishedAt && run.startedAt
                  ? `${Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000)}s`
                  : run.startedAt
                    ? 'Running...'
                    : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}