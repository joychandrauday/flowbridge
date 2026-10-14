import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Empty states are a first-class screen in this product, not a placeholder.
 *
 * A workspace with no workflows is the most likely first impression, so every
 * empty state offers a concrete starting point ("Instant lead assignment", "Route
 * by source") rather than just describing the absence. Nothing here says "no data
 * found" — silence is the failure mode FlowBridge exists to eliminate, and that
 * applies to the UI's own voice as much as to automations.
 */
export interface EmptyStateSuggestion {
  label: string
  description?: string
  onSelect?: () => void
  href?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  suggestions,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  suggestions?: EmptyStateSuggestion[]
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-border px-6 py-14 text-center',
        'motion-safe:animate-flow-fade',
        className
      )}
    >
      {Icon ? (
        <span className="mb-4 grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}

      <h3 className="text-base font-semibold tracking-display">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-5">{action}</div> : null}

      {suggestions?.length ? (
        <div className="mt-7 w-full max-w-md space-y-1.5 border-t border-border pt-5 text-left">
          <p className="mb-2.5 flex items-center gap-1.5 text-2xs font-semibold text-muted-foreground">
            <Sparkles className="size-3" aria-hidden="true" />
            Start with a template
          </p>
          {suggestions.map((s) => {
            const Inner = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{s.label}</span>
                  {s.description ? (
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {s.description}
                    </span>
                  ) : null}
                </span>
                <ArrowRight
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-flow ease-flow group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </>
            )

            const shared =
              'group flex w-full items-center gap-3 rounded-control border border-transparent px-3 py-2 text-left transition-colors duration-flow ease-flow hover:border-border hover:bg-accent'

            return s.href ? (
              <a key={s.label} href={s.href} className={shared}>
                {Inner}
              </a>
            ) : (
              <button key={s.label} type="button" onClick={s.onSelect} className={shared}>
                {Inner}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
