import Link from 'next/link'
import { Lead } from '@prisma/client'
import { Badge, BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronLeft, ChevronRight, Inbox, UserRound } from 'lucide-react'

export type LeadRow = Lead & {
  assignee?: { id: string; user: { id: string; name: string | null; email: string | null } } | null
  tasks: { id: string }[]
}

export interface LeadsTableProps {
  leads: LeadRow[]
  total: number
  page: number
  pageSize: number
  params: Record<string, string | string[] | undefined>
  assignees: { id: string; user: { name: string | null } }[]
}

const STATUS_VARIANT: Record<string, BadgeProps['variant'] | undefined> = {
  NEW: 'outline',
  CONTACTED: 'default',
  QUALIFIED: 'warning',
  WON: 'success',
  LOST: 'destructive',
}

function param(params: LeadsTableProps['params'], key: string): string {
  const value = params[key]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function filteredUrl(params: LeadsTableProps['params'], overrides: Record<string, string>): string {
  const url = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value) url.set(key, value)
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) url.set(key, value)
    else url.delete(key)
  }
  const qs = url.toString()
  return qs ? `/leads?${qs}` : '/leads'
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function LeadsTable({ leads, total, page, pageSize, params, assignees }: LeadsTableProps) {
  const q = param(params, 'q')
  const status = param(params, 'status')
  const assigneeId = param(params, 'assigneeId')
  const sort = param(params, 'sort') || 'newest'
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name or email" className="w-64" aria-label="Search leads" />
        <select
          name="status"
          defaultValue={status}
          aria-label="Filter by status"
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_VARIANT).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          name="assigneeId"
          defaultValue={assigneeId}
          aria-label="Filter by assignee"
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All assignees</option>
          {assignees.map((member) => (
            <option key={member.id} value={member.id}>{member.user.name ?? 'Unnamed'}</option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={sort}
          aria-label="Sort leads"
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>
        <input type="hidden" name="page" value="1" />
        <Button type="submit" size="sm" variant="secondary">Apply</Button>
      </form>

      <div className="rounded-md border">
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium">No leads {q || status || assigneeId ? 'match your filters' : 'yet'}</p>
              <p className="text-sm text-muted-foreground">
                {q || status || assigneeId
                  ? 'Try adjusting your filters.'
                  : 'Start with: create a form to capture leads instantly.'}
              </p>
            </div>
            {!q && !status && !assigneeId && (
              <Link href="/forms/new">
                <Button size="sm">Create your first form</Button>
              </Link>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Open tasks</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-muted/50">
                  <TableCell>
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                      {lead.name || 'Unnamed lead'}
                    </Link>
                    {lead.email && (
                      <p className="text-xs text-muted-foreground">{lead.email}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.phone ?? '—'}</TableCell>
                  <TableCell className="text-sm">{lead.source}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[lead.status] ?? 'outline'}>{lead.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {lead.assignee?.user.name ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
                          <UserRound className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        </span>
                        {lead.assignee.user.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{lead.tasks.length}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(lead.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} lead{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline" disabled={page <= 1}>
              <Link href={filteredUrl(params, { page: String(Math.max(1, page - 1)) })}>
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Prev
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" disabled={page >= totalPages}>
              <Link href={filteredUrl(params, { page: String(Math.min(totalPages, page + 1)) })}>
                Next <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}