import { defineConfig } from 'vitest/config'

/**
 * Unit/component tests only. The Playwright specs live in `./e2e` and the
 * database integration suite in `./tests/integration`; both need a real browser
 * or database and are run by their own commands (`test:e2e`, `test:integration`).
 */
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'e2e/**',
      'tests/integration/**',
    ],
  },
})
