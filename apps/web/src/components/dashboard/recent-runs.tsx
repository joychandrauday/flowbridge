'use client'

import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDistanceToNow } from 'date-fns'

export interface RecentRunRow {
  id: string
  status: string
  createdAt: Date | string
  startedAt: Date | string | null
  finishedAt: Date | string | null
  workflowName: string
  leadName: string | null
  leadEmail: string | null
}

interface RecentRunsProps {
  runs: RecentRunRow[]
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

export function RecentRuns({ runs }: RecentRunsProps) {
  if (runs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">No workflow runs yet</p>
      </div>
    )
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
          {runs.map((run) => {
            const startedAt = run.startedAt ? toDate(run.startedAt) : null
            const finishedAt = run.finishedAt ? toDate(run.finishedAt) : null

            return (
              <TableRow key={run.id}>
                <TableCell className="font-medium">{run.workflowName}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{run.leadName || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{run.leadEmail}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={run.status === 'SUCCEEDED' ? 'success' : run.status === 'FAILED' ? 'destructive' : 'default'}>
                    {run.status}
                  </Badge>
                </TableCell>
                <TableCell>{formatDistanceToNow(toDate(run.createdAt), { addSuffix: true })}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {finishedAt && startedAt
                    ? `${Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)}s`
                    : startedAt
                      ? 'Running...'
                      : '—'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
