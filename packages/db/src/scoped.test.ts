import { describe, it, expect } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { scoped } from './scoped'

/**
 * Cross-tenant isolation tests (SPEC §3 / AGENTS §3).
 *
 * The fake delegate applies `where`/`data` to an in-memory table, so these
 * tests prove the *behaviour* of the proxy — not just that it was called with
 * certain arguments. If `scoped()` ever stops injecting `workspaceId`, a
 * tenant can read or mutate another tenant's rows and these tests go red.
 */

interface Row {
  id: string
  workspaceId: string
  [key: string]: unknown
}

function matches(row: Row, where?: Record<string, unknown>): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, value]) => row[key] === value)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeDelegate(rows: Row[]) {
  return {
    findMany: async (args: any = {}) => rows.filter((row) => matches(row, args.where)),
    findFirst: async (args: any = {}) => rows.find((row) => matches(row, args.where)) ?? null,
    findFirstOrThrow: async (args: any = {}) => {
      const found = rows.find((row) => matches(row, args.where))
      if (!found) throw new Error('No record found')
      return found
    },
    findUnique: async (args: any = {}) => rows.find((row) => matches(row, args.where)) ?? null,
    findUniqueOrThrow: async (args: any = {}) => {
      const found = rows.find((row) => matches(row, args.where))
      if (!found) throw new Error('No record found')
      return found
    },
    count: async (args: any = {}) => rows.filter((row) => matches(row, args.where)).length,
    create: async (args: any = {}) => {
      const row = { id: `row-${rows.length + 1}`, ...args.data } as Row
      rows.push(row)
      return row
    },
    createMany: async (args: any = {}) => {
      const list = Array.isArray(args.data) ? args.data : [args.data]
      for (const data of list) rows.push({ id: `row-${rows.length + 1}`, ...data })
      return { count: list.length }
    },
    update: async (args: any = {}) => {
      const found = rows.find((row) => matches(row, args.where))
      if (!found) throw new Error('No record found')
      Object.assign(found, args.data)
      return found
    },
    updateMany: async (args: any = {}) => {
      const found = rows.filter((row) => matches(row, args.where))
      for (const row of found) Object.assign(row, args.data)
      return { count: found.length }
    },
    upsert: async (args: any = {}) => {
      const found = rows.find((row) => matches(row, args.where))
      if (found) {
        Object.assign(found, args.update)
        return found
      }
      const row = { id: `row-${rows.length + 1}`, ...args.create } as Row
      rows.push(row)
      return row
    },
    deleteMany: async (args: any = {}) => {
      const kept = rows.filter((row) => !matches(row, args.where))
      const removed = rows.length - kept.length
      rows.length = 0
      rows.push(...kept)
      return { count: removed }
    },
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface LooseClient {
  lead: {
    findMany: (args?: unknown) => Promise<Row[]>
    findFirst: (args?: unknown) => Promise<Row | null>
    findUnique: (args?: unknown) => Promise<Row | null>
    findUniqueOrThrow: (args?: unknown) => Promise<Row>
    create: (args?: unknown) => Promise<Row>
    createMany: (args?: unknown) => Promise<{ count: number }>
    update: (args?: unknown) => Promise<Row>
    updateMany: (args?: unknown) => Promise<{ count: number }>
    upsert: (args?: unknown) => Promise<Row>
    deleteMany: (args?: unknown) => Promise<{ count: number }>
    count: (args?: unknown) => Promise<number>
  }
}

function setup() {
  const rows: Row[] = [
    { id: 'lead-a', workspaceId: 'ws-a', name: 'A' },
    { id: 'lead-b', workspaceId: 'ws-b', name: 'B' },
  ]
  const client = { lead: makeDelegate(rows) } as unknown as PrismaClient
  return { rows, wsA: scoped(client, 'ws-a') as unknown as LooseClient }
}

describe('scoped client — tenant isolation', () => {
  it('scopes findMany to the workspace', async () => {
    const { wsA } = setup()
    const result = await wsA.lead.findMany({})
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('lead-a')
  })

  it('cannot read another workspace row via findUnique (rewritten to findFirst)', async () => {
    const { wsA } = setup()
    expect(await wsA.lead.findUnique({ where: { id: 'lead-b' } })).toBeNull()
    expect(await wsA.lead.findUnique({ where: { id: 'lead-a' } })).toMatchObject({ id: 'lead-a' })
  })

  it('throws on findUniqueOrThrow for another workspace row', async () => {
    const { wsA } = setup()
    await expect(wsA.lead.findUniqueOrThrow({ where: { id: 'lead-b' } })).rejects.toThrow()
  })

  it('cannot update another workspace row', async () => {
    const { rows, wsA } = setup()
    await expect(wsA.lead.update({ where: { id: 'lead-b' }, data: { name: 'hacked' } })).rejects.toThrow()
    expect(rows.find((row) => row.id === 'lead-b')?.name).toBe('B')
  })

  it('deleteMany only removes the workspace rows', async () => {
    const { rows, wsA } = setup()
    await wsA.lead.deleteMany({})
    expect(rows.map((row) => row.id)).toEqual(['lead-b'])
  })

  it('ignores a forged workspaceId in where', async () => {
    const { wsA } = setup()
    const result = await wsA.lead.findMany({ where: { workspaceId: 'ws-b' } })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('lead-a')
  })

  it('forces the scoped workspaceId on create, overriding a forged value', async () => {
    const { wsA } = setup()
    const created = await wsA.lead.create({ data: { id: 'lead-c', workspaceId: 'ws-b', name: 'C' } })
    expect(created.workspaceId).toBe('ws-a')
  })

  it('stamps every createMany row with the scoped workspaceId', async () => {
    const { rows, wsA } = setup()
    await wsA.lead.createMany({ data: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y', workspaceId: 'ws-b' }] })
    const created = rows.filter((row) => row.workspaceId === 'ws-a')
    expect(created.map((row) => row.id).sort()).toEqual(['lead-a', 'x', 'y'])
  })

  it('upsert creates with the scoped workspaceId and never hijacks another tenant row', async () => {
    const { rows, wsA } = setup()
    await wsA.lead.upsert({
      where: { id: 'lead-b' },
      update: { name: 'hacked' },
      create: { name: 'new' },
    })
    expect(rows.find((row) => row.id === 'lead-b')?.name).toBe('B')
    const created = rows.find((row) => row.name === 'new')
    expect(created?.workspaceId).toBe('ws-a')
  })

  it('scopes count to the workspace', async () => {
    const { wsA } = setup()
    expect(await wsA.lead.count({})).toBe(1)
  })
})
