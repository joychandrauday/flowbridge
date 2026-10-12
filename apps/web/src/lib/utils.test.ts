import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn utility', () => {
  it('joins class names', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('handles conditional classes', () => {
    expect(cn('base', true && 'active', false && 'hidden')).toBe('base active')
  })

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end')
  })
})