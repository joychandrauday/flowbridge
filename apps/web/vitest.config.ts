import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Unit/component tests only. The Playwright specs live in `./e2e` and the
 * database integration suite in `./tests/integration`; both need a real browser
 * or database and are run by their own commands (`test:e2e`, `test:integration`).
 */
export default defineConfig({
  resolve: {
    // Mirrors the `@/*` -> `src/*` alias from tsconfig.
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
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
