import { PrismaClient } from '@prisma/client'
import { prisma } from './client'

type ScopedClient = PrismaClient & {
  $transaction: <T>(
    fn: (prisma: ReturnType<typeof scoped>) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ) => Promise<T>
}

const TENANT_MODELS = [
  'member',
  'form',
  'lead',
  'activity',
  'task',
  'workflow',
  'workflowRun',
  'runStep',
  'integration',
  'intakeEvent',
  'apiKey',
] as const

const READ_METHODS = [
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
] as const

const WRITE_METHODS = [
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
] as const

const SCOPED_METHODS = new Set<string>([...READ_METHODS, ...WRITE_METHODS])

/**
 * `findUnique`/`findUniqueOrThrow` are rewritten to their `findFirst`
 * equivalents. Prisma only accepts unique fields in a `findUnique` `where`,
 * so injecting `workspaceId` there depends on `extendedWhereUnique` semantics;
 * `findFirst` always accepts the tenant filter, making isolation version-proof.
 */
const METHOD_REWRITE: Record<string, string> = {
  findUnique: 'findFirst',
  findUniqueOrThrow: 'findFirstOrThrow',
}

/**
 * Creates a scoped Prisma client that injects `workspaceId` into every query.
 * This is the single chokepoint that guarantees tenant isolation (SPEC §3 /
 * AGENTS §3) — never trust a `workspaceId` that arrived from the client.
 */
export function scoped(client: PrismaClient, workspaceId: string): ScopedClient {
  const scopedClient: Record<string, unknown> = {}

  for (const model of TENANT_MODELS) {
    const delegate = client[model as keyof typeof client]
    if (!delegate) continue

    const handler: ProxyHandler<typeof delegate> = {
      get(target, prop, receiver) {
        if (typeof prop !== 'string' || !SCOPED_METHODS.has(prop)) {
          return Reflect.get(target, prop, receiver)
        }

        const implementationName = METHOD_REWRITE[prop] ?? prop
        const implementation = Reflect.get(target, implementationName, receiver)
        if (typeof implementation !== 'function') return implementation

        return async function (args: Record<string, unknown> = {}) {
          // Clone so we never mutate the caller's argument object.
          const next: Record<string, unknown> = { ...args }

          if (implementationName === 'create') {
            next.data = { ...((args.data as object) ?? {}), workspaceId }
          } else if (implementationName === 'createMany') {
            const rows = Array.isArray(args.data) ? args.data : [args.data ?? {}]
            next.data = rows.map((row) => ({ ...(row as object), workspaceId }))
          } else {
            next.where = { ...((args.where as object) ?? {}), workspaceId }
            if (implementationName === 'upsert') {
              next.create = { ...((args.create as object) ?? {}), workspaceId }
            }
          }

          return implementation.call(target, next)
        }
      },
    }

    scopedClient[model] = new Proxy(delegate, handler)
  }

  scopedClient.$transaction = async <T>(
    fn: (prisma: ReturnType<typeof scoped>) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ) => client.$transaction(async (tx) => fn(scoped(tx as PrismaClient, workspaceId)), options)

  return scopedClient as unknown as ScopedClient
}

/**
 * Type-safe scoped client factory for use in Server Components, Server Actions
 * and API routes.
 */
export function createScopedClient(workspaceId: string) {
  return scoped(prisma, workspaceId)
}
