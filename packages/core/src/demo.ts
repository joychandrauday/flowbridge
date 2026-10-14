/**
 * Demo login (SPEC.md §2 "golden path demoable in under 2 minutes").
 *
 * The demo workspace is intentionally public **when a deployment opts in**:
 * its credentials are rendered on the sign-in page so an evaluator can explore
 * seeded leads, workflows and run history without signing up. It is off by
 * default (see `isDemoLoginEnabled`) — publishing a working login is a choice,
 * not a default. Kept here — pure, no IO — so the DB seed
 * (`packages/db/src/seed.ts`) and the login page resolve the *same* account from
 * the *same* env vars and can never drift apart.
 *
 * Override per environment (see `.env.example`):
 *   DEMO_EMAIL / DEMO_PASSWORD / DEMO_NAME  — the demo account
 *   DEMO_LOGIN=true                         — enable the account + panel
 *
 * The default password is deliberately low-entropy: it is a demo credential,
 * published on purpose, and must only ever guard the demo workspace.
 */

export interface DemoAccount {
  email: string
  password: string
  name: string
}

export const DEMO_DEFAULTS = {
  email: 'hello@g2gdigital.com',
  password: 'demo123',
  name: 'G2G Demo',
} as const

type Env = Record<string, string | undefined>

export function resolveDemoAccount(env: Env = {}): DemoAccount {
  return {
    email: env.DEMO_EMAIL?.trim() || DEMO_DEFAULTS.email,
    password: env.DEMO_PASSWORD || DEMO_DEFAULTS.password,
    // `||` (not `??`) so an empty string falls back to the default.
    name: env.DEMO_NAME?.trim() || DEMO_DEFAULTS.name,
  }
}

/**
 * The demo login is **off unless explicitly enabled**. Publishing a live
 * credential is a deliberate choice a deployment opts into (`DEMO_LOGIN=true`),
 * never something a forgotten or misspelled env var can switch on. This gates
 * both the seeded account and the panel on the sign-in page.
 */
export function isDemoLoginEnabled(env: Env = {}): boolean {
  return env.DEMO_LOGIN === 'true'
}
