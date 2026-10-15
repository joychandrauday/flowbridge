'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Keeps the engine ticking while the app is open.
 *
 * The real scheduler is the external cron hitting `/api/internal/tick` every
 * minute. That is durable — and also invisible: when the free-tier cron job is
 * misconfigured, paused, or rate-limited, delayed steps and retries just stop,
 * with nothing to show the owner. This component is the safety net. It asks
 * `/api/internal/drain` to run the same tick on mount and then once a minute
 * while a dashboard tab is open, and refreshes the shell when work was done so
 * the heartbeat stays honest.
 *
 * It renders nothing. The route is OWNER/ADMIN-only, so agents simply get a 403
 * that is ignored.
 */
export function EngineDrain({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter()
  const inFlight = useRef(false)

  useEffect(() => {
    let cancelled = false

    const ping = async () => {
      if (cancelled || inFlight.current) return
      // No point doing work nobody is looking at.
      if (typeof document !== 'undefined' && document.hidden) return
      inFlight.current = true
      try {
        const res = await fetch('/api/internal/drain', { method: 'POST' })
        if (!res.ok) return
        const data = (await res.json()) as { processed?: number }
        if (!cancelled && (data.processed ?? 0) > 0) router.refresh()
      } catch {
        /* best-effort: never break the shell */
      } finally {
        inFlight.current = false
      }
    }

    void ping()
    const timer = setInterval(ping, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [router, intervalMs])

  return null
}
