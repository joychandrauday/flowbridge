'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { EngineHeartbeat as Heartbeat } from '@/lib/heartbeat'

/**
 * The engine heartbeat: a live readout of what the automation engine is doing.
 *
 * The product runs on a one-minute tick, so work is never instantaneous — this
 * makes that visible instead of leaving the user guessing whether anything is
 * happening. The rule that shapes it: if a run has failed in the last day, that
 * fact outranks everything else and turns the whole indicator red and clickable.
 * A quiet engine is a calm indicator; a broken engine is impossible to miss.
 *
 * `serverNow` is passed in rather than read from the client clock so the first
 * client render matches the server render exactly (no hydration mismatch), and
 * only then does it start ticking.
 */

function formatAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

const TICK_HINT =
  'FlowBridge runs on a one-minute tick. Queued work and delayed steps start within about a minute.'

export function EngineHeartbeat({
  heartbeat,
  serverNow,
  className,
}: {
  heartbeat: Heartbeat
  serverNow: number
  className?: string
}) {
  const [now, setNow] = useState(serverNow)

  useEffect(() => {
    // Re-render often enough that the readout stays honest; the relative label
    // only changes at second/minute boundaries anyway.
    const timer = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(timer)
  }, [])

  const failed = heartbeat.failed24h > 0
  const busy = heartbeat.running > 0
  const queued = heartbeat.queued > 0

  const tone = failed ? 'danger' : busy ? 'progress' : queued ? 'attention' : 'idle'

  const lampClass = {
    danger: 'bg-destructive animate-flow-pulse',
    progress: 'bg-brand animate-flow-pulse',
    attention: 'bg-amber-500',
    idle: 'bg-muted-foreground/50',
  }[tone]

  const shellClass = {
    danger: 'border-destructive/40 bg-destructive/10 text-destructive hover:border-destructive/60',
    progress: 'border-border bg-card text-foreground',
    attention: 'border-border bg-card text-foreground',
    idle: 'border-border bg-card text-muted-foreground',
  }[tone]

  const activity = heartbeat.lastActivityAt
    ? formatAgo(now - new Date(heartbeat.lastActivityAt).getTime())
    : null

  const body = (
    <>
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', lampClass)} />
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        {failed ? (
          <>
            <span className="metric font-semibold">{heartbeat.failed24h}</span>
            <span className="font-medium">failed</span>
          </>
        ) : busy ? (
          <>
            <span className="metric font-semibold">{heartbeat.running}</span>
            <span className="font-medium">running</span>
          </>
        ) : queued ? (
          <>
            <span className="metric font-semibold">{heartbeat.queued}</span>
            <span className="font-medium">queued</span>
          </>
        ) : (
          <span className="font-medium">Engine idle</span>
        )}
      </span>
      {!failed && activity ? (
        <>
          <span aria-hidden="true" className="text-border">
            ·
          </span>
          {/* Live region is intentionally off: a ticking clock is not an alert. */}
          <span className="metric hidden whitespace-nowrap text-muted-foreground lg:inline">
            {activity}
          </span>
        </>
      ) : null}
      {failed ? <span className="hidden whitespace-nowrap lg:inline">in 24h</span> : null}
    </>
  )

  const base = cn(
    'inline-flex h-8 items-center gap-2 rounded-control border px-2.5 text-[13px]',
    'transition-colors duration-flow ease-flow',
    shellClass,
    className
  )

  if (failed) {
    return (
      <Link href="/runs?status=FAILED" className={cn(base, 'focus-visible:outline-none')} title={TICK_HINT}>
        <span className="sr-only">Failed runs need attention. View failed runs.</span>
        {body}
      </Link>
    )
  }

  return (
    <div className={base} title={TICK_HINT}>
      <span className="sr-only">
        Automation engine status: {busy ? `${heartbeat.running} running` : queued ? `${heartbeat.queued} queued` : 'idle'}
        {activity ? `, last activity ${activity}` : ''}
      </span>
      {body}
    </div>
  )
}
