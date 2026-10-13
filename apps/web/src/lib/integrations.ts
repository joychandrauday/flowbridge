import type { PrismaClient } from '@prisma/client'
import { decryptJsonWithKey, isEncryptedPayload, deriveEncryptionKey } from '@flowbridge/core'

/**
 * Integration secret handling (SPEC.md §3).
 *
 * - `configEnc` in the DB is ALWAYS an AES-256-GCM payload of the JSON config.
 * - Executors receive a decrypted `config` via the resolved integration.
 * - The client NEVER receives decrypted config — only `configured: boolean`.
 */

export interface ResolvedIntegration {
  id: string
  type: string
  name: string
  config: Record<string, unknown>
}

function decryptConfig(configEnc: string): Record<string, unknown> {
  const keyMaterial = process.env.ENCRYPTION_KEY
  if (keyMaterial) {
    const key = deriveEncryptionKey(keyMaterial)
    if (isEncryptedPayload(configEnc)) {
      try {
        return decryptJsonWithKey<Record<string, unknown>>(configEnc, key)
      } catch (error) {
        console.error('[integrations] failed to decrypt config for integration', error)
        return {}
      }
    }
  }
  // Legacy / placeholder values (e.g. seed) that are plaintext JSON. Never
  // reach the client; used only to keep demos working before secrets exist.
  try {
    return JSON.parse(configEnc)
  } catch {
    console.warn('[integrations] configEnc is neither encrypted JSON nor plaintext JSON')
    return {}
  }
}

/** Internal-only resolver used by the engine. Throws never; degrades to {}. */
export async function resolveIntegrations(prisma: PrismaClient, workspaceId: string): Promise<ResolvedIntegration[]> {
  const rows = await prisma.integration.findMany({ where: { workspaceId } })
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    config: decryptConfig(row.configEnc),
  }))
}

export interface PublicIntegration {
  id: string
  type: string
  name: string
  configured: boolean
}

/** Client-facing shape — never includes decrypted config. */
export function toPublicIntegration(integration: { id: string; type: string; name: string }): PublicIntegration {
  return { id: integration.id, type: integration.type, name: integration.name, configured: true }
}