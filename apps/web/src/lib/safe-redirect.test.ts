import { describe, expect, it } from 'vitest'
import { safeCallbackUrl } from './safe-redirect'

describe('safeCallbackUrl', () => {
  it('honours site-relative paths', () => {
    expect(safeCallbackUrl('/dashboard')).toBe('/dashboard')
    expect(safeCallbackUrl('/leads?tab=new')).toBe('/leads?tab=new')
    expect(safeCallbackUrl(['/admin'])).toBe('/admin')
  })

  it('rejects protocol-relative URLs — the browser would fill in the scheme', () => {
    expect(safeCallbackUrl('//evil.com/steal')).toBe('/dashboard')
    expect(safeCallbackUrl('/\\evil.com/steal')).toBe('/dashboard')
  })

  it('rejects absolute and javascript: URLs', () => {
    expect(safeCallbackUrl('https://evil.com/steal')).toBe('/dashboard')
    expect(safeCallbackUrl('javascript:alert(1)')).toBe('/dashboard')
    expect(safeCallbackUrl('evil.com')).toBe('/dashboard')
  })

  it('falls back when the value is missing, blank, or the first entry is hostile', () => {
    expect(safeCallbackUrl(undefined)).toBe('/dashboard')
    expect(safeCallbackUrl('')).toBe('/dashboard')
    expect(safeCallbackUrl(['//evil.com', '/dashboard'])).toBe('/dashboard')
  })
})
