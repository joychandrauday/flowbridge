/**
 * Derives the seeded email integration config from environment variables.
 *
 * Kept pure (no Prisma, no IO) so `email-integration.test.ts` can lock the
 * env → config mapping without a database — the same pattern as `demo-form.ts`
 * and `demo-workflows.ts`. The seed encrypts the result with `sealConfig`, so
 * no SMTP credential ever lands in git.
 *
 * The executor (`apps/web/src/lib/executors/sendEmail.ts`) refuses to send
 * unless an `email` integration exists, and that integration's config wins over
 * the `SMTP_*` env fallbacks. Seeding one here is what makes email steps work
 * out of the box; the field names must match `EMAIL_CONFIG` in
 * `apps/web/src/app/(dashboard)/settings/actions.ts` exactly.
 */

export type EmailProvider = 'smtp' | 'resend' | 'log'

export interface EmailIntegrationConfig {
  provider: EmailProvider
  host?: string
  port?: number
  secure?: boolean
  user?: string
  password?: string
  from?: string
  apiKey?: string
}

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim()
  return next ? next : undefined
}

/**
 * - `SMTP_PROVIDER` overrides everything.
 * - Otherwise: `smtp` when a host is configured, else `log` (nothing leaves the
 *   box) so a bare seed never tries to reach `localhost:587`.
 */
export function buildEmailIntegrationConfig(
  env: Record<string, string | undefined>
): EmailIntegrationConfig {
  const requested = trimmed(env.SMTP_PROVIDER)
  const provider: EmailProvider =
    requested === 'smtp' || requested === 'resend' || requested === 'log'
      ? requested
      : trimmed(env.SMTP_HOST)
        ? 'smtp'
        : 'log'

  if (provider === 'log') return { provider }

  if (provider === 'resend') {
    return { provider, apiKey: trimmed(env.RESEND_API_KEY), from: trimmed(env.SMTP_FROM) }
  }

  const port = trimmed(env.SMTP_PORT) ? Number(env.SMTP_PORT) : undefined
  const explicitSecure = trimmed(env.SMTP_SECURE)
  const secure = explicitSecure
    ? explicitSecure.toLowerCase() === 'true'
    : port === 465

  return {
    provider,
    host: trimmed(env.SMTP_HOST),
    port: port !== undefined && Number.isFinite(port) ? port : undefined,
    secure,
    user: trimmed(env.SMTP_USER),
    password: trimmed(env.SMTP_PASSWORD),
    from: trimmed(env.SMTP_FROM),
  }
}
