import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeRetryAfter, tickDefaults } from './engine'

describe('computeRetryAfter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fixed backoff returns the base delay on every attempt', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const a = computeRetryAfter('fixed', 1)
    const b = computeRetryAfter('fixed', 3)
    expect(a.getTime()).toBe(Date.now() + 1 * 60 * 1000)
    expect(b.getTime()).toBe(Date.now() + 1 * 60 * 1000)
  })

  it('exponential backoff doubles for later attempts', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const a = computeRetryAfter('exponential', 1)
    const b = computeRetryAfter('exponential', 2)
    const c = computeRetryAfter('exponential', 3)
    expect(b.getTime() - a.getTime()).toBe(1 * 60 * 1000)
    expect(c.getTime() - b.getTime()).toBe(2 * 60 * 1000)
  })

  it('linear backoff scales by attempt count', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const a = computeRetryAfter('linear', 1)
    const c = computeRetryAfter('linear', 3)
    expect(c.getTime() - a.getTime()).toBe(2 * 60 * 1000)
  })

  it('honors a custom base delay', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const out = computeRetryAfter('fixed', 1, 5)
    expect(out.getTime()).toBe(Date.now() + 5 * 60 * 1000)
  })

  it('tick defaults respect the ~25s budget and every-minute retry granularity', () => {
    const defaults = tickDefaults()
    expect(defaults.timeBudgetMs).toBe(25000)
    expect(defaults.maxJobs).toBe(10)
    expect(defaults.lockTimeoutMs).toBe(30000)
  })
})