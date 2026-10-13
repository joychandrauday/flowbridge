/**
 * Minimal 5-field cron matcher for `schedule` triggers (SPEC.md §2).
 *
 * Fields: minute hour day-of-month month day-of-week. Supports `*`, `a`,
 * `a-b`, `a,b,c`, and `/step` (`*` or `a-b`). Day-of-week is 0–6 (Sunday=0),
 * with 7 also accepted as Sunday. Expressions are evaluated in **UTC** —
 * per-workflow timezones are a future enhancement (noted in decisions.md).
 *
 * Pure module — no IO — exhaustively unit-tested in cron.test.ts.
 */

const RANGES = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 7],
} as const

export interface CronFields {
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
}

/** Split and validate a 5-field cron expression. Returns null when invalid. */
export function parseCron(expression: string): CronFields | null {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
  const fields: CronFields = { minute, hour, dayOfMonth, month, dayOfWeek }
  for (const [name, value] of Object.entries(fields)) {
    if (!isValidField(value, RANGES[name as keyof typeof RANGES])) return null
  }
  return fields
}

function isValidField(field: string, [min, max]: readonly [number, number]): boolean {
  for (const part of field.split(',')) {
    if (part === '') return false
    const [range, stepStr] = part.split('/')
    if (stepStr !== undefined) {
      const step = Number(stepStr)
      if (!Number.isInteger(step) || step <= 0) return false
    }
    if (range === '*') continue
    if (range.includes('-')) {
      const [aStr, bStr] = range.split('-')
      const a = Number(aStr)
      const b = Number(bStr)
      if (!Number.isInteger(a) || !Number.isInteger(b)) return false
      if (a < min || b > max || a > b) return false
    } else {
      const n = Number(range)
      if (!Number.isInteger(n) || n < min || n > max) return false
    }
  }
  return true
}

function matchesField(field: string, value: number, min: number): boolean {
  for (const part of field.split(',')) {
    if (part === '*') return true
    const [range, stepStr] = part.split('/')
    const step = stepStr ? Number(stepStr) : 1

    if (range === '*') {
      if ((value - min) % step === 0) return true
      continue
    }
    if (range.includes('-')) {
      const [aStr, bStr] = range.split('-')
      const a = Number(aStr)
      const b = Number(bStr)
      if (value >= a && value <= b && (value - a) % step === 0) return true
      continue
    }
    if (Number(range) === value) return true
  }
  return false
}

/** True when `date` (evaluated in UTC) matches the cron expression. */
export function matchesCron(expression: string, date: Date): boolean {
  const fields = parseCron(expression)
  if (!fields) return false

  if (!matchesField(fields.minute, date.getUTCMinutes(), RANGES.minute[0])) return false
  if (!matchesField(fields.hour, date.getUTCHours(), RANGES.hour[0])) return false
  if (!matchesField(fields.month, date.getUTCMonth() + 1, RANGES.month[0])) return false

  const domRestricted = fields.dayOfMonth.trim() !== '*'
  const dowRestricted = fields.dayOfWeek.trim() !== '*'
  const domMatch = matchesField(fields.dayOfMonth, date.getUTCDate(), RANGES.dayOfMonth[0])
  // Sunday is 0; also accept 7 (and ranges ending in 7) as Sunday.
  const day = date.getUTCDay()
  const dowMatch =
    matchesField(fields.dayOfWeek, day, RANGES.dayOfWeek[0]) ||
    (day === 0 && matchesField(fields.dayOfWeek, 7, RANGES.dayOfWeek[0]))

  // Standard cron: when both day fields are restricted, a match on either is enough.
  return domRestricted && dowRestricted ? domMatch || dowMatch : domMatch && dowMatch
}
