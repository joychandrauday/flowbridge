/**
 * Fixed-window rate limiter (SPEC §3) for public intake routes.
 *
 * Process-local by design: the app is a single Next.js deployment with no Redis
 * (AGENTS §1). In a multi-instance deployment swap this for Vercel KV / Upstash —
 * see `docs/decisions.md`.
 */

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

interface Entry {
  count: number
  resetAt: number
}

export interface RateLimiter {
  check(key: string, maxRequests: number, windowMs: number): RateLimitResult
  reset(): void
}

/** Create an isolated limiter. `now` is injectable for deterministic tests. */
export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const store = new Map<string, Entry>()

  function check(key: string, maxRequests: number, windowMs: number): RateLimitResult {
    const current = now()
    const entry = store.get(key)

    if (!entry || current >= entry.resetAt) {
      const resetAt = current + windowMs
      store.set(key, { count: 1, resetAt })
      return { allowed: true, remaining: Math.max(0, maxRequests - 1), resetAt }
    }

    if (entry.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt }
    }

    entry.count += 1
    return { allowed: true, remaining: Math.max(0, maxRequests - entry.count), resetAt: entry.resetAt }
  }

  return {
    check,
    reset: () => store.clear(),
  }
}
