import { test, expect } from '@playwright/test'
import { AGENT1, AGENT2, loginAs } from './helpers'

/**
 * SPEC §3: agents only see the leads assigned to them.
 *
 * Seeded assignment (packages/db/src/seed.ts): every lead except the `NEW`
 * unassigned **Sarah Johnson** is assigned to **agent1** (Nila). agent2 (Kiran)
 * owns none.
 */
test.describe('agent lead scoping', () => {
  test('an agent does not see leads assigned to someone else', async ({ page }) => {
    await loginAs(page, AGENT2)
    await page.goto('/leads')

    // Michael Chen belongs to agent1, Sarah Johnson is unassigned.
    await expect(page.getByRole('link', { name: 'Michael Chen' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Sarah Johnson' })).toHaveCount(0)
  })

  test('an agent sees their own leads but not unassigned ones', async ({ page }) => {
    await loginAs(page, AGENT1)
    await page.goto('/leads')

    await expect(page.getByRole('link', { name: 'Michael Chen' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sarah Johnson' })).toHaveCount(0)
  })
})
