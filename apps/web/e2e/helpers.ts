import { type Page } from '@playwright/test'

/** Seeded demo accounts (see `packages/db/src/seed.ts`). */
export const OWNER = { email: 'owner@demo.flowbridge', password: 'demo123' }
export const ADMIN = { email: 'admin@demo.flowbridge', password: 'demo123' }
export const AGENT1 = { email: 'agent1@demo.flowbridge', password: 'demo123' }
export const AGENT2 = { email: 'agent2@demo.flowbridge', password: 'demo123' }

export const FORM_KEY = process.env.E2E_FORM_KEY ?? 'contact-form'

/** Sign in through the real login form and wait for the dashboard. */
export async function loginAs(page: Page, user: { email: string; password: string }): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard')
}
