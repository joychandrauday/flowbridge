import { PrismaClient, Prisma } from '@prisma/client'

export type ScopedPrisma = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'> & {
  $transaction: <T>(fn: (prisma: ScopedPrisma) => Promise<T>, options?: { maxWait?: number; timeout?: number }) => Promise<T>
}

/**
 * Creates a scoped Prisma client that automatically filters all queries by workspaceId.
 * This ensures tenant isolation at the database level.
 */
export function scoped(prisma: PrismaClient, workspaceId: string): ScopedPrisma {
  const models = [
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

  const scopedClient = {} as ScopedPrisma

  for (const model of models) {
    // @ts-expect-error - dynamic model access
    const delegate = prisma[model]

    if (!delegate) continue

    const handler: ProxyHandler<typeof delegate> = {
      get(target, prop, receiver) {
        const original = Reflect.get(target, prop, receiver)

        if (typeof original !== 'function') {
          return original
        }

        const mutatingMethods = [
          'create',
          'createMany',
          'update',
          'updateMany',
          'upsert',
          'delete',
          'deleteMany',
          'findFirst',
          'findFirstOrThrow',
          'findMany',
          'findUnique',
          'findUniqueOrThrow',
          'count',
          'aggregate',
          'groupBy',
        ]

        if (mutatingMethods.includes(prop as string)) {
          return async function (args: any = {}) {
            const where = args.where ?? {}
            const data = args.data ?? {}

            // For create/createMany, ensure workspaceId is in data
            if ((prop === 'create' || prop === 'createMany') && data) {
              if (prop === 'createMany') {
                args.data = data.map((d: any) => ({ ...d, workspaceId }))
              } else {
                args.data = { ...data, workspaceId }
              }
            }

            // For update/updateMany/upsert/delete/deleteMany, add workspaceId to where
            if (['update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(prop as string)) {
              args.where = { ...where, workspaceId }
            }

            // For find queries, add workspaceId to where
            if (['findFirst', 'findFirstOrThrow', 'findMany', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy'].includes(prop as string)) {
              args.where = { ...where, workspaceId }
            }

            return original.call(target, args)
          }
        }

        return original
      },
    }

    // @ts-expect-error - dynamic assignment
    scopedClient[model] = new Proxy(delegate, handler)
  }

  // Handle $transaction
  scopedClient.$transaction = async <T>(
    fn: (prisma: ScopedPrisma) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ) => {
    return prisma.$transaction(async (tx) => fn(scoped(tx, workspaceId)), options)
  }

  return scopedClient
}

/**
 * Type-safe scoped client factory for use in Server Actions and API routes
 */
export function createScopedClient(workspaceId: string) {
  return scoped(prisma, workspaceId)
}