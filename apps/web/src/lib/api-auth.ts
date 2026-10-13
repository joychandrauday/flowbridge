import { createHash, timingSafeEqual } from 'crypto'
import { prisma } from '@flowbridge/db'

export interface ApiKeyAuth {
  apiKeyId: string
  workspaceId: string
  userId: string
  scopes: string[]
}

/**
 * Authenticate a request from its `Authorization: Bearer fb_…` header.
 *
 * Keys are stored only as SHA-256 hashes (see `createApiKey`). We look the hash
 * up, compare it in constant time, reject expired keys, and bump `lastUsedAt`.
 * Returns `null` when the header is missing or the key is unknown/expired.
 */
export async function authenticateApiKey(request: Request): Promise<ApiKeyAuth | null> {
  const header = request.headers.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token?.startsWith('fb_')) return null

  const keyHash = createHash('sha256').update(token).digest('hex')

  const key = await prisma.apiKey.findFirst({
    where: { keyHash },
    select: {
      id: true,
      keyHash: true,
      workspaceId: true,
      userId: true,
      scopes: true,
      expiresAt: true,
    },
  })
  if (!key) return null
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null

  // Defence in depth: compare the hashes in constant time even though the
  // lookup already matched, so a timing oracle cannot confirm a prefix.
  const stored = Buffer.from(key.keyHash)
  const candidate = Buffer.from(keyHash)
  if (stored.length !== candidate.length || !timingSafeEqual(stored, candidate)) return null

  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })

  return {
    apiKeyId: key.id,
    workspaceId: key.workspaceId,
    userId: key.userId,
    scopes: key.scopes,
  }
}

/** True when the authenticated key grants `scope`. */
export function hasScope(auth: ApiKeyAuth, scope: string): boolean {
  return auth.scopes.includes(scope)
}
