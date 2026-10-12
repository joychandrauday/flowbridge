import { describe, it, expect, vi } from 'vitest'
import { scoped } from './scoped'

describe('scoped', () => {
  it('filters queries by workspaceId', () => {
    const mockPrisma = {
      lead: {
        findMany: vi.fn(),
      },
    }
    const scopedClient = scoped(mockPrisma as any, 'ws-123')
    scopedClient.lead.findMany()
    expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'ws-123' } })
    )
  })

  it('works with empty workspaceId (does not throw)', () => {
    const mockPrisma = { lead: { findMany: vi.fn() } }
    expect(() => scoped(mockPrisma as any, '')).not.toThrow()
    expect(() => scoped(mockPrisma as any, undefined as any)).not.toThrow()
  })
})