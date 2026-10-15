import { describe, it, expect } from 'vitest'
import { EMPTY_HEARTBEAT, STALL_THRESHOLD_MS, isEngineStalled } from './heartbeat'

const NOW = new Date('2026-10-15T12:00:00.000Z').getTime()

describe('isEngineStalled', () => {
  it('is never stalled when nothing is queued', () => {
    expect(isEngineStalled(null, NOW)).toBe(false)
  })

  it('is not stalled while a queued run is still within a normal tick', () => {
    // Queue drains every minute; one minute of waiting is expected behaviour.
    expect(isEngineStalled(new Date(NOW - 60_000), NOW)).toBe(false)
  })

  it('is not stalled exactly at the threshold — only past it', () => {
    expect(isEngineStalled(new Date(NOW - STALL_THRESHOLD_MS), NOW)).toBe(false)
    expect(isEngineStalled(new Date(NOW - STALL_THRESHOLD_MS - 1), NOW)).toBe(true)
  })

  it('flags a queue that has not moved for well over the threshold', () => {
    // The production incident: jobs sat QUEUED for ~45 minutes.
    expect(isEngineStalled(new Date(NOW - 45 * 60_000), NOW)).toBe(true)
  })

  it('honors a custom threshold', () => {
    const tenMinutesOld = new Date(NOW - 10 * 60_000)
    expect(isEngineStalled(tenMinutesOld, NOW, 15 * 60_000)).toBe(false)
    expect(isEngineStalled(tenMinutesOld, NOW, 5 * 60_000)).toBe(true)
  })
})

describe('EMPTY_HEARTBEAT', () => {
  it('is the calm, unknown state', () => {
    expect(EMPTY_HEARTBEAT).toMatchObject({
      running: 0,
      queued: 0,
      queuedNow: 0,
      failed24h: 0,
      stalled: false,
      oldestQueuedAgeMs: null,
      lastActivityAt: null,
    })
  })
})
