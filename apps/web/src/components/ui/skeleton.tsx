import * as React from 'react'
import { cn } from '@/lib/utils'

/** Animated placeholder used by route-level `loading.tsx` states. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}

export { Skeleton }
