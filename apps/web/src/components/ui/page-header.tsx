import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The page title pattern, identical on every screen: title left, actions right,
 * optional one-line description underneath. Left-aligned because everything below
 * it — tables, forms, timelines — reads left to right.
 *
 * `meta` sits beside the title for inline facts about the page as a whole (a
 * count, a live indicator, a version).
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  meta?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-[25px] font-semibold leading-tight tracking-display">{title}</h1>
          {meta}
        </div>
        {description ? (
          <p className="max-w-[72ch] text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/**
 * A labelled band inside a page. Used instead of stacking a bare `<h2>` followed
 * by a grid, so section spacing and heading weight stay consistent.
 */
export function SectionHeading({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="space-y-0.5">
        <h2 className="text-base font-semibold tracking-display">{title}</h2>
        {description ? (
          <p className="text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
