import { describe, it, expect } from 'vitest'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('allows up to the max then blocks', () => {
    const limiter = createRateLimiter()
    expect(limiter.check('k', 2, 60_000).allowed).toBe(true)
    expect(limiter.check('k', 2, 60_000).allowed).toBe(true)

    const third = limiter.check('k', 2, 60_000)
    expect(third.allowed).toBe(false)
    expect(third.remaining).toBe(0)
  })

  it('tracks keys independently', () => {
    const limiter = createRateLimiter()
    expect(limiter.check('a', 1, 60_000).allowed).toBe(true)
    expect(limiter.check('b', 1, 60_000).allowed).toBe(true)
    expect(limiter.check('a', 1, 60_000).allowed).toBe(false)
    expect(limiter.check('b', 1, 60_000).allowed).toBe(false)
  })

  it('resets after the window elapses', () => {
    let clock = 1_000_000
    const limiter = createRateLimiter(() => clock)

    expect(limiter.check('k', 1, 60_000).allowed).toBe(true)
    expect(limiter.check('k', 1, 60_000).allowed).toBe(false)

    clock += 60_001
    const after = limiter.check('k', 1, 60_000)
    expect(after.allowed).toBe(true)
    expect(after.resetAt).toBe(clock + 60_000)
  })

  it('reports remaining count and reset time', () => {
    const limiter = createRateLimiter(() => 0)
    const first = limiter.check('k', 3, 120_000)
    expect(first.remaining).toBe(2)
    expect(first.resetAt).toBe(120_000)
  })
})
