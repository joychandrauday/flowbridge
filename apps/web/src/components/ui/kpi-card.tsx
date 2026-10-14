import * as React from 'react'
import { AlertTriangle, Mail, TrendingUp, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

/**
 * A dashboard reading, not a decorative tile: label, figure, and — when there
 * is real history behind it — the movement against last week. The figure is set
 * in tabular figures so a row of cards lines up, and the icon stays muted in the
 * corner rather than sitting in a filled square.
 *
 * A negative movement is deliberately *not* red: red in this product means an
 * automation failed, and a quiet week is not a failure.
 */
interface KPICardProps {
  title: string
  value: string | number
  icon: string
  variant?: 'default' | 'primary' | 'destructive' | 'success'
  trend?: { value: number; label: string }
  /** Small secondary reading, e.g. "of 128 total". */
  detail?: React.ReactNode
  href?: string
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Users,
  Mail,
  TrendingUp,
  AlertTriangle,
}

export function KPICard({ title, value, icon, variant = 'default', trend, detail, href }: KPICardProps) {
  const Icon = iconMap[icon] ?? TrendingUp
  const isAlert = variant === 'destructive'

  const body = (
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <p
            className={cn(
              'metric text-[28px] font-semibold leading-none tracking-display',
              isAlert && 'text-destructive'
            )}
          >
            {value}
          </p>
          {detail ? <div className="text-[13px] text-muted-foreground">{detail}</div> : null}
          {trend ? (
            <div className="flex items-center gap-1.5 text-[13px]">
              <span
                className={cn(
                  'metric font-medium',
                  trend.value > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                )}
              >
                {trend.value > 0 ? '+' : ''}
                {trend.value}%
              </span>
              <span className="text-muted-foreground">{trend.label}</span>
            </div>
          ) : null}
        </div>
        <Icon
          aria-hidden="true"
          className={cn(
            'mt-0.5 size-4 shrink-0',
            isAlert ? 'text-destructive' : 'text-muted-foreground/70'
          )}
        />
      </div>
    </CardContent>
  )

  if (href) {
    return (
      <Card className="flow-lift cursor-pointer hover:border-primary/40 hover:shadow-raised">
        <a href={href} className="block rounded-card focus-visible:outline-none">
          {body}
        </a>
      </Card>
    )
  }

  return <Card className="flow-lift hover:border-primary/40 hover:shadow-raised">{body}</Card>
}
