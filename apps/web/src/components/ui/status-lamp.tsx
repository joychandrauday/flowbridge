import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The status language for the whole app.
 *
 * Status is the single most important thing FlowBridge communicates, so it gets
 * a consistent system rather than ad-hoc coloured pills: one mapping from every
 * domain status to a tone, used by leads, runs, tasks, forms and workflows
 * alike. A tone is rendered as a lamp — a dot plus a word — not a filled pill,
 * so state reads as an indicator on an instrument rather than as decoration.
 *
 * One rule matters more than the rest: **destructive/red means the machine
 * failed.** A lost lead is a normal business outcome and is deliberately muted,
 * so red in a list always means "an automation broke".
 */
export type Tone = 'neutral' | 'info' | 'progress' | 'positive' | 'attention' | 'danger' | 'muted'

const LEAD_STATUS_TONES: Record<string, Tone> = {
  NEW: 'info',
  CONTACTED: 'progress',
  QUALIFIED: 'attention',
  WON: 'positive',
  LOST: 'muted',
}

const RUN_STATUS_TONES: Record<string, Tone> = {
  QUEUED: 'neutral',
  RUNNING: 'progress',
  WAITING: 'attention',
  SUCCEEDED: 'positive',
  FAILED: 'danger',
  CANCELED: 'muted',
}

const TASK_STATUS_TONES: Record<string, Tone> = {
  OPEN: 'info',
  DONE: 'positive',
}

export type StatusKind = 'lead' | 'run' | 'task' | 'workflow'

export function statusTone(status: string, kind: StatusKind = 'lead'): Tone {
  const table =
    kind === 'run' ? RUN_STATUS_TONES : kind === 'task' ? TASK_STATUS_TONES : LEAD_STATUS_TONES
  return table[status?.toUpperCase()] ?? 'neutral'
}

/** The dot itself. `live` adds the slow pulse used for work in progress. */
const DOT: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/60',
  info: 'bg-brand',
  progress: 'bg-brand',
  positive: 'bg-emerald-500',
  attention: 'bg-amber-500',
  danger: 'bg-destructive',
  muted: 'bg-muted-foreground/35',
}

const LABEL: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-foreground',
  progress: 'text-primary',
  positive: 'text-emerald-700 dark:text-emerald-400',
  attention: 'text-amber-700 dark:text-amber-400',
  danger: 'text-destructive',
  muted: 'text-muted-foreground/80',
}

/** Only the alarming tone earns a filled background — that is what makes it loud. */
const CONTAINER: Record<Tone, string> = {
  neutral: '',
  info: '',
  progress: '',
  positive: '',
  attention: '',
  danger: 'bg-destructive/10 ring-1 ring-inset ring-destructive/20',
  muted: '',
}

export function StatusLamp({
  status,
  kind = 'lead',
  tone,
  label,
  live,
  className,
}: {
  status?: string
  kind?: StatusKind
  tone?: Tone
  label?: string
  live?: boolean
  className?: string
}) {
  const resolved: Tone = tone ?? statusTone(status ?? '', kind)
  const text = label ?? status ?? ''
  const isLive = live ?? /running/i.test(text)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[13px] font-medium',
        LABEL[resolved],
        CONTAINER[resolved],
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', DOT[resolved], isLive && 'animate-flow-pulse')}
      />
      {text}
    </span>
  )
}

/** A bare lamp, for tight spaces like a table's first column or a chart legend. */
export function StatusDot({ tone, live, className }: { tone: Tone; live?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2 shrink-0 rounded-full', DOT[tone], live && 'animate-flow-pulse', className)}
    />
  )
}

/** Shared legend order for the lead pipeline. */
export const LEAD_STATUS_ORDER = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'] as const

export const RUN_STATUS_ORDER = ['QUEUED', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELED'] as const
