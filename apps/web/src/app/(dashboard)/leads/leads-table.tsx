'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lead } from '@prisma/client'
import { Badge, BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronLeft, ChevronRight, Inbox, UserRound, Bookmark, X } from 'lucide-react'
import { bulkUpdateLeads, updateLeadAssignee } from './actions'

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
  /** Owners/admins may reassign; agents see a read-only assignee. */
  canReassign: boolean
}

const STATUS_VARIANT: Record<string, BadgeProps['variant'] | undefined> = {
  NEW: 'outline',
  CONTACTED: 'default',
  QUALIFIED: 'warning',
  WON: 'success',
  LOST: 'destructive',
}

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST']
const SAVED_FILTERS_KEY = 'flowbridge:savedLeadFilters'

interface SavedFilter {
  name: string
  query: string
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

/** The current filter set (without pagination) — what a saved filter stores. */
function currentFilterQuery(params: LeadsTableProps['params']): string {
  const url = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page') continue
    if (typeof value === 'string' && value) url.set(key, value)
  }
  return url.toString()
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function LeadsTable({ leads, total, page, pageSize, params, assignees, canReassign }: LeadsTableProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const q = param(params, 'q')
  const status = param(params, 'status')
  const assigneeId = param(params, 'assigneeId')
  const sort = param(params, 'sort') || 'newest'
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const filterQuery = currentFilterQuery(params)

  // ---- Saved filters (client-side, per browser) --------------------------
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [saveName, setSaveName] = useState('')
  const [showSave, setShowSave] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_FILTERS_KEY)
      if (raw) setSavedFilters(JSON.parse(raw) as SavedFilter[])
    } catch {
      // ignore malformed storage
    }
  }, [])

  const persist = (next: SavedFilter[]) => {
    setSavedFilters(next)
    try {
      window.localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable — keep in-memory only
    }
  }

  const saveCurrentFilter = () => {
    const name = saveName.trim()
    if (!name) return
    const next = [...savedFilters.filter((f) => f.name !== name), { name, query: filterQuery }]
    persist(next)
    setSaveName('')
    setShowSave(false)
  }

  const removeFilter = (name: string) => persist(savedFilters.filter((f) => f.name !== name))

  // ---- Selection + bulk actions -----------------------------------------
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allSelected = leads.length > 0 && leads.every((lead) => selected.has(lead.id))

  const toggleAll = () => {
    setSelected((prev) => {
      if (leads.every((lead) => prev.has(lead.id))) return new Set()
      return new Set(leads.map((lead) => lead.id))
    })
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const applyBulk = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      await bulkUpdateLeads(formData)
      setSelected(new Set())
    })
  }

  const selectedCount = selected.size

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
          {STATUSES.map((s) => (
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Bookmark className="h-3.5 w-3.5" aria-hidden="true" /> Saved filters
        </span>
        {savedFilters.length === 0 && !showSave && (
          <span className="text-xs text-muted-foreground">none yet</span>
        )}
        {savedFilters.map((filter) => (
          <span
            key={filter.name}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
          >
            <button
              type="button"
              className="hover:underline"
              onClick={() => router.push(filter.query ? `/leads?${filter.query}` : '/leads')}
            >
              {filter.name}
            </button>
            <button
              type="button"
              aria-label={`Delete filter ${filter.name}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => removeFilter(filter.name)}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        {showSave ? (
          <span className="inline-flex items-center gap-1">
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Filter name"
              className="h-7 w-36 text-xs"
              aria-label="Filter name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  saveCurrentFilter()
                }
              }}
            />
            <Button type="button" size="sm" variant="secondary" className="h-7" onClick={saveCurrentFilter}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setShowSave(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setShowSave(true)}
          >
            Save current
          </Button>
        )}
      </div>

      {selectedCount > 0 && (
        <form onSubmit={applyBulk} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="leadIds" value={id} />
          ))}
          <span className="text-sm font-medium">
            {selectedCount} selected
          </span>
          <select name="status" defaultValue="" aria-label="Set status" className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">No status change</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>Set status: {s}</option>
            ))}
          </select>
          {canReassign && (
            <select name="assigneeId" defaultValue="" aria-label="Set assignee" className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">No assignee change</option>
              <option value="__none__">Unassign</option>
              {assignees.map((member) => (
                <option key={member.id} value={member.id}>Assign: {member.user.name ?? 'Unnamed'}</option>
              ))}
            </select>
          )}
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Applying…' : `Apply to ${selectedCount}`}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </form>
      )}

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
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all leads on this page"
                    className="h-4 w-4 rounded border-input"
                  />
                </TableHead>
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
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      aria-label={`Select ${lead.name || lead.email || 'lead'}`}
                      className="h-4 w-4 rounded border-input"
                    />
                  </TableCell>
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
                    {canReassign ? (
                      <form action={updateLeadAssignee}>
                        <input type="hidden" name="leadId" value={lead.id} />
                        <select
                          name="assigneeId"
                          defaultValue={lead.assignee?.id ?? ''}
                          aria-label={`Assignee for ${lead.name || lead.email || 'lead'}`}
                          className="h-8 rounded-md border bg-background px-2 text-sm"
                          onChange={(e) => e.currentTarget.form?.requestSubmit()}
                        >
                          <option value="">Unassigned</option>
                          {assignees.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.user.name ?? 'Unnamed'}
                            </option>
                          ))}
                        </select>
                      </form>
                    ) : lead.assignee?.user.name ? (
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
