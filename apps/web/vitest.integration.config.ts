import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Opt-in database integration suite. Requires `TEST_DATABASE_URL` pointing at a
 * dedicated **empty** scratch Postgres (see `tests/integration/*.test.ts`).
 *
 *   pnpm --filter @flowbridge/db exec prisma db push   # against TEST_DATABASE_URL
 *   pnpm --filter @flowbridge/web test:integration
 */
export default defineConfig({
  resolve: {
    // Mirrors the `@/*` -> `src/*` alias from tsconfig so route handlers import.
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    // One worker process for the whole suite: a single Prisma client instance and
    // only one teardown. (Multiple worker exits intermittently crash the native
    // Prisma engine on Windows with 0xC0000005 *after* the tests pass.)
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
