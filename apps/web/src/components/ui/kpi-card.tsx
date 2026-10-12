import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

interface KPICardProps {
  title: string
  value: string | number
  icon: string
  variant?: 'default' | 'primary' | 'destructive' | 'success'
  trend?: { value: number; label: string }
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Users: () => <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Mail: () => <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  TrendingUp: () => <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  AlertTriangle: () => <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>,
}

export function KPICard({ title, value, icon: IconName, variant = 'default', trend }: KPICardProps) {
  const Icon = iconMap[IconName] || (() => <div className="h-5 w-5" />)

  const variantClasses = {
    default: 'border-l-4 border-primary',
    primary: 'border-l-4 border-primary',
    destructive: 'border-l-4 border-destructive',
    success: 'border-l-4 border-green-500',
  }

  return (
    <Card className={cn(variantClasses[variant])}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <span className="font-medium">+{trend.value}%</span>
                <span className="text-muted-foreground">{trend.label}</span>
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <Icon />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}