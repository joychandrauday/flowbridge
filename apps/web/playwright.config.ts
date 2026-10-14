import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/**
 * Playwright config for the golden-path E2E suite.
 *
 * The specs exercise a **seeded** database, so run:
 *   pnpm db:generate && pnpm db:push && pnpm db:seed
 * before `pnpm test:e2e`. Set `E2E_BASE_URL` to target an already-running app
 * (no dev server is then started).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // Generous per-test budget: when E2E runs against `next dev` the *first* hit
  // on a route pays its on-demand compilation (observed 10-55s per route here,
  // and the golden path touches the public form, intake, auth, dashboard and
  // leads in one test). A production build (`next build && next start`) removes
  // that cost; the timeout only needs to absorb cold compiles in dev.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
