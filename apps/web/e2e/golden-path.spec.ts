import { test, expect } from '@playwright/test'
import { FORM_KEY, OWNER, loginAs } from './helpers'

/**
 * Golden path (SPEC §15): a public form submission becomes a lead and the
 * `lead.created` workflow runs to completion — all visible to the owner.
 *
 * Requires a migrated + seeded database (see playwright.config.ts).
 */
test.describe('golden path', () => {
  test('public submission creates a lead and the workflow succeeds', async ({ page }) => {
    const stamp = Date.now()
    const name = `E2E Lead ${stamp}`
    const email = `e2e+${stamp}@example.com`

    // 1. Submit the public hosted form.
    await page.goto(`/f/${FORM_KEY}`)
    await page.getByLabel('Full Name').fill(name)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Message').fill('Automated golden-path submission.')
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText(/thanks for reaching out/i)).toBeVisible()

    // 2. The owner finds the new lead through search.
    await loginAs(page, OWNER)
    await page.goto(`/leads?q=${encodeURIComponent(email)}`)
    await page.getByRole('link', { name: new RegExp(name) }).click()
    await expect(page).toHaveURL(/\/leads\//)

    // 3. `lead.created` fired: the demo workflow ran to completion. The engine
    //    processes the run asynchronously (best-effort in-process drain after
    //    intake, with the cron tick as the durable path) and this page is
    //    server-rendered with no client polling — so reload until the run reports
    //    SUCCEEDED instead of asserting once on a stale render.
    await expect(page.getByText('Instant Lead Assignment')).toBeVisible()
    await expect(async () => {
      await page.reload()
      await expect(page.getByText('SUCCEEDED')).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 90_000, intervals: [2_000] })
  })
})
