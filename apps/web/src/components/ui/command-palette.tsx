'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  ClipboardList,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  Mail,
  Plus,
  Search,
  Settings,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react'

interface Command {
  id: string
  label: string
  group: string
  icon: LucideIcon
  hint?: string
  run: () => void
}

/**
 * Global ⌘K / Ctrl-K command palette (SPEC §10 micro-interactions). Pure client
 * navigation — no data fetching, so it is safe to mount on every dashboard page.
 */
export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href)
    return [
      { id: 'dashboard', label: 'Go to Dashboard', group: 'Navigate', icon: LayoutDashboard, run: go('/dashboard') },
      { id: 'leads', label: 'Go to Leads', group: 'Navigate', icon: Users, run: go('/leads') },
      { id: 'workflows', label: 'Go to Workflows', group: 'Navigate', icon: GitBranch, run: go('/workflows') },
      { id: 'runs', label: 'Go to Runs', group: 'Navigate', icon: ClipboardList, run: go('/runs') },
      { id: 'tasks', label: 'Go to Tasks', group: 'Navigate', icon: ListTodo, run: go('/tasks') },
      { id: 'forms', label: 'Go to Forms', group: 'Navigate', icon: Mail, run: go('/forms') },
      { id: 'settings', label: 'Go to Settings', group: 'Navigate', icon: Settings, run: go('/settings') },
      { id: 'new-workflow', label: 'Create workflow', group: 'Create', icon: Plus, hint: 'New', run: go('/workflows/new') },
      { id: 'new-form', label: 'Create form', group: 'Create', icon: Plus, hint: 'New', run: go('/forms/new') },
      { id: 'import', label: 'Import leads from CSV', group: 'Actions', icon: Upload, run: go('/leads/import') },
    ]
  }, [router])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((command) => command.label.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  const runAt = (index: number) => {
    const command = filtered[index]
    if (!command) return
    setOpen(false)
    command.run()
  }

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runAt(active)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Open command palette"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[20%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search pages and actions…"
              aria-label="Command palette search"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matching commands</li>
            ) : (
              filtered.map((command, index) => (
                <li key={command.id} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => runAt(index)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                      index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                    )}
                  >
                    <command.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1">{command.label}</span>
                    <span className="text-xs text-muted-foreground">{command.group}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
