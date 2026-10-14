import { describe, it, expect } from 'vitest'
import { pickRoundRobinIndex } from './assignment'
import { normalizeConditionField } from './schema/workflow'

describe('pickRoundRobinIndex', () => {
  it('starts at the first member for a fresh pointer', () => {
    expect(pickRoundRobinIndex(0, 3)).toBe(0)
  })

  it('rotates through every member in order', () => {
    expect([0, 1, 2, 3, 4].map((p) => pickRoundRobinIndex(p, 3))).toEqual([0, 1, 2, 0, 1])
  })

  it('wraps a pointer far past the member count', () => {
    expect(pickRoundRobinIndex(101, 4)).toBe(1)
  })

  it('returns null when there are no members (caller must surface a failure)', () => {
    expect(pickRoundRobinIndex(5, 0)).toBe(null)
    expect(pickRoundRobinIndex(5, -1)).toBe(null)
  })

  it('is defensive about a non-numeric or negative pointer', () => {
    expect(pickRoundRobinIndex(Number.NaN, 3)).toBe(0)
    expect(pickRoundRobinIndex(-1, 3)).toBe(0)
  })
})

describe('normalizeConditionField', () => {
  it('prefixes bare lead columns with `lead.`', () => {
    expect(normalizeConditionField('status')).toBe('lead.status')
    expect(normalizeConditionField('email')).toBe('lead.email')
    expect(normalizeConditionField('source')).toBe('lead.source')
  })

  it('maps a bare custom field to a lead data field', () => {
    expect(normalizeConditionField('company')).toBe('lead.company')
    expect(normalizeConditionField('data.company')).toBe('lead.data.company')
  })

  it('leaves already-namespaced paths untouched', () => {
    expect(normalizeConditionField('lead.status')).toBe('lead.status')
    expect(normalizeConditionField('assignee.name')).toBe('assignee.name')
    expect(normalizeConditionField('workspace.name')).toBe('workspace.name')
    expect(normalizeConditionField('trigger.type')).toBe('trigger.type')
  })

  it('leaves system variables untouched', () => {
    expect(normalizeConditionField('now')).toBe('now')
    expect(normalizeConditionField('uuid')).toBe('uuid')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeConditionField('  status  ')).toBe('lead.status')
  })
})
