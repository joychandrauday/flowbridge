import { describe, expect, it } from 'vitest'
import { matchesCron, parseCron } from './cron'

// 2026-10-13 is a Tuesday.
const tue0900 = new Date('2026-10-13T09:00:00.000Z')
const tue0930 = new Date('2026-10-13T09:30:00.000Z')
const sat0900 = new Date('2026-10-17T09:00:00.000Z')

describe('parseCron', () => {
  it('accepts a valid 5-field expression', () => {
    expect(parseCron('*/15 * * * *')).toEqual({
      minute: '*/15',
      hour: '*',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '*',
    })
  })

  it('rejects wrong field counts', () => {
    expect(parseCron('* * * *')).toBeNull()
    expect(parseCron('* * * * * *')).toBeNull()
  })

  it('rejects out-of-range values', () => {
    expect(parseCron('60 * * * *')).toBeNull()
    expect(parseCron('* 24 * * *')).toBeNull()
    expect(parseCron('* * 0 * *')).toBeNull()
    expect(parseCron('* * * 13 *')).toBeNull()
  })

  it('rejects malformed steps and ranges', () => {
    expect(parseCron('*/0 * * * *')).toBeNull()
    expect(parseCron('5-2 * * * *')).toBeNull()
    expect(parseCron('a * * * *')).toBeNull()
  })
})

describe('matchesCron', () => {
  it('matches every minute with *', () => {
    expect(matchesCron('* * * * *', tue0900)).toBe(true)
  })

  it('matches step values', () => {
    expect(matchesCron('*/15 * * * *', tue0900)).toBe(true) // :00
    expect(matchesCron('*/15 * * * *', tue0930)).toBe(true) // :30
    expect(matchesCron('0,30 9 * * *', tue0930)).toBe(true)
    expect(matchesCron('0 * * * *', tue0930)).toBe(false)
  })

  it('matches a weekday range (9am Mon-Fri)', () => {
    expect(matchesCron('0 9 * * 1-5', tue0900)).toBe(true)
    expect(matchesCron('0 9 * * 1-5', sat0900)).toBe(false)
  })

  it('treats 7 as Sunday', () => {
    const sunday = new Date('2026-10-18T09:00:00.000Z')
    expect(matchesCron('0 9 * * 7', sunday)).toBe(true)
    expect(matchesCron('0 9 * * 0', sunday)).toBe(true)
  })

  it('returns false for invalid expressions', () => {
    expect(matchesCron('not a cron', tue0900)).toBe(false)
    expect(matchesCron('', tue0900)).toBe(false)
  })
})
