'use server'

import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { prisma } from '@flowbridge/db'
import { encryptJson } from '@/lib/crypto'
import { z } from 'zod'
import { createHash, randomBytes } from 'crypto'
import { Role } from '@prisma/client'

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/
const API_KEY_SCOPES = ['read:leads', 'write:workflows', 'trigger:intake'] as const

/**
 * Integration config schemas — field shapes must match exactly what each
 * executor reads from `integration.config`.
 */
const EMAIL_CONFIG = z.object({
  provider: z.enum(['resend', 'smtp', 'log']).default('smtp'),
  apiKey: z.string().optional(),
  host: z.string().optional(),
  port: z.coerce.number().int().positive().max(65535).optional(),
  secure: z.boolean().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  from: z.string().optional(),
})

const TELEGRAM_CONFIG = z.object({
  botToken: z.string().min(1),
  chatId: z.string().min(1),
})

const SLACK_CONFIG = z.object({
  webhookUrl: z.string().url(),
})

const HTTP_CONFIG = z.object({
  baseUrl: z.string().url(),
  authToken: z.string().optional(),
})

const CONFIG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  email: EMAIL_CONFIG,
  telegram: TELEGRAM_CONFIG,
  slack: SLACK_CONFIG,
  http: HTTP_CONFIG,
}

/** Upsert an integration. Config is AES-256-GCM encrypted before it touches the DB. */
export async function saveIntegration(type: string, name: string, rawConfig: unknown) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return { ok: false, error: 'Unauthorized' }

  const schema = CONFIG_SCHEMAS[type]
  if (!schema) return { ok: false, error: 'Unsupported integration type' }

  const parsed = schema.safeParse(rawConfig ?? {})
  if (!parsed.success) return { ok: false, error: 'Invalid configuration' }

  const configEnc = encryptJson(parsed.data)

  await prisma.integration.upsert({
    where: { workspaceId_type_name: { workspaceId: session.user.workspaceId, type, name: name || type } },
    create: { workspaceId: session.user.workspaceId, type, name: name || type, configEnc },
    update: { configEnc },
  })

  revalidatePath('/settings')
  return { ok: true }
}

/** Delete an integration (scoped to the session workspace). */
export async function deleteIntegration(id: string) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return { ok: false, error: 'Unauthorized' }

  const existing = await prisma.integration.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
  })
  if (!existing) return { ok: false, error: 'Not found' }

  await prisma.integration.delete({ where: { id: existing.id } })
  revalidatePath('/settings')
  return { ok: true }
}

/** Send a test email through the workspace's configured email integration. */
export async function sendTestEmail() {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return { ok: false, error: 'Unauthorized' }
  if (!session.user.email) return { ok: false, error: 'No email on your account' }

  const integration = await prisma.integration.findFirst({
    where: { workspaceId: session.user.workspaceId, type: 'email' },
  })
  if (!integration) return { ok: false, error: 'No email integration configured' }

  // Decrypt via the shared resolver rather than parsing plaintext.
  const { resolveIntegrations } = await import('@/lib/integrations')
  const resolved = await resolveIntegrations(prisma, session.user.workspaceId)
  const email = resolved.find((i) => i.type === 'email')
  if (!email) return { ok: false, error: 'Could not read email configuration' }

  const config = email.config as Record<string, unknown>
  const provider = (config.provider as string) || 'smtp'
  const subject = 'FlowBridge test email'
  const text = 'Your FlowBridge email integration is working.'

  try {
    if (provider === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey as string}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: (config.from as string) || 'FlowBridge <noreply@flowbridge.local>',
          to: session.user.email,
          subject,
          text,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        return { ok: false, error: (data as { message?: string }).message || 'Resend error' }
      }
      return { ok: true }
    }

    if (provider === 'smtp') {
      const host = (config.host as string) || process.env.SMTP_HOST || 'localhost'
      const port = Number((config.port as number) ?? process.env.SMTP_PORT ?? 587)
      const user = (config.user as string) || process.env.SMTP_USER || undefined
      const pass = (config.password as string) || process.env.SMTP_PASSWORD || undefined
      const from = (config.from as string) || process.env.SMTP_FROM || 'noreply@flowbridge.local'
      const secure = (config.secure as boolean) ?? port === 465

      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
      })
      await transporter.sendMail({ from, to: session.user.email, subject, text })
      return { ok: true }
    }

    // log-only — nothing leaves the box
    console.log('Email (log-only):', { to: session.user.email, subject, text })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Send failed' }
  }
}

/** Resolve the session plus the caller's membership (role-aware guards). */
async function getActor() {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.workspaceId) return null
  const member = await prisma.member.findFirst({
    where: { userId: session.user.id, workspaceId: session.user.workspaceId },
  })
  return { session, member, workspaceId: session.user.workspaceId }
}

function isManager(role?: Role | null): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

/** Update the workspace name and slug. Managers only; slug must stay unique. */
export async function updateWorkspace(formData: FormData) {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Unauthorized' }
  if (!isManager(actor.member?.role)) return { ok: false, error: 'Only owners/admins can change workspace settings' }

  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()

  if (name.length < 1 || name.length > 100) return { ok: false, error: 'Name must be 1–100 characters' }
  if (!SLUG_REGEX.test(slug)) {
    return { ok: false, error: 'Slug must be 3–50 lowercase letters, numbers, or hyphens' }
  }

  const conflict = await prisma.workspace.findFirst({
    where: { slug, NOT: { id: actor.workspaceId } },
    select: { id: true },
  })
  if (conflict) return { ok: false, error: 'That slug is already taken' }

  await prisma.workspace.update({ where: { id: actor.workspaceId }, data: { name, slug } })
  revalidatePath('/settings')
  return { ok: true }
}

/** Generate a fresh webhook secret. Returned once — only the hash-less secret is shown. */
export async function regenerateWebhookSecret() {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Unauthorized' }
  if (!isManager(actor.member?.role)) return { ok: false, error: 'Only owners/admins can rotate the webhook secret' }

  const secret = `whsec_${randomBytes(24).toString('base64url')}`
  await prisma.workspace.update({
    where: { id: actor.workspaceId },
    data: { webhookSecret: secret },
  })
  revalidatePath('/settings')
  return { ok: true, secret }
}

/** Create an API key. The plaintext is returned once and never stored. */
export async function createApiKey(input: { name: string; scopes: string[] }) {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Unauthorized' }
  if (!isManager(actor.member?.role)) return { ok: false, error: 'Only owners/admins can create API keys' }

  const name = (input.name ?? '').trim()
  if (name.length < 1 || name.length > 60) return { ok: false, error: 'Name must be 1–60 characters' }

  const scopes = (input.scopes ?? []).filter((scope) =>
    (API_KEY_SCOPES as readonly string[]).includes(scope)
  )

  const secret = `fb_${randomBytes(24).toString('base64url')}`
  const keyHash = createHash('sha256').update(secret).digest('hex')
  const prefix = secret.slice(0, 11)

  await prisma.apiKey.create({
    data: {
      workspaceId: actor.workspaceId,
      userId: actor.session.user.id,
      name,
      keyHash,
      prefix,
      scopes,
    },
  })

  revalidatePath('/settings')
  return { ok: true, key: secret }
}

/** Revoke an API key (scoped to the session workspace). */
export async function revokeApiKey(id: string) {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Unauthorized' }
  if (!isManager(actor.member?.role)) return { ok: false, error: 'Only owners/admins can revoke API keys' }

  const existing = await prisma.apiKey.findFirst({
    where: { id, workspaceId: actor.workspaceId },
    select: { id: true },
  })
  if (!existing) return { ok: false, error: 'Not found' }

  await prisma.apiKey.delete({ where: { id: existing.id } })
  revalidatePath('/settings')
  return { ok: true }
}

/** Toggle a member's availability (used by round-robin assignment). */
export async function setMemberAvailability(formData: FormData) {
  const actor = await getActor()
  if (!actor || !isManager(actor.member?.role)) return

  const memberId = String(formData.get('memberId') ?? '')
  const available = String(formData.get('available') ?? '') === 'true'
  if (!memberId) return

  await prisma.member.updateMany({
    where: { id: memberId, workspaceId: actor.workspaceId },
    data: { available },
  })
  revalidatePath('/settings')
}

/** Change a member's role. Owners only, and never demote the last owner. */
export async function setMemberRole(formData: FormData) {
  const actor = await getActor()
  if (!actor || actor.member?.role !== 'OWNER') return

  const memberId = String(formData.get('memberId') ?? '')
  const role = String(formData.get('role') ?? '')
  if (!memberId || !['OWNER', 'ADMIN', 'AGENT'].includes(role)) return
  if (memberId === actor.member.id) return // don't change your own role

  if (role !== 'OWNER') {
    const owners = await prisma.member.count({
      where: { workspaceId: actor.workspaceId, role: 'OWNER' },
    })
    const target = await prisma.member.findFirst({
      where: { id: memberId, workspaceId: actor.workspaceId },
      select: { role: true },
    })
    if (target?.role === 'OWNER' && owners <= 1) return // keep at least one owner
  }

  await prisma.member.updateMany({
    where: { id: memberId, workspaceId: actor.workspaceId },
    data: { role: role as Role },
  })
  revalidatePath('/settings')
}